const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_STATUSES = ['Available', 'On Trip', 'Off Duty', 'Suspended'];


router.get('/', (req, res) => {
  const { status, dispatchable } = req.query;
  let sql = 'SELECT * FROM drivers WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (dispatchable === 'true') {

    
    sql += " AND status = 'Available' AND date(license_expiry) >= date('now')";
  }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  const trips = db.prepare('SELECT * FROM trips WHERE driver_id = ? ORDER BY id DESC').all(driver.id);
  const licenseExpired = new Date(driver.license_expiry) < new Date();
  res.json({ ...driver, license_expired: licenseExpired, trips });
});

router.post('/', (req, res) => {
  const { name, license_number, license_category, license_expiry, contact_number, safety_score, status } = req.body;
  if (!name || !license_number || !license_expiry) {
    return res.status(400).json({ error: 'name, license_number, and license_expiry are required' });
  }
  const existing = db.prepare('SELECT id FROM drivers WHERE license_number = ?').get(license_number);
  if (existing) return res.status(409).json({ error: 'A driver with this license number already exists' });

  const finalStatus = VALID_STATUSES.includes(status) ? status : 'Available';

  const result = db.prepare(`INSERT INTO drivers
    (name, license_number, license_category, license_expiry, contact_number, safety_score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(name, license_number, license_category || null, license_expiry, contact_number || null, safety_score ?? 100, finalStatus);

  res.status(201).json(db.prepare('SELECT * FROM drivers WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const { name, license_category, license_expiry, contact_number, safety_score, status } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  db.prepare(`UPDATE drivers SET
      name = COALESCE(?, name),
      license_category = COALESCE(?, license_category),
      license_expiry = COALESCE(?, license_expiry),
      contact_number = COALESCE(?, contact_number),
      safety_score = COALESCE(?, safety_score),
      status = COALESCE(?, status)
    WHERE id = ?`)
    .run(name, license_category, license_expiry, contact_number, safety_score, status, req.params.id);

  res.json(db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  db.prepare('DELETE FROM drivers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
