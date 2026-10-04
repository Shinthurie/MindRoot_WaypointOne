/* Planning on the server: reads the day's orders and fleet from the database, runs the shared engine,
   and checks any allocation (engine output, the team's published plan, or the dispatcher's edits). */
import { q, tx } from "./db.js";
import { createPlanner } from "../../app/src/domain/planner.js";
import data from "../../app/src/data/s1.json";
import { dayOrdersOf, isS1Run } from "../../app/src/domain/store.js";

let cache = null; // reference data changes only on reseed

export async function loadDay(dayId) {
  if (cache?.dayId === dayId) return cache;
  const day = (await q("SELECT * FROM delivery_days WHERE id = $1", [dayId])).rows[0];
  if (!day) throw new Error(`No delivery day ${dayId}: run the seed`);
  const districts = Object.fromEntries((await q("SELECT * FROM districts")).rows.map((d) => [d.name, { outMin: d.depot_min, stopMin: d.stop_min, outKm: d.depot_km, stopKm: d.stop_km }]));
  const allowance = Object.fromEntries((await q("SELECT * FROM service_allowance")).rows.map((a) => [`${a.brand}|${a.dock_type}`, a.minutes]));
  const orders = (await q(`SELECT o.*, t.brand, t.district, t.depot, t.dock_type, t.parking, t.mall_window, t.window_open, t.window_close
    FROM orders o JOIN outlets t ON t.id = o.outlet_id WHERE o.day_id = $1 ORDER BY o.ref`, [dayId])).rows.map((o) => ({
    ref: o.ref, outlet: o.outlet_id, brand: o.brand, district: o.district, depot: o.depot, dock: o.dock_type, parking: o.parking,
    mall: o.mall_window, open: o.window_open, close: o.window_close, chilled: o.chilled, units: o.units, kg: o.weight_kg, m3: o.volume_m3,
    deferredYesterday: o.deferred_yesterday, daysSince: o.days_since_last_served,
  }));
  const vehicles = (await q(`SELECT v.*, COALESCE(s.status, 'available') AS day_status FROM vehicles v
    LEFT JOIN vehicle_day_status s ON s.vehicle_id = v.id AND s.day_id = $1 WHERE v.depot = $2 ORDER BY v.id`, [dayId, day.depot])).rows.map((v) => ({
    id: v.id, type: v.type, reefer: v.temp === "reefer", depot: v.depot, m3: v.volume_cap_m3, kg: v.weight_cap_kg, kmPerL: v.km_per_l,
    quotaL: v.weekly_quota_l, status: v.day_status,
  }));
  // Fuel used so far this ISO week (Monday up to the day before): logged legs plus the return to the depot, per km/L.
  const fuel = (await q(`
    WITH d AS (SELECT date, (date - (EXTRACT(ISODOW FROM date)::int - 1))::date AS monday FROM delivery_days WHERE id = $1),
    routes AS (
      SELECT l.route_id, l.vehicle_id, l.district, SUM(l.distance_km) AS km FROM route_legs l, d
      WHERE l.date >= d.monday AND l.date < d.date GROUP BY 1, 2, 3)
    SELECT r.vehicle_id, SUM(r.km + t.depot_km) / MAX(v.km_per_l) AS litres
    FROM routes r JOIN districts t ON t.name = r.district JOIN vehicles v ON v.id = r.vehicle_id GROUP BY r.vehicle_id`, [dayId])).rows;
  const used = Object.fromEntries(fuel.map((f) => [f.vehicle_id, Number(f.litres)]));
  const fuelLeft = Object.fromEntries(vehicles.map((v) => [v.id, Math.max(0, v.quotaL - (used[v.id] || 0))]));
  cache = { dayId, day, districts, allowance, orders, vehicles, fuelLeft, fuelUsed: used, planner: createPlanner({ districts, allowance }) };
  return cache;
}
export const clearCache = () => { cache = null; };

/* Vehicles the plan may use: on S1 the dataset's fleet status; on a real run every vehicle is ready unless the
   dispatcher sent it to the workshop. */
function availableVehicles(d, state) {
  const edits = state?.fleetEdits || {};
  const s1 = !state || isS1Run(state);
  return d.vehicles.filter((v) => (edits[v.id]?.status || (s1 ? v.status : "available")) !== "in_workshop");
}
/* The run's orders (S1: the dataset in the database; a real run: the stores' orders + carried), with store rules. */
export function runOrders(d, state) {
  const edits = state?.storeEdits || {};
  const list = !state || isS1Run(state) ? d.orders : dayOrdersOf(state) || [];
  return list.map((o) => (edits[o.outlet] ? { ...o, ...edits[o.outlet], mall: edits[o.outlet].mall || null } : o));
}
const ordersWithRules = runOrders;
/* Fuel left this week: from the route history on S1; a real run has no logged legs yet, so the full quota. */
const fuelFor = (d, state) => (!state || isS1Run(state) ? d.fuelLeft : Object.fromEntries(d.vehicles.map((v) => [v.id, v.quotaL])));

/* The allocation the portals show: the adopted plan (engine or the team's optimiser plan) plus manual edits. */
export function effectiveAlloc(state) {
  const alloc = { ...(state.planAlloc || (isS1Run(state) ? data.plans.fair : {})) };
  for (const e of state.planEdits || []) alloc[e.ref] = e.to;
  return alloc;
}

/* The engine's answer depends only on the orders, the store rules and which vehicles are available, so it is
   kept per input: Auto-plan answers at once unless something changed (a truck to the workshop, a store rule).
   150 tries reach the best plan on S1 (measured); more add time, not quality. */
const engineCache = new Map();
export async function runEngine(dayId, state, opts = {}) {
  if (opts.without) return replanWithout(dayId, state, opts.without);
  const d = await loadDay(dayId);
  const vehicles = availableVehicles(d, state);
  const orders = ordersWithRules(d, state);
  const tries = opts.tries ?? 150;
  const fuelLeft = fuelFor(d, state);
  const key = JSON.stringify([dayId, state?.runDate, tries, vehicles.map((v) => v.id), state?.storeEdits || {}, orders.map((o) => `${o.ref}:${o.units}`)]);
  if (engineCache.has(key)) return { ...engineCache.get(key), cached: true };
  const t0 = Date.now();
  const result = d.planner.plan({ orders, vehicles, fuelLeft }, { tries });
  const check = d.planner.check({ orders, vehicles, alloc: result.alloc, fuelLeft });
  const out = { ...result, check, ms: Date.now() - t0, vehicles: vehicles.length };
  if (engineCache.size > 20) engineCache.clear();
  engineCache.set(key, out);
  return out;
}

/* An order whose stop is already delivered is done: it is not planned or checked again. */
const isDone = (state, alloc, o) => !!(alloc[o.ref] && state?.delivered?.[`${alloc[o.ref].vehicle}:${o.outlet}`]);

/* A truck broke down (cooling, engine, tyre): plan again without it. Every other truck keeps its orders; the engine
   finds room for the broken truck's orders that are not delivered yet, or defers them with a reason. */
async function replanWithout(dayId, state, vid) {
  const d = await loadDay(dayId);
  const vehicles = availableVehicles(d, state).filter((v) => v.id !== vid);
  const current = effectiveAlloc(state);
  const orders = ordersWithRules(d, state);
  const all = orders.filter((o) => !isDone(state, current, o));
  // The broken truck's stops already delivered stay in the plan as they were.
  const done = Object.fromEntries(orders.filter((o) => isDone(state, current, o)).map((o) => [o.ref, current[o.ref]]));
  const locked = Object.fromEntries(all.filter((o) => current[o.ref] && current[o.ref].vehicle !== vid).map((o) => [o.ref, current[o.ref]]));
  const fuelLeft = fuelFor(d, state);
  const t0 = Date.now();
  const result = d.planner.plan({ orders: all, vehicles, fuelLeft, locked }, { tries: 150 });
  const check = d.planner.check({ orders: all, vehicles, alloc: result.alloc, fuelLeft });
  const moved = all.filter((o) => current[o.ref]?.vehicle === vid).map((o) => ({ ref: o.ref, outlet: o.outlet, chilled: o.chilled, m3: o.m3, to: result.alloc[o.ref] || null, reason: result.reasons?.[o.ref]?.reason || null }));
  return { ...result, alloc: { ...result.alloc, ...done }, check, moved, without: vid, ms: Date.now() - t0, vehicles: vehicles.length };
}

export async function checkAlloc(dayId, state, alloc = effectiveAlloc(state)) {
  const d = await loadDay(dayId);
  const orders = ordersWithRules(d, state).filter((o) => !isDone(state, alloc, o));
  return d.planner.check({ orders, vehicles: availableVehicles(d, state), alloc, fuelLeft: fuelFor(d, state) });
}

/* Keep a record of every plan the engine produced (plans + plan_items). */
export async function savePlan(dayId, source, by, result, runDate = null) {
  return tx(async (c) => {
    const { rows } = await c.query("INSERT INTO plans (day_id, source, created_by, summary, run_date) VALUES ($1, $2, $3, $4, $5) RETURNING id", [dayId, source, by, JSON.stringify(result.summary), runDate]);
    const id = rows[0].id;
    const items = Object.entries(result.alloc);
    for (let i = 0; i < items.length; i += 500) {
      const part = items.slice(i, i + 500); const params = [];
      const values = part.map(([ref, a]) => { params.push(id, ref, a ? "served" : "deferred", a?.vehicle || null, a?.trip || null, a ? null : result.reasons?.[ref]?.reason || null); const b = params.length - 5; return `($${b},$${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`; }).join(",");
      await c.query(`INSERT INTO plan_items (plan_id, order_ref, decision, vehicle_id, trip_id, reason) VALUES ${values}`, params);
    }
    return id;
  });
}
