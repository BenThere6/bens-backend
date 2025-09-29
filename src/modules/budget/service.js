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
        actualCents: r.actualCents
    }));
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
    createRule,
    listAccounts,
    listTransactions,
    createTransaction,
    updateTransaction
};