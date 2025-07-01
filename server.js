const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { randomUUID } = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 5000;

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// SQLite setup
const db = new sqlite3.Database(path.join(__dirname, 'queue.db'));
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    managerId TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS queues (
    stationId TEXT,
    userId TEXT,
    position INTEGER,
    PRIMARY KEY (stationId, userId)
  )`);
});

const ADMIN_SECRET = 'changeme';

app.use((req, res, next) => {
  if (!req.cookies.userId) {
    res.cookie('userId', randomUUID(), { httpOnly: false });
  }
  next();
});

// Admin: create station
app.post('/admin/stations', (req, res) => {
  const { secret, name } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = randomUUID();
  const managerId = randomUUID();
  db.run('INSERT INTO stations (id, name, managerId) VALUES (?, ?, ?)', [id, name, managerId], function (err) {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'DB error', details: err.message });
    }
    db.get('SELECT * FROM stations WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: 'DB error', details: err.message });
      res.json(row);
    });
  });
});

// Admin: delete station
app.delete('/admin/stations/:id', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  db.run('DELETE FROM stations WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    db.run('DELETE FROM queues WHERE stationId = ?', [id], () => {
      res.json({ success: true });
    });
  });
});

// List stations
app.get('/stations', (req, res) => {
  db.all('SELECT * FROM stations', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

// User: join queue (add to end of queue: new users at the highest position)
app.post('/queue/:stationId', (req, res) => {
  const { stationId } = req.params;
  const userId = req.cookies.userId;
  db.get('SELECT * FROM stations WHERE id = ?', [stationId], (err, station) => {
    if (err || !station) return res.status(404).json({ error: 'Station not found' });
    db.get('SELECT * FROM queues WHERE stationId = ? AND userId = ?', [stationId, userId], (err, row) => {
      if (row) {
        db.get('SELECT position FROM queues WHERE stationId = ? AND userId = ?', [stationId, userId], (err, posRow) => {
          res.json({ queueNumber: posRow ? posRow.position : null });
        });
      } else {
        db.get('SELECT MAX(position) as maxPos FROM queues WHERE stationId = ?', [stationId], (err, maxRow) => {
          const position = (maxRow?.maxPos || 0) + 1;
          db.run('INSERT INTO queues (stationId, userId, position) VALUES (?, ?, ?)', [stationId, userId, position], err => {
            res.json({ queueNumber: position });
          });
        });
      }
    });
  });
});

// Person: view queue (show oldest at the top)
app.get('/queue/:stationId', (req, res) => {
  const { stationId } = req.params;
  const managerId = req.query.managerId;
  db.get('SELECT * FROM stations WHERE id = ?', [stationId], (err, station) => {
    if (err || !station || station.managerId !== managerId) return res.status(403).json({ error: 'Forbidden' });
    db.all('SELECT userId, position FROM queues WHERE stationId = ? ORDER BY position', [stationId], (err, rows) => {
      res.json({ queue: rows.map(r => ({ user_id: r.userId, position: r.position })) });
    });
  });
});

// Person: pop queue (remove from the front: lowest position)
app.post('/queue/:stationId/pop', (req, res) => {
  const { stationId } = req.params;
  const managerId = req.body.managerId;
  db.get('SELECT * FROM stations WHERE id = ?', [stationId], (err, station) => {
    if (err || !station || station.managerId !== managerId) return res.status(403).json({ error: 'Forbidden' });
    db.get('SELECT * FROM queues WHERE stationId = ? ORDER BY position LIMIT 1', [stationId], (err, row) => {
      if (!row) return res.json({ popped: null });
      db.run('DELETE FROM queues WHERE stationId = ? AND userId = ?', [stationId, row.userId], err => {
        res.json({ popped: row.userId });
      });
    });
  });
});

// User: view all queues
app.get('/my-queues', (req, res) => {
  const userId = req.cookies.userId;
  db.all('SELECT q.stationId, s.name as stationName, q.position FROM queues q JOIN stations s ON q.stationId = s.id WHERE q.userId = ? ORDER BY q.position', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    // Return queueNumber as position for each station
    res.json(rows.map(r => ({ stationId: r.stationId, stationName: r.stationName, queueNumber: r.position })));
  });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
