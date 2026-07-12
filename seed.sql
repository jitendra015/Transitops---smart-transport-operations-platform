-- Demo data for a fresh TransitOps database.
-- app.py creates the initial Fleet Manager account:
-- email: admin@transitops.com
-- password: Admin@123

INSERT OR IGNORE INTO roles (name) VALUES
    ('Fleet Manager'),
    ('Dispatcher'),
    ('Driver'),
    ('Safety Officer'),
    ('Financial Analyst');

INSERT OR IGNORE INTO vehicles (
    registration_number, name_model, vehicle_type, region,
    max_load_kg, odometer_km, acquisition_cost, status
) VALUES
    ('KA-01-AB-1234', 'Tata Prima 5530', 'Truck', 'Bengaluru', 18000, 45230, 3200000, 'Available'),
    ('MH-12-CD-5678', 'Ashok Leyland BOSS', 'Truck', 'Pune', 11000, 28640, 2150000, 'Available'),
    ('TN-09-EF-9012', 'Tata Ace Gold', 'Light Commercial Vehicle', 'Chennai', 750, 17890, 780000, 'Available'),
    ('DL-01-GH-3456', 'Eicher Pro 3015', 'Truck', 'Delhi', 9000, 36750, 1850000, 'Available');

INSERT OR IGNORE INTO drivers (
    name, license_number, license_category, license_expiry_date,
    contact_number, safety_score, status
) VALUES
    ('Arjun Kumar', 'DL-1420110012345', 'Heavy Motor Vehicle', '2028-05-14', '+91-9876543210', 96, 'Available'),
    ('Priya Sharma', 'MH-1220140098765', 'Heavy Motor Vehicle', '2027-11-22', '+91-9876543211', 98, 'Available'),
    ('Ravi Patel', 'GJ-0520160043210', 'Light Motor Vehicle', '2029-03-08', '+91-9876543212', 92, 'Available'),
    ('Neha Singh', 'UP-1620130076543', 'Heavy Motor Vehicle', '2027-08-30', '+91-9876543213', 95, 'Available');

INSERT INTO trips (
    source, destination, vehicle_id, driver_id,
    cargo_weight_kg, planned_distance_km, actual_distance_km,
    revenue, status, dispatched_at, completed_at
) VALUES
    ('Bengaluru Warehouse', 'Mysuru Distribution Hub', 1, 1, 8500, 150, 154, 42000, 'Completed', '2026-07-01 08:30:00', '2026-07-01 14:15:00'),
    ('Pune Warehouse', 'Mumbai Port', 2, 2, 6200, 165, 168, 51000, 'Completed', '2026-07-03 06:45:00', '2026-07-03 13:20:00'),
    ('Chennai Depot', 'Puducherry Retail Hub', 3, 3, 520, 150, NULL, 18500, 'Draft', NULL, NULL);

INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, log_date) VALUES
    (1, 1, 52.5, 5200, '2026-07-01'),
    (2, 2, 61.2, 6242, '2026-07-03');

INSERT INTO expenses (vehicle_id, trip_id, expense_type, amount, expense_date, note) VALUES
    (1, 1, 'Toll', 780, '2026-07-01', 'Bengaluru–Mysuru expressway tolls'),
    (2, 2, 'Toll', 1120, '2026-07-03', 'Pune–Mumbai expressway tolls'),
    (3, NULL, 'Insurance', 18500, '2026-07-05', 'Annual commercial vehicle insurance');

INSERT INTO maintenance_logs (
    vehicle_id, description, cost, start_date, end_date, status
) VALUES
    (4, 'Scheduled brake inspection and oil change', 6400, '2026-06-28', '2026-06-29', 'Closed');
