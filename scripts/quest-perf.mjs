#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadPlaywright, launchBrowser } from './e2e/playwright.mjs';

// Nearest-rank p95; median averages the two middle observations.
export function stats(values, budget = 13.9) {
  if (!values.length) return { median: null, p95: null, over: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    over: values.filter(value => value > budget).length / values.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { url: '/twin', seconds: 10, throttle: 4, json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') opts.json = true;
    else if (['--url', '--seconds', '--throttle'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) opts[arg.slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  opts.seconds = Number(opts.seconds); opts.throttle = Number(opts.throttle);
  if (!opts.url.startsWith('/') || opts.url.startsWith('//') || !Number.isFinite(opts.seconds) || opts.seconds <= 0 || !Number.isFinite(opts.throttle) || opts.throttle < 1) throw new Error('Use a local path, positive seconds, and throttle >= 1.');
  const { chromium } = loadPlaywright();
  const browser = await launchBrowser(chromium, false);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle });
    const external = [];
    const record = url => { try { const u = new URL(url); if (['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) && !['localhost', '127.0.0.1'].includes(u.hostname)) external.push(url); } catch {} };
    page.on('request', request => record(request.url()));
    page.on('websocket', socket => record(socket.url()));
    await page.addInitScript(() => {
      const state = window.__questPerf = { draws: 0, triangles: 0, uploads: [] };
      for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
        if (!proto) continue;
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          if (!Object.prototype.hasOwnProperty.call(proto, name)) continue;
          const original = proto[name];
          proto[name] = function (...args) {
            state.draws++;
            const count = name.startsWith('drawArrays') ? args[2] : args[1];
            const instances = name.endsWith('Instanced') ? args[name.startsWith('drawArrays') ? 3 : 4] : 1;
            if (args[0] === this.TRIANGLES) state.triangles += Math.floor(count / 3) * instances;
            else if (args[0] === this.TRIANGLE_STRIP || args[0] === this.TRIANGLE_FAN) state.triangles += Math.max(0, count - 2) * instances;
            return original.apply(this, args);
          };
        }
        for (const name of ['texImage2D', 'texSubImage2D']) {
          if (!Object.prototype.hasOwnProperty.call(proto, name)) continue;
          const original = proto[name];
          proto[name] = function (...args) {
            const explicit = name === 'texImage2D' ? args.length >= 9 : args.length >= 9;
            const source = args[name === 'texImage2D' ? 5 : 6];
            const width = explicit ? args[name === 'texImage2D' ? 3 : 4] : (source?.videoWidth || source?.naturalWidth || source?.width || 0);
            const height = explicit ? args[name === 'texImage2D' ? 4 : 5] : (source?.videoHeight || source?.naturalHeight || source?.height || 0);
            state.uploads.push({ width, height });
            return original.apply(this, args);
          };
        }
      }
    });
    const origin = process.env.QUEST_PERF_ORIGIN || 'http://127.0.0.1:3000';
    await page.goto(new URL(opts.url, origin).href, { waitUntil: 'domcontentloaded' });
    await page.locator('canvas').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);
    const data = await page.evaluate(seconds => new Promise(resolve => {
      const state = window.__questPerf;
      const frames = [], draws = [], triangles = [];
      let start, previous, lastDraws = state.draws, lastTriangles = state.triangles;
      function frame(now) {
        if (start === undefined) { start = previous = now; }
        else {
          frames.push(now - previous); draws.push(state.draws - lastDraws); triangles.push(state.triangles - lastTriangles);
          previous = now;
        }
        lastDraws = state.draws; lastTriangles = state.triangles;
        if (now - start >= seconds * 1000) resolve({ frames, draws, triangles, uploads: state.uploads });
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }), opts.seconds);
    const heap = await cdp.send('Runtime.getHeapUsage');
    const largest = data.uploads.reduce((a, b) => b.width * b.height > a.width * a.height ? b : a, { width: 0, height: 0 });
    const result = { url: opts.url, seconds: opts.seconds, throttle: opts.throttle, frames: data.frames.length,
      frameMs: { ...stats(data.frames), over11_1: stats(data.frames, 11.1).over },
      drawCalls: { median: stats(data.draws).median, max: Math.max(0, ...data.draws) },
      triangles: { median: stats(data.triangles).median, max: Math.max(0, ...data.triangles) },
      textureUploads: data.uploads.length, largestTexture: largest, jsHeapBytes: heap.usedSize, externalRequests: external };
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else {
      const n = x => x == null ? 'n/a' : x.toFixed(2);
      console.log(`${opts.url} · ${opts.seconds}s · CPU ${opts.throttle}x · ${result.frames} frames`);
      console.table({ 'Frame ms (median / p95)': `${n(result.frameMs.median)} / ${n(result.frameMs.p95)}`, 'Frames > 13.9 / 11.1 ms': `${n(result.frameMs.over * 100)}% / ${n(result.frameMs.over11_1 * 100)}%`, 'Draw calls (median / max)': `${result.drawCalls.median} / ${result.drawCalls.max}`, 'Triangles (median / max)': `${result.triangles.median} / ${result.triangles.max}`, 'Texture uploads / largest': `${result.textureUploads} / ${largest.width} × ${largest.height}`, 'JS heap': `${n(result.jsHeapBytes / 1048576)} MiB`, 'External requests': `${external.length}${external.length ? `: ${[...new Set(external)].join(', ')}` : ''}` });
    }
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
