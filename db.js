const Database = require('better-sqlite3');
const db = new Database('./iris.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS google_tokens (
    user_id TEXT PRIMARY KEY,
    tokens_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_id TEXT,
    title TEXT NOT NULL,
    remind_at DATETIME NOT NULL,
    sent INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS preferences (
    user_id TEXT PRIMARY KEY,
    airline TEXT,
    seat TEXT,
    hotel_stars INTEGER,
    diet TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recurring_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    interval_type TEXT NOT NULL,
    remind_minutes_before INTEGER DEFAULT 60,
    next_fire DATETIME NOT NULL,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL DEFAULT 'default',
    source TEXT NOT NULL DEFAULT 'widget',
    name TEXT,
    email TEXT,
    phone TEXT,
    message TEXT NOT NULL,
    notified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Messages ---
function getHistory(userId, limit = 10) {
  return db.prepare(
    `SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(userId, limit).reverse();
}

function addMessage(userId, role, content) {
  db.prepare(`INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)`).run(userId, role, content);
}

// --- Google tokens ---
function saveTokens(userId, tokens) {
  db.prepare(`
    INSERT INTO google_tokens (user_id, tokens_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET tokens_json = excluded.tokens_json, updated_at = CURRENT_TIMESTAMP
  `).run(userId, JSON.stringify(tokens));
}

function getTokens(userId) {
  const row = db.prepare(`SELECT tokens_json FROM google_tokens WHERE user_id = ?`).get(userId);
  return row ? JSON.parse(row.tokens_json) : null;
}

// --- Reminders ---
function addReminder(userId, title, remindAt, eventId = null) {
  return db.prepare(
    `INSERT INTO reminders (user_id, event_id, title, remind_at) VALUES (?, ?, ?, ?)`
  ).run(userId, eventId, title, remindAt).lastInsertRowid;
}

function getPendingReminders() {
  return db.prepare(
    `SELECT * FROM reminders WHERE sent = 0 AND remind_at <= datetime('now')`
  ).all();
}

function markReminderSent(id) {
  db.prepare(`UPDATE reminders SET sent = 1 WHERE id = ?`).run(id);
}

function getUserReminders(userId) {
  return db.prepare(
    `SELECT * FROM reminders WHERE user_id = ? AND sent = 0 AND remind_at > datetime('now') ORDER BY remind_at ASC`
  ).all(userId);
}

// --- Preferences ---
function getPrefs(userId) {
  return db.prepare(`SELECT * FROM preferences WHERE user_id = ?`).get(userId) || {};
}

function setPrefs(userId, fields) {
  const keys = Object.keys(fields).join(', ');
  const placeholders = Object.keys(fields).map(() => '?').join(', ');
  const updates = Object.keys(fields).map((k) => `${k} = excluded.${k}`).join(', ');
  db.prepare(`
    INSERT INTO preferences (user_id, ${keys}, updated_at)
    VALUES (?, ${placeholders}, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP
  `).run(userId, ...Object.values(fields));
}

// --- Recurring tasks ---
function addRecurring(userId, title, intervalType, remindMinutesBefore, nextFire) {
  return db.prepare(`
    INSERT INTO recurring_tasks (user_id, title, interval_type, remind_minutes_before, next_fire)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, title, intervalType, remindMinutesBefore, nextFire).lastInsertRowid;
}

function getDueRecurring() {
  return db.prepare(
    `SELECT * FROM recurring_tasks WHERE active = 1 AND next_fire <= datetime('now')`
  ).all();
}

function updateRecurringNextFire(id, nextFire) {
  db.prepare(`UPDATE recurring_tasks SET next_fire = ? WHERE id = ?`).run(nextFire, id);
}

function getUserRecurring(userId) {
  return db.prepare(
    `SELECT * FROM recurring_tasks WHERE user_id = ? AND active = 1 ORDER BY next_fire ASC`
  ).all(userId);
}

function deleteRecurring(id, userId) {
  db.prepare(`UPDATE recurring_tasks SET active = 0 WHERE id = ? AND user_id = ?`).run(id, userId);
}

// --- Leads ---
function addLead(clientId, source, name, email, phone, message) {
  return db.prepare(`
    INSERT INTO leads (client_id, source, name, email, phone, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(clientId, source, name || null, email || null, phone || null, message).lastInsertRowid;
}

function getLeads(clientId, limit = 50) {
  return db.prepare(
    `SELECT * FROM leads WHERE client_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(clientId, limit);
}

function getLeadsCount(clientId, since) {
  return db.prepare(
    `SELECT COUNT(*) as count FROM leads WHERE client_id = ? AND created_at >= ?`
  ).get(clientId, since).count;
}

function markLeadNotified(id) {
  db.prepare(`UPDATE leads SET notified = 1 WHERE id = ?`).run(id);
}

module.exports = {
  getHistory, addMessage,
  saveTokens, getTokens,
  addReminder, getPendingReminders, markReminderSent, getUserReminders,
  getPrefs, setPrefs,
  addRecurring, getDueRecurring, updateRecurringNextFire, getUserRecurring, deleteRecurring,
  addLead, getLeads, getLeadsCount, markLeadNotified,
};
