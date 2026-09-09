const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const database = new sqlite3.Database(path.join(__dirname, 'launchpad.sqlite'));

database.serialize(() => {
  database.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    reset_token TEXT,
    reset_expires TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  database.run('ALTER TABLE users ADD COLUMN reset_token TEXT', () => {});
  database.run('ALTER TABLE users ADD COLUMN reset_expires TEXT', () => {});
  database.run(`CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    title TEXT NOT NULL,
    style TEXT NOT NULL,
    description TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 30,
    prediction_id TEXT UNIQUE NOT NULL,
    audio_url TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    rights_status TEXT NOT NULL DEFAULT 'All rights reserved',
    is_public INTEGER NOT NULL DEFAULT 0,
    public_slug TEXT UNIQUE,
    lyrics TEXT,
    tags TEXT,
    instrumental INTEGER NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'simple',
    variation_group TEXT,
    source TEXT NOT NULL DEFAULT 'generated',
    copyright_owner TEXT,
    rights_id TEXT,
    registered_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  database.run('ALTER TABLE tracks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN public_slug TEXT', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 30', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN lyrics TEXT', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN tags TEXT', () => {});
  database.run("ALTER TABLE tracks ADD COLUMN instrumental INTEGER NOT NULL DEFAULT 0", () => {});
  database.run("ALTER TABLE tracks ADD COLUMN mode TEXT NOT NULL DEFAULT 'simple'", () => {});
  database.run('ALTER TABLE tracks ADD COLUMN variation_group TEXT', () => {});
  database.run("ALTER TABLE tracks ADD COLUMN source TEXT NOT NULL DEFAULT 'generated'", () => {});
  database.run('ALTER TABLE tracks ADD COLUMN copyright_owner TEXT', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN rights_id TEXT', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN registered_at TEXT', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN parent_track_id INTEGER', () => {});
  database.run('ALTER TABLE tracks ADD COLUMN stem_type TEXT', () => {});
  database.run(`CREATE TABLE IF NOT EXISTS personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    tags TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'rockecho-salt').digest('hex');
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

module.exports = { run, get, all, hashPassword };
