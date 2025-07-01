// Script to check and display configured Ably API keys in the database
// Usage: node check-ably-keys.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Get both keys
    const backendKey = await prisma.config.findUnique({ where: { key: 'ABLY_API_KEY' } });
    const frontendKey = await prisma.config.findUnique({ where: { key: 'VITE_ABLY_API_KEY' } });
    
    console.log('====== Ably API Key Configuration ======');
    
    if (backendKey) {
      const keyParts = backendKey.value.split(':');
      if (keyParts.length === 2) {
        // Show masked key for security
        console.log(`Backend Key (ABLY_API_KEY): ${keyParts[0].substring(0, 4)}...${keyParts[0].substring(keyParts[0].length - 4)} : ${keyParts[1].substring(0, 2)}...`);
      } else {
        console.log(`Backend Key (ABLY_API_KEY): [Format unknown] - ${backendKey.value.length} characters`);
      }
    } else {
      console.log('Backend Key (ABLY_API_KEY): Not configured');
    }
    
    if (frontendKey) {
      const keyParts = frontendKey.value.split(':');
      if (keyParts.length === 2) {
        // Show masked key for security
        console.log(`Frontend Key (VITE_ABLY_API_KEY): ${keyParts[0].substring(0, 4)}...${keyParts[0].substring(keyParts[0].length - 4)} : ${keyParts[1].substring(0, 2)}...`);
      } else {
        console.log(`Frontend Key (VITE_ABLY_API_KEY): [Format unknown] - ${frontendKey.value.length} characters`);
      }
    } else {
      console.log('Frontend Key (VITE_ABLY_API_KEY): Not configured');
    }
    
    console.log('\nSetup Commands:');
    console.log('- Set Backend Key: npm run set-backend-ably-key "your-backend-key"');
    console.log('- Set Frontend Key: npm run set-frontend-ably-key "your-frontend-key"');
  } catch (error) {
    console.error('Error checking Ably API keys:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
