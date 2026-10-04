/* Which delivery run the system is working on, and that run's orders.

   The run follows the clock (booklet: orders for a run close at 4 PM the day before):
     - before 4 PM: today's run, or the next operating day if today is closed (Sundays, holidays);
     - from 4 PM:   the next run (the dispatcher plans it this evening).
   S1 (Thu 8 Jan 2026) is the seeded peak day with its 85 orders from the dataset. Every other run's orders are the
   orders stores placed in the app for it, plus the orders the previous run could not serve (they go first:
   the fairness rule). */
import data from "../data/s1.json";
import { outletsAll } from "../data/accounts";
import { nextOperatingDay, CUTOFF } from "../runs.js";

export const S1_RUN = data.s1Date;
const CLOSED = new Set(data.closedDays || []);
export const isOperating = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0 && !CLOSED.has(iso);
};
export const runDateAt = (now) => (now.time < CUTOFF ? (isOperating(now.date) ? now.date : nextOperatingDay(now.date)) : nextOperatingDay(now.date));

/* Volume per case and weight per m³ by brand and temperature, from the dataset's S1 orders. */
const PER = data.orders.reduce((acc, o) => {
  const k = `${o.brand}|${o.chilled ? "cold" : "dry"}`;
  const x = (acc[k] ||= { m3: 0, kg: 0, units: 0 });
  x.m3 += o.m3; x.kg += o.kg; x.units += o.units;
  return acc;
}, {});
const per = (brand, cold) => PER[`${brand}|${cold ? "cold" : "dry"}`] || PER[`Fresh|${cold ? "cold" : "dry"}`];
const OUTLET = Object.fromEntries(outletsAll.map((o) => [o.id, o]));
const r2 = (x) => Math.round(x * 1000) / 1000;

/* A store's order (dry and chilled cases) becomes one or two plannable orders. */
export function ordersFromStore(so) {
  const o = OUTLET[so.outlet];
  if (!o) return [];
  return [["dry", so.dry, false], ["cold", so.cold, true]].filter(([, cases]) => cases > 0).map(([k, cases, chilled]) => {
    const p = per(o.brand, chilled);
    const m3 = (p.m3 / p.units) * cases;
    return {
      ref: `${so.ref}-${k === "cold" ? "C" : "D"}`, storeRef: so.ref, outlet: so.outlet, brand: o.brand, district: o.district, depot: o.depot,
      dock: o.dock, parking: o.parking, mall: null, open: o.open, close: o.close, chilled, units: cases,
      m3: r2(m3), kg: Math.round((p.kg / p.m3) * m3 * 10) / 10, deferredYesterday: !!so.firstInLine, daysSince: so.firstInLine ? 2 : 1,
      placedDay: so.day, placedAt: so.at, placedBy: so.by, replaces: so.replaces || null,
    };
  });
}

/* The orders of a run (S1 uses the dataset: null). */
export function buildRunOrders(storeOrders, run, carried = []) {
  if (run === S1_RUN) return null;
  const fromStores = (storeOrders || []).filter((so) => so.run === run && !so.cancelled).flatMap(ordersFromStore);
  return [...carried, ...fromStores];
}
