const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'studentmarket.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');                       // SQLite ignores foreign keys unless this is on
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));  // creates tables on first run

module.exports = db;
