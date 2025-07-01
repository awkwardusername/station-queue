// Script to clean up orphaned lastPosition config entries
// This script finds and removes lastPosition entries for stations that no longer exist
// Usage: node prisma/cleanup-orphaned-position-keys.js

// Handle both ESM and CommonJS
let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  // If require fails, we're in ESM mode
  PrismaClient = (await import('@prisma/client')).PrismaClient;
}

const prisma = new PrismaClient();

async function main() {
  console.log('Starting cleanup of orphaned lastPosition entries...');
  
  // Find all lastPosition config entries
  const positionEntries = await prisma.config.findMany({
    where: {
      key: {
        startsWith: 'lastPosition:'
      }
    }
  });
  
  console.log(`Found ${positionEntries.length} lastPosition entries in the Config table.`);
  
  // Get all active station IDs
  const stations = await prisma.station.findMany({
    select: { id: true }
  });
  const stationIds = new Set(stations.map(station => station.id));
  
  console.log(`Found ${stationIds.size} active stations.`);
  
  // Find orphaned entries
  const orphanedEntries = positionEntries.filter(entry => {
    // Extract the stationId from the key (format: lastPosition:stationId)
    const stationId = entry.key.split(':')[1];
    return !stationIds.has(stationId);
  });
  
  console.log(`Found ${orphanedEntries.length} orphaned lastPosition entries.`);
  
  // Delete orphaned entries
  if (orphanedEntries.length > 0) {
    for (const entry of orphanedEntries) {
      await prisma.config.delete({
        where: { key: entry.key }
      });
      console.log(`Deleted orphaned entry with key: ${entry.key}`);
    }
    console.log(`Successfully deleted ${orphanedEntries.length} orphaned entries.`);
  } else {
    console.log('No orphaned entries found. Database is clean!');
  }
}

main()
  .catch((e) => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
