// Script to initialize lastPosition values for all stations
// This ensures that position numbers are never reused
// Usage: node prisma/initialize-last-positions.js

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
  // Get all stations
  const stations = await prisma.station.findMany();
  
  console.log(`Found ${stations.length} stations. Initializing last position values...`);
  
  for (const station of stations) {
    // Get the current max position for this station
    const max = await prisma.queue.aggregate({
      where: { stationId: station.id },
      _max: { position: true }
    });
    
    // Use at least 99 as the starting value (so next position will be 100)
    const lastPosition = Math.max(max._max.position || 0, 99);
    const positionKey = `lastPosition:${station.id}`;
    
    // Upsert the last position record
    await prisma.config.upsert({
      where: { key: positionKey },
      update: { value: String(lastPosition) },
      create: { key: positionKey, value: String(lastPosition) },
    });
    
    console.log(`Station ${station.name} (${station.id}) - Last position set to ${lastPosition}`);
  }
  
  console.log('Last position initialization complete!');
}

main()
  .catch((e) => {
    console.error('Error during initialization:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
