// Script to set or update the ABLY_API_KEY in the Config table using Prisma
// Usage: node prisma/seed-ably-key.js <ably-api-key>

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ablyKey = process.argv[2];
  if (!ablyKey) {
    console.error('Usage: node prisma/seed-ably-key.js <ably-api-key>');
    process.exit(1);
  }
  await prisma.config.upsert({
    where: { key: 'ABLY_API_KEY' },
    update: { value: ablyKey },
    create: { key: 'ABLY_API_KEY', value: ablyKey },
  });
  console.log('ABLY_API_KEY set successfully in database.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
