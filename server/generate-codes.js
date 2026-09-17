// Mints activation codes into the server's data file.
//
//   node server/generate-codes.js 10 month
//   node server/generate-codes.js 5 forever
//
// Codes are only ever created here, never by the server itself, so a leaked
// endpoint cannot hand out authorisations. Run it on the VPS next to index.js
// (same DATA_FILE), then give each printed code to one user.
//
// A plan's clock starts when the code is redeemed, not when it is minted, so a
// month card bought today and used in March still gives a full month.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O/0/I/1: they are misread when typed off a screen.
const GROUPS = 4;
const GROUP_LEN = 4;

function newCode() {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  return Array.from({ length: GROUPS }, () => Array.from({ length: GROUP_LEN }, pick).join('')).join('-');
}

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {}, tokens: {}, codes: {} }; }
}

function save(db) {
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}

// null means it never expires.
const PLANS = {
  '3d': 3,
  month: 30,
  quarter: 90,
  half: 180,
  year: 365,
  forever: null
};

const count = Number(process.argv[2] || 1);
const plan = String(process.argv[3] || 'month');
if (!Number.isInteger(count) || count < 1 || count > 1000 || !(plan in PLANS)) {
  console.error(`用法：node server/generate-codes.js <数量 1-1000> <套餐>`);
  console.error(`套餐：${Object.keys(PLANS).join(' / ')}`);
  process.exit(1);
}

const db = load();
if (!db.codes) db.codes = {};

const minted = [];
while (minted.length < count) {
  const code = newCode();
  if (db.codes[code]) continue;
  db.codes[code] = {
    email: null, deviceId: null, createdAt: Date.now(), activatedAt: null,
    plan, days: PLANS[plan], expiresAt: null
  };
  minted.push(code);
}
save(db);

console.log(minted.join('\n'));
const span = PLANS[plan] === null ? '永久有效' : `${PLANS[plan]} 天，从激活时起算`;
console.error(`已写入 ${minted.length} 个「${plan}」激活码（${span}）：${DATA_FILE}`);
