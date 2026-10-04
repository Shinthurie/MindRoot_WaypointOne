/* Waypoint One planning engine: assigns orders to vehicles and trips for one depot day.

   Hard rules (booklet p.20, the same ones the organisers' check_allocation.py enforces):
     - one brand and one district per trip, own depot only
     - chilled orders only on refrigerated vehicles, van-only outlets only get vans
     - trip volume and weight within the vehicle's capacity
     - at most 2 trips per vehicle; Fresh trips share the 270-minute pre-dawn window, Style/Tech the 480-minute day
     - orders are never split
   Our own rules on top:
     - every stop is reached inside its delivery window (and mall window), using the booklet trip-time standard
     - the day's fuel stays within what is left of the vehicle's weekly quota
     - fairness first: shops deferred yesterday are served before anyone else, then the most chilled volume

   Pure and data-driven: the server runs it on the seeded database, the browser can run it on cached data. */

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
export const TRIP_BUDGET = { Fresh: 270, other: 480 };
export const WINDOW_START = { Fresh: "03:30", other: "09:00" };
const EPS = 1e-6;

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

export function createPlanner({ districts, allowance }) {
  const allow = (o) => allowance[`${o.brand}|${o.dock}`] ?? 15;
  const tripMinutes = (list) => {
    if (!list.length) return 0;
    const d = districts[list[0].district];
    return d.outMin + (list.length - 1) * d.stopMin + list.reduce((s, o) => s + allow(o), 0);
  };
  const tripKm = (list) => { const d = districts[list[0].district]; return 2 * d.outKm + (list.length - 1) * d.stopKm; };
  const closeOf = (o) => { if (!o.mall) return o.close; const end = o.mall.split("-")[1]; return toMin(end) < toMin(o.close) ? end : o.close; };
  const openOf = (o) => { if (!o.mall) return o.open; const st = o.mall.split("-")[0]; return toMin(st) > toMin(o.open) ? st : o.open; };

  // One stop per outlet; a stop's service time is the sum of its orders' allowances.
  const stopsOf = (list) => {
    const m = new Map();
    list.forEach((o) => { if (!m.has(o.outlet)) m.set(o.outlet, []); m.get(o.outlet).push(o); });
    return [...m.values()].map((os) => ({ outlet: os[0].outlet, open: toMin(openOf(os[0])), close: toMin(closeOf(os[0])), service: os.reduce((s, o) => s + allow(o), 0) }));
  };
  // Drive the stops from `start`; returns lateness and when the next trip may start (booklet budget or real waiting).
  const simulate = (seq, start, district) => {
    const d = districts[district];
    let t = start, late = 0;
    for (let i = 0; i < seq.length; i++) {
      const arrive = Math.max(t + (i === 0 ? d.outMin : d.stopMin), seq[i].open);
      late += Math.max(0, arrive - seq[i].close);
      t = arrive + seq[i].service;
    }
    const budgetEnd = start + d.outMin + (seq.length - 1) * d.stopMin + seq.reduce((a, s) => a + s.service, 0);
    return { late, end: Math.max(t, budgetEnd) };
  };
  const bestRun = (list, start) => {
    const stops = stopsOf(list);
    const pool = stops.length <= 6 ? permutations(stops) : [[...stops].sort((a, b) => a.close - b.close)];
    let best = null;
    for (const seq of pool) { const r = simulate(seq, start, list[0].district); if (!best || r.late < best.late || (r.late === best.late && r.end < best.end)) best = { ...r, seq }; }
    return best;
  };
  // A vehicle's trips are feasible when each window's total minutes fit and no stop is late in either run order.
  const laneOk = (trips, v, fuelLeft) => {
    const km = trips.reduce((s, t) => s + tripKm(t.orders), 0);
    if (fuelLeft != null && km / v.kmPerL > fuelLeft + EPS) return false;
    for (const fresh of [true, false]) {
      const group = trips.filter((t) => (t.brand === "Fresh") === fresh);
      if (!group.length) continue;
      if (group.reduce((s, t) => s + tripMinutes(t.orders), 0) > (fresh ? TRIP_BUDGET.Fresh : TRIP_BUDGET.other) + EPS) return false;
      const orders = group.length === 2 ? [group, [group[1], group[0]]] : [group];
      const ok = orders.some((ord) => {
        let t = toMin(fresh ? WINDOW_START.Fresh : WINDOW_START.other);
        for (const trip of ord) { const r = bestRun(trip.orders, t); if (r.late > 0) return false; t = r.end; }
        return true;
      });
      if (!ok) return false;
    }
    return true;
  };
  const fits = (trip, o, v) => trip.brand === o.brand && trip.district === o.district
    && (!o.chilled || v.reefer) && (o.parking !== "van_only" || v.type === "van")
    && trip.m3 + o.m3 <= v.m3 + EPS && trip.kg + o.kg <= v.kg + EPS;
  const compatible = (o, v) => v.depot === o.depot && (!o.chilled || v.reefer) && (o.parking !== "van_only" || v.type === "van") && o.m3 <= v.m3 + EPS && o.kg <= v.kg + EPS;

  /* orders: [{ ref, outlet, brand, district, depot, dock, parking, mall, open, close, chilled, kg, m3, deferredYesterday, daysSince }]
     vehicles: available vehicles [{ id, type, reefer, depot, m3, kg, kmPerL }]; fuelLeft: { VEH001: litres left this week } */
  function planOnce({ orders, vehicles, fuelLeft = {}, locked = {}, rand = null }) {
    const V = Object.fromEntries(vehicles.map((v) => [v.id, v]));
    const lanes = Object.fromEntries(vehicles.map((v) => [v.id, []])); // vid -> trips [{ no, brand, district, orders, m3, kg }]
    const alloc = {};
    const addTo = (trip, o) => { trip.orders.push(o); trip.m3 += o.m3; trip.kg += o.kg; alloc[o.ref] = { vehicle: trip.vid, trip: trip.no }; };
    const removeFrom = (trip, o) => { trip.orders = trip.orders.filter((x) => x !== o); trip.m3 -= o.m3; trip.kg -= o.kg; delete alloc[o.ref]; };
    const tryInsert = (trip, o) => { if (!fits(trip, o, V[trip.vid])) return false; addTo(trip, o); if (laneOk(lanes[trip.vid], V[trip.vid], fuelLeft[trip.vid])) return true; removeFrom(trip, o); return false; };
    const tryOpen = (v, o) => {
      const used = lanes[v.id].map((t) => t.no);
      if (used.length >= 2) return null;
      const trip = { vid: v.id, no: used.includes(1) ? 2 : 1, brand: o.brand, district: o.district, orders: [], m3: 0, kg: 0 };
      lanes[v.id].push(trip);
      if (tryInsert(trip, o)) return trip;
      lanes[v.id] = lanes[v.id].filter((t) => t !== trip);
      return null;
    };
    const allTrips = () => Object.values(lanes).flat();

    // Fairness first, then scarce cold space, then bigger orders (a volume plan within the fairness guard).
    const jitter = {}; orders.forEach((o) => { jitter[o.ref] = rand ? rand() : 0; }); vehicles.forEach((v) => { jitter[v.id] = rand ? rand() : 0; });
    const prio = (o) => [o.deferredYesterday ? 0 : 1, o.chilled ? 0 : 1, rand ? jitter[o.ref] : -(o.daysSince || 0), -o.m3];
    const cmp = (a, b) => { const x = prio(a), y = prio(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.ref.localeCompare(b.ref); };
    const queue = [...orders].sort(cmp);
    // Demand still waiting per brand/district/temperature, to pick a vehicle that fits the whole group.
    const groupKey = (o) => `${o.depot}|${o.brand}|${o.district}|${o.chilled ? "C" : "A"}|${o.parking === "van_only" ? "V" : "-"}`;
    const waiting = {};
    queue.forEach((o) => { waiting[groupKey(o)] = (waiting[groupKey(o)] || 0) + o.m3; });

    const place = (o) => {
      // 1) best fit into an open trip
      const open = allTrips().filter((t) => fits(t, o, V[t.vid])).sort((a, b) => (V[a.vid].m3 - a.m3) - (V[b.vid].m3 - b.m3));
      for (const t of open) if (tryInsert(t, o)) return true;
      // 2) a new trip: keep reefers for chilled goods, and pick the smallest vehicle that holds the waiting group
      const need = Math.max(o.m3, waiting[groupKey(o)] || 0);
      const cands = vehicles.filter((v) => compatible(o, v)).sort((a, b) => {
        if (!o.chilled && a.reefer !== b.reefer) return a.reefer ? 1 : -1;
        const fa = a.m3 >= need, fb = b.m3 >= need;
        if (fa !== fb) return fa ? -1 : 1;
        if (rand && Math.abs(a.m3 - b.m3) < 3) return jitter[a.id] - jitter[b.id];
        return fa ? a.m3 - b.m3 : b.m3 - a.m3;
      });
      for (const v of cands) if (tryOpen(v, o)) return true;
      return false;
    };

    // Dispatcher decisions the engine must keep (manual moves, cancelled vehicles are simply not in `vehicles`).
    for (const [ref, to] of Object.entries(locked)) {
      const o = orders.find((x) => x.ref === ref);
      if (!o || !to || !V[to.vehicle]) continue;
      let t = lanes[to.vehicle].find((x) => x.no === to.trip);
      if (!t) { t = { vid: to.vehicle, no: to.trip, brand: o.brand, district: o.district, orders: [], m3: 0, kg: 0 }; lanes[to.vehicle].push(t); }
      addTo(t, o);
    }
    for (const o of queue) {
      if (alloc[o.ref] || o.ref in locked) { waiting[groupKey(o)] -= o.m3; continue; }
      place(o);
      waiting[groupKey(o)] -= o.m3;
    }

    // Improvement: a deferred order may take the place of smaller, non-protected orders on a compatible trip.
    let improved = true, rounds = 0;
    while (improved && rounds++ < 4) {
      improved = false;
      const deferred = queue.filter((o) => !alloc[o.ref] && !(o.ref in locked)).sort(cmp);
      for (const o of deferred) {
        if (alloc[o.ref]) continue;
        if (place(o)) { improved = true; continue; }
        const trips = allTrips().filter((t) => t.brand === o.brand && t.district === o.district && compatible(o, V[t.vid]));
        let done = false;
        for (const t of trips) {
          const victims = t.orders.filter((x) => !x.deferredYesterday && !(x.ref in locked) && x.m3 < o.m3).sort((a, b) => a.m3 - b.m3);
          for (const x of victims) {
            removeFrom(t, x);
            if (tryInsert(t, o)) {
              if (!place(x)) { /* x now waits instead: still more volume served */ }
              done = improved = true; break;
            }
            addTo(t, x);
          }
          if (done) break;
        }
      }
    }

    const maxM3 = Math.max(...vehicles.map((v) => v.m3), 0);
    const reeferLeft = vehicles.some((v) => v.reefer && lanes[v.id].length < 2);
    const result = {}; const reasons = {};
    for (const o of orders) {
      result[o.ref] = alloc[o.ref] || null;
      if (!alloc[o.ref]) {
        reasons[o.ref] = o.m3 > maxM3 ? { reason: "Bigger than any truck", kind: "Unavoidable" }
          : o.chilled && !reeferLeft ? { reason: "No reefer trip left", kind: "Capacity" }
          : o.chilled ? { reason: "No reefer space left", kind: "Capacity" }
          : { reason: "No capacity left", kind: "Capacity" };
      }
    }
    const served = orders.filter((o) => alloc[o.ref]);
    return {
      alloc: result, reasons,
      summary: {
        orders: orders.length, served: served.length, deferred: orders.length - served.length,
        servedM3: +served.reduce((s, o) => s + o.m3, 0).toFixed(1),
        deferredChilledM3: +orders.filter((o) => o.chilled && !alloc[o.ref]).reduce((s, o) => s + o.m3, 0).toFixed(1),
        protectedServed: orders.filter((o) => o.deferredYesterday && alloc[o.ref]).length,
        protectedTotal: orders.filter((o) => o.deferredYesterday).length,
        trips: allTrips().filter((t) => t.orders.length).length,
      },
    };
  }

  /* Fairness guard first (every shop deferred yesterday served), then chilled volume served, then all volume,
     then fewer trips. The search is deterministic: the same inputs always give the same plan. */
  const score = (s) => [s.protectedServed, -s.deferredChilledM3, s.servedM3, s.served, -s.trips];
  const better = (a, b) => { const x = score(a.summary), y = score(b.summary); for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 1e-9) return x[i] > y[i]; return false; };
  function plan(input, { tries = 300, seed = 20260108 } = {}) {
    let best = planOnce(input);
    let s = seed >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < tries; i++) { const r = planOnce({ ...input, rand }); if (better(r, best)) best = r; }
    return best;
  }

  /* Rule check for any allocation (the engine's own output, or the dispatcher's edited plan). */
  function check({ orders, vehicles, alloc, fuelLeft = {} }) {
    const V = Object.fromEntries(vehicles.map((v) => [v.id, v]));
    const errors = [];
    const trips = {};
    for (const o of orders) {
      const a = alloc[o.ref];
      if (!a) continue;
      if (!V[a.vehicle]) { errors.push(`${o.ref}: vehicle ${a.vehicle} is not available`); continue; }
      if (![1, 2].includes(a.trip)) errors.push(`${o.ref}: trip must be 1 or 2`);
      ((trips[a.vehicle] ??= {})[a.trip] ??= []).push(o);
    }
    for (const [vid, ts] of Object.entries(trips)) {
      const v = V[vid];
      const list = Object.entries(ts).map(([no, os]) => ({ no: +no, brand: os[0].brand, district: os[0].district, orders: os }));
      for (const t of list) {
        const tag = `${vid} trip ${t.no}`;
        if (new Set(t.orders.map((o) => o.brand)).size > 1) errors.push(`${tag} mixes brands`);
        if (new Set(t.orders.map((o) => o.district)).size > 1) errors.push(`${tag} mixes districts`);
        if (t.orders.some((o) => o.depot !== v.depot)) errors.push(`${tag} carries another depot's orders`);
        if (t.orders.some((o) => o.chilled) && !v.reefer) errors.push(`${tag} carries chilled goods without a reefer`);
        if (t.orders.some((o) => o.parking === "van_only") && v.type !== "van") errors.push(`${tag} sends a ${v.type} to a van-only outlet`);
        const m3 = t.orders.reduce((s, o) => s + o.m3, 0), kg = t.orders.reduce((s, o) => s + o.kg, 0);
        if (m3 > v.m3 + EPS) errors.push(`${tag} volume ${m3.toFixed(1)} m³ over ${v.m3} m³`);
        if (kg > v.kg + EPS) errors.push(`${tag} weight ${Math.round(kg)} kg over ${v.kg} kg`);
      }
      const fresh = list.filter((t) => t.brand === "Fresh").reduce((s, t) => s + tripMinutes(t.orders), 0);
      const day = list.filter((t) => t.brand !== "Fresh").reduce((s, t) => s + tripMinutes(t.orders), 0);
      if (fresh > TRIP_BUDGET.Fresh + EPS) errors.push(`${vid} Fresh trips take ${Math.round(fresh)} min (window ${TRIP_BUDGET.Fresh})`);
      if (day > TRIP_BUDGET.other + EPS) errors.push(`${vid} daytime trips take ${Math.round(day)} min (window ${TRIP_BUDGET.other})`);
      if (!laneOk(list, v, fuelLeft[vid])) errors.push(`${vid}: a stop would be late, or the day's fuel is over the weekly quota left`);
    }
    return { ok: errors.length === 0, errors };
  }

  return { plan, check, tripMinutes, fmt };
}
