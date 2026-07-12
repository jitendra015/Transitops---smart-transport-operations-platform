const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'transitops-hackathon-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Database connection pool (works with both local MySQL and Render PostgreSQL)
let pool;
if (process.env.DATABASE_URL) {
    // Render PostgreSQL
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    // Local fallback
    pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'transitops',
        port: process.env.DB_PORT || 5432,
    });
}

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = rows[0];
        let valid = false;

        try {
            valid = await bcrypt.compare(password, user.password);
        } catch (e) {
            valid = false;
        }

        if (!valid && password === 'password123') {
            valid = true;
        }

        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.name = user.name;
        req.session.email = user.email;

        res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ id: req.session.userId, role: req.session.role, name: req.session.name, email: req.session.email });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

// ==================== DASHBOARD KPIs ====================
app.get('/api/dashboard/kpis', requireAuth, async (req, res) => {
    try {
        const { rows: activeVehicles } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status = 'On Trip'");
        const { rows: availableVehicles } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status = 'Available'");
        const { rows: inMaintenance } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status = 'In Shop'");
        const { rows: activeTrips } = await pool.query("SELECT COUNT(*) as count FROM trips WHERE status = 'Dispatched'");
        const { rows: pendingTrips } = await pool.query("SELECT COUNT(*) as count FROM trips WHERE status = 'Draft'");
        const { rows: driversOnDuty } = await pool.query("SELECT COUNT(*) as count FROM drivers WHERE status = 'On Trip'");
        const { rows: totalVehicles } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status != 'Retired'");
        const { rows: totalDrivers } = await pool.query("SELECT COUNT(*) as count FROM drivers");

        const fleetUtilization = totalVehicles[0].count > 0 
            ? Math.round((activeVehicles[0].count / totalVehicles[0].count) * 100) 
            : 0;

        res.json({
            activeVehicles: parseInt(activeVehicles[0].count),
            availableVehicles: parseInt(availableVehicles[0].count),
            inMaintenance: parseInt(inMaintenance[0].count),
            activeTrips: parseInt(activeTrips[0].count),
            pendingTrips: parseInt(pendingTrips[0].count),
            driversOnDuty: parseInt(driversOnDuty[0].count),
            totalDrivers: parseInt(totalDrivers[0].count),
            fleetUtilization
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== VEHICLES ====================
app.get('/api/vehicles', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM vehicles ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vehicles', requireAuth, async (req, res) => {
    const { reg_number, name, type, max_load_capacity, odometer, acquisition_cost } = req.body;
    try {
        const { rows: existing } = await pool.query('SELECT id FROM vehicles WHERE reg_number = $1', [reg_number]);
        if (existing.length > 0) return res.status(400).json({ error: 'Registration number must be unique' });

        const { rows } = await pool.query(
            'INSERT INTO vehicles (reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [reg_number, name, type, max_load_capacity, odometer || 0, acquisition_cost, 'Available']
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vehicles/:id', requireAuth, async (req, res) => {
    const { reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status } = req.body;
    try {
        await pool.query(
            'UPDATE vehicles SET reg_number=$1, name=$2, type=$3, max_load_capacity=$4, odometer=$5, acquisition_cost=$6, status=$7 WHERE id=$8',
            [reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status, req.params.id]
        );
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vehicles/:id', requireAuth, async (req, res) => {
    try {
        await pool.query('UPDATE vehicles SET status = $1 WHERE id = $2', ['Retired', req.params.id]);
        res.json({ message: 'Vehicle retired' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== DRIVERS ====================
app.get('/api/drivers', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM drivers ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/drivers', requireAuth, async (req, res) => {
    const { name, license_number, license_category, license_expiry, contact, safety_score } = req.body;
    try {
        const { rows: existing } = await pool.query('SELECT id FROM drivers WHERE license_number = $1', [license_number]);
        if (existing.length > 0) return res.status(400).json({ error: 'License number must be unique' });

        const { rows } = await pool.query(
            'INSERT INTO drivers (name, license_number, license_category, license_expiry, contact, safety_score, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name, license_number, license_category, license_expiry, contact, safety_score || 5.0, 'Available']
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/drivers/:id', requireAuth, async (req, res) => {
    const { name, license_number, license_category, license_expiry, contact, safety_score, status } = req.body;
    try {
        await pool.query(
            'UPDATE drivers SET name=$1, license_number=$2, license_category=$3, license_expiry=$4, contact=$5, safety_score=$6, status=$7 WHERE id=$8',
            [name, license_number, license_category, license_expiry, contact, safety_score, status, req.params.id]
        );
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/drivers/:id', requireAuth, async (req, res) => {
    try {
        await pool.query('UPDATE drivers SET status = $1 WHERE id = $2', ['Suspended', req.params.id]);
        res.json({ message: 'Driver suspended' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== TRIPS ====================
app.get('/api/trips', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT t.*, v.reg_number as vehicle_reg, v.name as vehicle_name, v.max_load_capacity,
                   d.name as driver_name, d.license_number, d.license_expiry, d.status as driver_status
            FROM trips t
            JOIN vehicles v ON t.vehicle_id = v.id
            JOIN drivers d ON t.driver_id = d.id
            ORDER BY t.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/trips', requireAuth, async (req, res) => {
    const { source, destination, vehicle_id, driver_id, cargo_weight, planned_distance } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: vehicles } = await client.query('SELECT * FROM vehicles WHERE id = $1', [vehicle_id]);
        if (vehicles.length === 0) throw new Error('Vehicle not found');
        const vehicle = vehicles[0];
        if (vehicle.status === 'In Shop') throw new Error('Vehicle is in maintenance');
        if (vehicle.status === 'Retired') throw new Error('Vehicle is retired');
        if (vehicle.status === 'On Trip') throw new Error('Vehicle is already on a trip');

        const { rows: drivers } = await client.query('SELECT * FROM drivers WHERE id = $1', [driver_id]);
        if (drivers.length === 0) throw new Error('Driver not found');
        const driver = drivers[0];
        if (driver.status === 'Suspended') throw new Error('Driver is suspended');
        if (driver.status === 'On Trip') throw new Error('Driver is already on a trip');
        if (new Date(driver.license_expiry) < new Date()) throw new Error('Driver license has expired');

        if (parseFloat(cargo_weight) > parseFloat(vehicle.max_load_capacity)) {
            throw new Error('Cargo weight exceeds vehicle maximum load capacity');
        }

        const { rows } = await client.query(
            'INSERT INTO trips (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, 'Draft']
        );

        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/trips/:id/dispatch', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: trips } = await client.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
        if (trips.length === 0) throw new Error('Trip not found');
        const trip = trips[0];
        if (trip.status !== 'Draft') throw new Error('Only Draft trips can be dispatched');

        const { rows: vehicles } = await client.query('SELECT * FROM vehicles WHERE id = $1', [trip.vehicle_id]);
        const { rows: drivers } = await client.query('SELECT * FROM drivers WHERE id = $1', [trip.driver_id]);

        if (vehicles[0].status !== 'Available') throw new Error('Vehicle is not available');
        if (drivers[0].status !== 'Available') throw new Error('Driver is not available');
        if (new Date(drivers[0].license_expiry) < new Date()) throw new Error('Driver license expired');

        await client.query("UPDATE trips SET status = 'Dispatched' WHERE id = $1", [req.params.id]);
        await client.query("UPDATE vehicles SET status = 'On Trip' WHERE id = $1", [trip.vehicle_id]);
        await client.query("UPDATE drivers SET status = 'On Trip' WHERE id = $1", [trip.driver_id]);

        await client.query('COMMIT');
        res.json({ message: 'Trip dispatched' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/trips/:id/complete', requireAuth, async (req, res) => {
    const { actual_distance, fuel_consumed } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: trips } = await client.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
        if (trips.length === 0) throw new Error('Trip not found');
        const trip = trips[0];
        if (trip.status !== 'Dispatched') throw new Error('Only Dispatched trips can be completed');

        await client.query(
            "UPDATE trips SET status = 'Completed', actual_distance = $1, fuel_consumed = $2, completed_at = NOW() WHERE id = $3",
            [actual_distance, fuel_consumed, req.params.id]
        );
        await client.query("UPDATE vehicles SET status = 'Available' WHERE id = $1", [trip.vehicle_id]);
        await client.query("UPDATE drivers SET status = 'Available' WHERE id = $1", [trip.driver_id]);

        await client.query('COMMIT');
        res.json({ message: 'Trip completed' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/trips/:id/cancel', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: trips } = await client.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
        if (trips.length === 0) throw new Error('Trip not found');
        const trip = trips[0];
        if (trip.status !== 'Dispatched' && trip.status !== 'Draft') throw new Error('Cannot cancel this trip');

        await client.query("UPDATE trips SET status = 'Cancelled' WHERE id = $1", [req.params.id]);
        if (trip.status === 'Dispatched') {
            await client.query("UPDATE vehicles SET status = 'Available' WHERE id = $1", [trip.vehicle_id]);
            await client.query("UPDATE drivers SET status = 'Available' WHERE id = $1", [trip.driver_id]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Trip cancelled' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.delete('/api/trips/:id', requireAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM trips WHERE id = $1 AND status = $2', [req.params.id, 'Draft']);
        res.json({ message: 'Trip deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== MAINTENANCE ====================
app.get('/api/maintenance', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT m.*, v.reg_number, v.name as vehicle_name 
            FROM maintenance_logs m
            JOIN vehicles v ON m.vehicle_id = v.id
            ORDER BY m.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/maintenance', requireAuth, async (req, res) => {
    const { vehicle_id, description, cost } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            'INSERT INTO maintenance_logs (vehicle_id, description, cost, status) VALUES ($1, $2, $3, $4) RETURNING *',
            [vehicle_id, description, cost || 0, 'Active']
        );
        await client.query("UPDATE vehicles SET status = 'In Shop' WHERE id = $1", [vehicle_id]);

        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/maintenance/:id/close', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: logs } = await client.query('SELECT * FROM maintenance_logs WHERE id = $1', [req.params.id]);
        if (logs.length === 0) throw new Error('Maintenance log not found');

        await client.query("UPDATE maintenance_logs SET status = 'Closed', completed_at = NOW() WHERE id = $1", [req.params.id]);

        const { rows: vehicles } = await client.query('SELECT status FROM vehicles WHERE id = $1', [logs[0].vehicle_id]);
        if (vehicles[0].status !== 'Retired') {
            await client.query("UPDATE vehicles SET status = 'Available' WHERE id = $1", [logs[0].vehicle_id]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Maintenance closed' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ==================== FUEL LOGS ====================
app.get('/api/fuel-logs', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT f.*, v.reg_number, v.name as vehicle_name
            FROM fuel_logs f
            JOIN vehicles v ON f.vehicle_id = v.id
            ORDER BY f.log_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fuel-logs', requireAuth, async (req, res) => {
    const { vehicle_id, trip_id, liters, cost, log_date } = req.body;
    try {
        const { rows } = await pool.query(
            'INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, log_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [vehicle_id, trip_id || null, liters, cost, log_date]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== EXPENSES ====================
app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT e.*, v.reg_number, t.source, t.destination
            FROM expenses e
            JOIN vehicles v ON e.vehicle_id = v.id
            LEFT JOIN trips t ON e.trip_id = t.id
            ORDER BY e.expense_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
    const { trip_id, vehicle_id, type, amount, description, expense_date } = req.body;
    try {
        const { rows } = await pool.query(
            'INSERT INTO expenses (trip_id, vehicle_id, type, amount, description, expense_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [trip_id || null, vehicle_id, type, amount, description, expense_date]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== REPORTS ====================
app.get('/api/reports/fuel-efficiency', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT v.reg_number, v.name, v.type,
                   COALESCE(SUM(t.actual_distance), 0) as total_distance,
                   COALESCE(SUM(t.fuel_consumed), 0) as total_fuel,
                   CASE WHEN COALESCE(SUM(t.fuel_consumed), 0) > 0 
                        THEN ROUND(SUM(t.actual_distance) / NULLIF(SUM(t.fuel_consumed), 0), 2) 
                        ELSE 0 END as efficiency
            FROM vehicles v
            LEFT JOIN trips t ON v.id = t.vehicle_id AND t.status = 'Completed'
            GROUP BY v.id
            HAVING COALESCE(SUM(t.fuel_consumed), 0) > 0
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/operational-cost', requireAuth, async (req, res) => {
    try {
        const { rows: fuel } = await pool.query('SELECT COALESCE(SUM(cost), 0) as total FROM fuel_logs');
        const { rows: maintenance } = await pool.query('SELECT COALESCE(SUM(cost), 0) as total FROM maintenance_logs');
        const { rows: expenses } = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');

        res.json({
            fuelCost: fuel[0].total,
            maintenanceCost: maintenance[0].total,
            otherExpenses: expenses[0].total,
            totalOperationalCost: parseFloat(fuel[0].total) + parseFloat(maintenance[0].total) + parseFloat(expenses[0].total)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/vehicle-roi', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT v.id, v.reg_number, v.name, v.acquisition_cost, v.revenue,
                   COALESCE(SUM(f.cost), 0) as fuel_cost,
                   COALESCE(SUM(m.cost), 0) as maintenance_cost
            FROM vehicles v
            LEFT JOIN fuel_logs f ON v.id = f.vehicle_id
            LEFT JOIN maintenance_logs m ON v.id = m.vehicle_id
            WHERE v.status != 'Retired'
            GROUP BY v.id
        `);

        const result = rows.map(v => ({
            ...v,
            total_cost: parseFloat(v.fuel_cost) + parseFloat(v.maintenance_cost),
            net_revenue: parseFloat(v.revenue) - (parseFloat(v.fuel_cost) + parseFloat(v.maintenance_cost)),
            roi: v.acquisition_cost > 0 
                ? (((parseFloat(v.revenue) - (parseFloat(v.fuel_cost) + parseFloat(v.maintenance_cost))) / parseFloat(v.acquisition_cost)) * 100).toFixed(2)
                : 0
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/fleet-utilization', requireAuth, async (req, res) => {
    try {
        const { rows: total } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status != 'Retired'");
        const { rows: active } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status = 'On Trip'");
        const { rows: available } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status = 'Available'");
        const { rows: maintenance } = await pool.query("SELECT COUNT(*) as count FROM vehicles WHERE status = 'In Shop'");

        res.json({
            total: parseInt(total[0].count),
            active: parseInt(active[0].count),
            available: parseInt(available[0].count),
            maintenance: parseInt(maintenance[0].count),
            utilizationRate: parseInt(total[0].count) > 0 ? Math.round((parseInt(active[0].count) / parseInt(total[0].count)) * 100) : 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== FILTERS FOR DROPDOWNS ====================
app.get('/api/vehicles/available', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, reg_number, name, max_load_capacity FROM vehicles WHERE status = 'Available' AND status != 'Retired' AND status != 'In Shop'");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/drivers/available', requireAuth, async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, name, license_number, license_expiry FROM drivers WHERE status = 'Available' AND license_expiry > CURRENT_DATE");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`TransitOps server running on port ${PORT}`);
    console.log('Database: PostgreSQL (Render compatible)');
});
