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

// Helper to publish to Ably channels
const publishToChannel = async (channelName, eventName, data) => {
  if (!ably) {
    ably = await initializeAbly();
    if (!ably) return Promise.reject('Ably not initialized');
  }
  
  const channel = ably.channels.get(channelName);
  return channel.publish(eventName, data);
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
    await prisma.queue.deleteMany({ where: { stationId: id } });
    await prisma.station.delete({ where: { id } });
    
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
app.get('/config/ably-key', async (req, res) => {
  try {
    // Check if this is a frontend request (use the client-side key)
    const isFrontend = req.query.frontend === 'true';
    const keyName = isFrontend ? 'VITE_ABLY_API_KEY' : 'ABLY_API_KEY';
    
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
  try {
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station) return res.status(404).json({ error: 'Station not found' });
    const existing = await prisma.queue.findUnique({ where: { stationId_userId: { stationId, userId } } });
    let position;
    
    if (existing) {
      position = existing.position;
    } else {      const max = await prisma.queue.aggregate({
        where: { stationId },
        _max: { position: true }
      });
      // Start position from 100 instead of 1
      position = (max._max.position || 99) + 1;
      await prisma.queue.create({ data: { stationId, userId, position } });
    }
    
    // Get the full queue after update
    const queue = await prisma.queue.findMany({
      where: { stationId },
      orderBy: { position: 'asc' }
    });
    
    // Publish queue update
    await publishToChannel(
      CHANNEL_NAMES.QUEUE(stationId),
      EVENT_NAMES.QUEUE_UPDATE,
      { queue: queue.map(r => ({ user_id: r.userId, position: r.position })) }
    );
    
    // Also update the user's personal queue
    const userQueues = await prisma.queue.findMany({
      where: { userId },
      include: { station: true },
      orderBy: { position: 'asc' }
    });
    
    const userQueueData = userQueues.map(q => ({ 
      stationId: q.stationId, 
      stationName: q.station.name, 
      queueNumber: q.position 
    }));
    
    console.log(`Publishing to ${CHANNEL_NAMES.MY_QUEUES(userId)}:${EVENT_NAMES.QUEUE_UPDATE}`, userQueueData);
    
    await publishToChannel(
      CHANNEL_NAMES.MY_QUEUES(userId),
      EVENT_NAMES.QUEUE_UPDATE,
      userQueueData
    );
    
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
      res.status(400).json({ error: 'Invalid request body format', details: e.message });
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
    await prisma.queue.delete({ where: { stationId_userId: { stationId, userId: poppedUserId } } });
    
    // Get updated queue
    const queue = await prisma.queue.findMany({
      where: { stationId },
      orderBy: { position: 'asc' }
    });
    
    // Publish queue update after pop
    await publishToChannel(
      CHANNEL_NAMES.QUEUE(stationId),
      EVENT_NAMES.QUEUE_UPDATE,
      { queue: queue.map(r => ({ user_id: r.userId, position: r.position })) }
    );
    
    // Publish specific pop event
    await publishToChannel(
      CHANNEL_NAMES.QUEUE(stationId),
      EVENT_NAMES.QUEUE_POP,
      { poppedUserId }
    );
    
    // Update the popped user's personal queue
    const userQueues = await prisma.queue.findMany({
      where: { userId: poppedUserId },
      include: { station: true },
      orderBy: { position: 'asc' }
    });
    
    const userQueueData = userQueues.map(q => ({ 
      stationId: q.stationId, 
      stationName: q.station.name, 
      queueNumber: q.position 
    }));
    
    console.log(`Publishing to ${CHANNEL_NAMES.MY_QUEUES(poppedUserId)}:${EVENT_NAMES.QUEUE_UPDATE}`, userQueueData);
    
    await publishToChannel(
      CHANNEL_NAMES.MY_QUEUES(poppedUserId),
      EVENT_NAMES.QUEUE_UPDATE,
      userQueueData
    );
    
    res.json({ popped: poppedUserId });
  } catch (err) {
    console.error('Error in pop queue:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// User: view all queues
app.get('/my-queues', async (req, res) => {
  const userId = req.userId;
  try {
    const queues = await prisma.queue.findMany({
      where: { userId },
      include: { station: true },
      orderBy: { position: 'asc' }
    });
    res.json(queues.map(q => ({ stationId: q.stationId, stationName: q.station.name, queueNumber: q.position })));
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

const serverlessHandler = serverless(app, { basePath: '/.netlify/functions/api' });
export const handler = serverlessHandler;
export default app;
