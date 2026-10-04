/* Waypoint One API server. Serves the web app too, so one URL runs the whole system. */
import express from "express";
import cors from "cors";
import compression from "compression";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { q, waitForDb } from "./db.js";
import { AuthError, demoLogin, login, profile, requireAuth, requireRole } from "./auth.js";
import { apply, getState, listenerCount, rebuild, subscribe } from "./daystore.js";
import { checkAlloc, effectiveAlloc, loadDay, runEngine, savePlan } from "./planning.js";

const app = express();
app.set("trust proxy", true);
app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => (req.path === "/api/events" ? next() : compression()(req, res, next))); // never buffer the live stream

const DAY = config.dayId;
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const status = e.status || (e instanceof AuthError ? e.status : 500);
  if (status >= 500) console.error(e);
  res.status(status).json({ error: e.message, code: e.code, details: e.details });
});

// ---------- Health ----------
app.get("/api/health", wrap(async (req, res) => {
  const db = (await q("SELECT (SELECT count(*) FROM orders)::int AS orders, (SELECT count(*) FROM accounts)::int AS accounts")).rows[0];
  const { seq } = await getState(DAY);
  res.json({ ok: true, day: DAY, seq, demoMode: config.demoMode, listeners: listenerCount(DAY), ...db });
}));

// ---------- Sign-in ----------
app.post("/api/auth/login", wrap(async (req, res) => res.json(await login(req.body.id, req.body.secret))));
app.post("/api/auth/demo", wrap(async (req, res) => res.json(await demoLogin(req.body.role, req.body.account))));
app.get("/api/auth/me", requireAuth, wrap(async (req, res) => {
  if (req.user.role === "demo") return res.json({ user: { role: "demo", id: "DEMO", name: "Demo controls" } });
  const { rows } = await q("SELECT * FROM accounts WHERE id = $1", [req.user.id]);
  if (!rows[0] || rows[0].status !== "Active") return res.status(401).json({ error: "This account can no longer sign in" });
  res.json({ user: profile(rows[0]) });
}));

// ---------- The shared day: state, live stream, commands ----------
app.get("/api/state", requireAuth, wrap(async (req, res) => res.json(await getState(DAY))));

app.get("/api/events", requireAuth, wrap(async (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const { seq } = await getState(DAY);
  res.write(`data: ${JSON.stringify({ kind: "hello", seq })}\n\n`);
  const off = subscribe(DAY, res);
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => { clearInterval(ping); off(); });
}));

// Commands arrive one at a time or as a batch (a phone's outbox after a dead zone). Each result says applied,
// duplicate (already recorded: nothing happens twice) or rejected (with the reason).
app.post("/api/commands", requireAuth, wrap(async (req, res) => {
  const list = Array.isArray(req.body.commands) ? req.body.commands : [req.body];
  if (list.length > 200) return res.status(413).json({ error: "Send at most 200 commands at a time" });
  const results = await apply(DAY, req.user, list);
  const { seq } = await getState(DAY);
  res.json({ seq, results });
}));

// Who did what, in order (admin activity log, audit).
app.get("/api/commands", requireAuth, requireRole("admin", "dispatcher"), wrap(async (req, res) => {
  const since = Number(req.query.since || 0);
  const { rows } = await q(`SELECT seq, id, type, actor_id, actor_role, person, client_time, received_at FROM commands
    WHERE day_id = $1 AND seq > $2 ORDER BY seq LIMIT 500`, [DAY, since]);
  res.json({ commands: rows });
}));

// ---------- Planning ----------
app.post("/api/plan/auto", requireAuth, requireRole("dispatcher", "demo"), wrap(async (req, res) => {
  const { state } = await getState(DAY);
  const r = await runEngine(DAY, state, req.body?.tries ? { tries: Math.min(Number(req.body.tries), 2000) } : {});
  const planId = await savePlan(DAY, "engine", req.user.id, r);
  res.json({ planId, ...r });
}));
app.get("/api/plan/check", requireAuth, wrap(async (req, res) => {
  const { state } = await getState(DAY);
  res.json(await checkAlloc(DAY, state));
}));
app.get("/api/plan/current", requireAuth, wrap(async (req, res) => {
  const { state } = await getState(DAY);
  res.json({ source: state.planSource?.source || "optimiser", alloc: effectiveAlloc(state), edits: state.planEdits || [] });
}));

// ---------- Reference data (from the seeded datasets) ----------
app.get("/api/reference/day", requireAuth, wrap(async (req, res) => {
  const d = await loadDay(DAY);
  res.json({ day: d.day, orders: d.orders, vehicles: d.vehicles, districts: d.districts, allowance: d.allowance, fuelLeft: d.fuelLeft });
}));
app.get("/api/reference/outlets", requireAuth, wrap(async (req, res) => res.json({ outlets: (await q("SELECT * FROM outlets ORDER BY id")).rows })));
app.get("/api/reference/vehicles", requireAuth, wrap(async (req, res) => res.json({ vehicles: (await q("SELECT * FROM vehicles ORDER BY id")).rows })));

// Rebuild the day's state from its command log (admin tool; shows the log is the source of truth).
app.post("/api/admin/rebuild", requireAuth, requireRole("admin"), wrap(async (req, res) => res.json(await rebuild(DAY))));

// ---------- The web app ----------
if (existsSync(join(config.staticDir, "index.html"))) {
  app.use(express.static(config.staticDir, { index: false, maxAge: "1h", setHeaders: (res, p) => { if (/sw\.js$|index\.html$/.test(p)) res.setHeader("Cache-Control", "no-cache"); } }));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(join(config.staticDir, "index.html")));
}
app.use("/api", (req, res) => res.status(404).json({ error: `No API route ${req.method} ${req.path}` }));

export async function start() {
  await waitForDb();
  await getState(DAY);
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      console.log(`Waypoint One API on :${config.port} (day ${DAY}, demo mode ${config.demoMode ? "on" : "off"})`);
      resolve(server);
      // Work out tonight's engine plan in the background, so the dispatcher's Auto-plan answers at once.
      setTimeout(() => getState(DAY).then(({ state }) => runEngine(DAY, state)).then((r) => console.log(`engine plan ready: ${r.summary.served} of ${r.summary.orders} served (${r.ms} ms)`)).catch((e) => console.error("engine warm-up failed", e.message)), 500);
    });
  });
}
export { app };

if (process.argv[1] && /index\.js$/.test(process.argv[1])) start();
