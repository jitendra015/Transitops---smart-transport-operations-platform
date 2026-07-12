const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);


router.get('/fuel', (req, res) => {
  const { vehicle_id } = req.query;
  let sql = `SELECT f.*, v.reg_number FROM fuel_logs f JOIN vehicles v ON v.id = f.vehicle_id WHERE 1=1`;
  const params = [];
  if (vehicle_id) { sql += ' AND f.vehicle_id = ?'; params.push(vehicle_id); }
  sql += ' ORDER BY f.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/fuel', (req, res) => {
  const { vehicle_id, liters, cost, date } = req.body;
  if (!vehicle_id || !liters || !cost) {
    return res.status(400).json({ error: 'vehicle_id, liters, and cost are required' });
  }
  const vehicle = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  const result = db.prepare(`INSERT INTO fuel_logs (vehicle_id, liters, cost, date)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')))`).run(vehicle_id, liters, cost, date || null);

  res.status(201).json(db.prepare('SELECT * FROM fuel_logs WHERE id = ?').get(result.lastInsertRowid));
});


router.get('/expenses', (req, res) => {
  const { vehicle_id } = req.query;
  let sql = `SELECT e.*, v.reg_number FROM expenses e JOIN vehicles v ON v.id = e.vehicle_id WHERE 1=1`;
  const params = [];
  if (vehicle_id) { sql += ' AND e.vehicle_id = ?'; params.push(vehicle_id); }
  sql += ' ORDER BY e.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/expenses', (req, res) => {
  const { vehicle_id, type, amount, date } = req.body;
  if (!vehicle_id || !type || !amount) {
    return res.status(400).json({ error: 'vehicle_id, type, and amount are required' });
  }
  const vehicle = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  const result = db.prepare(`INSERT INTO expenses (vehicle_id, type, amount, date)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')))`).run(vehicle_id, type, amount, date || null);

  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid));
});

module.exports = router;
