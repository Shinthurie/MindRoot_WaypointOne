/* End-to-end API test: the judge walkthrough through the real endpoints, on a freshly seeded database.
   Run: DATABASE_URL=... npm test   (it reseeds the database it points at) */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed } from "../db/seed.js";
import { app } from "../src/index.js";
import { pool } from "../src/db.js";
import { config } from "../src/config.js";

let server, base;
before(async () => {
  await seed();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

const call = async (path, { token, body, method } = {}) => {
  const r = await fetch(base + path, { method: method || (body ? "POST" : "GET"), headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const signIn = async (id, secret) => (await call("/api/auth/login", { body: { id, secret } })).body.token;
const send = (token, ...actions) => call("/api/commands", { token, body: { commands: actions.map((a) => ({ id: randomUUID(), action: a })) } });

test("sign-in: right secret, wrong secret, lockout message", async () => {
  const ok = await call("/api/auth/login", { body: { id: "WP-DSP-001", secret: config.seedPassword } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, "dispatcher");
  const bad = await call("/api/auth/login", { body: { id: "WP-DRV-005", secret: "000000" } });
  assert.equal(bad.status, 401);
  assert.match(bad.body.error, /tries left/);
});

test("judge walkthrough across all four roles", async () => {
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  const loader = await signIn("DEPOT-PELIYAGODA", config.seedPin);
  const driver = await signIn("WP-DRV-003", config.seedPin);
  const store = await signIn("STORE-OUT074", config.seedPassword);

  // 1. Dispatcher runs the planning engine: every rule holds and every shop skipped yesterday is served.
  const plan = await call("/api/plan/auto", { token: disp, body: { tries: 60 } });
  assert.equal(plan.status, 200);
  assert.equal(plan.body.check.ok, true, plan.body.check.errors.join("; "));
  assert.equal(plan.body.summary.protectedServed, plan.body.summary.protectedTotal);
  assert.ok(plan.body.summary.served >= 70, `served ${plan.body.summary.served}`);

  // The team's published plan (the seeded one) also passes, so the walkthrough keeps it and publishes.
  const chk = await call("/api/plan/check", { token: disp });
  assert.equal(chk.body.ok, true, chk.body.errors?.join("; "));
  let r = await send(disp, { type: "publish", by: "Nimal" });
  assert.equal(r.body.results[0].status, "applied");

  // 2. Loader: who is loading, reefer check, tick, all loaded (clock moves to the loading dock).
  await send(disp, { type: "clock", clock: { date: "2026-01-08", time: "03:00" } });
  r = await send(loader,
    { type: "loadStart", vehicle: "VEH003", run: 1, by: "Suresh", district: "Puttalam", leaves: "03:30" },
    { type: "reeferCheck", key: "VEH003:1", value: true, by: "Suresh" },
    { type: "load", key: "VEH003:1:1", value: true },
    { type: "truckLoaded", vehicle: "VEH003", run: 1, by: "Suresh" });
  assert.deepEqual(r.body.results.map((x) => x.status), ["applied", "applied", "applied", "applied"]);

  // 3. Driver: start the run, arrive, hand over. The phone had no signal, so the batch arrives late - and twice.
  await send(disp, { type: "clock", clock: { time: "06:20" } });
  const batch = [
    { id: randomUUID(), action: { type: "startRun", vehicle: "VEH003", run: 1 } },
    { id: randomUUID(), action: { type: "arrive", vehicle: "VEH003", outlet: "OUT074" } },
    { id: randomUUID(), action: { type: "deliver", vehicle: "VEH003", outlet: "OUT074", open: "05:30", outcome: "all", online: true, receivedBy: "Store manager" } },
  ];
  r = await call("/api/commands", { token: driver, body: { commands: batch } });
  assert.deepEqual(r.body.results.map((x) => x.status), ["applied", "applied", "applied"]);
  r = await call("/api/commands", { token: driver, body: { commands: batch } });
  assert.deepEqual(r.body.results.map((x) => x.status), ["duplicate", "duplicate", "duplicate"], "a replayed outbox is never applied twice");

  // 4. Store: sees the delivery and confirms it.
  const st = await call("/api/state", { token: store });
  assert.equal(st.body.state.delivered["VEH003:OUT074"].outcome, "all");
  assert.equal(st.body.state.loadedTrucks["VEH003:1"].by, "Suresh");
  r = await send(store, { type: "storeReport", report: { outlet: "OUT074", ref: "S1-083", kind: "ok", what: "All 205 cases OK", by: "Store manager" } });
  assert.equal(r.body.results[0].status, "applied");
});

test("the server refuses what a role may not do", async () => {
  const driver = await signIn("WP-DRV-003", config.seedPin);
  const store = await signIn("STORE-OUT034", config.seedPassword);
  let r = await send(driver, { type: "publish", by: "Ruwan" });
  assert.equal(r.body.results[0].status, "rejected");
  r = await send(driver, { type: "deliver", vehicle: "VEH006", outlet: "OUT026", outcome: "all", online: true });
  assert.match(r.body.results[0].error, /You drive VEH003/);
  r = await send(store, { type: "storeReport", report: { outlet: "OUT054", what: "x" } });
  assert.match(r.body.results[0].error, /OUT034/);
  const noToken = await call("/api/state");
  assert.equal(noToken.status, 401);
});

test("a manual move that breaks a rule is rejected", async () => {
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  // S1-041 is a chilled order: a dry truck is not allowed.
  const r = await send(disp, { type: "planEdit", edit: { ref: "S1-041", to: { vehicle: "VEH033", trip: 1 }, by: "Nimal" } });
  assert.equal(r.body.results[0].status, "rejected");
  assert.match(r.body.results[0].error, /Move not allowed/);
});
