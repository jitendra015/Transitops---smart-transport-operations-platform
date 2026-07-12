const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT t.*, v.reg_number, v.name AS vehicle_name, d.name AS driver_name
    FROM trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN drivers d ON d.id = t.driver_id
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  sql += ' ORDER BY t.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const trip = db.prepare(`
    SELECT t.*, v.reg_number, v.name AS vehicle_name, d.name AS driver_name
    FROM trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN drivers d ON d.id = t.driver_id
    WHERE t.id = ?`).get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

// CREATE a trip (status = Draft). Validates capacity + availability up front.
router.post('/', (req, res) => {
  const { source, destination, vehicle_id, driver_id, cargo_weight, planned_distance } = req.body;

  if (!source || !destination || !vehicle_id || !driver_id || cargo_weight == null) {
    return res.status(400).json({ error: 'source, destination, vehicle_id, driver_id, and cargo_weight are required' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driver_id);

  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  // Rule: Retired or In Shop vehicles must never appear in dispatch selection
  if (vehicle.status !== 'Available') {
    return res.status(422).json({ error: `Vehicle ${vehicle.reg_number} is not Available (current status: ${vehicle.status})` });
  }

  // Rule: Drivers with expired licenses or Suspended status cannot be assigned
  if (driver.status === 'Suspended') {
    return res.status(422).json({ error: `Driver ${driver.name} is suspended and cannot be assigned to trips` });
  }
  if (driver.status !== 'Available') {
    return res.status(422).json({ error: `Driver ${driver.name} is not Available (current status: ${driver.status})` });
  }
  if (new Date(driver.license_expiry) < new Date()) {
    return res.status(422).json({ error: `Driver ${driver.name}'s license expired on ${driver.license_expiry}` });
  }

  // Rule: Cargo weight must not exceed vehicle's max load capacity
  if (cargo_weight > vehicle.max_load_capacity) {
    return res.status(422).json({
      error: `Cargo weight (${cargo_weight}kg) exceeds vehicle max capacity (${vehicle.max_load_capacity}kg)`
    });
  }

  const result = db.prepare(`INSERT INTO trips
    (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Draft')`)
    .run(source, destination, vehicle_id, driver_id, cargo_weight, planned_distance || null);

  res.status(201).json(db.prepare('SELECT * FROM trips WHERE id = ?').get(result.lastInsertRowid));
});

// DISPATCH a trip: Draft -> Dispatched. Vehicle & Driver -> On Trip.
router.post('/:id/dispatch', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.status !== 'Draft') {
    return res.status(422).json({ error: `Only Draft trips can be dispatched (current status: ${trip.status})` });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(trip.vehicle_id);
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(trip.driver_id);

  // Re-validate at dispatch time in case state changed since trip was drafted
  if (vehicle.status !== 'Available') {
    return res.status(422).json({ error: `Vehicle is no longer Available (status: ${vehicle.status})` });
  }
  if (driver.status !== 'Available') {
    return res.status(422).json({ error: `Driver is no longer Available (status: ${driver.status})` });
  }
  if (new Date(driver.license_expiry) < new Date()) {
    return res.status(422).json({ error: `Driver's license has expired` });
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE trips SET status = 'Dispatched', dispatched_at = datetime('now') WHERE id = ?").run(trip.id);
    db.prepare("UPDATE vehicles SET status = 'On Trip' WHERE id = ?").run(vehicle.id);
    db.prepare("UPDATE drivers SET status = 'On Trip' WHERE id = ?").run(driver.id);
  });
  tx();

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id));
});

// COMPLETE a trip: Dispatched -> Completed. Vehicle & Driver -> Available.
router.post('/:id/complete', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.status !== 'Dispatched') {
    return res.status(422).json({ error: `Only Dispatched trips can be completed (current status: ${trip.status})` });
  }

  const { final_odometer, fuel_consumed, fuel_cost } = req.body;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE trips SET status = 'Completed', completed_at = datetime('now'),
        final_odometer = ?, fuel_consumed = ? WHERE id = ?`)
      .run(final_odometer || null, fuel_consumed || null, trip.id);

    db.prepare("UPDATE vehicles SET status = 'Available' WHERE id = ?").run(trip.vehicle_id);
    db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ?").run(trip.driver_id);

    if (final_odometer) {
      db.prepare('UPDATE vehicles SET odometer = ? WHERE id = ?').run(final_odometer, trip.vehicle_id);
    }
    if (fuel_consumed && fuel_cost) {
      db.prepare(`INSERT INTO fuel_logs (vehicle_id, liters, cost) VALUES (?, ?, ?)`)
        .run(trip.vehicle_id, fuel_consumed, fuel_cost);
    }
  });
  tx();

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id));
});

// CANCEL a trip: Draft or Dispatched -> Cancelled. If it was Dispatched, restore Vehicle/Driver.
router.post('/:id/cancel', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!['Draft', 'Dispatched'].includes(trip.status)) {
    return res.status(422).json({ error: `Only Draft or Dispatched trips can be cancelled (current status: ${trip.status})` });
  }

  const wasDispatched = trip.status === 'Dispatched';

  const tx = db.transaction(() => {
    db.prepare("UPDATE trips SET status = 'Cancelled', cancelled_at = datetime('now') WHERE id = ?").run(trip.id);
    if (wasDispatched) {
      db.prepare("UPDATE vehicles SET status = 'Available' WHERE id = ?").run(trip.vehicle_id);
      db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ?").run(trip.driver_id);
    }
  });
  tx();

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id));
});

module.exports = router;
