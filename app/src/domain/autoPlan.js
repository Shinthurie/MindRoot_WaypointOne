/* Auto-plan: runs the planning engine on the server when there is one, otherwise in the browser on the same data. */
import data from "../data/s1.json";
import { createPlanner } from "./planner";
import { api, session, SERVER_MODE } from "../sync";

let planner = null;
export async function autoPlan({ fleetEdits = {}, storeEdits = {} } = {}) {
  if (SERVER_MODE) {
    const s = session.get();
    return api.autoPlan(s?.token);
  }
  planner ??= createPlanner({ districts: data.districts, allowance: data.allowance });
  const fleet = Object.fromEntries(data.fleetAll.map((v) => [v.id, v]));
  const vehicles = data.vehicles
    .filter((v) => (fleetEdits[v.id]?.status || v.status) !== "in_workshop")
    .map((v) => ({ ...v, depot: fleet[v.id]?.depot || "Peliyagoda" }));
  const fuelLeft = Object.fromEntries(vehicles.map((v) => [v.id, fleet[v.id] ? Math.max(0, fleet[v.id].quotaL - (fleet[v.id].weekSoFarL ?? 0)) : null]));
  const orders = data.orders.map((o) => ({ ...o, depot: o.depot || "Peliyagoda", ...(storeEdits[o.outlet] || {}) }));
  const t0 = performance.now();
  // Let the spinner paint before the search runs.
  await new Promise((r) => setTimeout(r, 50));
  const result = planner.plan({ orders, vehicles, fuelLeft }, { tries: 150 });
  const check = planner.check({ orders, vehicles, alloc: result.alloc, fuelLeft });
  return { ...result, check, ms: Math.round(performance.now() - t0), vehicles: vehicles.length };
}
