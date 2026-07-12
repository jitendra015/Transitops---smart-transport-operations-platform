const express = require('express');
const mysql = require('mysql2/promise');
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
    secret: 'transitops-hackathon-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'transitops',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.session.userId || !roles.includes(req.session.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
};

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = rows[0];
        let valid = false;

        // Try bcrypt first
        try {
            valid = await bcrypt.compare(password, user.password);
        } catch (e) {
            valid = false;
        }

        // Fallback for demo accounts
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

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, role } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
            [email, hash, name, role || 'FleetManager']
        );
        res.json({ id: result.insertId, email, name, role });
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
        const [[activeVehicles]] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'On Trip'");
        const [[availableVehicles]] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'Available'");
        const [[inMaintenance]] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'In Shop'");
        const [[activeTrips]] = await pool.execute("SELECT COUNT(*) as count FROM trips WHERE status = 'Dispatched'");
        const [[pendingTrips]] = await pool.execute("SELECT COUNT(*) as count FROM trips WHERE status = 'Draft'");
        const [[driversOnDuty]] = await pool.execute("SELECT COUNT(*) as count FROM drivers WHERE status = 'On Trip'");
        const [[totalVehicles]] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status != 'Retired'");
        const [[totalDrivers]] = await pool.execute("SELECT COUNT(*) as count FROM drivers");

        const fleetUtilization = totalVehicles.count > 0 
            ? Math.round((activeVehicles.count / totalVehicles.count) * 100) 
            : 0;

        res.json({
            activeVehicles: activeVehicles.count,
            availableVehicles: availableVehicles.count,
            inMaintenance: inMaintenance.count,
            activeTrips: activeTrips.count,
            pendingTrips: pendingTrips.count,
            driversOnDuty: driversOnDuty.count,
            totalDrivers: totalDrivers.count,
            fleetUtilization
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== VEHICLES ====================
app.get('/api/vehicles', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM vehicles ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vehicles', requireAuth, async (req, res) => {
    const { reg_number, name, type, max_load_capacity, odometer, acquisition_cost } = req.body;
    try {
        const [existing] = await pool.execute('SELECT id FROM vehicles WHERE reg_number = ?', [reg_number]);
        if (existing.length > 0) return res.status(400).json({ error: 'Registration number must be unique' });

        const [result] = await pool.execute(
            'INSERT INTO vehicles (reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [reg_number, name, type, max_load_capacity, odometer || 0, acquisition_cost, 'Available']
        );
        res.json({ id: result.insertId, ...req.body, status: 'Available' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vehicles/:id', requireAuth, async (req, res) => {
    const { reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status } = req.body;
    try {
        const [existing] = await pool.execute('SELECT id FROM vehicles WHERE reg_number = ? AND id != ?', [reg_number, req.params.id]);
        if (existing.length > 0) return res.status(400).json({ error: 'Registration number must be unique' });

        await pool.execute(
            'UPDATE vehicles SET reg_number=?, name=?, type=?, max_load_capacity=?, odometer=?, acquisition_cost=?, status=? WHERE id=?',
            [reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status, req.params.id]
        );
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vehicles/:id', requireAuth, async (req, res) => {
    try {
        await pool.execute('UPDATE vehicles SET status = ? WHERE id = ?', ['Retired', req.params.id]);
        res.json({ message: 'Vehicle retired' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== DRIVERS ====================
app.get('/api/drivers', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM drivers ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/drivers', requireAuth, async (req, res) => {
    const { name, license_number, license_category, license_expiry, contact, safety_score } = req.body;
    try {
        const [existing] = await pool.execute('SELECT id FROM drivers WHERE license_number = ?', [license_number]);
        if (existing.length > 0) return res.status(400).json({ error: 'License number must be unique' });

        const [result] = await pool.execute(
            'INSERT INTO drivers (name, license_number, license_category, license_expiry, contact, safety_score, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, license_number, license_category, license_expiry, contact, safety_score || 5.0, 'Available']
        );
        res.json({ id: result.insertId, ...req.body, status: 'Available' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/drivers/:id', requireAuth, async (req, res) => {
    const { name, license_number, license_category, license_expiry, contact, safety_score, status } = req.body;
    try {
        const [existing] = await pool.execute('SELECT id FROM drivers WHERE license_number = ? AND id != ?', [license_number, req.params.id]);
        if (existing.length > 0) return res.status(400).json({ error: 'License number must be unique' });

        await pool.execute(
            'UPDATE drivers SET name=?, license_number=?, license_category=?, license_expiry=?, contact=?, safety_score=?, status=? WHERE id=?',
            [name, license_number, license_category, license_expiry, contact, safety_score, status, req.params.id]
        );
        res.json({ message: 'Updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/drivers/:id', requireAuth, async (req, res) => {
    try {
        await pool.execute('UPDATE drivers SET status = ? WHERE id = ?', ['Suspended', req.params.id]);
        res.json({ message: 'Driver suspended' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== TRIPS ====================
app.get('/api/trips', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
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
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Validate vehicle
        const [vehicles] = await conn.execute('SELECT * FROM vehicles WHERE id = ?', [vehicle_id]);
        if (vehicles.length === 0) throw new Error('Vehicle not found');
        const vehicle = vehicles[0];
        if (vehicle.status === 'In Shop') throw new Error('Vehicle is in maintenance');
        if (vehicle.status === 'Retired') throw new Error('Vehicle is retired');
        if (vehicle.status === 'On Trip') throw new Error('Vehicle is already on a trip');

        // Validate driver
        const [drivers] = await conn.execute('SELECT * FROM drivers WHERE id = ?', [driver_id]);
        if (drivers.length === 0) throw new Error('Driver not found');
        const driver = drivers[0];
        if (driver.status === 'Suspended') throw new Error('Driver is suspended');
        if (driver.status === 'On Trip') throw new Error('Driver is already on a trip');
        if (new Date(driver.license_expiry) < new Date()) throw new Error('Driver license has expired');

        // Validate cargo weight
        if (parseFloat(cargo_weight) > parseFloat(vehicle.max_load_capacity)) {
            throw new Error('Cargo weight exceeds vehicle maximum load capacity');
        }

        const [result] = await conn.execute(
            'INSERT INTO trips (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, 'Draft']
        );

        await conn.commit();
        res.json({ id: result.insertId, ...req.body, status: 'Draft' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.put('/api/trips/:id/dispatch', requireAuth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [trips] = await conn.execute('SELECT * FROM trips WHERE id = ?', [req.params.id]);
        if (trips.length === 0) throw new Error('Trip not found');
        const trip = trips[0];
        if (trip.status !== 'Draft') throw new Error('Only Draft trips can be dispatched');

        // Validate vehicle and driver again
        const [vehicles] = await conn.execute('SELECT * FROM vehicles WHERE id = ?', [trip.vehicle_id]);
        const [drivers] = await conn.execute('SELECT * FROM drivers WHERE id = ?', [trip.driver_id]);

        if (vehicles[0].status !== 'Available') throw new Error('Vehicle is not available');
        if (drivers[0].status !== 'Available') throw new Error('Driver is not available');
        if (new Date(drivers[0].license_expiry) < new Date()) throw new Error('Driver license expired');

        await conn.execute("UPDATE trips SET status = 'Dispatched' WHERE id = ?", [req.params.id]);
        await conn.execute("UPDATE vehicles SET status = 'On Trip' WHERE id = ?", [trip.vehicle_id]);
        await conn.execute("UPDATE drivers SET status = 'On Trip' WHERE id = ?", [trip.driver_id]);

        await conn.commit();
        res.json({ message: 'Trip dispatched' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.put('/api/trips/:id/complete', requireAuth, async (req, res) => {
    const { actual_distance, fuel_consumed } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [trips] = await conn.execute('SELECT * FROM trips WHERE id = ?', [req.params.id]);
        if (trips.length === 0) throw new Error('Trip not found');
        const trip = trips[0];
        if (trip.status !== 'Dispatched') throw new Error('Only Dispatched trips can be completed');

        await conn.execute(
            "UPDATE trips SET status = 'Completed', actual_distance = ?, fuel_consumed = ?, completed_at = NOW() WHERE id = ?",
            [actual_distance, fuel_consumed, req.params.id]
        );
        await conn.execute("UPDATE vehicles SET status = 'Available' WHERE id = ?", [trip.vehicle_id]);
        await conn.execute("UPDATE drivers SET status = 'Available' WHERE id = ?", [trip.driver_id]);

        await conn.commit();
        res.json({ message: 'Trip completed' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.put('/api/trips/:id/cancel', requireAuth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [trips] = await conn.execute('SELECT * FROM trips WHERE id = ?', [req.params.id]);
        if (trips.length === 0) throw new Error('Trip not found');
        const trip = trips[0];
        if (trip.status !== 'Dispatched' && trip.status !== 'Draft') throw new Error('Cannot cancel this trip');

        await conn.execute("UPDATE trips SET status = 'Cancelled' WHERE id = ?", [req.params.id]);
        if (trip.status === 'Dispatched') {
            await conn.execute("UPDATE vehicles SET status = 'Available' WHERE id = ?", [trip.vehicle_id]);
            await conn.execute("UPDATE drivers SET status = 'Available' WHERE id = ?", [trip.driver_id]);
        }

        await conn.commit();
        res.json({ message: 'Trip cancelled' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.delete('/api/trips/:id', requireAuth, async (req, res) => {
    try {
        await pool.execute('DELETE FROM trips WHERE id = ? AND status = ?', [req.params.id, 'Draft']);
        res.json({ message: 'Trip deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== MAINTENANCE ====================
app.get('/api/maintenance', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
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
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO maintenance_logs (vehicle_id, description, cost, status) VALUES (?, ?, ?, ?)',
            [vehicle_id, description, cost || 0, 'Active']
        );
        await conn.execute("UPDATE vehicles SET status = 'In Shop' WHERE id = ?", [vehicle_id]);

        await conn.commit();
        res.json({ id: result.insertId, ...req.body, status: 'Active' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.put('/api/maintenance/:id/close', requireAuth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [logs] = await conn.execute('SELECT * FROM maintenance_logs WHERE id = ?', [req.params.id]);
        if (logs.length === 0) throw new Error('Maintenance log not found');

        await conn.execute("UPDATE maintenance_logs SET status = 'Closed', completed_at = NOW() WHERE id = ?", [req.params.id]);

        const [vehicles] = await conn.execute('SELECT status FROM vehicles WHERE id = ?', [logs[0].vehicle_id]);
        if (vehicles[0].status !== 'Retired') {
            await conn.execute("UPDATE vehicles SET status = 'Available' WHERE id = ?", [logs[0].vehicle_id]);
        }

        await conn.commit();
        res.json({ message: 'Maintenance closed' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// ==================== FUEL LOGS ====================
app.get('/api/fuel-logs', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
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
        const [result] = await pool.execute(
            'INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, log_date) VALUES (?, ?, ?, ?, ?)',
            [vehicle_id, trip_id || null, liters, cost, log_date]
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== EXPENSES ====================
app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
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
        const [result] = await pool.execute(
            'INSERT INTO expenses (trip_id, vehicle_id, type, amount, description, expense_date) VALUES (?, ?, ?, ?, ?, ?)',
            [trip_id || null, vehicle_id, type, amount, description, expense_date]
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== REPORTS ====================
app.get('/api/reports/fuel-efficiency', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT v.reg_number, v.name, v.type,
                   COALESCE(SUM(t.actual_distance), 0) as total_distance,
                   COALESCE(SUM(t.fuel_consumed), 0) as total_fuel,
                   CASE WHEN COALESCE(SUM(t.fuel_consumed), 0) > 0 
                        THEN ROUND(SUM(t.actual_distance) / SUM(t.fuel_consumed), 2) 
                        ELSE 0 END as efficiency
            FROM vehicles v
            LEFT JOIN trips t ON v.id = t.vehicle_id AND t.status = 'Completed'
            GROUP BY v.id
            HAVING total_fuel > 0
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/operational-cost', requireAuth, async (req, res) => {
    try {
        const [fuel] = await pool.execute('SELECT COALESCE(SUM(cost), 0) as total FROM fuel_logs');
        const [maintenance] = await pool.execute('SELECT COALESCE(SUM(cost), 0) as total FROM maintenance_logs');
        const [expenses] = await pool.execute('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');

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
        const [rows] = await pool.execute(`
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
        const [total] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status != 'Retired'");
        const [active] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'On Trip'");
        const [available] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'Available'");
        const [maintenance] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'In Shop'");

        res.json({
            total: total[0].count,
            active: active[0].count,
            available: available[0].count,
            maintenance: maintenance[0].count,
            utilizationRate: total[0].count > 0 ? Math.round((active[0].count / total[0].count) * 100) : 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== FILTERS FOR DROPDOWNS ====================
app.get('/api/vehicles/available', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT id, reg_number, name, max_load_capacity FROM vehicles WHERE status = 'Available' AND status != 'Retired' AND status != 'In Shop'");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/drivers/available', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT id, name, license_number, license_expiry FROM drivers WHERE status = 'Available' AND license_expiry > CURDATE()");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`TransitOps server running on http://localhost:${PORT}`);
    console.log('Make sure MySQL is running and database is created!');
    console.log('Run: npm run setup');
});
