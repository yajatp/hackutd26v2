import { test } from "node:test";
import assert from "node:assert/strict";
import { luma, skyLook } from "./sky";
import { atLocal, localHours, sitePlace, SITE_ZONES, sunAt } from "./clock";

const blue = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

test("noon: a clear blue sky, a bright sun, no stars", () => {
  const s = skyLook(55);
  const [r, g, b] = blue(s.zenith);
  assert.ok(b > r + 80 && b > g, `zenith ${s.zenith} is blue`);
  assert.ok(luma(s.zenith) > 0.1, "zenith is bright");
  assert.ok(s.sunI >= 2.5, "strong daylight");
  assert.equal(s.sunDisc, 1);
  assert.equal(s.stars, 0);
  assert.equal(s.moonI, 0);
  assert.ok(s.hemiI > 0.8);
  assert.equal(s.fog, s.horizon);
});

test("midnight: a pitch-black sky with stars and a moon", () => {
  const s = skyLook(-45);
  assert.ok(luma(s.zenith) < 0.002, `zenith ${s.zenith} is black`);
  assert.ok(luma(s.horizon) < 0.004, `horizon ${s.horizon} is near black`);
  assert.equal(s.stars, 1);
  assert.equal(s.sunI, 0);
  assert.equal(s.sunDisc, 0);
  assert.ok(s.moonI > 0.5 && s.moonDisc === 1, "the moon lights the site");
});

test("dawn: a warm horizon between night and day", () => {
  const s = skyLook(0);
  const [r, , b] = blue(s.horizon);
  assert.ok(r > b, `horizon ${s.horizon} is warm`);
  assert.ok(s.glowAmt > 0.5);
  assert.ok(luma(s.zenith) > luma(skyLook(-45).zenith) && luma(s.zenith) < luma(skyLook(55).zenith));
  assert.ok(s.stars < 0.1 && s.sunI > 0 && s.sunI < 2);
});

test("the look changes smoothly with the sun", () => {
  for (let el = -30; el < 60; el += 0.5) {
    const a = skyLook(el), b = skyLook(el + 0.5);
    assert.ok(Math.abs(a.sunI - b.sunI) < 0.2 && Math.abs(a.stars - b.stars) < 0.1, `step at ${el}`);
    assert.ok(Math.abs(luma(a.zenith) - luma(b.zenith)) < 0.02, `zenith step at ${el}`);
  }
});

test("site zones: Texas and Williston on Chicago time, Carlsbad and Casper on Denver", () => {
  for (const k of ["permian", "eagleford", "dorado", "williston"]) assert.equal(SITE_ZONES[k], "America/Chicago");
  for (const k of ["delaware", "powder"]) assert.equal(SITE_ZONES[k], "America/Denver");
  assert.equal(sitePlace(null).key, "permian");
  assert.equal(sitePlace("nope").key, "permian");
  assert.equal(sitePlace("powder").zone, "America/Denver");
});

test("the sun at Midland: high at local noon, far below at midnight, near the horizon at dawn", () => {
  const p = sitePlace("permian");
  const day = new Date("2026-11-08T12:00:00Z");
  const noon = atLocal(day, p.zone, 12, 30);
  assert.equal(Math.round(localHours(noon, p.zone) * 60), 12 * 60 + 30);
  const sNoon = sunAt(noon, p.lat, p.lon);
  assert.ok(sNoon.elDeg > 35 && sNoon.elDeg < 50, `noon el ${sNoon.elDeg}`);
  assert.ok(sNoon.azDeg > 150 && sNoon.azDeg < 210, `noon az ${sNoon.azDeg} is south`);
  const sMid = sunAt(atLocal(day, p.zone, 0, 30), p.lat, p.lon);
  assert.ok(sMid.elDeg < -30, `midnight el ${sMid.elDeg}`);
  const sDawn = sunAt(atLocal(day, p.zone, 7, 0), p.lat, p.lon);
  assert.ok(sDawn.elDeg > -10 && sDawn.elDeg < 8, `07:00 el ${sDawn.elDeg}`);
  assert.ok(sDawn.azDeg > 60 && sDawn.azDeg < 130, `dawn az ${sDawn.azDeg} is east`);
});
