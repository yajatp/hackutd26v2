import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'quest-test-'));
const stub = join(dir, 'adb');
const log = join(dir, 'log');
const state = join(dir, 'state');
const missing = join(dir, 'missing.cjs');
writeFileSync(missing, `const fs = require('node:fs'); fs.existsSync = () => false; require('node:module').syncBuiltinESMExports();`);
writeFileSync(stub, `#!${process.execPath}\n${String.raw`
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(a) + '\n');
if (a[0] === 'devices') {
 const s = fs.readFileSync(process.env.STUB_STATE, 'utf8');
 console.log('List of devices attached\n' + (s === 'none' ? '' : 'abc ' + s + ' product:quest model:Quest_3S'));
} else if (a.includes('--list')) console.log('abc tcp:3000 tcp:3000\nabc tcp:3001 tcp:3001');
else if (a.includes('packages')) console.log('package:com.oculus.browser');
`}`, { mode: 0o755 });
const env = { ...process.env, ADB: stub, STUB_LOG: log, STUB_STATE: state };
const script = new URL('./quest.mjs', import.meta.url).pathname;
let web, tcp;
before(async () => {
  web = http.createServer((req, res) => res.end('ok'));
  tcp = net.createServer(socket => socket.end());
  await Promise.all([new Promise((resolve, reject) => web.once('error', reject).listen(3000, '127.0.0.1', resolve)), new Promise((resolve, reject) => tcp.once('error', reject).listen(3001, '127.0.0.1', resolve))]);
});
after(() => { web?.close(); tcp?.close(); rmSync(dir, { recursive: true, force: true }); });
function start(stateValue, args = [], extra = {}) {
  writeFileSync(state, stateValue); writeFileSync(log, '');
  return spawn(process.execPath, [script, ...args], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function collect(child) {
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  return new Promise(resolve => child.on('close', code => resolve({ code, output })));
}
test('missing adb offers LAN route', async () => {
  const child = start('none', [], { ADB: '', PATH: '', ANDROID_HOME: '', LOCALAPPDATA: '', HOME: dir, NODE_OPTIONS: `--require=${missing}` });
  const result = await collect(child);
  assert.equal(result.code, 1); assert.match(result.output, /adb not found/); assert.match(result.output, /http:\/\/[^\s]+:3000\/vr/);
});
test('no device', async () => { const r = await collect(start('none')); assert.equal(r.code, 1); assert.match(r.output, /Plug the Quest in/); });
test('unauthorized device', async () => { const r = await collect(start('unauthorized')); assert.equal(r.code, 1); assert.match(r.output, /press Allow/); });
test('reverses both ports and opens browser', async () => {
  const r = await collect(start('device')); assert.equal(r.code, 0); assert.match(r.output, /Quest ready/);
  const calls = readFileSync(log, 'utf8'); assert.match(calls, /"reverse","tcp:3000","tcp:3000"/); assert.match(calls, /"reverse","tcp:3001","tcp:3001"/); assert.match(calls, /"am","start".*com.oculus.browser/);
});
test('watch restores ports after reconnect', { timeout: 12000 }, async () => {
  const child = start('device', ['--watch', '--no-open']);
  let output = ''; child.stdout.on('data', d => output += d);
  const waitFor = async predicate => { const deadline = Date.now() + 10000; while (!predicate()) { if (Date.now() > deadline) throw new Error(`timed out: ${output}`); await new Promise(r => setTimeout(r, 100)); } };
  try {
    await waitFor(() => output.includes('Quest ready')); writeFileSync(state, 'none');
    await waitFor(() => output.includes('Plug the Quest in')); writeFileSync(state, 'device');
    await waitFor(() => output.includes('ports restored'));
    const calls = readFileSync(log, 'utf8'); assert.equal((calls.match(/"reverse","tcp:3000","tcp:3000"/g) || []).length, 2); assert.equal((calls.match(/"reverse","tcp:3001","tcp:3001"/g) || []).length, 2);
  } finally { child.kill(); await new Promise(resolve => child.once('close', resolve)); }
});
