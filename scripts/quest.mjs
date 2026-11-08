#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces, homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import net from 'node:net';
import http from 'node:http';

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${name} needs a value`);
  return args[i + 1];
}
const lan = Object.values(networkInterfaces()).flat().find(x => x && x.family === 'IPv4' && !x.internal)?.address || '<laptop-IP>';
function noCable() {
  console.log(`No cable: in Quest Browser open chrome://flags, enable "Insecure origins treated as secure" for http://${lan}:3000, relaunch, then open http://${lan}:3000/vr`);
}
function findAdb() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [process.env.ADB, ...(process.env.PATH || '').split(delimiter).map(p => join(p, exe)),
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', exe),
    join(homedir(), 'Library/Android/sdk/platform-tools', exe), join('/opt/homebrew/bin', exe),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools', exe)];
  return candidates.find(p => p && existsSync(p));
}
function run(adb, ...argv) {
  const r = spawnSync(adb, argv, { encoding: 'utf8', timeout: 10000 });
  if (r.error || r.status !== 0) throw new Error(`adb ${argv.join(' ')} failed: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout;
}
function device(adb, serial) {
  const rows = run(adb, 'devices', '-l').split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/)).filter(row => row.length >= 2);
  if (!rows.length) throw new Error('Plug the Quest in with a USB-C cable and put it on.');
  const row = serial ? rows.find(r => r[0] === serial) : rows.find(r => /quest/i.test(r.join(' '))) || (rows.length === 1 ? rows[0] : null);
  if (!row) throw new Error(serial ? `Device ${serial} not found; check --serial.` : 'Several devices found; select the Quest with --serial.');
  if (row[1] === 'unauthorized') throw new Error('Put the headset on and press Allow on Allow USB debugging (tick Always allow).');
  if (row[1] !== 'device') throw new Error(`Device ${row[0]} is ${row[1]}; reconnect it.`);
  return row[0];
}
function listening(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
function webReady() {
  return new Promise(resolve => {
    const request = http.get('http://127.0.0.1:3000/vr', { timeout: 2000 }, response => { response.resume(); resolve(response.statusCode >= 200 && response.statusCode < 400); });
    request.on('error', () => resolve(false));
    request.on('timeout', () => request.destroy());
  });
}
function reversed(adb, serial) {
  const list = run(adb, '-s', serial, 'reverse', '--list');
  return [3000, 3001].every(port => list.split(/\r?\n/).some(line => new RegExp(`(?:^|\\s)tcp:${port}\\s+tcp:${port}(?:\\s|$)`).test(line)));
}
function reverse(adb, serial) {
  for (const port of [3000, 3001]) run(adb, '-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`);
  if (!reversed(adb, serial)) throw new Error('The ports were not confirmed; reconnect the Quest and retry.');
}
// --watch: every 3 s, (re)apply the reverse when the Quest appears, changes, or lost its ports while
// still plugged in (a headset restart or an adb server restart clears them without unplugging).
function watch(adb, serial, start) {
  let selected = start;
  let away = false;
  let note = null;
  const say = (m) => { if (m !== note) console.log(`${new Date().toLocaleTimeString()} ${m}`); note = m; };
  setInterval(() => {
    try {
      const current = device(adb, serial);
      if (away || current !== selected || !reversed(adb, current)) {
        reverse(adb, current);
        say(selected ? 'Quest reconnected; ports restored.' : `Quest ready: http://localhost:3000${option('--url', '/vr')}`);
        selected = current;
        away = false;
      }
      note = null;
    } catch (e) { away = true; say(e.message); }
  }, 3000);
}
async function main() {
  const path = option('--url', '/vr');
  const serial = option('--serial');
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('--url must be a local path such as /twin.');
  const adb = findAdb();
  if (!adb) { noCable(); throw new Error('adb not found. Install with brew install android-platform-tools; on Windows download the Google SDK Platform-Tools zip.'); }
  if (!(await webReady()) || !(await listening(3001))) throw new Error('Start Avon first: npm run demo');
  let selected;
  try { selected = device(adb, serial); } catch (e) {
    if (!args.includes('--watch')) throw e;
    console.log(`${e.message} Waiting for it (Ctrl+C to stop).`);
    watch(adb, serial, null);
    return;
  }
  reverse(adb, selected);
  const url = `http://localhost:3000${path}`;
  if (!args.includes('--no-open')) {
    try {
      const packages = run(adb, '-s', selected, 'shell', 'pm', 'list', 'packages').split(/\r?\n/).map(x => x.replace(/^package:/, '').trim()).filter(x => /browser/i.test(x));
      const browser = packages.find(x => /oculus|meta/i.test(x));
      if (!browser) throw new Error('Quest Browser package not found');
      run(adb, '-s', selected, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', browser);
    } catch { console.log(`Could not open Quest Browser; type ${url} in the headset.`); }
  }
  console.log(`Quest ready: ${url}`);
  if (args.includes('--watch')) watch(adb, serial, selected);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
