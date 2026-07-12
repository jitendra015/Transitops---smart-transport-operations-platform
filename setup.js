const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 
        `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'transitops'}`,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'FleetManager',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    reg_number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    max_load_capacity DECIMAL(10,2) NOT NULL,
    odometer DECIMAL(10,2) DEFAULT 0,
    acquisition_cost DECIMAL(12,2) NOT NULL,
    revenue DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) UNIQUE NOT NULL,
    license_category VARCHAR(50) NOT NULL,
    license_expiry DATE NOT NULL,
    contact VARCHAR(50) NOT NULL,
    safety_score DECIMAL(3,1) DEFAULT 5.0,
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    source VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    vehicle_id INT NOT NULL,
    driver_id INT NOT NULL,
    cargo_weight DECIMAL(10,2) NOT NULL,
    planned_distance DECIMAL(10,2) NOT NULL,
    actual_distance DECIMAL(10,2) DEFAULT 0,
    fuel_consumed DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
    id SERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL,
    description TEXT NOT NULL,
    cost DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

CREATE TABLE IF NOT EXISTS fuel_logs (
    id SERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL,
    trip_id INT NULL,
    liters DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    log_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    trip_id INT NULL,
    vehicle_id INT NOT NULL,
    type VARCHAR(50) DEFAULT 'Other',
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    expense_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);
`;

async function setup() {
    console.log('\n🚀 TransitOps Database Setup (PostgreSQL)\n');

    try {
        console.log('Connecting to PostgreSQL...');
        await pool.query('SELECT NOW()');
        console.log('✅ Connected to PostgreSQL\n');

        console.log('Creating tables...');
        await pool.query(SCHEMA_SQL);
        console.log('✅ Tables created\n');

        console.log('Checking for existing data...');
        const { rows: existingUsers } = await pool.query('SELECT COUNT(*) as count FROM users');

        if (parseInt(existingUsers[0].count) > 0) {
            console.log('⚠️  Data already exists, skipping seed\n');
        } else {
            console.log('Inserting seed data...');

            await pool.query(`
                INSERT INTO users (email, password, name, role) VALUES
                ('admin@transitops.com', '$2b$10$RTvAX53sQ04.7EXRZZQXyuZU5M..rX5a1gvylh1IUUs/vlXXqdh3G', 'Fleet Manager', 'FleetManager'),
                ('driver@transitops.com', '$2b$10$RTvAX53sQ04.7EXRZZQXyuZU5M..rX5a1gvylh1IUUs/vlXXqdh3G', 'John Driver', 'Driver'),
                ('safety@transitops.com', '$2b$10$RTvAX53sQ04.7EXRZZQXyuZU5M..rX5a1gvylh1IUUs/vlXXqdh3G', 'Sarah Safety', 'SafetyOfficer'),
                ('finance@transitops.com', '$2b$10$RTvAX53sQ04.7EXRZZQXyuZU5M..rX5a1gvylh1IUUs/vlXXqdh3G', 'Mike Finance', 'FinancialAnalyst')
            `);

            await pool.query(`
                INSERT INTO vehicles (reg_number, name, type, max_load_capacity, odometer, acquisition_cost, revenue, status) VALUES
                ('Van-05', 'Toyota HiAce 2022', 'Van', 500.00, 12500.00, 25000.00, 15000.00, 'Available'),
                ('TRK-101', 'Isuzu FTR 2021', 'Truck', 5000.00, 45000.00, 85000.00, 45000.00, 'Available'),
                ('BIKE-03', 'Honda CB500X', 'Motorcycle', 150.00, 8000.00, 7000.00, 5000.00, 'Available'),
                ('VAN-02', 'Ford Transit 2020', 'Van', 800.00, 32000.00, 35000.00, 28000.00, 'In Shop'),
                ('TRK-205', 'Volvo FH16', 'Heavy Truck', 12000.00, 78000.00, 120000.00, 85000.00, 'Available')
            `);

            await pool.query(`
                INSERT INTO drivers (name, license_number, license_category, license_expiry, contact, safety_score, status) VALUES
                ('Alex Johnson', 'DL-9988771', 'Class B', '2026-12-15', '+1-555-0101', 4.8, 'Available'),
                ('Maria Garcia', 'DL-1122334', 'Class A', '2027-03-20', '+1-555-0102', 4.9, 'Available'),
                ('James Wilson', 'DL-5566778', 'Class C', '2025-01-10', '+1-555-0103', 3.5, 'Suspended'),
                ('Sarah Chen', 'DL-9900112', 'Class B', '2026-08-25', '+1-555-0104', 4.7, 'Available'),
                ('Robert Brown', 'DL-3344556', 'Class A', '2027-11-30', '+1-555-0105', 4.6, 'Off Duty')
            `);

            await pool.query(`
                INSERT INTO trips (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, actual_distance, fuel_consumed, status, created_at, completed_at) VALUES
                ('Warehouse A', 'Distribution Center X', 1, 1, 450.00, 120.00, 125.00, 18.50, 'Completed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
                ('Factory B', 'Retail Store Y', 2, 2, 3200.00, 85.00, 82.00, 35.00, 'Completed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours'),
                ('Port C', 'Warehouse D', 3, 4, 120.00, 45.00, 0, 0, 'Dispatched', NOW() - INTERVAL '4 hours', NULL)
            `);

            await pool.query("UPDATE vehicles SET status = 'On Trip' WHERE id = 3");
            await pool.query("UPDATE drivers SET status = 'On Trip' WHERE id = 4");

            await pool.query(`
                INSERT INTO maintenance_logs (vehicle_id, description, cost, status, created_at) VALUES
                (4, 'Oil change and brake pad replacement', 350.00, 'Active', NOW() - INTERVAL '1 day')
            `);

            await pool.query(`
                INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, log_date) VALUES
                (1, 1, 18.50, 55.50, NOW() - INTERVAL '1 day'),
                (2, 2, 35.00, 105.00, NOW() - INTERVAL '12 hours'),
                (3, NULL, 12.00, 36.00, CURRENT_DATE)
            `);

            await pool.query(`
                INSERT INTO expenses (trip_id, vehicle_id, type, amount, description, expense_date) VALUES
                (1, 1, 'Toll', 15.00, 'Highway toll Route 95', NOW() - INTERVAL '1 day'),
                (2, 2, 'Toll', 22.50, 'Bridge crossing fee', NOW() - INTERVAL '12 hours'),
                (NULL, 4, 'Maintenance', 350.00, 'Brake pads and labor', NOW() - INTERVAL '1 day')
            `);

            console.log('✅ Seed data inserted\n');
        }

        console.log('══════════════════════════════════════════');
        console.log('✅ SETUP COMPLETE!');
        console.log('══════════════════════════════════════════');
        console.log('Login credentials:');
        console.log('  admin@transitops.com / password123');
        console.log('  driver@transitops.com / password123');
        console.log('  safety@transitops.com / password123');
        console.log('  finance@transitops.com / password123');
        console.log('══════════════════════════════════════════\n');

    } catch (err) {
        console.error('❌ ERROR:', err.message);
        console.log('\nMake sure PostgreSQL is running and DATABASE_URL is set correctly.');
    } finally {
        await pool.end();
    }
}

setup();
