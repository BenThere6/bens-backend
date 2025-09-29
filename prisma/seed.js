const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  let profile = await prisma.profile.findFirst();
  if (!profile) profile = await prisma.profile.create({ data: { name: 'Ben (Personal)' } });

  // One test account
  let account = await prisma.account.findFirst({ where: { profileId: profile.id, name: 'Checking' } });
  if (!account) {
    account = await prisma.account.create({
      data: { profileId: profile.id, institution: 'Demo Bank', name: 'Checking', type: 'checking' }
    });
  }

  // Category group + category
  let group = await prisma.categoryGroup.findFirst({ where: { profileId: profile.id, name: 'Everyday' } });
  if (!group) group = await prisma.categoryGroup.create({ data: { profileId: profile.id, name: 'Everyday' } });

  let food = await prisma.category.findFirst({ where: { profileId: profile.id, name: 'Food' } });
  if (!food) food = await prisma.category.create({ data: { profileId: profile.id, name: 'Food', groupId: group.id } });

  // Envelope + budget row for current month
  let env = await prisma.envelope.findFirst({ where: { profileId: profile.id, name: 'Food' } });
  if (!env) env = await prisma.envelope.create({ data: { profileId: profile.id, name: 'Food', categoryId: food.id } });

  const month = new Date().toISOString().slice(0, 7);
  await prisma.envelopeBudget.upsert({
    where: { envelopeId_month: { envelopeId: env.id, month } },
    update: { plannedCents: 40000, actualCents: 12345 },
    create: { envelopeId: env.id, month, plannedCents: 40000, actualCents: 12345 }
  });

  console.log('Seed complete.');
}

main().finally(() => prisma.$disconnect());
