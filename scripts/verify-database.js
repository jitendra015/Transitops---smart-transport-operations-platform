const db = require('../db');

const requiredTables = ['roles', 'users', 'vehicles', 'drivers', 'trips', 'maintenance_logs', 'fuel_logs', 'expenses'];
const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));

for (const table of requiredTables) {
  if (!tables.has(table)) throw new Error(`Missing required table: ${table}`);
}

const summary = Object.fromEntries(requiredTables.map(table => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
const admin = db.prepare(`SELECT u.email, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`).get('admin@transitops.com');

if (!admin || admin.role !== 'Fleet Manager') throw new Error('Default Fleet Manager account is missing');
console.log(JSON.stringify({ database: 'ready', admin: admin.email, records: summary }, null, 2));
