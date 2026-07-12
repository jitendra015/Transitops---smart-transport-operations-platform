const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_STATUSES = ['Available', 'On Trip', 'In Shop', 'Retired'];


router.get('/', (req, res) => {
  const { status, type, region, dispatchable } = req.query;
  let sql = 'SELECT * FROM vehicles WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (region) { sql += ' AND region = ?'; params.push(region); }
  if (dispatchable === 'true') {
  
    sql += " AND status = 'Available'";
  }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  const fuelTotal = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM fuel_logs WHERE vehicle_id = ?').get(vehicle.id).t;
  const maintTotal = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM maintenance_logs WHERE vehicle_id = ?').get(vehicle.id).t;
  const trips = db.prepare('SELECT * FROM trips WHERE vehicle_id = ? ORDER BY id DESC').all(vehicle.id);

  res.json({
    ...vehicle,
    operational_cost: fuelTotal + maintTotal,
    fuel_cost_total: fuelTotal,
    maintenance_cost_total: maintTotal,
    trips
  });
});

router.post('/', (req, res) => {
  const { reg_number, name, type, max_load_capacity, odometer, acquisition_cost, region, status } = req.body;
  if (!reg_number || !name || !type || !max_load_capacity) {
    return res.status(400).json({ error: 'reg_number, name, type, and max_load_capacity are required' });
  }
  const existing = db.prepare('SELECT id FROM vehicles WHERE reg_number = ?').get(reg_number);
  if (existing) return res.status(409).json({ error: 'A vehicle with this registration number already exists' });

  const finalStatus = VALID_STATUSES.includes(status) ? status : 'Available';

  const result = db.prepare(`INSERT INTO vehicles
    (reg_number, name, type, max_load_capacity, odometer, acquisition_cost, region, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(reg_number, name, type, max_load_capacity, odometer || 0, acquisition_cost || 0, region || 'Unassigned', finalStatus);

  res.status(201).json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  const { name, type, max_load_capacity, odometer, acquisition_cost, region, status } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  db.prepare(`UPDATE vehicles SET
      name = COALESCE(?, name),
      type = COALESCE(?, type),
      max_load_capacity = COALESCE(?, max_load_capacity),
      odometer = COALESCE(?, odometer),
      acquisition_cost = COALESCE(?, acquisition_cost),
      region = COALESCE(?, region),
      status = COALESCE(?, status)
    WHERE id = ?`)
    .run(name, type, max_load_capacity, odometer, acquisition_cost, region, status, req.params.id);

  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
