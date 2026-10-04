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

  // The S1 reference day: the evening before (orders closed, plan not yet published).
  await send(disp, { type: "clock", clock: { date: "2026-01-07", time: "19:00" } });
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

test("no back doors: no demo sessions, no reset in a real deployment", async () => {
  const r = await call("/api/auth/demo", { body: { role: "dispatcher", account: "WP-DSP-001" } });
  assert.equal(r.status, 403);
  const portal = await call("/api/auth/demo", { body: { role: "demo" } });
  assert.equal(portal.status, 403, "DEMO_MODE is off by default");
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  const reset = await send(disp, { type: "reset" });
  assert.equal(reset.body.results[0].status, "rejected");
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

test("a real run: store orders on the clock's run are planned; unserved orders carry to the next run", async () => {
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  const store = await signIn("STORE-OUT034", config.seedPassword);
  // Sunday 4 Oct 2026, 12:00: the current run is Monday 5 Oct.
  await send(disp, { type: "clock", clock: { date: "2026-10-04", time: "12:00" } });
  let r = await send(store, { type: "storeOrder", order: { ref: "N-T1", outlet: "OUT034", name: "OUT034", dry: 84, cold: 192, by: "Fathima" } });
  assert.equal(r.body.results[0].status, "applied");
  let st = (await call("/api/state", { token: disp })).body.state;
  assert.equal(st.storeOrders[0].run, "2026-10-05");
  // Publishing a real run with orders but no plan is refused.
  r = await send(disp, { type: "publish", by: "Nimal" });
  assert.match(r.body.results[0].error, /no plan/);
  // The engine plans exactly this run's real orders.
  const plan = await call("/api/plan/auto", { token: disp, body: {} });
  assert.equal(plan.status, 200, JSON.stringify(plan.body));
  assert.deepEqual(Object.keys(plan.body.alloc).sort(), ["N-T1-C", "N-T1-D"]);
  assert.equal(plan.body.check.ok, true);
  // Defer the chilled order on purpose, publish, then move to Tuesday: it carries over and goes first.
  const alloc = { ...plan.body.alloc, "N-T1-C": null };
  r = await send(disp, { type: "planSet", alloc, summary: plan.body.summary, by: "Nimal" }, { type: "publish", by: "Nimal" });
  assert.deepEqual(r.body.results.map((x) => x.status), ["applied", "applied"]);
  // Monday morning: the dry order is delivered by its truck's driver.
  await send(disp, { type: "clock", clock: { date: "2026-10-05", time: "06:00" } });
  const veh = alloc["N-T1-D"].vehicle;
  const driver = await signIn(`WP-DRV-${veh.slice(3)}`, config.seedPassword);
  r = await send(driver, { type: "deliver", vehicle: veh, outlet: "OUT034", outcome: "all", online: true, receivedBy: "Fathima" });
  assert.equal(r.body.results[0].status, "applied", JSON.stringify(r.body));
  // The dispatcher looks at the S1 reference day and comes back: Monday's plan and delivery are still there.
  await send(disp, { type: "clock", clock: { date: "2026-01-08", time: "05:00" } });
  await send(disp, { type: "clock", clock: { date: "2026-10-05", time: "07:00" } });
  st = (await call("/api/state", { token: disp })).body.state;
  assert.equal(st.runDate, "2026-10-05");
  assert.equal(st.published, true, "the run's plan is kept");
  assert.ok(st.delivered[`${veh}:OUT034`], "the run's delivery is kept");
  await send(disp, { type: "clock", clock: { date: "2026-10-06", time: "03:00" } });
  r = await send(disp, { type: "log", who: "Nimal", role: "Dispatcher", what: "Tuesday" });
  st = (await call("/api/state", { token: disp })).body.state;
  assert.equal(st.runDate, "2026-10-06");
  assert.equal(st.published, false, "a new run starts unpublished");
  assert.deepEqual(st.carry.map((o) => [o.ref, o.deferredYesterday]), [["N-T1-C", true]]);
});

test("a truck breaks down: re-plan without it keeps every other truck's orders", async () => {
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  // Tuesday before 4 PM: stores order for Wednesday's run. At 17:00 the dispatcher plans it.
  await send(disp, { type: "clock", clock: { date: "2026-10-06", time: "12:00" } });
  for (const [ref, outlet] of [["N-R1", "OUT034"], ["N-R2", "OUT026"], ["N-R3", "OUT074"]]) {
    const store = await signIn(`STORE-${outlet}`, config.seedPassword);
    const r = await send(store, { type: "storeOrder", order: { ref, outlet, name: outlet, dry: 60, cold: 40, by: "Store" } });
    assert.equal(r.body.results[0].status, "applied");
  }
  await send(disp, { type: "clock", clock: { date: "2026-10-06", time: "17:00" } });
  const plan = (await call("/api/plan/auto", { token: disp, body: {} })).body;
  for (const ref of ["N-R1-D", "N-R1-C", "N-R2-D", "N-R2-C", "N-R3-D", "N-R3-C"]) assert.ok(ref in plan.alloc, `${ref} is in Wednesday's run`);
  let r = await send(disp, { type: "planSet", alloc: plan.alloc, summary: plan.summary, by: "Nimal" }, { type: "publish", by: "Nimal" });
  assert.deepEqual(r.body.results.map((x) => x.status), ["applied", "applied"]);
  const down = Object.values(plan.alloc).find(Boolean).vehicle;
  const re = await call("/api/plan/auto", { token: disp, body: { without: down } });
  assert.equal(re.status, 200, JSON.stringify(re.body));
  assert.equal(re.body.check.ok, true);
  assert.ok(Object.values(re.body.alloc).every((a) => !a || a.vehicle !== down), "nothing left on the broken truck");
  for (const [ref, a] of Object.entries(plan.alloc)) if (a && a.vehicle !== down) assert.deepEqual(re.body.alloc[ref], a, `${ref} keeps its truck`);
  assert.deepEqual(re.body.moved.map((m) => m.ref).sort(), Object.keys(plan.alloc).filter((k) => plan.alloc[k]?.vehicle === down).sort());
  r = await send(disp, { type: "planSet", alloc: re.body.alloc, summary: re.body.summary, by: "Nimal", what: "re-plan" },
    { type: "fleetStatus", vehicle: down, change: { status: "in_workshop", back: null, by: "Nimal" } });
  assert.deepEqual(r.body.results.map((x) => x.status), ["applied", "applied"]);
  const st = (await call("/api/state", { token: disp })).body.state;
  assert.equal(st.published, true, "the plan stays published");
  assert.equal(st.fleetEdits[down].status, "in_workshop");
  assert.equal((await call("/api/plan/check", { token: disp })).body.ok, true);
});

test("one order per store per run; a store changes only its own orders", async () => {
  const s34 = await signIn("STORE-OUT034", config.seedPassword);
  const s26 = await signIn("STORE-OUT026", config.seedPassword);
  await send(await signIn("WP-DSP-001", config.seedPassword), { type: "clock", clock: { date: "2026-10-06", time: "12:00" } });
  // OUT034 already ordered N-R1 for this run (previous test): a second order is refused, a change is fine.
  let r = await send(s34, { type: "storeOrder", order: { ref: "OUT034-X", outlet: "OUT034", name: "OUT034", dry: 5, cold: 0, by: "Store" } });
  assert.match(r.body.results[0].error, /already has an order/);
  r = await send(s34, { type: "storeOrderUpdate", ref: "N-R1", patch: { dry: 70 } });
  assert.equal(r.body.results[0].status, "applied");
  // An order too big for one truck goes as pieces; a used order number is refused.
  r = await send(s34, { type: "storeOrder", order: { ref: "OUT034-P2", outlet: "OUT034", name: "OUT034", dry: 5, cold: 0, by: "Store", split: true } });
  assert.equal(r.body.results[0].status, "applied");
  r = await send(s26, { type: "storeOrder", order: { ref: "N-R1", outlet: "OUT026", name: "OUT026", dry: 5, cold: 0, by: "Store", split: true } });
  assert.match(r.body.results[0].error, /already an order N-R1/);
  // Another store cannot change or cancel it.
  r = await send(s26, { type: "storeOrderCancel", ref: "N-R1", by: "Someone" });
  assert.match(r.body.results[0].error, /belongs to OUT034/);
});

test("bad day on a real run: not delivered carries over; short and missing cases come back as replacement orders", async () => {
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  // Wednesday's run (planned and published in the tests above), 06:00.
  await send(disp, { type: "clock", clock: { date: "2026-10-07", time: "06:00" } });
  let st = (await call("/api/state", { token: disp })).body.state;
  assert.equal(st.published, true);
  const alloc = { ...st.planAlloc };
  for (const e of st.planEdits || []) alloc[e.ref] = e.to;
  const drive = async (ref, outlet, rec) => {
    const veh = alloc[ref].vehicle;
    const t = await signIn(`WP-DRV-${veh.slice(3)}`, config.seedPassword);
    const r = await send(t, { type: "deliver", vehicle: veh, outlet, online: true, ...rec });
    assert.equal(r.body.results[0].status, "applied", JSON.stringify(r.body));
    return veh;
  };
  // Dock: 2 chilled cases of OUT034 broken; the dispatcher sends the truck short.
  const loader = await signIn("DEPOT-PELIYAGODA", config.seedPassword);
  let r = await send(loader, { type: "loaderReport", report: { vehicle: alloc["N-R1-C"].vehicle, outlet: "OUT034", ref: "N-R1-C", count: 2, chilled: true, kind: "broken", what: "2 chilled cases broken", by: "Suresh" } });
  assert.equal(r.body.results[0].status, "applied", JSON.stringify(r.body));
  st = (await call("/api/state", { token: disp })).body.state;
  r = await send(disp, { type: "shortReorder", id: st.loaderReports[0].id, by: "Nimal" });
  assert.equal(r.body.results[0].status, "applied", JSON.stringify(r.body));
  // OUT034 receives the rest; OUT026 is closed; OUT074 gets its order but reports 3 cases missing.
  await drive("N-R1-D", "OUT034", { outcome: "all", receivedBy: "Fathima" });
  await drive("N-R2-D", "OUT026", { outcome: "none", reason: "shopClosed" });
  const v74 = await drive("N-R3-D", "OUT074", { outcome: "all", receivedBy: "Kamal" });
  const s74 = await signIn("STORE-OUT074", config.seedPassword);
  await send(s74, { type: "storeReport", report: { outlet: "OUT074", name: "OUT074", ref: "N-R3-D", vehicle: v74, count: 3, kind: "missing", what: "3 cases missing", by: "Kamal" } });
  st = (await call("/api/state", { token: disp })).body.state;
  r = await send(disp, { type: "storeReportDecision", id: st.storeReports[0].id, decision: "resend", by: "Nimal" });
  assert.equal(r.body.results[0].status, "applied");
  st = (await call("/api/state", { token: disp })).body.state;
  const repl = st.storeOrders.filter((o) => o.ref.startsWith("R-") && o.run === "2026-10-08").map((o) => [o.outlet, o.dry, o.cold]).sort();
  assert.deepEqual(repl, [["OUT034", 0, 2], ["OUT074", 3, 0]]);
  assert.ok(st.notifications.some((n) => n.title === "Not delivered · OUT026"), "the dispatcher is told");
  // Thursday's run: the closed shop's orders and both replacement orders, all first in line.
  await send(disp, { type: "clock", clock: { date: "2026-10-07", time: "17:00" } });
  st = (await call("/api/state", { token: disp })).body.state;
  assert.equal(st.runDate, "2026-10-08");
  const carried = st.carry.map((o) => o.ref);
  assert.ok(carried.includes("N-R2-D") && carried.includes("N-R2-C"), `OUT026 carries over: ${carried}`);
  assert.ok(!carried.includes("N-R1-D") && !carried.includes("N-R3-D"), "delivered orders do not carry");
  const plan = (await call("/api/plan/auto", { token: disp, body: {} })).body;
  for (const ref of ["N-R2-D", "N-R2-C"]) assert.ok(plan.alloc[ref], `${ref} is planned first`);
  assert.ok(Object.keys(plan.alloc).some((k) => k.startsWith("R-")), "replacement orders are planned");
});

test("safety: a switched-off account is signed out at once; deliveries and reports must match the plan", async () => {
  const admin = await signIn("WP-ADM-001", config.seedPassword);
  const drv = await signIn("WP-DRV-020", config.seedPassword);
  assert.equal((await call("/api/state", { token: drv })).status, 200);
  let r = await send(admin, { type: "accountStatus", id: "WP-DRV-020", status: "Deactivated" });
  assert.equal(r.body.results[0].status, "applied");
  const after = await call("/api/state", { token: drv });
  assert.equal(after.status, 401, "the open session ends");
  assert.equal(after.body.code, "deactivated");
  await send(admin, { type: "accountStatus", id: "WP-DRV-020", status: "Active" });
  assert.equal((await call("/api/state", { token: drv })).status, 200);
  // A driver cannot hand over a stop that is not on their truck's plan.
  r = await send(drv, { type: "deliver", vehicle: "VEH020", outlet: "OUT099", outcome: "all", online: true });
  assert.match(r.body.results[0].error, /not a stop of VEH020|not published|cannot be delivered yet/);
  // A report cannot claim more cases than the order has.
  const disp = await signIn("WP-DSP-001", config.seedPassword);
  const st = (await call("/api/state", { token: disp })).body.state;
  const o = st.carry[0];
  const store = await signIn(`STORE-${o.outlet}`, config.seedPassword);
  r = await send(store, { type: "storeReport", report: { outlet: o.outlet, name: o.outlet, ref: o.ref, count: o.units + 1, kind: "missing", what: "too many", by: "Store" } });
  assert.match(r.body.results[0].error, /has only/);
});
