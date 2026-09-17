// Creates the signing key this server uses to issue activation licences.
//
//   node server/make-keys.js
//
// Run once per deployment. The private key stays on the server and never
// leaves it; the printed public key goes into src/account.js so the app can
// check a licence without being able to mint one.
//
// Replacing the key invalidates every licence already issued, so every
// activated device has to re-check before it works again. That is fine while
// they can reach the server, and a good reason not to do it casually.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KEY_FILE = process.env.KEY_FILE
  || path.join(path.dirname(process.env.DATA_FILE || path.join(__dirname, 'data.json')), 'signing-key.pem');

if (fs.existsSync(KEY_FILE) && !process.argv.includes('--force')) {
  console.error(`已存在密钥：${KEY_FILE}`);
  console.error('确实要换新密钥（会作废所有已签发的凭证）请加 --force');
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });

console.error(`私钥已写入 ${KEY_FILE}（权限 0600，不要复制出服务器）`);
console.error('把下面这行公钥填进 src/account.js 的 PUBLIC_KEY：\n');
console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
