// The free daily allowance for devices that have not been activated.
//
// Counting is per task id, not per start: retrying a download that failed
// halfway must not cost a second slot, or a flaky network would eat the whole
// day's allowance. An activated device never reaches this module at all.
//
// This lives on the user's own disk, so it is a courtesy limit, not a lock. The
// activation check on the server is what actually decides authorisation.
'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const FREE_DAILY_LIMIT = 3;

/** Local calendar day: "today" is the one on the user's own wall clock. */
function dayKey(at = Date.now()) {
  const date = new Date(at);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Pure core: given the stored record, decide whether this task may run and
 * return the record to store next. Yesterday's record counts as empty.
 */
function nextUsage(record, taskId, { day = dayKey(), limit = FREE_DAILY_LIMIT } = {}) {
  const ids = record && record.day === day && Array.isArray(record.ids) ? record.ids.map(String) : [];
  const id = String(taskId);
  if (ids.includes(id)) return { allowed: true, record: { day, ids }, remaining: Math.max(0, limit - ids.length) };
  if (ids.length >= limit) return { allowed: false, record: { day, ids }, remaining: 0 };
  const grown = [...ids, id];
  return { allowed: true, record: { day, ids: grown }, remaining: Math.max(0, limit - grown.length) };
}

function usagePath() { return path.join(app.getPath('userData'), 'usage.json'); }

function read() {
  try { return JSON.parse(fs.readFileSync(usagePath(), 'utf8')); }
  catch { return null; }
}

function write(record) {
  try { fs.writeFileSync(usagePath(), JSON.stringify(record)); }
  catch { /* A read-only profile should not stop a download that was allowed. */ }
}

/** Takes a slot for this task, returning whether it may proceed. */
function claim(taskId) {
  const result = nextUsage(read(), taskId);
  if (result.allowed) write(result.record);
  return result;
}

/** What the renderer shows next to the activation status. */
function state() {
  const record = read();
  const day = dayKey();
  const used = record && record.day === day && Array.isArray(record.ids) ? record.ids.length : 0;
  return { limit: FREE_DAILY_LIMIT, used, remaining: Math.max(0, FREE_DAILY_LIMIT - used) };
}

module.exports = { FREE_DAILY_LIMIT, dayKey, nextUsage, claim, state };
