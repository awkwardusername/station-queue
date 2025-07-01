import 'dotenv/config';
import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient().$extends(withAccelerate());

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use((req, res, next) => {
  if (!req.cookies.userId) {
    res.cookie('userId', randomUUID(), { httpOnly: false });
  }
  next();
});

// Helper to get admin secret from Config table
async function getAdminSecret() {
  const config = await prisma.config.findUnique({ where: { key: 'ADMIN_SECRET' } });
  return config?.value;
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
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
  const userId = req.cookies.userId;
  try {
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station) return res.status(404).json({ error: 'Station not found' });
    const existing = await prisma.queue.findUnique({ where: { stationId_userId: { stationId, userId } } });
    if (existing) {
      res.json({ queueNumber: existing.position });
    } else {
      const max = await prisma.queue.aggregate({
        where: { stationId },
        _max: { position: true }
      });
      const position = (max._max.position || 0) + 1;
      await prisma.queue.create({ data: { stationId, userId, position } });
      res.json({ queueNumber: position });
    }
  } catch (err) {
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
  const managerId = req.body.managerId;
  try {
    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.managerId !== managerId) return res.status(403).json({ error: 'Forbidden' });
    const first = await prisma.queue.findFirst({
      where: { stationId },
      orderBy: { position: 'asc' }
    });
    if (!first) return res.json({ popped: null });
    await prisma.queue.delete({ where: { stationId_userId: { stationId, userId: first.userId } } });
    res.json({ popped: first.userId });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// User: view all queues
app.get('/my-queues', async (req, res) => {
  const userId = req.cookies.userId;
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

export default app;
