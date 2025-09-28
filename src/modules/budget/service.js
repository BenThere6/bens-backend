// For now these are in-memory stubs; later swap to SQLite/Prisma
const rules = [];
const envelopes = [
    { id: 'food', name: 'Food', month: '2025-09', plannedCents: 40000, actualCents: 12345 }
];

async function listEnvelopes({ month }) {
    return month ? envelopes.filter(e => e.month === month) : envelopes;
}

async function createRule({ priority, tests, actions, isActive }) {
    const id = `r_${Date.now()}`;
    const rule = { id, priority, tests, actions, isActive: isActive ?? true };
    rules.push(rule);
    return rule;
}

module.exports = { listEnvelopes, createRule };
