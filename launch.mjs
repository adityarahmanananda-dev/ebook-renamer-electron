import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const clientDeps = path.join(root, 'client', 'node_modules');
const clientDist = path.join(root, 'client', 'dist');
const electronBin = path.join(root, 'node_modules', 'electron');

const run = (cmd, cwd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

if (!fs.existsSync(electronBin)) {
  run('npm install', root);
}

if (!fs.existsSync(clientDeps)) {
  run('npm install', path.join(root, 'client'));
}

if (!fs.existsSync(clientDist)) {
  run('npm run build', path.join(root, 'client'));
}

console.log('\n> Menjalankan Electron…');
spawn(
  process.execPath,
  [path.join(root, 'node_modules', 'electron', 'cli.js'), '.'],
  { cwd: root, stdio: 'inherit', detached: false }
);
