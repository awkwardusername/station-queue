import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import cookie from 'cookie';
import serverless from 'serverless-http';
import * as Ably from 'ably';

const prisma = new PrismaClient().$extends(withAccelerate());

// Initialize Ably with null - we'll set it once we get the API key from the database
let ably = null;

// Helper to get configuration values from the Config table
async function getConfigValue(key) {
  const config = await prisma.config.findUnique({ where: { key } });
  return config?.value;
}

// Helper to get and increment the last issued position for a station
async function getNextPositionForStation(stationId) {
  const positionKey = `lastPosition:${stationId}`;
  
  // Use a transaction to ensure we don't have race conditions
  return prisma.$transaction(async (tx) => {
    // Try to get the last position for this station
    const lastPositionConfig = await tx.config.findUnique({ 
      where: { key: positionKey } 
    });
    
    let lastPosition;
    if (!lastPositionConfig) {
      // If we don't have a last position, start from 99 (so next position will be 100)
      lastPosition = 99;
      // Create the initial record
      await tx.config.create({ 
        data: { key: positionKey, value: String(lastPosition) }
      });
    } else {
      lastPosition = parseInt(lastPositionConfig.value, 10);
    }
    
    // Increment the position
    const nextPosition = lastPosition + 1;
    
    // Update the last position in the database
    await tx.config.update({
      where: { key: positionKey },
      data: { value: String(nextPosition) }
    });
    
    return nextPosition;
  });
}

// Helper to initialize Ably with the API key from the database
async function initializeAbly() {
  try {
    // Always use the backend key for server-side operations
    const apiKey = await getConfigValue('ABLY_API_KEY');
    if (!apiKey) {
      console.error('ABLY_API_KEY not found in database. Real-time updates will not work.');
      return null;
    }
    
    console.log('Initializing Ably with backend API key from database');
    return new Ably.Rest({ key: apiKey });
  } catch (error) {
    console.error('Error initializing Ably:', error);
    return null;
  }
}

// Channel and event names (keep in sync with frontend)
const CHANNEL_NAMES = {
  QUEUE: (stationId) => `queue:${stationId}`,
  STATIONS: 'stations',
  MY_QUEUES: (userId) => `my-queues:${userId}`,
};

const EVENT_NAMES = {
  QUEUE_UPDATE: 'queue:update',
  QUEUE_POP: 'queue:pop',
  STATION_UPDATE: 'station:update',
  STATION_CREATE: 'station:create',
  STATION_DELETE: 'station:delete',
};

// Enhanced helper to publish to Ably channels with retry logic
const publishToChannel = async (channelName, eventName, data, maxRetries = 3) => {
  const attemptPublish = async (retryCount = 0) => {
    try {
      // Cache Ably instance for the lifetime of the function
      if (!ably) {
        ably = await initializeAbly();
        if (!ably) {
          throw new Error('Ably not initialized');
        }
      }
      
      const channel = ably.channels.get(channelName);
      console.log(`Publishing to ${channelName}:${eventName}`, data);
      
      const result = await channel.publish(eventName, data);
      console.log(`Successfully published to ${channelName}:${eventName}`);
      return result;
    } catch (error) {
      console.error(`Error publishing to ${channelName}:${eventName} (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const delay = 1000 * Math.pow(2, retryCount); // Exponential backoff
        console.log(`Retrying publish to ${channelName}:${eventName} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Reset ably instance on retry to ensure fresh connection
        if (retryCount > 0) {
          ably = null;
        }
        
        return attemptPublish(retryCount + 1);
      }
      
      console.error(`Failed to publish to ${channelName}:${eventName} after ${maxRetries + 1} attempts`);
      throw error;
    }
  };

  return attemptPublish();
};

// Helper to safely publish to multiple channels in parallel with error isolation
const publishToChannelsParallel = async (publishPromises) => {
  const results = await Promise.allSettled(publishPromises);
  
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Publishing failed for operation ${index + 1}:`, result.reason);
    }
  });
  
  // Return the number of successful publishes
  return results.filter(result => result.status === 'fulfilled').length;
};

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.use((req, res, next) => {
  let cookies = {};
  if (req.headers.cookie) {
    cookies = cookie.parse(req.headers.cookie);
  }
  let userId = cookies.userId;
  // Accept userId from x-user-id header if present (for Netlify/SPA clients)
  if (!userId && req.headers['x-user-id']) {
    userId = req.headers['x-user-id'];
  }
  req.userId = userId;
  next();
});

// Helper to get admin secret from Config table
async function getAdminSecret() {
  return getConfigValue('ADMIN_SECRET');
}

// Admin: create station
app.post('/admin/stations', async (req, res) => {
  const { secret, name } = req.body;
  const dbSecret = await getAdminSecret();
  if (secret !== dbSecret) return res.status(403).json({ error: 'Forbidden' });
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = randomUUID();
  const managerId = randomUUID();
  try {
    const station = await prisma.station.create({
      data: { id, name, managerId }
    });
    
    // Publish station creation event
    await publishToChannel(
      CHANNEL_NAMES.STATIONS, 
      EVENT_NAMES.STATION_CREATE, 
      station
    );
    
    res.json(station);
  } catch (err) {
    res.status(500).json({ error: 'DB error', details: err.message });
  }
});

// Admin: delete station
app.delete('/admin/stations/:id', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  const dbSecret = await getAdminSecret();
  if (secret !== dbSecret) return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;  
  try {
    console.log(`Deleting station ${id} and all associated data...`);
    
    // Delete all queue entries for this station
    const deletedQueue = await prisma.queue.deleteMany({ where: { stationId: id } });
    console.log(`Deleted ${deletedQueue.count} queue entries`);
    
    // Delete the lastPosition config entry for this station
    const positionKey = `lastPosition:${id}`;
    const deletedConfig = await prisma.config.deleteMany({ where: { key: positionKey } });
    console.log(`Deleted ${deletedConfig.count} config entries with key: ${positionKey}`);
    
    // Delete the station itself
    await prisma.station.delete({ where: { id } });
    console.log(`Deleted station ${id}`);
    
    // Publish station deletion event
    await publishToChannel(
      CHANNEL_NAMES.STATIONS, 
      EVENT_NAMES.STATION_DELETE, 
      { id }
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});



// Get Ably API key for client-side initialization
let ablyKeyCache = { value: null, expires: 0 };

app.get('/config/ably-key', async (req, res) => {
  try {
    const keyName = 'VITE_ABLY_API_KEY';
    const now = Date.now();
    // Cache for 5 minutes
    if (ablyKeyCache.value && ablyKeyCache.expires > now) {
      return res.json({ key: ablyKeyCache.value });
    }

    const apiKey = await getConfigValue(keyName);
    if (!apiKey) {
      console.error(`${keyName} not found in database. Check your configuration.`);
      return res.status(404).json({ error: `Ably API key (${keyName}) not found` });
    }

    // Only return the key value, not the entire key
    const keyParts = apiKey.split(':');
    if (keyParts.length === 2) {
      // Return a partially masked key for logging
      console.log(`Serving ${keyName}: ${keyParts[0].substring(0, 4)}...`);
    } else {
      console.log(`Serving ${keyName} (format unknown)`);
    }

    ablyKeyCache.value = apiKey;
    ablyKeyCache.expires = now + 5 * 60 * 1000; // 5 minutes

    res.json({ key: apiKey });
  } catch (err) {
    console.error('Error retrieving Ably API key:', err);
    res.status(500).json({ error: 'Error retrieving configuration' });
  }
});

// List stations
app.get('/stations', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== undefined) {
    const dbSecret = await getAdminSecret();
    if (adminSecret !== dbSecret) return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const stations = await prisma.station.findMany();
    res.json(stations);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// User: join queue
app.post('/queue/:stationId', async (req, res) => {
  const { stationId } = req.params;
  const userId = req.userId;
  console.log(`Join Queue Debug: userId from request: ${userId}, stationId: ${stationId}`);
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }
  
  try {
    const station = await prisma.station.findUnique({
      where: { id: stationId },
      select: { id: true } // Only fetch id for existence check
    });
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const existing = await prisma.queue.findUnique({
      where: { stationId_userId: { stationId, userId } },
      select: { position: true } // Only fetch position
    });
    let position;

    if (existing) {
      position = existing.position;
    } else {
      // Get a new, never-reused position for this user
      position = await getNextPositionForStation(stationId);
      await prisma.queue.create({ data: { stationId, userId, position } });
    }

    // Get the full queue after update (only needed fields)
    const queue = await prisma.queue.findMany({
      where: { stationId },
      orderBy: { position: 'asc' },
      select: { userId: true, position: true }
    });

    // Also update the user's personal queue (only needed fields)
    const userQueues = await prisma.queue.findMany({
      where: { userId },
      include: { station: { select: { name: true } } },
      orderBy: { position: 'asc' }
    });

    const userQueueData = await Promise.all(userQueues.map(async (q) => {
      // Get all users in this station's queue to calculate actual position
      const stationQueue = await prisma.queue.findMany({
        where: { stationId: q.stationId },
        orderBy: { position: 'asc' },
        select: { userId: true, position: true }
      });
      
      // Find this user's actual position in line (1st, 2nd, 3rd, etc.)
      const userIndex = stationQueue.findIndex(sq => sq.userId === userId);
      const actualPosition = userIndex === -1 ? 0 : userIndex + 1;
      
      console.log(`Join Queue Debug: User ${userId} in station ${q.stationId} - position ${q.position}, actual position ${actualPosition}`);
      
      return {
        stationId: q.stationId,
        stationName: q.station.name,
        queueNumber: q.position,
        actualPosition: actualPosition
      };
    }));

    // Parallelize Ably publishing with error isolation
    const publishResults = await publishToChannelsParallel([
      publishToChannel(
        CHANNEL_NAMES.QUEUE(stationId),
        EVENT_NAMES.QUEUE_UPDATE,
        { queue: queue.map(r => ({ user_id: r.userId, position: r.position })) }
      ),
      publishToChannel(
        CHANNEL_NAMES.MY_QUEUES(userId),
        EVENT_NAMES.QUEUE_UPDATE,
        userQueueData
      )
    ]);

    console.log(`Published ${publishResults}/2 real-time updates for queue join`);

    res.json({ queueNumber: position });
  } catch (err) {
    console.error('Error in join queue:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Person: view queue
app.get('/queue/:stationId', async (req, res) => {
  const { stationId } = req.params;
  const managerId = req.query.managerId;
  try {
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.managerId !== managerId) return res.status(403).json({ error: 'Forbidden' });
    const queue = await prisma.queue.findMany({
      where: { stationId },
      orderBy: { position: 'asc' }
    });
    res.json({ queue: queue.map(r => ({ user_id: r.userId, position: r.position })) });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Person: pop queue
app.post('/queue/:stationId/pop', async (req, res) => {
  const { stationId } = req.params;
  let managerId = req.body.managerId;

  // Handle Buffer body (Netlify issue)
  if (typeof req.body === 'object' && Buffer.isBuffer(req.body)) {
    try {
      const parsed = JSON.parse(req.body.toString('utf8'));
      managerId = parsed.managerId;
    } catch (e) {
      console.log('Pop Queue Debug: Failed to parse Buffer body', { error: e });
      return res.status(400).json({ error: 'Invalid request body format', details: e.message });
    }
  }

  try {
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      console.log('Pop Queue Debug: Station not found');
      return res.status(403).json({ error: 'Forbidden', reason: 'Station not found' });
    }
    if (station.managerId !== managerId) {
      console.log('Pop Queue Debug: ManagerId mismatch', { dbManagerId: station.managerId, incomingManagerId: managerId });
      return res.status(403).json({ error: 'Forbidden', reason: 'ManagerId mismatch', dbManagerId: station.managerId, incomingManagerId: managerId });
    }
    const first = await prisma.queue.findFirst({
      where: { stationId },
      orderBy: { position: 'asc' }
    });
    
    if (!first) return res.json({ popped: null });
    
    const poppedUserId = first.userId;
    console.log(`Pop Queue Debug: Popping user ${poppedUserId} from station ${stationId}`);
    
    await prisma.queue.delete({ where: { stationId_userId: { stationId, userId: poppedUserId } } });
    
    // Get updated queue
    // Get updated queue (only needed fields)
    const queue = await prisma.queue.findMany({
      where: { stationId },
      orderBy: { position: 'asc' },
      select: { userId: true, position: true }
    });

    // Update the popped user's personal queue (only needed fields)
    const userQueues = await prisma.queue.findMany({
      where: { userId: poppedUserId },
      include: { station: { select: { name: true } } },
      orderBy: { position: 'asc' }
    });

    const userQueueData = await Promise.all(userQueues.map(async (q) => {
      // Get all users in this station's queue to calculate actual position
      const stationQueue = await prisma.queue.findMany({
        where: { stationId: q.stationId },
        orderBy: { position: 'asc' },
        select: { userId: true, position: true }
      });
      
      // Find this user's actual position in line (1st, 2nd, 3rd, etc.)
      const userIndex = stationQueue.findIndex(sq => sq.userId === poppedUserId);
      const actualPosition = userIndex === -1 ? 0 : userIndex + 1;
      
      console.log(`Pop Queue Debug: Popped user ${poppedUserId} in station ${q.stationId} - position ${q.position}, actual position ${actualPosition}`);
      
      return {
        stationId: q.stationId,
        stationName: q.station.name,
        queueNumber: q.position,
        actualPosition: actualPosition
      };
    }));

    console.log(`Pop Queue Debug: Publishing to channels for user ${poppedUserId}`);
    console.log(`Pop Queue Debug: User queue data:`, userQueueData);

    // Get all remaining users in this queue to notify them of position changes
    const remainingUserIds = queue.map(q => q.userId);
    console.log(`Pop Queue Debug: Remaining users in queue:`, remainingUserIds);

    // Prepare publish operations
    const publishOperations = [
      publishToChannel(
        CHANNEL_NAMES.QUEUE(stationId),
        EVENT_NAMES.QUEUE_UPDATE,
        { queue: queue.map(r => ({ user_id: r.userId, position: r.position })) }
      ),
      publishToChannel(
        CHANNEL_NAMES.QUEUE(stationId),
        EVENT_NAMES.QUEUE_POP,
        { poppedUserId }
      ),
      publishToChannel(
        CHANNEL_NAMES.MY_QUEUES(poppedUserId),
        EVENT_NAMES.QUEUE_UPDATE,
        userQueueData
      )
    ];

    // Update personal queues for all remaining users so they get notifications
    for (const remainingUserId of remainingUserIds) {
      const remainingUserQueues = await prisma.queue.findMany({
        where: { userId: remainingUserId },
        include: { station: { select: { name: true } } },
        orderBy: { position: 'asc' }
      });

      const remainingUserQueueData = await Promise.all(remainingUserQueues.map(async (q) => {
        // Get all users in this station's queue to calculate actual position
        const stationQueue = await prisma.queue.findMany({
          where: { stationId: q.stationId },
          orderBy: { position: 'asc' },
          select: { userId: true, position: true }
        });
        
        // Find this user's actual position in line (1st, 2nd, 3rd, etc.)
        const userIndex = stationQueue.findIndex(sq => sq.userId === remainingUserId);
        const actualPosition = userIndex === -1 ? 0 : userIndex + 1;
        
        console.log(`Pop Queue Debug: User ${remainingUserId} in station ${q.stationId}:`);
        console.log(`  - Queue number: ${q.position}`);
        console.log(`  - User index in queue: ${userIndex}`);
        console.log(`  - Actual position: ${actualPosition}`);
        console.log(`  - Station queue:`, stationQueue.map(sq => `${sq.userId}:${sq.position}`));
        
        return {
          stationId: q.stationId,
          stationName: q.station.name,
          queueNumber: q.position,
          actualPosition: actualPosition
        };
      }));

      publishOperations.push(
        publishToChannel(
          CHANNEL_NAMES.MY_QUEUES(remainingUserId),
          EVENT_NAMES.QUEUE_UPDATE,
          remainingUserQueueData
        )
      );
    }

    // Parallelize Ably publishing with error isolation
    const publishResults = await publishToChannelsParallel(publishOperations);

    console.log(`Published ${publishResults}/${publishOperations.length} real-time updates for queue pop`);

    res.json({ popped: poppedUserId });
  } catch (err) {
    console.error('Error in pop queue:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// User: view all queues
app.get('/my-queues', async (req, res) => {
  const userId = req.userId;
  console.log(`My Queues Debug: userId from request: ${userId}`);
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }
  
  try {
    const queues = await prisma.queue.findMany({
      where: { userId },
      include: { station: { select: { name: true } } },
      orderBy: { position: 'asc' }
    });
    const result = await Promise.all(queues.map(async (q) => {
      // Get all users in this station's queue to calculate actual position
      const stationQueue = await prisma.queue.findMany({
        where: { stationId: q.stationId },
        orderBy: { position: 'asc' },
        select: { userId: true, position: true }
      });
      
      // Find this user's actual position in line (1st, 2nd, 3rd, etc.)
      const userIndex = stationQueue.findIndex(sq => sq.userId === userId);
      const actualPosition = userIndex === -1 ? 0 : userIndex + 1;
      
      console.log(`My Queues Debug: User ${userId} in station ${q.stationId}:`);
      console.log(`  - Queue number: ${q.position}`);
      console.log(`  - User index in queue: ${userIndex}`);
      console.log(`  - Actual position: ${actualPosition}`);
      console.log(`  - Station queue:`, stationQueue.map(sq => `${sq.userId}:${sq.position}`));
      
      return {
        stationId: q.stationId,
        stationName: q.station.name,
        queueNumber: q.position,
        actualPosition: actualPosition
      };
    }));
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

const serverlessHandler = serverless(app, { basePath: '/.netlify/functions/api' });
export const handler = serverlessHandler;
export default app;
