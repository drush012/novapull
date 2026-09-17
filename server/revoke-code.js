// Turns an activation code off, or back on, without stopping the server.
//
//   node server/revoke-code.js --list
//   node server/revoke-code.js ABCD-EFGH-JKLM-NPQR
//   node server/revoke-code.js ABCD-EFGH-JKLM-NPQR --undo
//
// The server re-reads this flag on every activation check, so a revoked code
// stops working as soon as that device next asks — no restart needed.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {}, tokens: {}, codes: {} }; }
}

function save(db) {
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}

const args = process.argv.slice(2);
const db = load();
if (!db.codes) db.codes = {};

if (!args.length || args.includes('--help')) {
  console.error('用法：node server/revoke-code.js <激活码> [--undo] | --list');
  process.exit(1);
}

if (args[0] === '--list') {
  const rows = Object.entries(db.codes).map(([code, entry]) => {
    const overdue = entry.expiresAt && Date.now() > entry.expiresAt;
    const state = entry.revoked ? '已吊销' : overdue ? '已到期' : entry.deviceId ? '已激活' : '未使用';
    // A timed code has no end date until it is redeemed, so say what it is
    // worth rather than printing "永久" for an unused three-day card.
    const until = entry.expiresAt ? new Date(entry.expiresAt).toISOString().slice(0, 10)
      : entry.days ? `${entry.days}天(未起算)` : '永久';
    return `${code}  ${state.padEnd(6)}  ${(entry.plan || '-').padEnd(8)}  ${until}  ${entry.username || '-'}`;
  });
  console.log(rows.length ? rows.join('\n') : '库里没有激活码');
  process.exit(0);
}

const code = args[0].trim().toUpperCase();
const undo = args.includes('--undo');
const entry = db.codes[code];
if (!entry) {
  console.error(`找不到激活码 ${code}`);
  process.exit(1);
}

entry.revoked = !undo;
save(db);
console.log(`${code} 已${undo ? '恢复' : '吊销'}${entry.deviceId ? `（原绑定设备 ${entry.deviceId}）` : ''}`);
