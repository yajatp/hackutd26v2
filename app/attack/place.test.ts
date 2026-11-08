// Run: npx tsx --test app/attack/place.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { countyOf, placeLine, siteFor, siteLine } from "./place.ts";

test("siteFor reads ?site= in any case and falls back to the default site", () => {
  assert.equal(siteFor("dorado").name, "Laredo");
  assert.equal(siteFor("DORADO").name, "Laredo");
  assert.equal(siteFor(null).key, "permian");
  assert.equal(siteFor("atlantis").key, "permian");
});

test("siteLine matches the map's name, basin and state", () => {
  assert.equal(siteLine(siteFor("permian")), "Midland · Permian Basin · TX");
  assert.equal(siteLine(siteFor("powder")), "Casper · Powder River Basin · WY");
});

test("a generated site's pad name gives its county", () => {
  const site = siteFor("eagleford");
  assert.equal(countyOf(site, "La_Salle_County_4", "S3"), "La Salle");
  assert.equal(placeLine(site, "McMullen_County_11", "S4"), "McMullen County, TX");
});

test("EOG's own ids use the generator's system-to-county rule", () => {
  const site = siteFor("permian");   // counties: Midland, Martin, Andrews
  assert.equal(placeLine(site, "S1_FACILITY_A", "S1"), "Midland County, TX");
  assert.equal(placeLine(site, "S5_FACILITY_C", "S5"), "Martin County, TX");
  assert.equal(placeLine(site, "S3_FACILITY_B", "S3"), "Andrews County, TX");
});

test("no county known: the state alone", () => {
  const site = siteFor("dorado");
  assert.equal(placeLine(site, "Facility-05b1ecefe94a", "Region-0f25affa577c"), "TX");
  assert.equal(placeLine(site, "X", "S0"), "TX");
});
