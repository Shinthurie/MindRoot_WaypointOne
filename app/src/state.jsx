import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { t as translate } from "./i18n";
import { DATE_WORDS, STORE } from "./i18n_store";

/* Phrase lookup for screens written as English sentences ({x} = value): the English text is the key. */
const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
export function phrase(lang, key, vars) { return fill((STORE[lang] && STORE[lang][key]) || key, vars); }
/* "Thu 1 Oct" in the reader's language. */
export function localDate(lang, iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const w = DATE_WORDS[lang] || { days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
  return `${w.days[day]} ${d} ${w.months[m - 1]}`;
}
import { storeName, fleetAll, outletsAll, SEED_ACCOUNTS } from "./data/accounts";
import { applyPlanEdits } from "./data/model";
import { USERS, KANDY_LOADER, USERS_BY_ID, personalUser, initial, reducer, applyAt, atNow, dayOrdersOf, isS1Run } from "./domain/store";
import { SERVER_MODE } from "./sync";
import { clockAt } from "./domain/clock";
import { useServerState } from "./useServerState";
export { USERS, storeUpdateText } from "./domain/store";

const KEY = "waypoint-one-state-v9";

function load() {
  let s = initial;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...initial, ...JSON.parse(raw) };
  } catch { /* storage blocked: start fresh */ }
  // A saved sign-in keeps its person, but always uses today's start page for its role (e.g. the loader's Home).
  if (s.user && USERS[s.user.role]) s = { ...s, user: { ...s.user, home: USERS[s.user.role].home } };
  // Direct links for design capture (?as=driver&time=03:00&published=1…) only work in the stand-alone prototype.
  // Connected to a server, a link can never sign anyone in or change the shared day: people sign in themselves.
  const q = new URLSearchParams(SERVER_MODE ? [...new URLSearchParams(window.location.search)].filter(([k]) => ["lang", "frame", "clean"].includes(k)) : window.location.search);
  const as = q.get("as");
  if (as && USERS[as]) s = { ...s, user: USERS[as], lang: USERS[as].lang, person: USERS[as].people ? q.get("person") || USERS[as].people[0] : null };
  if (q.get("lang")) s = { ...s, lang: q.get("lang") };
  // A leftover "no signal" demo switch never survives a page load (the Dead Zone story keeps its own truck).
  if (!q.get("offline") && !s.offlineVeh) s = { ...s, simOffline: false };
  if (q.get("offline")) s = { ...s, simOffline: q.get("offline") === "1", offlineVeh: null };
  // The Demo panel is back on every fresh load; a clean=1 link hides it for that visit only (design capture).
  s = { ...s, hideDemo: q.get("clean") === "1" };
  if (q.get("frame")) s = { ...s, phonePreview: q.get("frame") === "1" };
  if (q.get("depot")) s = { ...s, depot: q.get("depot") };
  if (q.get("time") || q.get("date")) s = { ...s, clock: { date: q.get("date") || s.clock.date, time: q.get("time") || s.clock.time, setAt: Date.now() } };
  // A saved fixed time starts running from now (the clock always moves on, like a real one).
  if (s.clock && !s.clock.real && !s.clock.setAt) s = { ...s, clock: { ...s.clock, setAt: Date.now() } };
  if (q.get("published")) s = { ...s, published: q.get("published") === "1", publishedBy: q.get("published") === "1" ? { by: "Demo link", at: s.clock.time } : null };
  // Demo links for screens that normally appear only after an action (for design capture):
  // &arrived=OUT074 (driver at a shop → hand-over), &dock=report|decided (Short at the Dock),
  // &reefer=reported|approved (Reefer Down), &dead=complaint|synced (Dead Zone).
  if (q.get("arrived") && s.user?.vehicle) {
    const veh = s.user.vehicle;
    s = { ...s, runStarted: { ...s.runStarted, [`${veh}:1`]: s.runStarted?.[`${veh}:1`] || "03:32" }, stopProgress: { ...s.stopProgress, [`${veh}:${q.get("arrived")}`]: { arrivedAt: s.clock.time } } };
  }
  if (q.get("dock")) {
    const rep = { id: "LR-1", vehicle: "VEH006", run: 1, outlet: "OUT026", ref: "S1-028", count: 2, kind: "broken", chilled: true, units: 170, what: "2 chilled cases broken", by: "Suresh", photo: true, at: "03:10" };
    s = { ...s, loaderReports: [q.get("dock") === "decided" ? { ...rep, decision: "replace", decidedBy: "Nimal", decidedAt: "03:12", waitMin: 15 } : rep] };
  }
  if (q.get("reefer")) s = { ...s, scenario: { ...s.scenario, reefer: q.get("reefer") } };
  if (q.get("dead")) s = { ...s, scenario: { ...s.scenario, dead: q.get("dead") } };
  if (as === "driver" && q.get("account")) s = { ...s, user: personalUser("driver", q.get("account"), s.newAccounts), tracked: { ...s.tracked, [personalUser("driver", q.get("account"), s.newAccounts).vehicle]: true } };
  if (as === "loader" && q.get("depot") === "Kandy") s = { ...s, user: KANDY_LOADER, person: q.get("person") || KANDY_LOADER.people[0] };
  if (as === "store" && q.get("store")) s = { ...s, user: { ...USERS.store, id: `STORE-${q.get("store")}`, outlet: q.get("store"), name: storeName[q.get("store")] || q.get("store"), people: ["Store manager"] } };
  return s;
}

/* The state on the clock's current run (rolls over at the 4 PM run boundary even when nobody acts). */
function useRunView(s) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  return useMemo(() => atNow(s, clockAt(s.clock, Math.max(now, s.clock?.setAt || 0))), [s, now]);
}

const Ctx = createContext(null);

/* Local mode: this browser keeps the whole day (the design prototype). Server mode: see useServerState. */
const localReducer = (s, a) => (a.type === "hydrate" || a.type === "login" || a.type === "logout" ? reducer(s, a) : applyAt(s, a));
function useLocalState() {
  const [state, raw] = useReducer(localReducer, undefined, load);
  // Every action carries the moment it happened, so the reducer stays pure.
  const dispatch = useMemo(() => (a) => raw({ ...a, at: a.at ?? Date.now() }), []);
  return [state, dispatch, null];
}

export function StateProvider({ children }) {
  const [toast, setToast] = useState(null);
  // SERVER_MODE is fixed at build time, so the same hook runs on every render.
  const [rawState, dispatch, sync] = SERVER_MODE ? useServerState(load, (text) => setToast({ text })) : useLocalState(); // eslint-disable-line react-hooks/rules-of-hooks
  // The clock may have moved into a new run since the last action: show that run (the next action records it).
  const state = useRunView(rawState);
  // Link settings (?as=…&time=…) apply once. Then clear them from the address bar, so refreshing this tab
  // doesn't reset the shared clock (or the plan) for every open portal.
  useEffect(() => {
    if (!window.location.search) return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch { /* ignore */ }
  }, []);
  const [netOnline, setNetOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    if (SERVER_MODE) return; // the server keeps the day; this device keeps only its outbox and session
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be blocked; the app still works */ }
  }, [state]);

  // Keep open tabs in step: when another tab saves shared data, pick it up here.
  useEffect(() => {
    const onStorage = (e) => {
      if (SERVER_MODE || e.key !== KEY || !e.newValue) return;
      try { dispatch({ type: "hydrate", state: JSON.parse(e.newValue) }); } catch { /* ignore bad data */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const on = () => setNetOnline(true), off = () => setNetOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Optimistic: the app treats itself as online. Only the Dead Zone story (or the demo "Go offline"
  // switch) turns signal off, so banners never appear by accident on a flaky connection.
  // Everyone is online. Only a driver can lose signal (a bad day); in the Dead Zone story only that truck's driver.
  // A real lost connection counts too (the browser knows); the demo switch only affects a driver.
  const online = netOnline && !(state.simOffline && state.user?.role === "driver" && (!state.offlineVeh || state.user.vehicle === state.offlineVeh));

  // Offline records sync automatically as soon as that truck has signal again. Records wait on the
  // phone of the truck that has no signal, whichever screen is open (e.g. the bad days portal).
  const stuck = (k) => state.simOffline && (!state.offlineVeh || k.startsWith(state.offlineVeh + ":"));
  const ready = state.outbox.filter((k) => !stuck(k));
  useEffect(() => {
    if (ready.length) {
      const keys = ready; const count = keys.length;
      const id = setTimeout(() => {
        dispatch({ type: "sync", keys });
        if (state.scenario.dead === "complaint" && keys.some((k) => k.startsWith("VEH010:"))) dispatch({ type: "scenario", patch: { dead: "synced" } });
        setToast({ text: `Signal back · ${count} record${count > 1 ? "s" : ""} sent · 0 duplicates` });
      }, 900);
      return () => clearTimeout(id);
    }
  }, [ready.join(","), state.scenario.dead]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // Every screen imports the same live plan; rebuild it when the dispatcher edits it.
  // The day's clock keeps running: every screen gets the current date and time (state.clock holds the setting).
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 15000); return () => clearInterval(id); }, []);
  const clock = useMemo(() => clockAt(state.clock, Math.max(tick, state.clock?.setAt || 0)), [state.clock, tick]);
  // This run's orders: S1's dataset, or the stores' orders for the run plus the ones carried from the last run.
  const dayOrders = useMemo(() => dayOrdersOf(state), [state.runDate, state.storeOrders, state.carry]); // eslint-disable-line react-hooks/exhaustive-deps
  useMemo(() => applyPlanEdits(state.planEdits, state.stopOrders, state.storeEdits, clock.date, state.planAlloc, { run: state.runDate, orders: dayOrders }),
    [state.planEdits, state.stopOrders, state.storeEdits, clock.date, state.planAlloc, state.runDate, dayOrders]);

  const accounts = useMemo(
    () => [...SEED_ACCOUNTS, ...state.newAccounts].map((a) => ({
      ...a,
      ...(state.peopleEdits[a.id] ? { people: state.peopleEdits[a.id] } : {}),
      ...(state.accountStatus[a.id] ? { status: state.accountStatus[a.id] } : {}),
    })),
    [state.newAccounts, state.peopleEdits, state.accountStatus],
  );
  // Fleet with workshop changes; a vehicle whose driver is deactivated has no driver and cannot be planned.
  const fleet = useMemo(() => {
    const drivers = Object.fromEntries(accounts.filter((a) => a.vehicle).map((a) => [a.vehicle, a]));
    const base = [...fleetAll, ...accounts.filter((a) => a.vehicle && !fleetAll.some((v) => v.id === a.vehicle)).map((a) => ({
      id: a.vehicle, type: a.category.split(" ")[1], reefer: a.category.startsWith("Reefer"), depot: a.depot, m3: null, kg: null, usedL: 0, quotaL: null, status: "available", isNew: true,
    }))];
    return base.map((v) => {
      const d = drivers[v.id];
      // The dataset's workshop list is for S1; on a real run every vehicle is ready unless the dispatcher says otherwise.
      const own = isS1Run(state) ? {} : { status: "available" };
      return { ...v, ...own, ...(state.fleetEdits[v.id] || {}), driver: d && d.status !== "Deactivated" ? d : null };
    });
  }, [accounts, state.fleetEdits, state.runDate]); // eslint-disable-line react-hooks/exhaustive-deps
  // Store rules (window, mall window, dock, access) with admin edits.
  const storeRules = (outlet) => ({ ...outletsAll.find((o) => o.id === outlet), ...(state.storeEdits[outlet] || {}) });
  // People on a shared account (store or depot), including admin's edits.
  const peopleOf = (id) => accounts.find((a) => a.id === id)?.people || USERS_BY_ID[id]?.people || [];

  const value = useMemo(() => ({
    ...state, clock, clockSetting: state.clock, online, dispatch, toast, setToast, accounts, peopleOf, fleet, storeRules, sync, serverMode: SERVER_MODE,
    t: (key) => translate(state.lang, key),
    tf: (key, vars) => phrase(state.lang, key, vars),
    fd: (iso) => localDate(state.lang, iso),
  }), [state, clock, online, toast, accounts, fleet, sync?.live, sync?.waiting]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
