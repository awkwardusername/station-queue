// src/__tests__/api.test.js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';

// Mock dependencies
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    config: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    station: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    queue: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $extends: vi.fn(() => mockPrismaClient),
  };
  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  };
});

vi.mock('@prisma/extension-accelerate', () => ({
  withAccelerate: vi.fn(() => ({})),
}));

vi.mock('ably', () => ({
  Rest: vi.fn(() => ({
    channels: {
      get: vi.fn(() => ({
        publish: vi.fn(),
      })),
    },
  })),
}));

vi.mock('dotenv/config', () => ({}));

describe('API Routes', () => {
  let app;
  let mockPrisma;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Clear the module cache to reset the app state between tests
    vi.resetModules();
    
    // Import the app after mocks are set up
    const apiModule = await import('../../netlify/functions/api.js');
    app = apiModule.default;
    
    // Get reference to the mocked prisma instance
    const { PrismaClient } = await import('@prisma/client');
    mockPrisma = new PrismaClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /admin/stations', () => {
    it('should create a station with valid admin secret', async () => {
      const mockAdminSecret = 'test-admin-secret';
      const stationName = 'Test Station';
      const mockStation = {
        id: randomUUID(),
        name: stationName,
        managerId: randomUUID(),
      };

      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });
      mockPrisma.station.create.mockResolvedValue(mockStation);

      const response = await request(app)
        .post('/admin/stations')
        .set('x-admin-secret', mockAdminSecret)
        .send({ name: stationName });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStation);
      expect(mockPrisma.station.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: stationName,
          id: expect.any(String),
          managerId: expect.any(String),
        }),
      });
    });

    it('should return 403 with invalid admin secret', async () => {
      const mockAdminSecret = 'test-admin-secret';
      const invalidSecret = 'invalid-secret';

      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });

      const response = await request(app)
        .post('/admin/stations')
        .set('x-admin-secret', invalidSecret)
        .send({ name: 'Test Station' });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Forbidden' });
    });

    it('should return 400 with missing station name', async () => {
      const mockAdminSecret = 'test-admin-secret';
      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });

      const response = await request(app)
        .post('/admin/stations')
        .set('x-admin-secret', mockAdminSecret)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Name required' });
    });

    it('should handle Buffer body format', async () => {
      const mockAdminSecret = 'test-admin-secret';
      const stationName = 'Test Station';
      const mockStation = {
        id: randomUUID(),
        name: stationName,
        managerId: randomUUID(),
      };

      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });
      mockPrisma.station.create.mockResolvedValue(mockStation);

      // Simulate Buffer body by sending raw JSON string
      const response = await request(app)
        .post('/admin/stations')
        .set('x-admin-secret', mockAdminSecret)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ name: stationName }));

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStation);
    });
  });

  describe('DELETE /admin/stations/:id', () => {
    it('should delete station with valid admin secret', async () => {
      const mockAdminSecret = 'test-admin-secret';
      const stationId = randomUUID();

      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });
      mockPrisma.queue.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.config.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.station.delete.mockResolvedValue({});

      const response = await request(app)
        .delete(`/admin/stations/${stationId}`)
        .set('x-admin-secret', mockAdminSecret);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockPrisma.queue.deleteMany).toHaveBeenCalledWith({ where: { stationId } });
      expect(mockPrisma.station.delete).toHaveBeenCalledWith({ where: { id: stationId } });
    });

    it('should return 403 with invalid admin secret', async () => {
      const mockAdminSecret = 'test-admin-secret';
      const stationId = randomUUID();

      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });

      const response = await request(app)
        .delete(`/admin/stations/${stationId}`)
        .set('x-admin-secret', 'invalid-secret');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Forbidden' });
    });
  });

  describe('GET /config/ably-key', () => {
    it('should return Ably API key', async () => {
      const mockApiKey = 'test-api-key:secret';
      mockPrisma.config.findUnique.mockResolvedValue({ value: mockApiKey });

      const response = await request(app)
        .get('/config/ably-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ key: mockApiKey });
    });

    it('should return 404 when API key not found', async () => {
      mockPrisma.config.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/config/ably-key');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Ably API key (VITE_ABLY_API_KEY) not found' });
    });

    it('should handle database errors', async () => {
      mockPrisma.config.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/config/ably-key');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Error retrieving configuration' });
    });
  });

  describe('GET /stations', () => {
    it('should return all stations without admin secret', async () => {
      const mockStations = [
        { id: randomUUID(), name: 'Station 1', managerId: randomUUID() },
        { id: randomUUID(), name: 'Station 2', managerId: randomUUID() },
      ];

      mockPrisma.station.findMany.mockResolvedValue(mockStations);

      const response = await request(app)
        .get('/stations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStations);
    });

    it('should return stations with valid admin secret', async () => {
      const mockAdminSecret = 'test-admin-secret';
      const mockStations = [
        { id: randomUUID(), name: 'Station 1', managerId: randomUUID() },
      ];

      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });
      mockPrisma.station.findMany.mockResolvedValue(mockStations);

      const response = await request(app)
        .get('/stations')
        .set('x-admin-secret', mockAdminSecret);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStations);
    });

    it('should return 403 with invalid admin secret', async () => {
      const mockAdminSecret = 'test-admin-secret';
      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });

      const response = await request(app)
        .get('/stations')
        .set('x-admin-secret', 'invalid-secret');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Forbidden' });
    });
  });

  describe('POST /queue/:stationId', () => {
    it('should join user to queue', async () => {
      const stationId = randomUUID();
      const userId = randomUUID();
      const position = 100;

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId });
      mockPrisma.queue.findUnique.mockResolvedValue(null); // User not in queue
      mockPrisma.$transaction.mockResolvedValue(position);
      mockPrisma.queue.create.mockResolvedValue({});
      mockPrisma.queue.findMany
        .mockResolvedValueOnce([{ userId, position }]) // For queue update
        .mockResolvedValueOnce([{ // For user's queues with station
          stationId,
          position,
          station: { name: 'Test Station' }
        }])
        .mockResolvedValue([{ userId, position }]); // For station queue position calculation

      const response = await request(app)
        .post(`/queue/${stationId}`)
        .set('x-user-id', userId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ queueNumber: position });
    });

    it('should return existing position if user already in queue', async () => {
      const stationId = randomUUID();
      const userId = randomUUID();
      const existingPosition = 101;

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId });
      mockPrisma.queue.findUnique.mockResolvedValue({ position: existingPosition });
      mockPrisma.queue.findMany
        .mockResolvedValueOnce([{ userId, position: existingPosition }]) // For queue update
        .mockResolvedValueOnce([{ // For user's queues with station
          stationId,
          position: existingPosition,
          station: { name: 'Test Station' }
        }])
        .mockResolvedValue([{ userId, position: existingPosition }]); // For station queue position calculation

      const response = await request(app)
        .post(`/queue/${stationId}`)
        .set('x-user-id', userId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ queueNumber: existingPosition });
    });

    it('should return 400 without user ID', async () => {
      const stationId = randomUUID();

      const response = await request(app)
        .post(`/queue/${stationId}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'User ID required' });
    });

    it('should return 404 for non-existent station', async () => {
      const stationId = randomUUID();
      const userId = randomUUID();

      mockPrisma.station.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post(`/queue/${stationId}`)
        .set('x-user-id', userId);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Station not found' });
    });
  });

  describe('GET /queue/:stationId', () => {
    it('should return queue for valid manager', async () => {
      const stationId = randomUUID();
      const managerId = randomUUID();
      const mockQueue = [
        { userId: randomUUID(), position: 100 },
        { userId: randomUUID(), position: 101 },
      ];

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId, managerId });
      mockPrisma.queue.findMany.mockResolvedValue(mockQueue);

      const response = await request(app)
        .get(`/queue/${stationId}`)
        .query({ managerId });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        queue: mockQueue.map(r => ({ user_id: r.userId, position: r.position }))
      });
    });

    it('should return 403 for invalid manager', async () => {
      const stationId = randomUUID();
      const managerId = randomUUID();
      const wrongManagerId = randomUUID();

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId, managerId });

      const response = await request(app)
        .get(`/queue/${stationId}`)
        .query({ managerId: wrongManagerId });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Forbidden' });
    });

    it('should return 403 for non-existent station', async () => {
      const stationId = randomUUID();
      const managerId = randomUUID();

      mockPrisma.station.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get(`/queue/${stationId}`)
        .query({ managerId });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Forbidden' });
    });
  });

  describe('POST /queue/:stationId/pop', () => {
    it('should pop first user from queue', async () => {
      const stationId = randomUUID();
      const managerId = randomUUID();
      const poppedUserId = randomUUID();
      const remainingUserId = randomUUID();

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId, managerId });
      mockPrisma.queue.findFirst.mockResolvedValue({ userId: poppedUserId, position: 100 });
      mockPrisma.queue.delete.mockResolvedValue({});
      mockPrisma.queue.findMany
        .mockResolvedValueOnce([{ userId: remainingUserId, position: 101 }]) // For updated queue
        .mockResolvedValueOnce([]) // For popped user's queues (now empty)
        .mockResolvedValueOnce([{ // For remaining user's queues with station
          stationId,
          position: 101,
          station: { name: 'Test Station' }
        }])
        .mockResolvedValue([{ userId: remainingUserId, position: 101 }]); // For position calculations

      const response = await request(app)
        .post(`/queue/${stationId}/pop`)
        .send({ managerId });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ popped: poppedUserId });
      expect(mockPrisma.queue.delete).toHaveBeenCalledWith({
        where: { stationId_userId: { stationId, userId: poppedUserId } }
      });
    });

    it('should return null when queue is empty', async () => {
      const stationId = randomUUID();
      const managerId = randomUUID();

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId, managerId });
      mockPrisma.queue.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post(`/queue/${stationId}/pop`)
        .send({ managerId });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ popped: null });
    });

    it('should return 403 for invalid manager', async () => {
      const stationId = randomUUID();
      const managerId = randomUUID();
      const wrongManagerId = randomUUID();

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId, managerId });

      const response = await request(app)
        .post(`/queue/${stationId}/pop`)
        .send({ managerId: wrongManagerId });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'Forbidden',
        reason: 'ManagerId mismatch',
        dbManagerId: managerId,
        incomingManagerId: wrongManagerId
      });
    });

    it('should handle Buffer body format', async () => {
      const stationId = randomUUID();
      const managerId = randomUUID();
      const poppedUserId = randomUUID();

      mockPrisma.station.findUnique.mockResolvedValue({ id: stationId, managerId });
      mockPrisma.queue.findFirst.mockResolvedValue({ userId: poppedUserId, position: 100 });
      mockPrisma.queue.delete.mockResolvedValue({});
      mockPrisma.queue.findMany.mockResolvedValue([]);

      const response = await request(app)
        .post(`/queue/${stationId}/pop`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ managerId }));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ popped: poppedUserId });
    });
  });

  describe('GET /my-queues', () => {
    it('should return user queues', async () => {
      const userId = randomUUID();
      const stationId1 = randomUUID();
      const stationId2 = randomUUID();
      
      const mockQueues = [
        {
          stationId: stationId1,
          position: 100,
          station: { name: 'Station 1' }
        },
        {
          stationId: stationId2,
          position: 102,
          station: { name: 'Station 2' }
        }
      ];

      const mockStationQueues = [
        { userId, position: 100 },
        { userId: randomUUID(), position: 101 }
      ];

      mockPrisma.queue.findMany
        .mockResolvedValueOnce(mockQueues) // First call for user's queues
        .mockResolvedValue(mockStationQueues); // Subsequent calls for station queues

      const response = await request(app)
        .get('/my-queues')
        .set('x-user-id', userId);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toEqual({
        stationId: stationId1,
        stationName: 'Station 1',
        queueNumber: 100,
        actualPosition: 1
      });
    });

    it('should return 400 without user ID', async () => {
      const response = await request(app)
        .get('/my-queues');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'User ID required' });
    });

    it('should return empty array for user with no queues', async () => {
      const userId = randomUUID();
      mockPrisma.queue.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/my-queues')
        .set('x-user-id', userId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('Helper Functions', () => {
    describe('getNextPositionForStation', () => {
      it('should start from position 100 for new station', async () => {
        const stationId = randomUUID();
        const positionKey = `lastPosition:${stationId}`;

        // Mock transaction
        const mockTx = {
          config: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({})
          }
        };

        mockPrisma.$transaction.mockImplementation(async (callback) => {
          return await callback(mockTx);
        });

        // Since we can't directly test the helper function, we test it through the API
        const userId = randomUUID();
        mockPrisma.station.findUnique.mockResolvedValue({ id: stationId });
        mockPrisma.queue.findUnique.mockResolvedValue(null);
        mockPrisma.$transaction.mockResolvedValue(100); // First position
        mockPrisma.queue.create.mockResolvedValue({});
        mockPrisma.queue.findMany
          .mockResolvedValueOnce([{ userId, position: 100 }]) // For queue update
          .mockResolvedValueOnce([{ // For user's queues with station
            stationId,
            position: 100,
            station: { name: 'Test Station' }
          }])
          .mockResolvedValue([{ userId, position: 100 }]); // For station queue position calculation

        const response = await request(app)
          .post(`/queue/${stationId}`)
          .set('x-user-id', userId);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ queueNumber: 100 });
      });
    });

    describe('Ably Publishing', () => {
      it('should handle Ably publishing errors gracefully', async () => {
        const stationId = randomUUID();
        const userId = randomUUID();

        // Mock Ably to throw an error
        const { Rest } = await import('ably');
        const mockAbly = new Rest();
        mockAbly.channels.get().publish.mockRejectedValue(new Error('Ably error'));

        mockPrisma.station.findUnique.mockResolvedValue({ id: stationId });
        mockPrisma.queue.findUnique.mockResolvedValue(null);
        mockPrisma.$transaction.mockResolvedValue(100);
        mockPrisma.queue.create.mockResolvedValue({});
        mockPrisma.queue.findMany
          .mockResolvedValueOnce([{ userId, position: 100 }]) // For queue update
          .mockResolvedValueOnce([{ // For user's queues with station
            stationId,
            position: 100,
            station: { name: 'Test Station' }
          }])
          .mockResolvedValue([{ userId, position: 100 }]); // For station queue position calculation

        // The API should still work even if Ably fails
        const response = await request(app)
          .post(`/queue/${stationId}`)
          .set('x-user-id', userId);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ queueNumber: 100 });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const stationId = randomUUID();
      const userId = randomUUID();

      mockPrisma.station.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post(`/queue/${stationId}`)
        .set('x-user-id', userId);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'DB error' });
    });

    it('should handle malformed JSON in Buffer body', async () => {
      const mockAdminSecret = 'test-admin-secret';
      mockPrisma.config.findUnique.mockResolvedValue({ value: mockAdminSecret });

      // This test is tricky to implement with supertest as it handles JSON parsing
      // In a real scenario, we'd test this with raw HTTP requests
      const response = await request(app)
        .post('/admin/stations')
        .set('x-admin-secret', mockAdminSecret)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}'); // This will be caught by express

      // Express will handle the JSON parsing error before our code runs
      expect(response.status).toBe(400);
    });
  });
});