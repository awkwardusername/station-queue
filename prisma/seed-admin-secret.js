// Script to set or update the ADMIN_SECRET in the Config table using Prisma
// Usage: node prisma/seed-admin-secret.js <your-secret>

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const secret = process.argv[2];
  if (!secret) {
    console.error('Usage: node prisma/seed-admin-secret.js <your-secret>');
    process.exit(1);
  }
  await prisma.config.upsert({
    where: { key: 'ADMIN_SECRET' },
    update: { value: secret },
    create: { key: 'ADMIN_SECRET', value: secret },
  });
  console.log('ADMIN_SECRET set successfully.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
