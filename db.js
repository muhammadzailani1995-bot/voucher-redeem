import Database from 'better-sqlite3';
import 'dotenv/config';

const DB_PATH = process.env.DB_PATH || 'data.sqlite';
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shopee_order_id TEXT,
  service_label TEXT,
  service_code TEXT,
  voucher_number TEXT,
  third_party_ref TEXT,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  redemption_id INTEGER NOT NULL,
  otp_code TEXT NOT NULL,
  received_at TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_payload TEXT,
  FOREIGN KEY (redemption_id) REFERENCES redemptions(id)
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  headers TEXT,
  payload TEXT,
  valid_signature INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

export default db;
