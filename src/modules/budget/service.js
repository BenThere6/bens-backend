const prisma = require('../../db/prisma');

// --- helpers ---
async function getDefaultProfileId() {
    const p = await prisma.profile.findFirst();
    if (!p) {
        const err = new Error('No profile found');
        err.status = 500;
        throw err;
    }
    return p.id;
}

// --- envelopes ---
async function listEnvelopes({ month }) {
    const m = month || new Date().toISOString().slice(0, 7);
    const rows = await prisma.envelopeBudget.findMany({
        where: { month: m, envelope: { isActive: true } },
        include: { envelope: true }
    });
    return rows.map(r => ({
        id: r.envelope.id,
        name: r.envelope.name,
        month: r.month,
        plannedCents: r.plannedCents,
        actualCents: r.actualCents,
        remainingCents: r.plannedCents - r.actualCents
    }));
}

// --- envelopes (create) ---
async function createEnvelope({ name, month, plannedCents = 0, categoryId = null }) {
    const profileId = await getDefaultProfileId();
    const m = month || new Date().toISOString().slice(0, 7);

    const env = await prisma.envelope.create({
        data: {
            profileId,
            name: name.trim(),
            categoryId,
            budgets: {
                create: {
                    month: m,
                    plannedCents,
                    actualCents: 0
                }
            }
        },
        include: { budgets: true }
    });

    const b = env.budgets.find(x => x.month === m);

    return {
        id: env.id,
        name: env.name,
        month: m,
        plannedCents: b?.plannedCents ?? plannedCents,
        actualCents: b?.actualCents ?? 0
    };
}

// --- rules ---
async function createRule({ priority, tests, actions, isActive }) {
    const profileId = await getDefaultProfileId();
    const rule = await prisma.rule.create({
        data: {
            profileId,
            priority,
            testsJSON: JSON.stringify(tests),
            actionsJSON: JSON.stringify(actions),
            isActive: isActive ?? true
        }
    });
    return {
        id: rule.id,
        priority: rule.priority,
        tests,
        actions,
        isActive: rule.isActive,
        createdAt: rule.createdAt
    };
}

// --- categories ---
async function listCategories() {
    const profileId = await getDefaultProfileId();
    const rows = await prisma.category.findMany({
        where: { profileId },
        orderBy: { name: 'asc' }
    });
    return rows.map(c => ({ id: c.id, name: c.name }));
}

// --- envelopes (edit planned) ---
async function setEnvelopeBudget(envelopeId, { month, plannedCents }) {
    const env = await prisma.envelope.findUnique({ where: { id: envelopeId } });
    if (!env) {
        const err = new Error('Envelope not found');
        err.status = 404;
        throw err;
    }

    // Requires compound unique in schema.prisma on EnvelopeBudget:
    // @@unique([envelopeId, month], name: "envelopeId_month")
    const row = await prisma.envelopeBudget.upsert({
        where: { envelopeId_month: { envelopeId, month } },
        update: { plannedCents },
        create: { envelopeId, month, plannedCents, actualCents: 0 }
    });

    return {
        id: env.id,
        name: env.name,
        month: row.month,
        plannedCents: row.plannedCents,
        actualCents: row.actualCents
    };
}

// --- actuals (recalc from transactions) ---
function monthToRange(month) {
  const [y, m] = month.split('-').map(Number); // m = 1..12
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // next month
  return { start, end };
}

async function recalcMonth({ month, status = 'posted' }) {
  const profileId = await getDefaultProfileId();
  const m = month || new Date().toISOString().slice(0, 7);

  // month range [start, end)
  const start = new Date(`${m}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  // envelopes that are tied to a category (so we can attribute spend)
  const envelopes = await prisma.envelope.findMany({
    where: { profileId, isActive: true, categoryId: { not: null } },
    select: { id: true, name: true, categoryId: true }
  });

  const envelopeIdByCategoryId = new Map(
    envelopes.map(e => [e.categoryId, e.id])
  );

  // pull transactions in month
  const txs = await prisma.transaction.findMany({
    where: {
      profileId,
      status,
      postedAt: { gte: start, lt: end }
    },
    select: {
      amountCents: true,
      categoryId: true,
      splits: { select: { categoryId: true, amountCents: true } }
    }
  });

  // accumulate spend per envelope
  const actualByEnvelopeId = new Map(); // envelopeId -> cents

  for (const t of txs) {
    const isRefund = t.amountCents > 0;
    const sign = isRefund ? -1 : 1; // refund reduces actual

    if (t.splits && t.splits.length) {
      // splits are stored as absolute cents (your createTransaction enforces sum === abs(amountCents))
      for (const s of t.splits) {
        const envId = envelopeIdByCategoryId.get(s.categoryId);
        if (!envId) continue;
        actualByEnvelopeId.set(envId, (actualByEnvelopeId.get(envId) || 0) + sign * s.amountCents);
      }
    } else if (t.categoryId) {
      const envId = envelopeIdByCategoryId.get(t.categoryId);
      if (!envId) continue;
      const abs = Math.abs(t.amountCents);
      actualByEnvelopeId.set(envId, (actualByEnvelopeId.get(envId) || 0) + sign * abs);
    }
  }

  // IMPORTANT: NO async map, NO await inside the array.
  const ops = envelopes.map(e => {
    const actualCents = actualByEnvelopeId.get(e.id) || 0;

    return prisma.envelopeBudget.upsert({
      where: { envelopeId_month: { envelopeId: e.id, month: m } },
      update: { actualCents },
      create: {
        envelopeId: e.id,
        month: m,
        plannedCents: 0,
        actualCents
      }
    });
  });

  await prisma.$transaction(ops);

  // return the updated view the same way your UI expects
  return listEnvelopes({ month: m });
}

// --- accounts ---
async function listAccounts() {
    const profileId = await getDefaultProfileId();
    const rows = await prisma.account.findMany({
        where: { profileId, isArchived: false },
        orderBy: [{ institution: 'asc' }, { name: 'asc' }]
    });
    return rows.map(a => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
        type: a.type
    }));
}

// --- transactions ---
async function listTransactions({ from, to, status, accountId, categoryId, merchant, q, page = 1, pageSize = 50 }) {
    const profileId = await getDefaultProfileId();
    const where = { profileId };

    if (from || to) {
        where.postedAt = {};
        if (from) where.postedAt.gte = new Date(from);
        if (to) where.postedAt.lte = new Date(to);
    }
    if (status) where.status = status;
    if (accountId) where.accountId = accountId;
    if (categoryId) where.categoryId = categoryId;

    const or = [];
    if (merchant) {
        where.merchant = { normalizedName: { contains: merchant.trim().toLowerCase() } };
    }
    if (q) {
        or.push({ memo: { contains: q, mode: 'insensitive' } });
        or.push({ merchant: { displayName: { contains: q, mode: 'insensitive' } } });
    }
    if (or.length) where.OR = or;

    const [items, total] = await Promise.all([
        prisma.transaction.findMany({
            where,
            include: { merchant: true, account: true, category: true, splits: true, txTags: { include: { tag: true } } },
            orderBy: { postedAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.transaction.count({ where })
    ]);

    const data = items.map(t => ({
        id: t.id,
        postedAt: t.postedAt,
        amountCents: t.amountCents,
        status: t.status,
        memo: t.memo || '',
        isReviewed: t.isReviewed,
        account: { id: t.accountId, name: t.account.name, institution: t.account.institution, type: t.account.type },
        merchant: t.merchant ? { id: t.merchantId, name: t.merchant.displayName } : null,
        category: t.category ? { id: t.categoryId, name: t.category.name } : null,
        splits: t.splits.map(s => ({ id: s.id, categoryId: s.categoryId, amountCents: s.amountCents, memo: s.memo || '' })),
        tags: t.txTags.map(tt => ({ id: tt.tagId, name: tt.tag.name }))
    }));

    return { page, pageSize, total, data };
}

async function createTransaction({ accountId, postedAt, amountCents, status = 'posted', merchantName, memo, categoryId, splits, tags }) {
    const profileId = await getDefaultProfileId();

    // merchant upsert (normalize)
    let merchantConnect = undefined;
    if (merchantName && merchantName.trim()) {
        const normalized = merchantName
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
        let merchant = await prisma.merchant.findFirst({ where: { profileId, normalizedName: normalized } });
        if (!merchant) {
            merchant = await prisma.merchant.create({
                data: { profileId, displayName: merchantName.trim(), normalizedName: normalized }
            });
        }
        merchantConnect = { connect: { id: merchant.id } };
    }

    // tags
    let tagOps = undefined;
    if (Array.isArray(tags) && tags.length) {
        const existing = await prisma.tag.findMany({ where: { profileId, name: { in: tags } } });
        const existingNames = new Set(existing.map(t => t.name));
        const toCreate = tags.filter(n => !existingNames.has(n)).map(name => ({ profileId, name }));
        const created = toCreate.length ? await prisma.$transaction(toCreate.map(d => prisma.tag.create({ data: d }))) : [];
        const all = [...existing, ...created];
        tagOps = { create: all.map(t => ({ tagId: t.id })) };
    }

    // splits (validate sum)
    if (Array.isArray(splits) && splits.length) {
        const sum = splits.reduce((acc, s) => acc + s.amountCents, 0);
        if (sum !== Math.abs(amountCents)) {
            const err = new Error('Split amounts must sum to the absolute value of amountCents');
            err.status = 400;
            throw err;
        }
    }

    const tx = await prisma.transaction.create({
        data: {
            profileId,
            accountId,
            postedAt: new Date(postedAt),
            amountCents,
            status,
            memo: memo || '',
            categoryId: categoryId || null,
            merchant: merchantConnect,     // ✅ relation write must be under the field name
            txTags: tagOps,
            splits: Array.isArray(splits) && splits.length ? {
                create: splits.map(s => ({
                    categoryId: s.categoryId,
                    amountCents: s.amountCents,
                    memo: s.memo || ''
                }))
            } : undefined
        },
        include: { merchant: true, account: true, category: true, splits: true, txTags: { include: { tag: true } } }
    });

    return {
        id: tx.id,
        postedAt: tx.postedAt,
        amountCents: tx.amountCents,
        status: tx.status,
        memo: tx.memo,
        account: { id: tx.accountId, name: tx.account.name },
        merchant: tx.merchant ? { id: tx.merchantId, name: tx.merchant.displayName } : null,
        category: tx.category ? { id: tx.categoryId, name: tx.category.name } : null,
        splits: tx.splits.map(s => ({ id: s.id, categoryId: s.categoryId, amountCents: s.amountCents, memo: s.memo || '' })),
        tags: tx.txTags.map(tt => ({ id: tt.tagId, name: tt.tag.name }))
    };
}

async function updateTransaction(id, { categoryId, memo, isReviewed, splits, tags }) {
    const profileId = await getDefaultProfileId();

    // tags replace
    let tagOps = undefined;
    if (Array.isArray(tags)) {
        const existing = await prisma.tag.findMany({ where: { profileId, name: { in: tags } } });
        const existingNames = new Set(existing.map(t => t.name));
        const toCreate = tags.filter(n => !existingNames.has(n)).map(name => ({ profileId, name }));
        const created = toCreate.length ? await prisma.$transaction(toCreate.map(d => prisma.tag.create({ data: d }))) : [];
        const all = [...existing, ...created];
        tagOps = { deleteMany: {}, create: all.map(t => ({ tagId: t.id })) };
    }

    // splits replace
    let splitOps = undefined;
    if (Array.isArray(splits)) {
        splitOps = {
            deleteMany: {},
            create: splits.map(s => ({
                categoryId: s.categoryId,
                amountCents: s.amountCents,
                memo: s.memo || ''
            }))
        };
    }

    const tx = await prisma.transaction.update({
        where: { id },
        data: {
            categoryId: typeof categoryId !== 'undefined' ? categoryId : undefined,
            memo: typeof memo !== 'undefined' ? memo : undefined,
            isReviewed: typeof isReviewed !== 'undefined' ? isReviewed : undefined,
            txTags: tagOps,
            splits: splitOps
        },
        include: { merchant: true, account: true, category: true, splits: true, txTags: { include: { tag: true } } }
    });

    return {
        id: tx.id,
        postedAt: tx.postedAt,
        amountCents: tx.amountCents,
        status: tx.status,
        memo: tx.memo,
        isReviewed: tx.isReviewed,
        account: { id: tx.accountId, name: tx.account.name },
        merchant: tx.merchant ? { id: tx.merchantId, name: tx.merchant.displayName } : null,
        category: tx.category ? { id: tx.categoryId, name: tx.category.name } : null,
        splits: tx.splits.map(s => ({ id: s.id, categoryId: s.categoryId, amountCents: s.amountCents, memo: s.memo || '' })),
        tags: tx.txTags.map(tt => ({ id: tt.tagId, name: tt.tag.name }))
    };
}

module.exports = {
  listEnvelopes,
  listCategories,
  createEnvelope,
  setEnvelopeBudget,
  recalcMonth,
  createRule,
  listAccounts,
  listTransactions,
  createTransaction,
  updateTransaction
};