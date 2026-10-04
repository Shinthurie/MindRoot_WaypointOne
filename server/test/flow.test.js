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

test("only a dispatcher sets the clock, and it keeps running", async () => {
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  const loader = await signIn("DEPOT-PELIYAGODA", config.seedPin);
  let r = await send(loader, { type: "clock", clock: { time: "04:00" } });
  assert.equal(r.body.results[0].status, "rejected");
  r = await send(disp, { type: "clock", clock: { date: "2026-01-08", time: "03:00" } });
  assert.equal(r.body.results[0].status, "applied");
  const st = (await call("/api/state", { token: disp })).body.state;
  assert.equal(st.clock.time, "03:00");
  assert.ok(st.clock.setAt > 0, "the set time runs on from setAt");
  r = await send(disp, { type: "clock", real: true });
  assert.equal((await call("/api/state", { token: disp })).body.state.clock.real, true);
});

test("no back doors: a demo session cannot be a real account", async () => {
  const r = await call("/api/auth/demo", { body: { role: "dispatcher", account: "WP-DSP-001" } });
  assert.equal(r.status, 403);
  const portal = (await call("/api/auth/demo", { body: { role: "demo" } })).body;
  assert.equal(portal.user.role, "demo");
});

test("first sign-in with a temporary password, then a password change", async () => {
  // WP-DRV-027 is seeded as not activated; its temporary secret is the seed PIN.
  const first = await call("/api/auth/login", { body: { id: "WP-DRV-027", secret: config.seedPin } });
  assert.equal(first.status, 409);
  assert.equal(first.body.code, "first");
  const weak = await call("/api/auth/activate", { body: { id: "WP-DRV-027", temp: config.seedPin, secret: "111111" } });
  assert.equal(weak.status, 400);
  const act = await call("/api/auth/activate", { body: { id: "WP-DRV-027", temp: config.seedPin, secret: "482916" } });
  assert.equal(act.status, 200);
  assert.equal(act.body.user.vehicle, "VEH027");
  const tok = await signIn("WP-DRV-027", "482916");
  assert.ok(tok);
  const wrong = await call("/api/auth/password", { token: tok, body: { current: "000000", next: "735184" } });
  assert.equal(wrong.status, 401);
  const ok = await call("/api/auth/password", { token: tok, body: { current: "482916", next: "735184" } });
  assert.equal(ok.status, 200);
  assert.ok(await signIn("WP-DRV-027", "735184"));
});

test("admin reset sign-in: temporary password works once and never reaches the shared log", async () => {
  const admin = await signIn("WP-ADM-001", config.seedPassword);
  const r = await send(admin, { type: "resetSignIn", id: "WP-DRV-005", temp: "AB-CD-EF" });
  assert.equal(r.body.results[0].status, "applied");
  const log = await call("/api/commands?since=0", { token: admin });
  assert.ok(log.body.commands.some((c) => c.type === "resetSignIn"));
  const { pool } = await import("../src/db.js");
  const stored = (await pool.query("SELECT payload FROM commands WHERE type = 'resetSignIn'")).rows[0].payload;
  assert.equal(stored.temp, undefined, "the temporary password is not stored in the log");
  const first = await call("/api/auth/login", { body: { id: "WP-DRV-005", secret: "AB-CD-EF" } });
  assert.equal(first.body.code, "first");
});
