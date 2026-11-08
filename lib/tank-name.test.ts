import { test } from "node:test";
import assert from "node:assert/strict";
import { tankLabel } from "./tank-name.ts";

test("Midland ids read as Phone 1 has always shown them", () => {
  assert.equal(tankLabel("S5_FACILITY_C", "S5"), "S5 · Facility C tank");
  assert.equal(tankLabel("S1_FACILITY_A", "S1"), "S1 · Facility A tank");
});

test("generated county pads keep their capitals", () => {
  assert.equal(tankLabel("McMullen_County_11", "S1"), "S1 · McMullen County 11 tank");
  assert.equal(tankLabel("La_Salle_County_4", "S2"), "S2 · La Salle County 4 tank");
});
