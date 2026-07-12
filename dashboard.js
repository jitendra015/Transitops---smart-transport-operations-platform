const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/kpis', (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params).c;

  const activeVehicles = count("SELECT COUNT(*) AS c FROM vehicles WHERE status != 'Retired'");
  const availableVehicles = count("SELECT COUNT(*) AS c FROM vehicles WHERE status = 'Available'");
  const inMaintenance = count("SELECT COUNT(*) AS c FROM vehicles WHERE status = 'In Shop'");
  const activeTrips = count("SELECT COUNT(*) AS c FROM trips WHERE status = 'Dispatched'");
  const pendingTrips = count("SELECT COUNT(*) AS c FROM trips WHERE status = 'Draft'");
  const driversOnDuty = count("SELECT COUNT(*) AS c FROM drivers WHERE status = 'On Trip'");
  const totalVehicles = count("SELECT COUNT(*) AS c FROM vehicles");
  const onTripVehicles = count("SELECT COUNT(*) AS c FROM vehicles WHERE status = 'On Trip'");

  const fleetUtilization = totalVehicles > 0 ? Math.round((onTripVehicles / totalVehicles) * 1000) / 10 : 0;

  res.json({
    active_vehicles: activeVehicles,
    available_vehicles: availableVehicles,
    vehicles_in_maintenance: inMaintenance,
    active_trips: activeTrips,
    pending_trips: pendingTrips,
    drivers_on_duty: driversOnDuty,
    fleet_utilization_pct: fleetUtilization
  });
});


router.get('/reports', (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles').all();

  const report = vehicles.map(v => {
    const fuelTotal = db.prepare('SELECT COALESCE(SUM(cost),0) AS t, COALESCE(SUM(liters),0) AS l FROM fuel_logs WHERE vehicle_id = ?').get(v.id);
    const maintTotal = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM maintenance_logs WHERE vehicle_id = ?').get(v.id).t;
    const distance = db.prepare(`SELECT COALESCE(SUM(planned_distance),0) AS d FROM trips WHERE vehicle_id = ? AND status = 'Completed'`).get(v.id).d;

    const fuelEfficiency = fuelTotal.l > 0 ? Math.round((distance / fuelTotal.l) * 100) / 100 : null;
    const operationalCost = fuelTotal.t + maintTotal;

    return {
      vehicle_id: v.id,
      reg_number: v.reg_number,
      name: v.name,
      total_distance: distance,
      total_fuel_liters: fuelTotal.l,
      fuel_efficiency_km_per_l: fuelEfficiency,
      fuel_cost: fuelTotal.t,
      maintenance_cost: maintTotal,
      operational_cost: operationalCost
    };
  });

  res.json(report);
});


router.get('/reports.csv', (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const rows = [['reg_number', 'name', 'total_distance', 'total_fuel_liters', 'fuel_efficiency_km_per_l', 'fuel_cost', 'maintenance_cost', 'operational_cost']];

  vehicles.forEach(v => {
    const fuelTotal = db.prepare('SELECT COALESCE(SUM(cost),0) AS t, COALESCE(SUM(liters),0) AS l FROM fuel_logs WHERE vehicle_id = ?').get(v.id);
    const maintTotal = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM maintenance_logs WHERE vehicle_id = ?').get(v.id).t;
    const distance = db.prepare(`SELECT COALESCE(SUM(planned_distance),0) AS d FROM trips WHERE vehicle_id = ? AND status = 'Completed'`).get(v.id).d;
    const fuelEfficiency = fuelTotal.l > 0 ? (distance / fuelTotal.l).toFixed(2) : '';
    rows.push([v.reg_number, v.name, distance, fuelTotal.l, fuelEfficiency, fuelTotal.t, maintTotal, fuelTotal.t + maintTotal]);
  });

  const csv = rows.map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transitops_report.csv"');
  res.send(csv);
});

module.exports = router;
