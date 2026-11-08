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
} else if (a.includes('--list')) {
 const lost = fs.existsSync(process.env.STUB_STATE + '.lost') && fs.readFileSync(process.env.STUB_STATE + '.lost', 'utf8') === 'yes';
 if (!lost) console.log('abc tcp:3000 tcp:3000\nabc tcp:3001 tcp:3001');
} else if (a.includes('reverse') && fs.existsSync(process.env.STUB_STATE + '.lost')) fs.writeFileSync(process.env.STUB_STATE + '.lost', 'no');
else if (a.includes('packages')) console.log('package:com.oculus.browser');
`}`, { mode: 0o755 });
const env = { ...process.env, ADB: stub, STUB_LOG: log, STUB_STATE: state };
const script = new URL('./quest.mjs', import.meta.url).pathname;
let web, tcp;
// Stand-ins for the web app and SpacetimeDB; on a laptop already running the demo the real ones
// answer instead, so the tests pass either way.
const serve = (server, port) => new Promise((resolve, reject) => server.once('error', e => (e.code === 'EADDRINUSE' ? resolve(null) : reject(e))).listen(port, '127.0.0.1', () => resolve(server)));
before(async () => {
  web = await serve(http.createServer((req, res) => res.end('ok')), 3000);
  tcp = await serve(net.createServer(socket => socket.end()), 3001);
});
after(() => { web?.close(); tcp?.close(); rmSync(dir, { recursive: true, force: true }); });
function start(stateValue, args = [], extra = {}) {
  writeFileSync(state, stateValue); writeFileSync(log, ''); writeFileSync(state + '.lost', 'no');
  return spawn(process.execPath, [script, ...args], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function collect(child) {
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  return new Promise(resolve => child.on('close', code => resolve({ code, output })));
}
test('missing adb offers LAN route', async () => {
  const child = start('none', [], { ADB: '', PATH: '', ANDROID_HOME: '', LOCALAPPDATA: '', HOME: dir, NODE_OPTIONS: `--require=${missing}` });
  const result = await collect(child);
  assert.equal(result.code, 1); assert.match(result.output, /adb not found/); assert.match(result.output, /http:\/\/\S+:3000\/vr/);
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

const watchUntil = (child) => {
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  const waitFor = async (predicate) => { const deadline = Date.now() + 10000; while (!predicate(output)) { if (Date.now() > deadline) throw new Error(`timed out: ${output}`); await new Promise(r => setTimeout(r, 100)); } };
  return waitFor;
};
test('watch restores ports a headset restart cleared while the cable stayed in', { timeout: 15000 }, async () => {
  const child = start('device', ['--watch', '--no-open']);
  const waitFor = watchUntil(child);
  try {
    await waitFor(o => o.includes('Quest ready'));
    writeFileSync(state + '.lost', 'yes');
    await waitFor(o => o.includes('ports restored'));
    const calls = readFileSync(log, 'utf8'); assert.equal((calls.match(/"reverse","tcp:3001","tcp:3001"/g) || []).length, 2);
  } finally { child.kill(); await new Promise(resolve => child.once('close', resolve)); }
});
test('watch waits for a Quest that is not plugged in yet', { timeout: 15000 }, async () => {
  const child = start('none', ['--watch', '--no-open']);
  const waitFor = watchUntil(child);
  try {
    await waitFor(o => o.includes('Waiting for it'));
    writeFileSync(state, 'device');
    await waitFor(o => o.includes('Quest ready'));
    const calls = readFileSync(log, 'utf8'); assert.match(calls, /"reverse","tcp:3000","tcp:3000"/);
  } finally { child.kill(); await new Promise(resolve => child.once('close', resolve)); }
});
