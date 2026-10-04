/* Shared domain state for Waypoint One: the initial state and the reducer that every action goes through.
   Pure JavaScript (no React, no browser APIs), so the same rules run in the browser (optimistic updates, offline)
   and on the server (the authoritative copy every portal syncs to). */
import { SEED_ACCOUNTS, storeName } from "../data/accounts";
import { FAIR_ALLOC, S1_DATE, stopKey } from "../data/model";
import data from "../data/s1.json";
import { S1_RUN, buildRunOrders, ordersFromStore, runDateAt } from "./day";
import { reduceAt } from "./clock";
import { nextOperatingDay, runFor } from "../runs.js";
import { SCENARIOS, SCENARIO_DAY } from "../scenarios";

/* Account model:
   - Store: ONE shared account per store. Important actions ask "Who is this?" so every record has a name.
   - Loader: ONE shared depot account per depot. Loaders tap their name (no PIN).
   - Driver: personal account, exactly one vehicle (one driver per vehicle, strictly).
   - Dispatcher and admin: personal accounts. Dispatchers see each other's decisions in the team log. */
export const USERS = {
  driver: { role: "driver", name: "Ruwan", id: "WP-DRV-003", lang: "si", home: "/driver", vehicle: "VEH003" },
  loader: { role: "loader", name: "Peliyagoda depot", id: "DEPOT-PELIYAGODA", lang: "ta", home: "/loader", shared: true, depot: "Peliyagoda", people: ["Suresh", "Kamal", "Mohamed"] },
  store: { role: "store", name: "Waypoint Fresh Veyangoda", id: "STORE-OUT034", lang: "en", home: "/store", shared: true, outlet: "OUT034", people: ["Fathima", "Dilani", "Night staff"] },
  dispatcher: { role: "dispatcher", name: "Nimal", id: "WP-DSP-001", lang: "en", home: "/dispatch", depot: "Peliyagoda" },
  admin: { role: "admin", name: "Admin", id: "WP-ADM-001", lang: "en", home: "/admin" },
};
// The Kandy hub has its own shared depot account (the S1 day plans only Peliyagoda, so Kandy has nothing to load).
export const KANDY_LOADER = { ...USERS.loader, name: "Kandy depot", id: "DEPOT-KANDY", depot: "Kandy", people: ["Ravi", "Nuwan"] };

export const USERS_BY_ID = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]));

/* A personal account signs in as itself: WP-DRV-006 is Kasun on VEH006, WP-DSP-002 is Kavinda at Kandy. */
export function personalUser(role, account, newAccounts = []) {
  const acc = [...SEED_ACCOUNTS, ...newAccounts].find((x) => x.id === account);
  if (!acc) return USERS[role];
  if (role === "driver") return { ...USERS.driver, id: acc.id, name: acc.name, vehicle: acc.vehicle, depot: acc.depot };
  if (role === "dispatcher") return { ...USERS.dispatcher, id: acc.id, name: acc.name, depot: acc.category === "Kandy" ? "Kandy" : "Peliyagoda" };
  return USERS[role];
}

/* Earlier decisions by the team, so the shared log is never empty. */
const SEED_LOG = [
  { at: "Yesterday 19:10", who: "Nimal", role: "Dispatcher", what: "Published the Peliyagoda plan · 10 orders deferred (no reefer trip left)" },
  { at: "Yesterday 18:45", who: "Kavinda", role: "Dispatcher · Kandy", what: "Published the Kandy plan" },
  { at: "Yesterday 16:40", who: "Admin", role: "Admin", what: "Created driver account WP-DRV-027 for VEH027" },
];

export const initial = {
  user: null,
  lang: "en",
  simOffline: false, // signal lost (demo only). Applies to drivers only; see `online` below
  offlineVeh: null, // in the Dead Zone story, only this truck's driver loses signal
  scenario: { dock: "idle", reefer: "idle", dead: "idle" }, // idle → reported → resolved/approved; dead: idle → complaint → synced
  loaded: {}, // "VEH003:1:2": true (truck, run, stop)
  delivered: {}, // "VEH003:OUT034": { outcome, missing, reason, at, synced, arrivedAt, serviceMin, receivedBy }
  tracked: { VEH003: true }, // trucks whose driver has signed in: the live board follows their real records
  runStarted: {}, // "VEH003:1": "03:32" when the driver left the depot on that run
  driverAck: {}, // plan changes a driver has seen: { VEH003: 2 }
  driverReports: [], // issues a driver flagged on the road: [{ id, vehicle, outlet, kind, delayMin, storeText, at, synced, seenBy }]
  stopProgress: {}, // arrival at a stop before hand-over: { "VEH003:OUT034": { arrivedAt } }
  outbox: [], // stops recorded offline ("VEH003:OUT034")
  person: null, // who is using a shared account right now (dock or store)
  depot: "Peliyagoda", // depot the dispatcher is viewing
  clock: { date: S1_DATE, time: "05:30" },
  runDate: S1_DATE, // the delivery run the system is working on (follows the clock; see domain/day.js)
  carry: [], // orders the previous run could not serve: they go first on this run
  pastRuns: [], // short summary of earlier runs // the S1 day, Thu 8 Jan 2026; set by hand for now (later: the real clock)
  publishedBy: null, // { by, at } who published and when
  published: false, // tonight's plan: loaders, drivers and stores only see it after the dispatcher publishes
  planAlloc: null, // the adopted base plan: null = the team's optimiser plan; set when the dispatcher uses an engine plan
  planSource: null, // { source: "engine", by, at, summary }
  planEdits: [], // dispatcher's manual moves and overrides: [{ ref, to: { vehicle, trip } | null, reason, by }]
  stopOrders: {}, // stop sequences the dispatcher set by hand: { "VEH003:2": ["OUT034", "OUT032"] }
  smsSent: [], // messages the dispatcher sent by SMS
  storeOrders: [], // orders stores sent for the next run: [{ outlet, name, dry, cold, by, at }]
  loadedTrucks: {}, // per run: { "VEH006:1": { by: "Suresh", at: "03:24" } }
  loadStarts: {}, // who started loading which truck and run: { "VEH006:1": { by: "Suresh", at: "03:02" } }
  notifications: [], // for the dispatcher: [{ id, at, kind: "info" | "done" | "problem", title, text, link, read }]
  loaderReports: [], // problems loaders flagged before a truck left: [{ vehicle, outlet, what, by, at }]
  adjusted: {}, // orders sent short: { "S1-028": { units: 168, missing: 2, newRef: "R-001", reason } }
  reeferChecked: {}, // reefer temperature checked before loading chilled goods: { "VEH006:1": { by, at } }
  storeReports: [], // problems stores reported: [{ outlet, name, what, by, at }]
  log: SEED_LOG, // shared activity log: every important action with a name
  peopleEdits: {}, // admin edits to the people on shared accounts: { "DEPOT-PELIYAGODA": ["Suresh", ...] }
  newAccounts: [], // accounts created by admin in this demo
  storeEdits: {}, // admin edits to store rules: { OUT034: { open, close, mall, dock, parking } }
  fleetEdits: {}, // workshop status changes: { VEH006: { status: "in_workshop", back: "2026-10-02", by: "Nimal" } }
  accountStatus: {}, // { "WP-DRV-003": "Locked" | "Deactivated" | "Active" }
  hideDemo: false,
  phonePreview: false, // show mobile screens inside a phone frame (for demos, video, Figma capture)
};

/* "Thu 9 Jan" without importing the UI layer. */
const shortDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()]} ${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`; };
/* What the store is told when its order goes short at the depot. */
export function storeUpdateText(ref, units, count, newRef, run, r) {
  return `Waypoint: ${count} ${r.chilled ? "chilled " : ""}cases of order ${ref} were ${r.kind} at the depot. Today's delivery brings ${units - count} of ${units}. The ${count} missing cases are re-ordered as ${newRef} and come first on the ${shortDate(run)} run. No action needed.`;
}

/* A notification for the dispatcher (loading started, truck loaded, problem at the dock). */
function notify(s, kind, title, text, link) {
  const n = { id: `N${(s.notifications?.length || 0) + 1}-${s.clock.time}`, at: s.clock.time, kind, title, text, link, read: false };
  return { ...s, notifications: [n, ...(s.notifications || [])].slice(0, 60) };
}

export function reducer(s, a) {
  switch (a.type) {
    case "login": {
      // Any of the 120 store accounts can sign in: STORE-OUT054 → the same store portal for OUT054.
      // Signed in on the server: the account comes back from the server as it is stored there.
      const u = a.user ? { ...(USERS[a.user.role] || {}), ...a.user, home: (USERS[a.user.role] || {}).home || a.user.home }
        : a.role === "store" && a.outlet && a.outlet !== USERS.store.outlet
        ? { ...USERS.store, id: `STORE-${a.outlet}`, outlet: a.outlet, name: storeName[a.outlet] || `Store ${a.outlet}`, people: ["Store manager"] }
        : a.role === "loader" && a.account === "DEPOT-KANDY" ? KANDY_LOADER
        : (a.role === "driver" || a.role === "dispatcher") && a.account ? personalUser(a.role, a.account, s.newAccounts)
        : USERS[a.role];
      const tracked = u.role === "driver" && u.vehicle ? { ...s.tracked, [u.vehicle]: true } : s.tracked;
      return { ...s, user: u, tracked, lang: a.keepLang ? s.lang : u.lang, person: null };
    }
    case "driverSignedIn": return { ...s, tracked: { ...s.tracked, [a.vehicle]: true } };
    case "logout": return { ...s, user: null, person: null, guide: null };
    // A step of a bad-day story: sign in as that role, set the clock and the situation, remember the step.
    case "scenarioGo": {
      const sc = SCENARIOS[a.id];
      const st = sc?.steps[a.index];
      if (!st) return s;
      let n = reducer(s, { type: "login", role: st.role, outlet: st.outlet, account: st.account, keepLang: true });
      n = { ...n, person: st.person || null, clock: { date: SCENARIO_DAY, time: st.time }, published: true,
        publishedBy: n.publishedBy || { by: "Nimal", at: "19:05" }, simOffline: !!st.offline, offlineVeh: st.offline ? "VEH010" : null, guide: { id: a.id, index: a.index } };
      return st.patch ? st.patch(n) : n;
    }
    case "guideExit": return { ...s, guide: null, simOffline: false, offlineVeh: null };
    // Short at the Dock, option B: the truck leaves short, the old order is reduced, and a replacement order
    // for the missing cases goes first on the next run. notify: also tell the store now.
    case "shortReorder": {
      const r = s.loaderReports.find((x) => x.id === a.id);
      if (!r) return s;
      const list = runOrdersOf(s);
      const o = list.find((x) => x.ref === r.ref) || list.find((x) => x.outlet === r.outlet && !!x.chilled === !!r.chilled) || list.find((x) => x.outlet === r.outlet);
      if (!o) return s;
      const count = a.count || r.count;
      const newRef = nextReplacementRef(s);
      const run = nextOperatingDay(s.runDate || s.clock.date);
      const newOrder = { ref: newRef, outlet: r.outlet, name: storeName[r.outlet] || r.outlet, dry: r.chilled ? 0 : count, cold: r.chilled ? count : 0,
        by: a.by, at: s.clock.time, day: s.clock.date, run, replaces: o?.ref, reason: `${count} ${r.chilled ? "chilled " : ""}cases ${r.kind} at the depot`, firstInLine: true };
      const adjusted = { ...s.adjusted, [o.ref]: { units: o.units - count, missing: count, newRef, run, reason: newOrder.reason } };
      const reports = s.loaderReports.map((x) => (x.id === r.id ? { ...x, decision: "short", decidedBy: x.decidedBy || a.by, decidedAt: x.decidedAt || s.clock.time, newRef } : x));
      const sms = a.notify ? [{ to: r.outlet, tag: "dock", by: a.by, at: s.clock.time, text: storeUpdateText(o.ref, o.units, count, newRef, run, r) }] : [];
      return { ...s, adjusted, loaderReports: reports, storeOrders: [newOrder, ...s.storeOrders], smsSent: [...sms, ...s.smsSent],
        log: [{ at: s.clock.time, day: s.clock.date, who: a.by, role: "Dispatcher · Peliyagoda", what: `Short at the Dock ${r.vehicle}: ${o.ref} reduced to ${o.units - count} cases, new order ${newRef} (${count} cases) for ${run}` }, ...s.log] };
    }
    case "reeferCheck": return { ...s, reeferChecked: { ...s.reeferChecked, [a.key]: a.value ? { by: a.by, at: s.clock.time } : undefined } };
    case "truckUnloaded": { const { [`${a.vehicle}:${a.run}`]: _, ...rest } = s.loadedTrucks; return { ...s, loadedTrucks: rest }; }
    // Bad days portal: put one scenario back to its start.
    case "badReset": {
      let n = { ...s, clock: { date: SCENARIO_DAY, time: a.time, setAt: a.at ?? null }, published: true, publishedBy: s.publishedBy || { by: "Nimal", at: "19:05" }, simOffline: false, offlineVeh: null };
      if (a.id === "dock") {
        const keep = (k) => !k.startsWith("VEH006:1");
        n = { ...n, loaderReports: n.loaderReports.filter((r) => !(r.vehicle === "VEH006" && r.outlet === "OUT026")), adjusted: {},
          storeOrders: n.storeOrders.filter((o) => !o.replaces), smsSent: n.smsSent.filter((m) => m.tag !== "dock"),
          loadedTrucks: Object.fromEntries(Object.entries(n.loadedTrucks).filter(([k]) => keep(k))), loaded: Object.fromEntries(Object.entries(n.loaded).filter(([k]) => keep(k))) };
      }
      if (a.id === "reefer") n = { ...n, scenario: { ...n.scenario, reefer: "idle", reeferMoved: false }, smsSent: n.smsSent.filter((m) => m.tag !== "reefer") };
      if (a.id === "dead") {
        n = { ...n, scenario: { ...n.scenario, dead: "idle", deadClosed: false }, delivered: Object.fromEntries(Object.entries(n.delivered).filter(([k]) => !k.startsWith("VEH010:"))),
          outbox: n.outbox.filter((k) => !k.startsWith("VEH010:")), storeReports: n.storeReports.filter((r) => r.outlet !== "OUT074"), smsSent: n.smsSent.filter((m) => m.tag !== "dead") };
      }
      return n;
    }
    case "person": return { ...s, person: a.name };
    case "depot": return { ...s, depot: a.depot };
    // Only the dispatcher changes the day's clock: a set time keeps running from that moment, or real time.
    case "clock": {
      if (a.real) return { ...s, clock: { real: true, setAt: a.at ?? null } };
      const cur = { date: s.clock.date, time: s.clock.time };
      return { ...s, clock: { date: a.clock?.date || cur.date, time: a.clock?.time || cur.time, setAt: a.at ?? null } };
    }
    case "publish": return { ...s, published: true, publishedBy: s.published ? s.publishedBy : { by: a.by || "Dispatcher", at: s.clock.time } };
    // Each edit remembers where the order was, when, and whether the plan was already published (loaders must re-check).
    case "planEdit": {
      const base = { ...(s.planAlloc || FAIR_ALLOC) };
      s.planEdits.forEach((e) => { base[e.ref] = e.to; });
      return { ...s, planEdits: [...s.planEdits, { ...a.edit, from: base[a.edit.ref]?.vehicle || null, at: s.clock.time, afterPublish: s.published }] };
    }
    // The dispatcher adopts a plan from the planning engine: it replaces the base plan and clears manual edits.
    case "planSet": return { ...s, planAlloc: a.alloc, planSource: { source: a.source || "engine", by: a.by, at: s.clock.time, summary: a.summary || null }, planEdits: [], stopOrders: {},
      log: [{ at: s.clock.time, day: s.clock.date, who: a.by, role: "Dispatcher · Peliyagoda", what: a.what || `Used the engine plan: ${a.summary?.served ?? "?"} of ${a.summary?.orders ?? "?"} orders served, ${a.summary?.deferred ?? "?"} deferred` }, ...s.log] };
    case "loaderReport": {
      const id = `LR-${s.loaderReports.length + 1}`;
      const r = { ...a.report, id, at: s.clock.time };
      return notify({ ...s, loaderReports: [r, ...s.loaderReports] }, "problem", `Short at the Dock · ${r.vehicle}`, `${r.outlet}: ${r.what} · reported by ${r.by}. Decide before the truck leaves.`, `/dispatch/incident/loader/${id}`);
    }
    // A loader taps a load and says who they are: logged, and the dispatcher sees loading has started.
    case "loadStart": {
      const k = `${a.vehicle}:${a.run}`;
      const n = { ...s, person: a.by, loadStarts: { ...s.loadStarts, [k]: { by: a.by, at: s.clock.time } },
        log: [{ at: s.clock.time, day: s.clock.date, who: a.by, role: `Loader · ${s.user?.depot || "Peliyagoda"} depot`, what: `Started loading ${a.vehicle} for run ${a.run} (${a.district}, leaves ${a.leaves})` }, ...s.log] };
      return notify(n, "info", `Loading started · ${a.vehicle}`, `${a.by} started loading ${a.vehicle} for run ${a.run} · ${a.district} · leaves ${a.leaves}`, "/dispatch/live");
    }
    case "loadWhoReset": { const { [a.key]: _, ...rest } = s.loadStarts; return { ...s, loadStarts: rest }; }
    case "notifRead": return { ...s, notifications: s.notifications.map((x) => ({ ...x, read: true })) };
    // The dispatcher's answer goes back to the dock; the loader ticks it off when done.
    case "loaderDecision": return { ...s, loaderReports: s.loaderReports.map((r) => (r.id === a.id ? { ...r, decision: a.decision, decidedBy: a.by, decidedAt: s.clock.time } : r)) };
    case "loaderAck": return { ...s, loaderReports: s.loaderReports.map((r) => (r.id === a.id ? { ...r, acked: s.clock.time } : r)) };
    case "undoEdits": return { ...s, planEdits: [], stopOrders: {} };
    case "stopOrder": return { ...s, stopOrders: { ...s.stopOrders, [a.key]: a.order } };
    case "sms": return { ...s, smsSent: [{ ...a.sms, at: s.clock.time }, ...s.smsSent] };
    case "storeOrderUpdate": return { ...s, storeOrders: s.storeOrders.map((o) => (o.ref === a.ref ? { ...o, ...a.patch, changedAt: s.clock.time, changedDay: s.clock.date } : o)) };
    case "storeOrderCancel": return { ...s, storeOrders: s.storeOrders.map((o) => (o.ref === a.ref ? { ...o, cancelled: true, changedAt: s.clock.time, changedDay: s.clock.date, changedBy: a.by } : o)) };
    case "storeOrder": return { ...s, storeOrders: [{ ...a.order, at: s.clock.time, day: s.clock.date, run: runFor(s.clock) }, ...s.storeOrders] };
    case "truckLoaded": return notify({ ...s, loadedTrucks: { ...s.loadedTrucks, [`${a.vehicle}:${a.run}`]: { by: a.by, at: s.clock.time } } },
      "done", `Loaded · ${a.vehicle}`, `${a.by} finished loading ${a.vehicle} for run ${a.run}. Ready to leave.`, "/dispatch/live");
    case "storeReport": {
      const r = { ...a.report, id: `SR-${s.storeReports.length + 1}`, at: s.clock.time };
      return notify({ ...s, storeReports: [r, ...s.storeReports] }, "problem", `Store report · ${r.outlet}`, `${r.what}${r.vehicle ? ` · truck ${r.vehicle}` : ""} · reported by ${r.by}`, "/dispatch/live");
    }
    // The dispatcher's answer to a store report (send on the next run, or credit) goes back to the store.
    case "storeReportDecision": {
      const r = s.storeReports.find((x) => x.id === a.id);
      if (!r || r.decision) return s;
      let n = { ...s, storeReports: s.storeReports.map((x) => (x.id === a.id ? { ...x, decision: a.decision, decidedBy: a.by, decidedAt: s.clock.time } : x)) };
      // "Send them on the next run": a replacement order for the missing cases (or the whole order) goes first then.
      if (a.decision === "resend") {
        const o = runOrdersOf(s).find((x) => x.ref === r.ref);
        const count = r.count || o?.units || 0;
        if (count > 0) {
          const chilled = o ? !!o.chilled : /-C$/.test(r.ref || "");
          const ref = nextReplacementRef(s);
          const run = nextOperatingDay(s.runDate || s.clock.date);
          const order = { ref, outlet: r.outlet, name: storeName[r.outlet] || r.name || r.outlet, dry: chilled ? 0 : count, cold: chilled ? count : 0,
            by: a.by, at: s.clock.time, day: s.clock.date, run, replaces: r.ref || null, reason: r.what, firstInLine: true };
          n = { ...n, storeOrders: [order, ...n.storeOrders], storeReports: n.storeReports.map((x) => (x.id === a.id ? { ...x, newRef: ref, newRun: run } : x)) };
        }
      }
      return n;
    }
    case "setPeople": return { ...s, peopleEdits: { ...s.peopleEdits, [a.id]: a.people } };
    case "storeRules": return { ...s, storeEdits: { ...s.storeEdits, [a.outlet]: a.rules } };
    case "fleetStatus": return { ...s, fleetEdits: { ...s.fleetEdits, [a.vehicle]: a.change } };
    case "accountStatus": return { ...s, accountStatus: { ...s.accountStatus, [a.id]: a.status } };
    // Admin gave a new temporary password: the person sets their own at the next (first) sign-in.
    case "resetSignIn": return { ...s, accountStatus: { ...s.accountStatus, [a.id]: "Not activated" } };
    case "addAccount": return { ...s, newAccounts: [...s.newAccounts, (({ temp, ...acc }) => acc)(a.account || {})] };
    case "log": return { ...s, log: [{ at: s.clock.time, day: s.clock.date, who: a.who, role: a.role, what: a.what }, ...s.log] };
    case "lang": return { ...s, lang: a.lang };
    case "offline": return { ...s, simOffline: a.value, offlineVeh: a.value ? a.vehicle || null : null };
    case "scenario": return { ...s, scenario: { ...s.scenario, ...a.patch } };
    case "load": return { ...s, loaded: { ...s.loaded, [a.key]: a.value } };
    // The driver leaves the depot once per run; each stop then only needs "I've arrived" and the hand-over.
    case "startRun": return { ...s, runStarted: { ...s.runStarted, [`${a.vehicle}:${a.run}`]: s.clock.time } };
    case "arrive": { const k = stopKey(a.vehicle, a.outlet); return { ...s, stopProgress: { ...s.stopProgress, [k]: { arrivedAt: s.clock.time } } }; }
    case "driverAck": return { ...s, driverAck: { ...s.driverAck, [a.vehicle]: a.count } };
    // A road issue reaches the dispatcher (Live board) and, if the driver chose, the store. Offline, it waits for sync.
    case "driverReport": {
      const r = { ...a.report, id: `DR-${s.driverReports.length + 1}`, at: s.clock.time, synced: a.online };
      const sms = a.online && r.storeText ? [{ to: r.outlet, text: r.storeText, at: s.clock.time, by: "Driver" }] : [];
      const truck = !r.outlet || r.kind === "vehicle";
      return notify({ ...s, driverReports: [r, ...s.driverReports], smsSent: [...sms, ...s.smsSent] }, "problem",
        truck ? `Truck problem · ${r.vehicle}` : `Driver report · ${r.vehicle}`,
        `${r.label}${r.outlet ? ` before ${r.outlet}` : ""}${r.delayMin ? ` · about ${r.delayMin} min late` : ""} · ${r.by}`, truck ? `/dispatch/replan/${r.vehicle}` : "/dispatch/live");
    }
    case "driverReportSeen": return { ...s, driverReports: s.driverReports.map((r) => (r.id === a.id ? { ...r, seenBy: a.by, seenAt: s.clock.time } : r)) };
    case "deliver": {
      // Real times from the clock. Service time follows the booklet: an early truck waits for the window to open,
      // so handling runs from the later of arrival and window-open until the truck leaves (hand-over done).
      const k = stopKey(a.vehicle, a.outlet);
      const p = s.stopProgress[k] || {};
      const mins = (x) => { const [h, m] = x.split(":").map(Number); return h * 60 + m; };
      const arrivedAt = p.arrivedAt || s.clock.time;
      const startAt = Math.max(mins(arrivedAt), a.open ? mins(a.open) : 0);
      const serviceMin = Math.max(0, mins(s.clock.time) - startAt);
      const rec = { outcome: a.outcome, missing: a.missing || 0, reason: a.reason || null, at: s.clock.time, synced: a.online, arrivedAt, serviceMin, receivedBy: a.receivedBy || null,
        photo: a.photo || null, signature: a.signature || null };
      const n = { ...s, delivered: { ...s.delivered, [k]: rec }, outbox: a.online ? s.outbox : [...s.outbox, k] };
      // A stop not delivered, or delivered short, is a problem for the dispatcher.
      if (a.outcome === "none") return notify(n, "problem", `Not delivered · ${a.outlet}`, `${a.vehicle} · ${{ shopClosed: "shop closed", refused: "refused", noAccess: "no access" }[a.reason] || a.reason || "not delivered"} · goes first on the next run`, "/dispatch/live");
      if (a.missing) return notify(n, "problem", `Delivered short · ${a.outlet}`, `${a.vehicle} · ${a.missing} cases missing · signed by ${a.receivedBy || "the store"}`, "/dispatch/live");
      return n;
    }
    case "sync": {
      // a.keys: only these records (a truck whose signal came back); none given = everything waiting.
      const keys = a.keys || s.outbox;
      const delivered = { ...s.delivered };
      keys.forEach((o) => { if (delivered[o]) delivered[o] = { ...delivered[o], synced: true }; });
      // Road issues saved offline go out now, and so do their store messages.
      const goes = (r) => !r.synced && (!a.keys || !r.vehicle || keys.some((k) => k.startsWith(r.vehicle + ":")) || !(s.simOffline && (!s.offlineVeh || r.vehicle === s.offlineVeh)));
      const waiting = s.driverReports.filter(goes);
      const sms = waiting.filter((r) => r.storeText).map((r) => ({ to: r.outlet, text: r.storeText, at: s.clock.time, by: "Driver" }));
      return { ...s, delivered, outbox: s.outbox.filter((k) => !keys.includes(k)), driverReports: s.driverReports.map((r) => (goes(r) ? { ...r, synced: true } : r)), smsSent: [...sms, ...s.smsSent] };
    }
    case "hideDemo": return { ...s, hideDemo: a.value };
    case "phonePreview": return { ...s, phonePreview: a.value };
    case "hydrate": {
      // Another tab changed shared data (time, plan, deliveries...). Keep this tab's own sign-in, language and view.
      const own = { user: s.user, person: s.person, lang: s.lang, phonePreview: s.phonePreview, hideDemo: s.hideDemo, guide: s.guide };
      return { ...s, ...a.state, ...own };
    }
    case "reset": return { ...initial, clock: { ...initial.clock, setAt: a.at ?? null }, user: s.user, lang: s.lang, phonePreview: s.phonePreview, person: s.person };
    default: return s;
  }
}

/* Per-device fields: who is signed in on this phone, its language and view. Never sent to or taken from the server. */
export const LOCAL_KEYS = ["user", "person", "lang", "phonePreview", "hideDemo", "guide"];
/* Actions that only change this device's view. Everything else is a shared command the server records. */
export const LOCAL_ACTIONS = new Set(["login", "logout", "person", "lang", "hideDemo", "phonePreview", "hydrate", "guideExit", "scenarioGo", "depot"]);
/* The shared part of a state (what the server stores). */
export const sharedOf = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !LOCAL_KEYS.includes(k)));


/* ---------- Runs: the state follows the clock from one delivery run to the next ---------- */
/* Fields that belong to one run: they start fresh when the next run begins. */
const DAY_RESET = {
  published: false, publishedBy: null, planAlloc: null, planSource: null, planEdits: [], stopOrders: {},
  loaded: {}, delivered: {}, runStarted: {}, stopProgress: {}, driverAck: {}, driverReports: [], outbox: [],
  loadedTrucks: {}, loadStarts: {}, reeferChecked: {}, loaderReports: [], storeReports: [], adjusted: {},
  scenario: { dock: "idle", reefer: "idle", dead: "idle" }, simOffline: false, offlineVeh: null,
};

/* This run's orders: the dataset's for S1; otherwise the stores' orders for it plus the carried ones. */
export const dayOrdersOf = (s) => ((s.runDate || S1_RUN) === S1_RUN ? null : buildRunOrders(s.storeOrders, s.runDate, s.carry || []));
/* This run's orders on any run (S1: the dataset's). */
const runOrdersOf = (s) => dayOrdersOf(s) || data.orders;
/* Replacement orders (sent short, or missing at the store) are numbered R-001, R-002, ... */
const nextReplacementRef = (s) => `R-${String(s.storeOrders.filter((x) => x.ref.startsWith("R-")).length + 1).padStart(3, "0")}`;
export const isS1Run = (s) => (s.runDate || S1_RUN) === S1_RUN;

/* Move the state to the run the clock is in. Going forward, every order the finished run did not serve (and any
   store order for a run that was skipped over) goes first on the new run. Going back (e.g. to the S1 day) just
   opens that run. */
const RUN_KEYS = Object.keys(DAY_RESET);
const runPart = (s) => Object.fromEntries(RUN_KEYS.map((k) => [k, s[k]]));

/* Orders of a saved run that still need delivering: not on its published plan, or planned but not handed over
   (no delivery record, or the driver recorded "not delivered"). */
function unserved(s, r, run) {
  const plan = { ...(r.planAlloc || {}) };
  (r.planEdits || []).forEach((e) => { plan[e.ref] = e.to; });
  return (dayOrdersOf({ ...s, runDate: run, carry: r.carry || [] }) || []).filter((o) => {
    const a = r.published && plan[o.ref];
    if (!a) return true;
    const d = (r.delivered || {})[stopKey(a.vehicle, o.outlet)];
    return !d || d.outcome === "none";
  });
}

/* Move the state to the run the clock is in. Each run's records (plan, loading, deliveries, reports) are kept, so
   going back to a run (the dispatcher looked at another day) finds everything as it was. Orders the last real run
   before this one did not deliver go first (S1 is the dataset's reference day: nothing carries from it). */
export function rollRun(s, now) {
  const run = runDateAt(now);
  const cur = s.runDate || S1_RUN;
  if (run === cur) return s.runDate ? s : { ...s, runDate: cur };
  const saved = { ...(s.runs || {}), [cur]: { ...runPart(s), carry: s.carry || [] } };
  const prev = Object.keys(saved).filter((d) => d < run && d !== S1_RUN).sort().pop();
  let carry = [];
  if (run !== S1_RUN && prev) {
    const skipped = (s.storeOrders || []).filter((so) => so.run > prev && so.run < run && !so.cancelled).flatMap(ordersFromStore);
    carry = [...unserved(s, saved[prev], prev), ...skipped]
      .map((o) => ({ ...o, deferredYesterday: true, daysSince: (o.daysSince || 0) + 1, carriedFrom: o.carriedFrom || prev }));
  }
  const back = saved[run] || {};
  const { carry: _, ...backFields } = back;
  // Keep the last 7 runs (and always the S1 reference day).
  const keys = Object.keys(saved).filter((d) => d !== run);
  const keep = new Set([...keys.filter((d) => d !== S1_RUN).sort().slice(-7), ...(keys.includes(S1_RUN) ? [S1_RUN] : [])]);
  const runs = Object.fromEntries(Object.entries(saved).filter(([d]) => keep.has(d)));
  const summary = { run: cur, published: !!s.published, delivered: Object.keys(s.delivered || {}).length };
  const pastRuns = s.runs?.[cur] ? s.pastRuns || [] : [...(s.pastRuns || []), summary].slice(-14);
  return { ...s, ...DAY_RESET, ...backFields, runDate: run, carry, runs, pastRuns };
}

/* Apply an action at a real moment, with the state on the clock's run. Used by the server and by every device. */
export const applyAt = (s, a, ms) => reduceAt(reducer, s, a, ms, rollRun);
/* The state as it is right now (the clock may have moved into a new run since the last action). */
export const atNow = (s, now) => rollRun(s, now);
