const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, 'transitops.db'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function runSqlFile(filename) {
  db.exec(fs.readFileSync(path.join(__dirname, filename), 'utf8'));
}

runSqlFile('schema.sql');

// Seed only a new database; operational data is never overwritten on startup.
if (db.prepare('SELECT COUNT(*) AS count FROM roles').get().count === 0) {
  const seed = db.transaction(() => {
    runSqlFile('seed.sql');
    const fleetManager = db.prepare('SELECT id FROM roles WHERE name = ?').get('Fleet Manager');
    db.prepare(`INSERT INTO users (name, email, password_hash, role_id)
      VALUES (?, ?, ?, ?)`)
      .run('TransitOps Admin', 'admin@transitops.com', bcrypt.hashSync('Admin@123', 10), fleetManager.id);
  });
  seed();
}

module.exports = db;
