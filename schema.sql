PRAGMA foreign_keys = ON;

CREATE TABLE roles (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    registration_number TEXT UNIQUE NOT NULL,
    name_model TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    region TEXT DEFAULT 'Default',
    max_load_kg REAL NOT NULL CHECK(max_load_kg > 0),
    odometer_km REAL DEFAULT 0 CHECK(odometer_km >= 0),
    acquisition_cost REAL DEFAULT 0 CHECK(acquisition_cost >= 0),
    status TEXT DEFAULT 'Available'
        CHECK(status IN ('Available','On Trip','In Shop','Retired'))
);

CREATE TABLE drivers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    license_number TEXT UNIQUE NOT NULL,
    license_category TEXT NOT NULL,
    license_expiry_date TEXT NOT NULL,
    contact_number TEXT,
    safety_score REAL DEFAULT 100 CHECK(safety_score BETWEEN 0 AND 100),
    status TEXT DEFAULT 'Available'
        CHECK(status IN ('Available','On Trip','Off Duty','Suspended'))
);

CREATE TABLE trips (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    vehicle_id INTEGER NOT NULL,
    driver_id INTEGER NOT NULL,
    cargo_weight_kg REAL NOT NULL,
    planned_distance_km REAL NOT NULL,
    actual_distance_km REAL,
    revenue REAL DEFAULT 0,
    status TEXT DEFAULT 'Draft'
        CHECK(status IN ('Draft','Dispatched','Completed','Cancelled')),
    dispatched_at TEXT,
    completed_at TEXT,
    FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY(driver_id) REFERENCES drivers(id)
);

CREATE TABLE maintenance_logs (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    cost REAL DEFAULT 0,
    start_date TEXT DEFAULT CURRENT_DATE,
    end_date TEXT,
    status TEXT DEFAULT 'Open' CHECK(status IN ('Open','Closed')),
    FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
);

CREATE TABLE fuel_logs (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER NOT NULL,
    trip_id INTEGER,
    liters REAL NOT NULL CHECK(liters > 0),
    cost REAL NOT NULL CHECK(cost >= 0),
    log_date TEXT DEFAULT CURRENT_DATE,
    FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY(trip_id) REFERENCES trips(id)
);

CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    vehicle_id INTEGER NOT NULL,
    trip_id INTEGER,
    expense_type TEXT NOT NULL
        CHECK(expense_type IN ('Toll','Repair','Insurance','Other')),
    amount REAL NOT NULL CHECK(amount >= 0),
    expense_date TEXT DEFAULT CURRENT_DATE,
    note TEXT,
    FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY(trip_id) REFERENCES trips(id)
);

CREATE TRIGGER maintenance_open
AFTER INSERT ON maintenance_logs
WHEN NEW.status = 'Open'
BEGIN
    UPDATE vehicles
    SET status = 'In Shop'
    WHERE id = NEW.vehicle_id AND status != 'Retired';
END;

CREATE TRIGGER maintenance_closed
AFTER UPDATE OF status ON maintenance_logs
WHEN NEW.status = 'Closed'
BEGIN
    UPDATE vehicles
    SET status = 'Available'
    WHERE id = NEW.vehicle_id
      AND status = 'In Shop'
      AND NOT EXISTS (
          SELECT 1 FROM maintenance_logs
          WHERE vehicle_id = NEW.vehicle_id AND status = 'Open'
      );
END;
