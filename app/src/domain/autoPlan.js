/* Auto-plan: runs the planning engine on the server when there is one, otherwise in the browser on the same data. */
import data from "../data/s1.json";
import { createPlanner } from "./planner";
import { api, session, SERVER_MODE } from "../sync";
import { orders as runOrders, IS_S1 } from "../data/model";

let planner = null;
export async function autoPlan({ fleetEdits = {}, storeEdits = {} } = {}) {
  if (SERVER_MODE) {
    const s = session.get();
    return api.autoPlan(s?.token);
  }
  planner ??= createPlanner({ districts: data.districts, allowance: data.allowance });
  const fleet = Object.fromEntries(data.fleetAll.map((v) => [v.id, v]));
  // S1: the dataset's workshop list and fuel history. A real run: every vehicle ready unless sent to the workshop.
  const vehicles = data.vehicles
    .filter((v) => (fleetEdits[v.id]?.status || (IS_S1 ? v.status : "available")) !== "in_workshop")
    .map((v) => ({ ...v, depot: fleet[v.id]?.depot || "Peliyagoda" }));
  const fuelLeft = Object.fromEntries(vehicles.map((v) => [v.id, fleet[v.id] ? Math.max(0, fleet[v.id].quotaL - (IS_S1 ? fleet[v.id].weekSoFarL ?? 0 : 0)) : null]));
  const orders = (IS_S1 ? data.orders : runOrders).map((o) => ({ ...o, depot: o.depot || "Peliyagoda", ...(storeEdits[o.outlet] || {}) }));
  const t0 = performance.now();
  // Let the spinner paint before the search runs.
  await new Promise((r) => setTimeout(r, 50));
  const result = planner.plan({ orders, vehicles, fuelLeft }, { tries: 150 });
  const check = planner.check({ orders, vehicles, alloc: result.alloc, fuelLeft });
  return { ...result, check, ms: Math.round(performance.now() - t0), vehicles: vehicles.length };
}
