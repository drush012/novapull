// Moves the two finished installers out of dist/ and into the project root, so
// they are one click away instead of one folder down.
//
// Only the final artifacts move. win-unpacked/, the blockmap and the builder
// log stay in dist/ — they are build intermediates, and having them in the root
// would just be clutter.
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const FINAL = /^NovaPull-.*-(portable|setup)\.exe$/;

if (!fs.existsSync(dist)) {
  console.error('dist/ 不存在，先跑 electron-builder');
  process.exit(1);
}

// Clear out installers from a previous version first, or the root slowly fills
// up with every build that was ever made.
for (const name of fs.readdirSync(root)) {
  if (FINAL.test(name)) fs.rmSync(path.join(root, name));
}

const moved = [];
for (const name of fs.readdirSync(dist)) {
  if (!FINAL.test(name)) continue;
  const from = path.join(dist, name);
  const to = path.join(root, name);
  fs.renameSync(from, to);
  moved.push({ name, size: fs.statSync(to).size });
}

if (!moved.length) {
  console.error('dist/ 里没有找到成品安装包');
  process.exit(1);
}

for (const { name, size } of moved) {
  console.log(`${name}  ${(size / 1048576).toFixed(1)} MB`);
}
