const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'pulse.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organisations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company_number TEXT,
      director_email TEXT,
      status TEXT NOT NULL DEFAULT 'Pending Verification',
      security_score TEXT NOT NULL DEFAULT 'A',
      mfa_required INTEGER NOT NULL DEFAULT 1,
      password_rotation_days INTEGER NOT NULL DEFAULT 90,
      next_reverification_due TEXT,
      suspended_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      mfa_enabled INTEGER NOT NULL DEFAULT 1,
      last_password_change TEXT DEFAULT CURRENT_TIMESTAMP,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organisation_id) REFERENCES organisations(id)
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      uploaded_by INTEGER,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organisation_id) REFERENCES organisations(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reverifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      reviewer_user_id INTEGER,
      notes TEXT,
      reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      next_due TEXT NOT NULL,
      FOREIGN KEY (organisation_id) REFERENCES organisations(id),
      FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      ip_address TEXT,
      changes_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      module TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      due_date TEXT,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS module_kpis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      module TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      trend TEXT,
      risk TEXT DEFAULT 'normal'
    );

    CREATE TABLE IF NOT EXISTS budget_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      label TEXT NOT NULL,
      budget REAL NOT NULL DEFAULT 0,
      forecast REAL NOT NULL DEFAULT 0,
      actual REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      riba_stage TEXT,
      health TEXT NOT NULL DEFAULT 'Good',
      budget REAL DEFAULT 0,
      invoiced REAL DEFAULT 0,
      next_milestone TEXT,
      milestone_due TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS compliance_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'Open',
      due_date TEXT,
      risk_rating TEXT DEFAULT 'Medium',
      evidence_path TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      qualification_status TEXT DEFAULT 'Current',
      training_expiry TEXT,
      emergency_contact TEXT,
      absence_days INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      module TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Active',
      renewal_date TEXT,
      compliance_status TEXT DEFAULT 'Current',
      cost REAL DEFAULT 0,
      usage_value REAL DEFAULT 0,
      carbon_estimate REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Not connected',
      access_token TEXT,
      refresh_token TEXT,
      last_sync_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function audit({ organisationId, userId, action, entityType, entityId, ip, changes }) {
  db.prepare(`INSERT INTO audit_logs (organisation_id, user_id, action, entity_type, entity_id, ip_address, changes_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    organisationId || null,
    userId || null,
    action,
    entityType || null,
    entityId || null,
    ip || null,
    changes ? JSON.stringify(changes) : null
  );
}

module.exports = { db, migrate, audit };
