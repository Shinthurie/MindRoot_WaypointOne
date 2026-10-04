/* The planning engine on the seeded S1 day: every booklet rule holds, the fairness guard holds,
   and a rule-breaking allocation is caught. Run after `npm run seed` (or after flow.test.js reseeds). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadDay } from "../src/planning.js";
import { pool } from "../src/db.js";

after(() => pool.end());

test("engine plan for S1 passes every rule and serves every shop skipped yesterday", async () => {
  const d = await loadDay("S1");
  const vehicles = d.vehicles.filter((v) => v.status !== "in_workshop");
  const r = d.planner.plan({ orders: d.orders, vehicles, fuelLeft: d.fuelLeft }, { tries: 80 });
  const chk = d.planner.check({ orders: d.orders, vehicles, alloc: r.alloc, fuelLeft: d.fuelLeft });
  assert.equal(chk.ok, true, chk.errors.join("; "));
  assert.equal(r.summary.protectedServed, r.summary.protectedTotal);
  // The 40.7 m³ Style order is bigger than any truck: it must be deferred, never split.
  assert.equal(r.alloc["S1-078"], null);
  assert.equal(r.reasons["S1-078"].kind, "Unavoidable");
  // Same inputs, same plan (the search is seeded).
  const again = d.planner.plan({ orders: d.orders, vehicles, fuelLeft: d.fuelLeft }, { tries: 80 });
  assert.deepEqual(again.alloc, r.alloc);
});

test("the checker catches broken rules", async () => {
  const d = await loadDay("S1");
  const vehicles = d.vehicles.filter((v) => v.status !== "in_workshop");
  const chilled = d.orders.find((o) => o.chilled);
  const dry = vehicles.find((v) => !v.reefer && v.type === "truck");
  const r = d.planner.check({ orders: d.orders, vehicles, alloc: { [chilled.ref]: { vehicle: dry.id, trip: 1 } }, fuelLeft: d.fuelLeft });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /chilled goods without a reefer/.test(e)), r.errors.join("; "));
  const workshop = d.vehicles.find((v) => v.status === "in_workshop");
  const r2 = d.planner.check({ orders: d.orders, vehicles, alloc: { [chilled.ref]: { vehicle: workshop.id, trip: 1 } }, fuelLeft: d.fuelLeft });
  assert.ok(r2.errors.some((e) => /not available/.test(e)));
});
