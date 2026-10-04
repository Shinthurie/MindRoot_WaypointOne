// Derived views over the S1 peak-day data. Every number shown in the app comes from here.
import data from "./s1.json";

// The run's orders: S1's from the dataset, or a real run's orders (stores' orders + carried), set by applyPlanEdits.
export let orders = data.orders;
export let byRef = Object.fromEntries(orders.map((o) => [o.ref, o]));
export let RUN_DATE = data.s1Date; // the run on screen
export let IS_S1 = true;
export const vehicles = Object.fromEntries(data.vehicles.map((v) => [v.id, v]));
export const districts = data.districts;
export const outlook = data.outlook;
export const MAX_TRUCK_M3 = Math.max(...data.vehicles.map((v) => v.m3));
export const NOW = "05:30"; // the moment the live board shows
export const REEFER_TRIPS = { possible: 4 * 2, needed: 10 }; // 4 available Peliyagoda reefers x 2 trips; 10 from our S1 analysis
export const FRESH_START = "03:30"; // Fresh window 3:30–8:00 (booklet)
export const DAY_START = "09:00"; // Style and Tech trading day

export const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
export const round1 = (x) => Math.round(x * 10) / 10;
export const n = (x) => x.toLocaleString("en-US");

const allowanceFor = (o) => data.allowance[`${o.brand}|${o.dock}`];

/* Store rules edited by admin (window, dock, access, mall window) override the order data. */
let ORIGINAL = Object.fromEntries(orders.map((o) => [o.ref, { open: o.open, close: o.close, dock: o.dock, parking: o.parking, mall: o.mall }]));
export function applyStoreRules(edits = {}) {
  orders.forEach((o) => {
    Object.assign(o, ORIGINAL[o.ref], edits[o.outlet] || {});
    if (edits[o.outlet] && !edits[o.outlet].mall) o.mall = null;
  });
}

// Booklet trip-time formula: outbound + (orders - 1) x inter-stop + sum of service allowances.
export function tripMinutes(list) {
  if (!list.length) return 0;
  const d = districts[list[0].district];
  return d.outMin + (list.length - 1) * d.stopMin + list.reduce((s, o) => s + allowanceFor(o), 0);
}

/* Fuel this week: starts at 0 every Monday. Earlier days this week use the vehicle's recorded daily average
   (its latest recorded week ÷ 6 operating days) until real trip records exist; today adds each run's fuel as it finishes. */
const fuelWeek = Object.fromEntries((data.fleetAll || []).map((v) => [v.id, v]));
/* The S1 dispatch day: Thu 8 Jan 2026 (Thai Pongal on 15 Jan is a week away, not a payday, no monsoon). */
export const S1_DATE = data.s1Date;
/* One record per truck and shop: a Fresh shop can get dry goods and chilled goods on two different trucks. */
export const stopKey = (vid, outlet) => `${vid}:${outlet}`;
/* Cases an order really carries after a shortfall at the depot (Short at the Dock, sent short). */
export const unitsOf = (o, adjusted = {}) => adjusted[o.ref]?.units ?? o.units;
export const stopUnits = (s, adjusted = {}) => s.orders.reduce((a, o) => a + unitsOf(o, adjusted), 0);
let fuelDate = S1_DATE; // the clock's date, set with the plan
const daysBefore = (iso) => { const [y, m, d] = iso.split("-").map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 ? 6 : w - 1; };
export const fuelBeforeToday = (vid) => {
  const f = fuelWeek[vid];
  if (!f) return null;
  // On the S1 day we know the real use from Monday to yesterday (route records); other days use last week's daily average.
  return fuelDate === S1_DATE && f.weekSoFarL != null ? f.weekSoFarL : (f.usedL / 6) * daysBefore(fuelDate);
};
export const fuelLeftEstimate = (vid) => {
  const f = fuelWeek[vid];
  return f ? Math.max(0, f.quotaL - fuelBeforeToday(vid)) : null;
};

/* One stop per outlet on a trip. */
function groupStops(list) {
  const byOutlet = new Map();
  for (const o of list) {
    if (!byOutlet.has(o.outlet)) byOutlet.set(o.outlet, []);
    byOutlet.get(o.outlet).push(o);
  }
  return [...byOutlet.entries()].map(([outlet, os]) => ({
    outlet, orders: os, units: os.reduce((a, o) => a + o.units, 0), m3: os.reduce((a, o) => a + o.m3, 0),
    chilled: os.some((o) => o.chilled), protected: os.some((o) => o.deferredYesterday),
    open: os[0].open, close: mallClose(os[0]), dock: os[0].dock, district: os[0].district,
    service: os.reduce((a, o) => a + allowanceFor(o), 0),
  }));
}
// Mall stores must be reached inside the mall window as well as their own window.
function mallClose(o) {
  if (!o.mall) return o.close;
  const end = o.mall.split("-")[1];
  return toMin(end) < toMin(o.close) ? end : o.close;
}
function mallOpen(s) {
  const m = s.orders[0].mall;
  if (!m) return s.open;
  const start = m.split("-")[0];
  return toMin(start) > toMin(s.open) ? start : s.open;
}

/* Drive a sequence of stops from a start time. A truck that arrives early waits for the window to open. */
function simulate(seq, start, district) {
  const d = districts[district];
  let t = start;
  let late = 0, lateMin = 0;
  const times = seq.map((s, i) => {
    const arrive = Math.max(t + (i === 0 ? d.outMin : d.stopMin), toMin(mallOpen(s)));
    const over = arrive - toMin(s.close);
    if (over > 0) { late++; lateMin += over; }
    t = arrive + s.service;
    return { eta: fmt(arrive), leave: fmt(t), lateBy: Math.max(0, over), slack: -over };
  });
  // Booklet standard: the next trip can start after this trip's budgeted minutes (return is already allowed for),
  // but waiting at a closed shop is real time, so the clock end is whichever is later.
  const budgetEnd = start + d.outMin + (seq.length - 1) * d.stopMin + seq.reduce((a, s) => a + s.service, 0);
  return { times, late, lateMin, end: Math.max(t, budgetEnd) };
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

/* Best stop order for a trip: fewest late stops, then fewest late minutes, then earliest finish. */
function bestSequence(stops, start, district, fixed) {
  if (fixed) {
    const seq = fixed.map((o) => stops.find((s) => s.outlet === o)).filter(Boolean);
    stops.forEach((s) => { if (!seq.includes(s)) seq.push(s); });
    return { seq, ...simulate(seq, start, district), fixed: true };
  }
  const pool = stops.length <= 7 ? permutations(stops) : [[...stops].sort((a, b) => toMin(a.close) - toMin(b.close))];
  let best = null;
  for (const seq of pool) {
    const r = simulate(seq, start, district);
    if (!best || r.late < best.late || (r.late === best.late && (r.lateMin < best.lateMin || (r.lateMin === best.lateMin && r.end < best.end)))) best = { seq, ...r };
  }
  return best;
}

/* Clock plan for one truck: Fresh trips from 03:30, Style/Tech from 09:00; tries both trip orders. */
function scheduleLane(tripList, { freshStart = FRESH_START, stopOrders = {}, vid } = {}) {
  const result = {};
  let runNo = 0;
  for (const fresh of [true, false]) {
    const group = tripList.filter((t) => t && (t.brand === "Fresh") === fresh);
    if (!group.length) continue;
    const orderings = group.length === 2 ? [group, [group[1], group[0]]] : [group];
    let best = null;
    for (const ord of orderings) {
      let t = toMin(fresh ? freshStart : DAY_START);
      let late = 0, lateMin = 0;
      const legs = ord.map((trip) => {
        const r = bestSequence(trip.stops, t, trip.district, stopOrders[`${vid}:${trip.no}`]);
        const leg = { trip, start: t, ...r };
        late += r.late; lateMin += r.lateMin; t = r.end;
        return leg;
      });
      if (!best || late < best.late || (late === best.late && lateMin < best.lateMin)) best = { legs, late, lateMin };
    }
    best.legs.forEach((leg) => {
      runNo++;
      result[leg.trip.no] = { run: runNo, start: fmt(leg.start), end: fmt(leg.end), seq: leg.seq, times: leg.times, fixed: !!leg.fixed };
    });
  }
  return result;
}

/* Build a plan from the optimiser's allocation plus the dispatcher's edits (manual moves, overrides).
   edits: [{ ref, to: { vehicle, trip } | null }]; the last edit for an order wins.
   stopOrders: { "VEH003:1": ["OUT034", "OUT032"] } for stop sequences the dispatcher fixed by hand.
   Orders are never split (booklet rule 5): each served order is on exactly one vehicle and trip. */
/* The team's optimiser plan for S1 (the seeded, published plan). The engine on the server can replace it (planSet). */
export const FAIR_ALLOC = data.plans.fair;
export function buildPlan(key = "fair", edits = [], stopOrders = {}, base = null) {
  const alloc = { ...(base || data.plans[key]) };
  edits.forEach((e) => { alloc[e.ref] = e.to; });
  const trips = {};
  const deferred = [];
  for (const o of orders) {
    const a = alloc[o.ref];
    if (!a) { deferred.push(o); continue; }
    trips[a.vehicle] ??= {};
    (trips[a.vehicle][a.trip] ??= []).push(o);
  }
  const lanes = Object.entries(trips).map(([vid, ts]) => {
    const v = vehicles[vid];
    const tripList = [1, 2].map((no) => {
      const list = ts[no] || [];
      if (!list.length) return null;
      const d = districts[list[0].district];
      return {
        no, brand: list[0].brand, district: list[0].district, orders: list,
        m3: list.reduce((s, o) => s + o.m3, 0), kg: list.reduce((s, o) => s + o.kg, 0),
        minutes: tripMinutes(list), km: 2 * d.outKm + (list.length - 1) * d.stopKm, fuelL: (2 * d.outKm + (list.length - 1) * d.stopKm) / v.kmPerL,
        chilled: list.some((o) => o.chilled), stops: groupStops(list),
      };
    });
    // After a breakdown the rescue truck is re-loaded, so it leaves later.
    const freshStart = key === "veh003Down" && vid === "VEH006" ? "04:00" : FRESH_START;
    const sched = scheduleLane(tripList, { freshStart, stopOrders, vid });
    tripList.forEach((t) => {
      if (!t) return;
      const s = sched[t.no];
      t.run = s.run; t.start = s.start; t.end = s.end; t.fixedOrder = s.fixed;
      t.stops = s.seq.map((stop, i) => ({ ...stop, n: i + 1, ...s.times[i] }));
      t.late = t.stops.filter((x) => x.lateBy > 0);
    });
    const fresh = tripList.filter((t) => t && t.brand === "Fresh").reduce((s, t) => s + t.minutes, 0);
    const day = tripList.filter((t) => t && t.brand !== "Fresh").reduce((s, t) => s + t.minutes, 0);
    const km = tripList.filter(Boolean).reduce((s, t) => s + t.km, 0);
    const fuelL = km / v.kmPerL;
    const fuelLeft = fuelLeftEstimate(vid);
    return {
      vehicle: v, trips: tripList, runs: tripList.filter(Boolean).sort((a, b) => a.run - b.run),
      freshMin: fresh, dayMin: day, fuelL, fuelLeft, fuelOver: fuelLeft != null && fuelL > fuelLeft,
      late: tripList.filter(Boolean).flatMap((t) => t.late),
    };
  });
  lanes.sort((a, b) => Number(b.vehicle.reefer) - Number(a.vehicle.reefer) || a.vehicle.id.localeCompare(b.vehicle.id));
  deferred.forEach((o) => {
    const noPlan = !IS_S1 && !Object.keys(alloc).length;
    o.reason = noPlan ? "Not planned yet" : o.m3 > MAX_TRUCK_M3 ? "Bigger than any truck" : o.chilled ? "No reefer trip left" : "No capacity left";
    o.kind = noPlan ? "Waiting" : o.m3 > MAX_TRUCK_M3 ? "Unavoidable" : "Capacity";
  });
  deferred.sort((a, b) => b.m3 - a.m3);
  return { key, lanes, deferred, served: orders.length - deferred.length, alloc, edits, stopOrders };
}

// Live binding: every screen that imports `plan` sees the dispatcher's latest edits.
export let plan = buildPlan("fair");
export let downPlan = buildPlan("veh003Down");
/* Switch the screens to a run: its orders (null = the S1 dataset). */
function setDay(run, list) {
  const next = list || data.orders;
  if (next === orders && RUN_DATE === run) return;
  orders = next; RUN_DATE = run; IS_S1 = !list;
  byRef = Object.fromEntries(orders.map((o) => [o.ref, o]));
  ORIGINAL = Object.fromEntries(orders.map((o) => [o.ref, { open: o.open, close: o.close, dock: o.dock, parking: o.parking, mall: o.mall }]));
  protectedCount = orders.filter((o) => o.deferredYesterday).length;
  chilledM3 = orders.filter((o) => o.chilled).reduce((s, o) => s + o.m3, 0);
  brandCounts = countBrands(orders);
}
export function applyPlanEdits(edits, stopOrders = {}, storeEdits = {}, date = fuelDate, base = null, day = null) {
  fuelDate = date;
  setDay(day?.run || data.s1Date, day?.orders || null);
  applyStoreRules(storeEdits);
  // A real run has no plan until the dispatcher makes one (Auto-plan); S1 starts from the team's published plan.
  plan = buildPlan("fair", edits, stopOrders, IS_S1 ? base : base || {});
  downPlan = IS_S1 ? buildPlan("veh003Down") : plan;
  return plan;
}

export const lane = (p, vid) => p.lanes.find((l) => l.vehicle.id === vid);
export const tripOf = (p, vid, no) => lane(p, vid)?.trips[no - 1];
/* A truck's trips in the order it actually runs them (1st run, 2nd run). */
export const runsOf = (p, vid) => lane(p, vid)?.runs || [];

// Reefer Down: what moves where, and what newly waits.
export function reeferDown() {
  const was = new Set(plan.deferred.map((o) => o.ref));
  const affected = orders.filter((o) => data.plans.fair[o.ref]?.vehicle === "VEH003");
  const moves = affected.map((o) => ({ order: o, to: data.plans.veh003Down[o.ref]?.vehicle ?? null }));
  const newlyDeferred = downPlan.deferred.filter((o) => !was.has(o.ref));
  return { affected, moves, newlyDeferred, served: downPlan.served, before: plan.served };
}

export let protectedCount = orders.filter((o) => o.deferredYesterday).length;
export let chilledM3 = orders.filter((o) => o.chilled).reduce((s, o) => s + o.m3, 0);
export const workshopReefers = data.vehicles.filter((v) => v.reefer && v.status === "in_workshop").map((v) => v.id);
function countBrands(list) {
  return list.reduce((acc, o) => {
    const k = o.brand === "Fresh" ? (o.chilled ? "freshChilled" : "freshDry") : o.brand.toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
export let brandCounts = countBrands(orders);
/* Fuel used this week at the clock time: earlier days + every run that has finished today.
   The live truck (VEH003) counts a run only when the driver has recorded all its stops. */
export function fuelThisWeek(vid, nowTime, delivered = {}, tracked = {}) {
  const before = fuelBeforeToday(vid);
  if (before == null) return null;
  const now = toMin(nowTime);
  const done = runsOf(plan, vid).filter((r) => (tracked[vid] ? r.stops.every((s) => delivered[stopKey(vid, s.outlet)]) : toMin(r.end) <= now));
  const today = done.reduce((s, r) => s + r.fuelL, 0);
  return { before, today, total: before + today, runs: done.length, quota: fuelWeek[vid].quotaL, lastWeek: fuelWeek[vid].usedL };
}
export const outletOrders = (outlet) => orders.filter((o) => o.outlet === outlet);
export const vehicleOf = (ref, key = "fair") => (key === "fair" ? plan.alloc : data.plans[key])[ref]?.vehicle ?? null;

/* Traffic: typical speed index by district and hour (100 = free-flowing). Used to predict delays on the road. */
const traffic = data.traffic || {};
export function speedIndex(district, hour) {
  return traffic[`${district}|${hour}`] ?? 100;
}

/* Live board at NOW (05:30): progress per truck's current run, plus a running-late prediction.
   Prediction: remaining legs are driven at the typical speed for that district and hour (traffic data),
   so a stop whose predicted arrival passes its window is flagged before it happens. */
export function liveStatus(scenario, delivered = {}, nowTime = NOW, tracked = { VEH003: true }) {
  const now = toMin(nowTime);
  return plan.lanes
    .filter((l) => l.runs[0])
    .map((l) => {
      const runs = l.runs;
      const t = runs.find((r) => toMin(r.end) > now) || runs[runs.length - 1];
      const vid = l.vehicle.id;
      const live = !!tracked[vid]; // a driver has signed in: follow their real records, not the plan's times
      const got = (s) => delivered[stopKey(vid, s.outlet)];
      // Finished: past the last run's end; for a tracked truck, only once every stop is recorded.
      const finished = toMin(runs[runs.length - 1].end) <= now && (!live || runs.every((r) => r.stops.every(got)));
      const waiting = !finished && toMin(t.start) > now; // at the depot until this run leaves
      const done = live
        ? t.stops.filter(got).length
        : t.stops.filter((s) => toMin(s.leave) <= now).length;
      // Predict the rest of the morning: the part of the current leg still to drive, every later leg, and the
      // truck's next Fresh run, at the typical speed for that district and hour (the plan assumed free-flowing roads).
      const risks = [];
      let clock = null;
      runs.slice(runs.indexOf(t)).forEach((run, ri) => {
        const d = districts[run.district];
        run.stops.forEach((s, i) => {
          if (ri === 0 && i < done) return;
          const leg = i === 0 ? d.outMin : d.stopMin;
          const legStart = toMin(i === 0 ? run.start : run.stops[i - 1].leave);
          let startAt, remaining;
          if (clock === null) {
            startAt = Math.max(now, legStart);
            remaining = Math.max(0, leg - Math.max(0, now - legStart));
          } else {
            startAt = i === 0 ? Math.max(clock, legStart) : clock;
            remaining = leg;
          }
          const factor = 100 / speedIndex(run.district, Math.floor(startAt / 60) % 24);
          const arrive = Math.max(startAt + remaining * factor, toMin(mallOpen(s)));
          const predicted = Math.round(arrive);
          if (predicted > toMin(s.close)) risks.push({ stop: s, run: run.run, predicted: fmt(predicted), lateBy: predicted - toMin(s.close) });
          clock = arrive + s.service;
        });
      });
      const offline = scenario.dead !== "idle" && l.vehicle.id === "VEH010" && scenario.dead !== "synced";
      let state = finished ? "done" : waiting ? "waiting" : risks.length ? "late" : "way";
      if (offline) state = "offline";
      if (l.vehicle.id === "VEH003" && scenario.reefer !== "idle") state = "problem";
      return { lane: l, trip: t, done: finished && !live ? t.stops.length : done, state, risks };
    });
}

const depotOfVehicle = Object.fromEntries((data.fleetAll || []).map((v) => [v.id, v.depot]));
const depotOfOutlet = Object.fromEntries((data.outletsAll || []).map((o) => [o.id, o.depot]));

/* Rule check for putting an order on a vehicle's trip. Returns { ok, problems[] } in plain words.
   Rules: one brand + one district per trip, reefer for chilled, vans for van-only shops, space, weight,
   the daily time budget (Fresh 270 min, Style + Tech 480 min), delivery windows on the clock, and the fuel quota. */
export function checkMove(p, order, vehicleId, tripNo, unavailable = new Set()) {
  const v = vehicles[vehicleId];
  const problems = [];
  if (!v) return { ok: false, problems: ["Unknown vehicle"] };
  if (unavailable.has(vehicleId)) problems.push(`${vehicleId} is not available today (workshop or no driver)`);
  const ln = lane(p, vehicleId);
  const trip = ln?.trips[tripNo - 1];
  const others = (trip?.orders || []).filter((o) => o.ref !== order.ref);
  if (others.length && (others[0].brand !== order.brand || others[0].district !== order.district)) {
    problems.push(`This trip goes to ${others[0].brand} · ${others[0].district} (one brand and one district per trip)`);
  }
  // Booklet rule 4: a vehicle serves only outlets of its own depot.
  const home = depotOfVehicle[vehicleId], shopDepot = depotOfOutlet[order.outlet];
  if (home && shopDepot && home !== shopDepot) problems.push(`${vehicleId} belongs to ${home}; this shop is served from ${shopDepot}`);
  if (order.chilled && !v.reefer) problems.push("Chilled goods need a refrigerated vehicle");
  if (order.parking === "van_only" && v.type !== "van") problems.push("This shop is van-only");
  if (others.some((o) => o.parking === "van_only") && v.type !== "van") problems.push("Another stop on this trip is van-only");
  const list = [...others, order];
  const m3 = list.reduce((s, o) => s + o.m3, 0);
  const kg = list.reduce((s, o) => s + o.kg, 0);
  if (m3 > v.m3 + 1e-6) problems.push(`Space ${round1(m3)} / ${v.m3} m³`);
  if (kg > v.kg + 1e-6) problems.push(`Weight ${Math.round(kg).toLocaleString("en-US")} / ${v.kg.toLocaleString("en-US")} kg`);
  const minutes = tripMinutes(list);
  const fresh = order.brand === "Fresh";
  const otherTrip = ln?.trips[tripNo === 1 ? 1 : 0];
  const sameGroup = otherTrip && (otherTrip.brand === "Fresh") === fresh ? otherTrip.minutes : 0;
  const budget = fresh ? 270 : 480;
  if (minutes + sameGroup > budget) problems.push(`Time ${minutes + sameGroup} / ${budget} min for ${fresh ? "Fresh" : "Style and Tech"} trips`);
  // Clock check only when the basic rules pass (otherwise the times mean nothing).
  if (!problems.length) {
    const d = districts[order.district];
    const newTrip = { no: tripNo, brand: order.brand, district: order.district, orders: list, stops: groupStops(list), minutes, km: 2 * d.outKm + (list.length - 1) * d.stopKm };
    const trips2 = [1, 2].map((no) => (no === tripNo ? newTrip : ln?.trips[no - 1] ? { ...ln.trips[no - 1], stops: groupStops(ln.trips[no - 1].orders) } : null));
    const sched = scheduleLane(trips2, { vid: vehicleId, stopOrders: p.stopOrders || {} });
    Object.entries(sched).forEach(([no, s]) => {
      s.times.forEach((tm, i) => {
        if (tm.lateBy > 0) problems.push(`${s.seq[i].outlet} would arrive ${tm.eta}, after its window closes (${s.seq[i].close})`);
      });
    });
    const km = trips2.filter(Boolean).reduce((a, t) => a + t.km, 0);
    const left = fuelLeftEstimate(vehicleId);
    if (left != null && km / v.kmPerL > left) problems.push(`Fuel ${Math.round(km / v.kmPerL)} L today, only about ${Math.round(left)} L left this week`);
  }
  return { ok: problems.length === 0, problems, m3, kg, minutes: minutes + sameGroup, budget };
}

/* All places an order could go, valid ones first. */
export function moveOptions(p, order, unavailable) {
  const opts = [];
  Object.values(vehicles).forEach((v) => {
    [1, 2].forEach((no) => {
      const cur = p.alloc[order.ref];
      if (cur && cur.vehicle === v.id && cur.trip === no) return;
      const r = checkMove(p, order, v.id, no, unavailable);
      const trip = lane(p, v.id)?.trips[no - 1];
      opts.push({ vehicle: v, trip: no, tripInfo: trip, ...r });
    });
  });
  const rank = (o) => (o.ok ? 0 : 1) * 100 + o.problems.length;
  return opts.sort((a, b) => rank(a) - rank(b) || Number(!!b.tripInfo) - Number(!!a.tripInfo) || a.vehicle.id.localeCompare(b.vehicle.id));
}
