/* Seeds the database from the shared datasets (data/…) and sets up one realistic delivery day: S1, the peak day
   (Thu 8 Jan 2026) with its 85 orders and fleet status, plus 185 accounts. The day starts on Wed 7 Jan at 19:00,
   orders closed and tonight's plan not yet published, so a judge can walk through planning → loading → delivery.
   Usage: tsx db/seed.js            (wipe and reseed)
          tsx db/seed.js --if-empty (only when the database has no delivery day yet; used by docker compose) */
import { readFileSync, existsSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { parse as parseStream } from "csv-parse";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { pool, q, tx, waitForDb } from "../src/db.js";
import { config } from "../src/config.js";
import { migrate } from "./migrate.js";
import { SEED_ACCOUNTS, storeName } from "../../app/src/data/accounts.js";
import { initial, sharedOf } from "../../app/src/domain/store.js";

const DAY = { id: config.dayId, date: "2026-01-08", depot: "Peliyagoda", label: "S1 peak day · Thu 8 Jan 2026" };
const START_CLOCK = { date: "2026-01-07", time: "19:00" };

function csv(rel) {
  const path = join(config.dataDir, rel);
  if (!existsSync(path)) throw new Error(`Missing dataset file: ${path}. Put the shared datasets in ${config.dataDir} (see README).`);
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true, trim: true });
}
const nb = (v) => (v === "" || v == null ? null : v);
const bool = (v) => v === "1" || v === "true" || v === "True";

/* The two history files are large (about 92,000 rows each): read them as a stream and insert in batches,
   so the seed runs in little memory (Render's free plan has 512 MB). */
async function insertStream(client, table, cols, rel, map, chunk = 2000) {
  const path = join(config.dataDir, rel);
  if (!existsSync(path)) throw new Error(`Missing dataset file: ${path}. Put the shared datasets in ${config.dataDir} (see README).`);
  let batch = [], n = 0;
  for await (const r of createReadStream(path).pipe(parseStream({ columns: true, skip_empty_lines: true, trim: true }))) {
    batch.push(map(r));
    if (batch.length >= chunk) { await insertMany(client, table, cols, batch, chunk); n += batch.length; batch = []; }
  }
  if (batch.length) { await insertMany(client, table, cols, batch, chunk); n += batch.length; }
  return n;
}

/* Insert many rows fast: one statement per chunk. */
async function insertMany(client, table, cols, rows, chunk = 1000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((r) => `(${cols.map((c) => { params.push(r[c]); return `$${params.length}`; }).join(",")})`).join(",");
    await client.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${values}`, params);
  }
}

/* The seeded accounts sign in with SEED_PASSWORD (office) and SEED_PIN (field). When either setting changes,
   the seeded accounts take the new secrets on the next start; accounts an admin created later are left alone. */
const SEED_IDS = () => [...SEED_ACCOUNTS.map((a) => a.id), "WP-ADM-001"];
const fingerprint = () => createHash("sha256").update(`${config.seedPassword}|${config.seedPin}`).digest("hex");
export async function syncSeedSecrets() {
  const fp = fingerprint();
  const { rows } = await q("SELECT value FROM app_meta WHERE key = 'seed_secrets'");
  if (rows[0]?.value === fp) return false;
  const [pw, pin] = await Promise.all([bcrypt.hash(config.seedPassword, 10), bcrypt.hash(config.seedPin, 10)]);
  await q(`UPDATE accounts SET secret_hash = CASE WHEN role IN ('driver', 'loader') THEN $2 ELSE $1 END, failed_attempts = 0, locked_until = NULL
    WHERE id = ANY($3)`, [pw, pin, SEED_IDS()]);
  await q(`INSERT INTO app_meta (key, value) VALUES ('seed_secrets', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`, [fp]);
  console.log("seed: seeded accounts now use the current SEED_PASSWORD / SEED_PIN");
  return true;
}

export async function seed({ ifEmpty = false } = {}) {
  await migrate();
  if (ifEmpty) {
    const { rows } = await q("SELECT count(*)::int AS n FROM delivery_days");
    if (rows[0].n > 0) { console.log("seed: database already has data, skipping"); await syncSeedSecrets(); return; }
  }
  const t0 = Date.now();
  const G = "General Data", T = "Test Data", R = "Training Data";
  const districts = csv(`${G}/district_travel.csv`);
  const outlets = csv(`${G}/outlets.csv`);
  const vehicles = csv(`${G}/vehicles.csv`);
  const allowance = csv(`${G}/service_allowance.csv`);
  const calendar = csv(`${G}/calendar.csv`);
  const traffic = csv(`${G}/traffic_speed.csv`);
  const roads = csv(`${G}/road_conditions.csv`);
  const scenarios = csv(`${T}/task2b_peak_day_scenarios.csv`).filter((r) => r.scenario === DAY.id);
  const fleet = csv(`${T}/task2b_peak_day_fleet.csv`).filter((r) => r.scenario === DAY.id);

  const [pw, pin] = await Promise.all([bcrypt.hash(config.seedPassword, 10), bcrypt.hash(config.seedPin, 10)]);

  await tx(async (c) => {
    await c.query(`TRUNCATE commands, day_state, plan_items, plans, accounts, vehicle_day_status, orders, delivery_days,
      route_legs, delivery_history, road_conditions, traffic_speed, calendar, service_allowance, vehicles, outlets, districts, depots RESTART IDENTITY CASCADE`);
    const depots = [...new Set([...districts.map((d) => d.depot), ...outlets.map((o) => o.depot), ...vehicles.map((v) => v.depot)])];
    await insertMany(c, "depots", ["name"], depots.map((name) => ({ name })));
    await insertMany(c, "districts", ["name", "depot", "road_class", "free_flow_kmh", "depot_km", "depot_min", "stop_km", "stop_min"],
      districts.map((d) => ({ name: d.district, depot: d.depot, road_class: d.road_class, free_flow_kmh: d.free_flow_kmh, depot_km: d.depot_to_district_km,
        depot_min: d.depot_to_district_freeflow_min, stop_km: d.inter_stop_km, stop_min: d.inter_stop_freeflow_min })));
    await insertMany(c, "outlets", ["id", "name", "brand", "district", "depot", "dock_type", "parking", "mall_window", "window_open", "window_close"],
      outlets.map((o) => ({ id: o.outlet_id, name: storeName[o.outlet_id] || o.outlet_id, brand: o.brand, district: o.district, depot: o.depot, dock_type: o.dock_type,
        parking: o.parking_constraint, mall_window: nb(o.mall_window), window_open: o.window_open_time, window_close: o.window_close_time })));
    await insertMany(c, "vehicles", ["id", "type", "temp", "weight_cap_kg", "volume_cap_m3", "fuel_type", "km_per_l", "weekly_quota_l", "depot"],
      vehicles.map((v) => ({ id: v.vehicle_id, type: v.type, temp: v.temp, weight_cap_kg: v.weight_cap_kg, volume_cap_m3: v.volume_cap_m3, fuel_type: v.fuel_type,
        km_per_l: v.km_per_l, weekly_quota_l: v.weekly_fuel_quota_l, depot: v.depot })));
    await insertMany(c, "service_allowance", ["brand", "dock_type", "minutes"], allowance.map((a) => ({ brand: a.brand, dock_type: a.dock_type, minutes: a.service_allowance_min })));
    await insertMany(c, "calendar", ["date", "dow", "iso_year", "iso_week", "is_weekend", "is_payday", "festival", "festival_ramp", "is_holiday", "monsoon", "is_operating"],
      calendar.map((d) => ({ date: d.date, dow: d.dow, iso_year: d.iso_year, iso_week: d.iso_week, is_weekend: bool(d.is_weekend), is_payday: bool(d.is_payday),
        festival: nb(d.festival), festival_ramp: nb(d.festival_ramp), is_holiday: bool(d.is_holiday), monsoon: bool(d.monsoon), is_operating: bool(d.is_operating) })));
    await insertMany(c, "traffic_speed", ["district", "hour", "monsoon", "speed_index"], traffic.map((t) => ({ district: t.district, hour: t.hour, monsoon: bool(t.monsoon), speed_index: t.speed_index })));
    await insertMany(c, "road_conditions", ["district", "date", "disruption_index"], roads.map((r) => ({ district: r.district, date: r.date, disruption_index: r.disruption_index })));
    await insertStream(c, "delivery_history", ["delivery_id", "order_date", "dispatch_date", "dispatch_status", "outlet_id", "brand", "district", "depot", "temp_requirement",
      "order_units", "order_weight_kg", "order_volume_m3", "route_id", "vehicle_id", "planned_arrival"], `${R}/deliveries_train.csv`,
      (h) => ({ delivery_id: h.delivery_id, order_date: h.order_date, dispatch_date: nb(h.dispatch_date), dispatch_status: h.dispatch_status, outlet_id: h.outlet_id,
        brand: h.brand, district: h.district, depot: h.depot, temp_requirement: h.temp_requirement, order_units: h.order_units, order_weight_kg: h.order_weight_kg,
        order_volume_m3: h.order_volume_m3, route_id: nb(h.route_id), vehicle_id: nb(h.vehicle_id), planned_arrival: nb(h.planned_arrival_time) }));
    await insertStream(c, "route_legs", ["leg_id", "date", "route_id", "depot", "vehicle_id", "brand", "district", "seq", "to_outlet", "distance_km", "planned_arrival", "arrival_time", "leave_time"], `${R}/route_legs_train.csv`,
      (l) => ({ leg_id: l.leg_id, date: l.date, route_id: l.route_id, depot: l.depot, vehicle_id: l.vehicle_id, brand: l.brand, district: l.district, seq: l.seq,
        to_outlet: l.to_outlet, distance_km: l.distance_km, planned_arrival: nb(l.planned_arrival_time), arrival_time: nb(l.arrival_time), leave_time: nb(l.leave_outlet_time) }));

    // The delivery day
    await c.query("INSERT INTO delivery_days (id, date, depot, label) VALUES ($1, $2, $3, $4)", [DAY.id, DAY.date, DAY.depot, DAY.label]);
    await insertMany(c, "orders", ["ref", "day_id", "outlet_id", "chilled", "units", "weight_kg", "volume_m3", "deferred_yesterday", "days_since_last_served", "source"],
      scenarios.map((o) => ({ ref: o.order_ref, day_id: DAY.id, outlet_id: o.outlet_id, chilled: o.temp_requirement === "chilled", units: o.order_units, weight_kg: o.order_weight_kg,
        volume_m3: o.order_volume_m3, deferred_yesterday: bool(o.deferred_yesterday), days_since_last_served: o.days_since_last_served, source: "dataset" })));
    await insertMany(c, "vehicle_day_status", ["day_id", "vehicle_id", "status"], fleet.map((f) => ({ day_id: DAY.id, vehicle_id: f.vehicle_id, status: f.status })));

    // Accounts: 2 dispatchers, 60 drivers (one per vehicle), 120 shared store accounts, 2 shared depot accounts, 1 admin.
    const roleOf = { Dispatcher: "dispatcher", Driver: "driver", "Store account": "store", "Depot account": "loader" };
    const LANG = { "WP-DRV-003": "si", "DEPOT-PELIYAGODA": "ta" };
    const accounts = [...SEED_ACCOUNTS, { name: "Admin", id: "WP-ADM-001", type: "Admin", category: "Head office", status: "Active" }].map((a) => {
      const role = roleOf[a.type] || "admin";
      const field = role === "driver" || role === "loader";
      return { id: a.id, role, name: a.name, depot: role === "dispatcher" ? a.category : a.depot || null, outlet_id: role === "store" ? a.id.replace("STORE-", "") : null,
        vehicle_id: a.vehicle || null, category: a.category || null, shared: role === "store" || role === "loader", people: a.people || [],
        lang: LANG[a.id] || "en", status: a.status, secret_hash: field ? pin : pw };
    });
    await insertMany(c, "accounts", ["id", "role", "name", "depot", "outlet_id", "vehicle_id", "category", "shared", "people", "lang", "status", "secret_hash"], accounts);

    // The day's starting state: the evening before, orders closed, plan not yet published.
    const start = { ...sharedOf(initial), clock: { ...START_CLOCK, setAt: Date.now() }, published: false, publishedBy: null };
    await c.query("INSERT INTO day_state (day_id, seq, state, seed_state) VALUES ($1, 0, $2, $2)", [DAY.id, JSON.stringify(start)]);
  });
  await q(`INSERT INTO app_meta (key, value) VALUES ('seed_secrets', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`, [fingerprint()]);
  const count = async (t) => (await q(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  console.log(`seed: ${await count("outlets")} outlets, ${await count("vehicles")} vehicles, ${await count("orders")} orders for ${DAY.id}, ` +
    `${await count("accounts")} accounts, ${await count("delivery_history")} past deliveries, ${await count("route_legs")} route legs (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  waitForDb().then(() => seed({ ifEmpty: process.argv.includes("--if-empty") })).then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
