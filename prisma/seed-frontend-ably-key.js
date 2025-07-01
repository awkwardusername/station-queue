// Script to set or update the VITE_ABLY_API_KEY in the Config table using Prisma
// Usage: node prisma/seed-frontend-ably-key.js <frontend-ably-api-key>

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ablyKey = process.argv[2];
  if (!ablyKey) {
    console.error('Usage: node prisma/seed-frontend-ably-key.js <frontend-ably-api-key>');
    process.exit(1);
  }
  await prisma.config.upsert({
    where: { key: 'VITE_ABLY_API_KEY' },
    update: { value: ablyKey },
    create: { key: 'VITE_ABLY_API_KEY', value: ablyKey },
  });
  console.log('VITE_ABLY_API_KEY set successfully in database.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
