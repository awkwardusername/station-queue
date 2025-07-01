// Script to reset queue positions to start from 100
// Usage: node prisma/reset-queue-positions.js

// Handle both ESM and CommonJS environments
let PrismaClient;
try {
  const prismaModule = require('@prisma/client');
  PrismaClient = prismaModule.PrismaClient;
} catch (e) {
  // If that fails, try ESM import
  console.warn('Failed to require PrismaClient, trying to import it');
  PrismaClient = require('@prisma/client').PrismaClient;
}

const prisma = new PrismaClient();

async function main() {
  // Get all stations
  const stations = await prisma.station.findMany();
  
  console.log(`Found ${stations.length} stations.`);
  
  for (const station of stations) {
    // Get the current max position for this station
    const max = await prisma.queue.aggregate({
      where: { stationId: station.id },
      _max: { position: true }
    });
    
    // If there are no queue items, set a dummy position at 99 to ensure the next one starts at 100
    if (!max._max.position) {
      console.log(`No queue items for station ${station.name} (${station.id}). Setting placeholder.`);
      // You could insert a dummy record here, but that's probably not necessary
      // since the API code has been updated to start at 100
    } else if (max._max.position < 100) {
      console.log(`Station ${station.name} (${station.id}) has queue positions below 100. Updating...`);
      
      // Get all queue items for this station
      const queueItems = await prisma.queue.findMany({
        where: { stationId: station.id },
        orderBy: { position: 'asc' }
      });
      
      // Update each item's position by adding 100
      for (const item of queueItems) {
        await prisma.queue.update({
          where: { stationId_userId: { stationId: item.stationId, userId: item.userId } },
          data: { position: item.position + 100 - 1 }  // +100 to start at 100, -1 to maintain order
        });
      }
      
      console.log(`Updated ${queueItems.length} queue items for station ${station.name}.`);
    } else {
      console.log(`Station ${station.name} (${station.id}) already has queue positions starting at or above 100.`);
    }
  }
  
  console.log('Queue positions reset complete!');
}

main()
  .catch((e) => {
    console.error('Error during reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
