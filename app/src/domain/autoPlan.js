/* Auto-plan: runs the planning engine on the server when there is one, otherwise in the browser on the same data. */
import data from "../data/s1.json";
import { createPlanner } from "./planner";
import { api, session, SERVER_MODE } from "../sync";
import { orders as runOrders, IS_S1, FAIR_ALLOC } from "../data/model";

let planner = null;
/* without: a truck that broke down. The engine plans again without it: every other truck keeps its orders, delivered
   stops stay done, and the broken truck's other orders go to trucks with room (or are deferred with a reason). */
export async function autoPlan({ fleetEdits = {}, storeEdits = {}, without = null, planAlloc = null, planEdits = [], delivered = {} } = {}) {
  if (SERVER_MODE) {
    const s = session.get();
    return api.autoPlan(s?.token, without ? { without } : {});
  }
  planner ??= createPlanner({ districts: data.districts, allowance: data.allowance });
  const fleet = Object.fromEntries(data.fleetAll.map((v) => [v.id, v]));
  // S1: the dataset's workshop list and fuel history. A real run: every vehicle ready unless sent to the workshop.
  const vehicles = data.vehicles
    .filter((v) => (fleetEdits[v.id]?.status || (IS_S1 ? v.status : "available")) !== "in_workshop" && v.id !== without)
    .map((v) => ({ ...v, depot: fleet[v.id]?.depot || "Peliyagoda" }));
  const fuelLeft = Object.fromEntries(vehicles.map((v) => [v.id, fleet[v.id] ? Math.max(0, fleet[v.id].quotaL - (IS_S1 ? fleet[v.id].weekSoFarL ?? 0 : 0)) : null]));
  const orders = (IS_S1 ? data.orders : runOrders).map((o) => ({ ...o, depot: o.depot || "Peliyagoda", ...(storeEdits[o.outlet] || {}) }));
  const t0 = performance.now();
  // Let the spinner paint before the search runs.
  await new Promise((r) => setTimeout(r, 50));
  if (without) {
    const current = { ...(planAlloc || (IS_S1 ? FAIR_ALLOC : {})) };
    for (const e of planEdits) current[e.ref] = e.to;
    const isDone = (o) => !!(current[o.ref] && delivered[`${current[o.ref].vehicle}:${o.outlet}`]);
    const all = orders.filter((o) => !isDone(o));
    const done = Object.fromEntries(orders.filter(isDone).map((o) => [o.ref, current[o.ref]]));
    const locked = Object.fromEntries(all.filter((o) => current[o.ref] && current[o.ref].vehicle !== without).map((o) => [o.ref, current[o.ref]]));
    const result = planner.plan({ orders: all, vehicles, fuelLeft, locked }, { tries: 150 });
    const check = planner.check({ orders: all, vehicles, alloc: result.alloc, fuelLeft });
    const moved = all.filter((o) => current[o.ref]?.vehicle === without).map((o) => ({ ref: o.ref, outlet: o.outlet, chilled: o.chilled, m3: o.m3, to: result.alloc[o.ref] || null, reason: result.reasons?.[o.ref]?.reason || null }));
    return { ...result, alloc: { ...result.alloc, ...done }, check, moved, without, ms: Math.round(performance.now() - t0), vehicles: vehicles.length };
  }
  const result = planner.plan({ orders, vehicles, fuelLeft }, { tries: 150 });
  const check = planner.check({ orders, vehicles, alloc: result.alloc, fuelLeft });
  return { ...result, check, ms: Math.round(performance.now() - t0), vehicles: vehicles.length };
}
