const prisma = require('../../db/prisma');
const plaid = require('../../lib/plaidClient');
const budgetService = require('../budget/service'); // so we can call recalcMonth()

async function getDefaultProfileId() {
  const p = await prisma.profile.findFirst();
  if (!p) {
    const err = new Error('No profile found');
    err.status = 500;
    throw err;
  }
  return p.id;
}

function toIsoMidnight(dateStr) {
  // Plaid often gives YYYY-MM-DD; make it ISO
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function plaidAmountToCents(plaidAmount) {
  // Plaid: amount is positive for outflow, negative for inflow :contentReference[oaicite:2]{index=2}
  // Your system: negative = spend, positive = income
  return Math.round(-plaidAmount * 100);
}

async function createLinkToken({ countryCodes = ['US'], products = ['transactions'] }) {
  const profileId = await getDefaultProfileId();

  const req = {
    user: { client_user_id: profileId },
    client_name: "Ben's Budget App",
    products,
    country_codes: countryCodes,
    language: 'en',
  };

  try {
    const resp = await plaid.linkTokenCreate(req);
    return { link_token: resp.data.link_token };
  } catch (err) {
    console.error('=== PLAID LINK TOKEN ERROR ===');
    console.error('status:', err?.response?.status);
    console.error('data:', JSON.stringify(err?.response?.data, null, 2));
    console.error('==============================');
    throw err;
  }
}

async function exchangePublicToken({ publicToken, institutionName }) {
  const profileId = await getDefaultProfileId();

  // Exchange public_token -> access_token, item_id :contentReference[oaicite:5]{index=5}
  const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;

  // Upsert PlaidItem
  const item = await prisma.plaidItem.upsert({
    where: { itemId },
    update: { accessToken, institutionName: institutionName || undefined },
    create: { profileId, itemId, accessToken, institutionName: institutionName || null },
  });

  // Pull accounts and upsert into Account table
  const acctResp = await plaid.accountsGet({ access_token: accessToken });
  const accounts = acctResp.data.accounts || [];
  const safeAccountName = (a) => (a.mask ? `${a.name} ••••${a.mask}` : a.name);

  const upserts = accounts.map(a => {
    const safeName = safeAccountName(a);

    return prisma.account.upsert({
      where: { plaidAccountId: a.account_id },
      update: {
        profileId,
        plaidItemId: item.id,
        institution: institutionName || 'Plaid',
        name: safeName, // ✅ changed
        type: a.type,
        mask: a.mask || null,
        officialName: a.official_name || null,
        subtype: a.subtype || null,
        isArchived: false,
      },
      create: {
        profileId,
        plaidItemId: item.id,
        plaidAccountId: a.account_id,
        institution: institutionName || 'Plaid',
        name: safeName, // ✅ changed
        type: a.type,
        mask: a.mask || null,
        officialName: a.official_name || null,
        subtype: a.subtype || null,
        isArchived: false,
      },
    });
  });

  await prisma.$transaction(upserts);

  return {
    plaidItemId: item.id,
    itemId: item.itemId,
    accounts: accounts.map(a => ({
      plaidAccountId: a.account_id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      mask: a.mask,
    })),
  };
}

async function syncItem({ plaidItemId, recalcMonth }) {
  const profileId = await getDefaultProfileId();

  console.log('SYNC plaidItemId received:', plaidItemId);
  console.log('DATABASE_URL at runtime:', process.env.DATABASE_URL);

  const allItems = await prisma.plaidItem.findMany({
    select: { id: true, itemId: true, profileId: true },
  });
  console.log('PlaidItems visible to server:', allItems);

  const item = await prisma.plaidItem.findUnique({ where: { id: plaidItemId } });
  if (!item) {
    const err = new Error('PlaidItem not found');
    err.status = 404;
    throw err;
  }

  // Map plaidAccountId -> internal accountId
  const dbAccounts = await prisma.account.findMany({
    where: { profileId, plaidItemId: item.id, plaidAccountId: { not: null } },
    select: { id: true, plaidAccountId: true },
  });
  const accountIdByPlaid = new Map(dbAccounts.map(a => [a.plaidAccountId, a.id]));

  let cursor = item.cursor || null;
  let hasMore = true;

  let added = 0, modified = 0, removed = 0;

  while (hasMore) {
    // /transactions/sync is cursor-based and returns added/modified/removed plus has_more :contentReference[oaicite:6]{index=6}
    const resp = await plaid.transactionsSync({
      access_token: item.accessToken,
      cursor,
      count: 500,
    });

    const data = resp.data;
    cursor = data.next_cursor;
    hasMore = data.has_more;

    // removed
    for (const r of (data.removed || [])) {
      removed++;
      await prisma.transaction.deleteMany({
        where: { profileId, plaidId: r.transaction_id },
      });
    }

    // helper to upsert a plaid tx
    const upsertPlaidTx = async (t, kind) => {
      const accountId = accountIdByPlaid.get(t.account_id);
      if (!accountId) return;

      const amountCents = plaidAmountToCents(t.amount); // sign conversion :contentReference[oaicite:7]{index=7}
      const status = t.pending ? 'pending' : 'posted';

      const postedAt =
        t.datetime ? new Date(t.datetime) :
          t.authorized_datetime ? new Date(t.authorized_datetime) :
            toIsoMidnight(t.date);

      // If this posted tx references a pending_transaction_id, try to “upgrade” the pending row
      if (!t.pending && t.pending_transaction_id) {
        const pendingRow = await prisma.transaction.findFirst({
          where: { profileId, plaidId: t.pending_transaction_id },
        });
        if (pendingRow) {
          await prisma.transaction.update({
            where: { id: pendingRow.id },
            data: {
              plaidId: t.transaction_id,
              pendingPlaidId: t.pending_transaction_id,
              accountId,
              postedAt,
              amountCents,
              status,
              memo: t.name || '',
            },
          });
          return;
        }
      }

      // Otherwise upsert by (profileId, plaidId) using findFirst/update/create
      const existing = await prisma.transaction.findFirst({
        where: { profileId, plaidId: t.transaction_id },
      });

      if (existing) {
        await prisma.transaction.update({
          where: { id: existing.id },
          data: {
            accountId,
            postedAt,
            amountCents,
            status,
            pendingPlaidId: t.pending_transaction_id || null,
            memo: t.name || '',
          },
        });
      } else {
        await prisma.transaction.create({
          data: {
            profileId,
            accountId,
            postedAt,
            amountCents,
            status,
            plaidId: t.transaction_id,
            pendingPlaidId: t.pending_transaction_id || null,
            memo: t.name || '',
            categoryId: null,
          },
        });
      }
    };

    for (const t of (data.added || [])) { added++; await upsertPlaidTx(t, 'added'); }
    for (const t of (data.modified || [])) { modified++; await upsertPlaidTx(t, 'modified'); }
  }

  // save cursor + stamp sync
  await prisma.plaidItem.update({ where: { id: item.id }, data: { cursor } });
  await prisma.account.updateMany({
    where: { profileId, plaidItemId: item.id },
    data: { lastSyncAt: new Date() },
  });

  // optional: recalc
  const month = recalcMonth || new Date().toISOString().slice(0, 7);
  await budgetService.recalcMonth({ month, status: 'posted' });

  return { plaidItemId: item.id, cursor, added, modified, removed, recalcMonth: month };
}

async function sandboxPublicToken() {
  // Common sandbox institution id used in Plaid examples; any sandbox institution works
  const institution_id = 'ins_109508';

  const resp = await plaid.sandboxPublicTokenCreate({
    institution_id,
    initial_products: ['transactions'],
  });

  return { public_token: resp.data.public_token, institution_id };
}

module.exports = { createLinkToken, exchangePublicToken, syncItem, sandboxPublicToken };