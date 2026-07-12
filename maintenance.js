const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { status, vehicle_id } = req.query;
  let sql = `SELECT m.*, v.reg_number, v.name AS vehicle_name FROM maintenance_logs m
             JOIN vehicles v ON v.id = m.vehicle_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND m.status = ?'; params.push(status); }
  if (vehicle_id) { sql += ' AND m.vehicle_id = ?'; params.push(vehicle_id); }
  sql += ' ORDER BY m.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// Creating an active maintenance record automatically changes vehicle status to In Shop
router.post('/', (req, res) => {
  const { vehicle_id, description, cost } = req.body;
  if (!vehicle_id || !description) {
    return res.status(400).json({ error: 'vehicle_id and description are required' });
  }
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  if (vehicle.status === 'On Trip') {
    return res.status(422).json({ error: 'Cannot add a vehicle that is currently On Trip to maintenance' });
  }

  const tx = db.transaction(() => {
    const result = db.prepare(`INSERT INTO maintenance_logs (vehicle_id, description, cost, status)
      VALUES (?, ?, ?, 'Active')`).run(vehicle_id, description, cost || 0);
    db.prepare("UPDATE vehicles SET status = 'In Shop' WHERE id = ?").run(vehicle_id);
    return result.lastInsertRowid;
  });
  const id = tx();

  res.status(201).json(db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(id));
});

// Closing maintenance restores the vehicle to Available (unless retired)
router.post('/:id/close', (req, res) => {
  const record = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Maintenance record not found' });
  if (record.status !== 'Active') {
    return res.status(422).json({ error: 'Only Active maintenance records can be closed' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(record.vehicle_id);

  const tx = db.transaction(() => {
    db.prepare("UPDATE maintenance_logs SET status = 'Closed', closed_at = datetime('now') WHERE id = ?").run(record.id);
    // Only restore to Available if there are no other active maintenance records and vehicle isn't retired
    const otherActive = db.prepare(
      "SELECT COUNT(*) AS c FROM maintenance_logs WHERE vehicle_id = ? AND status = 'Active' AND id != ?"
    ).get(record.vehicle_id, record.id).c;

    if (vehicle.status !== 'Retired' && otherActive === 0) {
      db.prepare("UPDATE vehicles SET status = 'Available' WHERE id = ?").run(record.vehicle_id);
    }
  });
  tx();

  res.json(db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(record.id));
});

module.exports = router;
