/* Server mode: the same `state` and `dispatch` the screens use, backed by the Waypoint One server.

   view = confirmed server state, plus this device's commands that the server has not confirmed yet (applied
   optimistically with the same reducer), plus this device's own fields (who is signed in, language, view).

   - A command is shown at once, saved in this device's outbox and sent in order. The server's answer or the live
     stream confirms it; a refused command drops out of the view again (with a message).
   - With no signal (really offline, or the driver in a dead zone) the outbox simply waits and is sent when the
     signal returns. Every command has an id made here, so a batch sent twice is still applied once.
   - Everyone else's commands arrive on the live stream and are applied to the confirmed state. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initial, reducer, sharedOf, applyAt, LOCAL_KEYS, LOCAL_ACTIONS, USERS } from "./domain/store";
import { api, confirmedCache, openEvents, outbox, session, uuid } from "./sync";

const pick = (s, keys) => Object.fromEntries(keys.map((k) => [k, s[k]]));
const LOCAL_KEY = "waypoint-one-state-v9"; // the same key the app's load() reads


export function useServerState(load, notify) {
  const [boot] = useState(() => {
    const s = load();
    // Signed in on this device only counts with a valid server session for that same account.
    const sess = session.get();
    const user = s.user && sess?.userId === s.user.id ? s.user : null;
    return { local: { ...pick(s, LOCAL_KEYS), user, person: user ? s.person : null } };
  });
  const [local, setLocal] = useState(boot.local);
  const [conf, setConf] = useState(() => confirmedCache.load() || { seq: -1, state: sharedOf(initial) });
  const [pending, setPending] = useState(() => outbox.load());
  const [auth, setAuth] = useState(() => session.get()); // { token, userId }
  const [live, setLive] = useState(false);
  const [retry, setRetry] = useState(0);
  const confRef = useRef(conf); confRef.current = conf;
  const sending = useRef(false);

  useEffect(() => { outbox.save(pending); }, [pending]);
  // This device's own fields (who is signed in, language, view) survive a reload; the day itself comes from the server.
  useEffect(() => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); } catch { /* storage blocked */ } }, [local]);
  useEffect(() => { if (conf.seq >= 0) confirmedCache.save(conf); }, [conf]);

  const view = useMemo(() => {
    let s = { ...initial, ...conf.state, ...local };
    for (const p of pending) s = applyAt(s, p.action);
    return { ...s, ...local };
  }, [conf, pending, local]);

  // This device has signal unless the browser is offline, or it is the driver in a (simulated) dead zone.
  const [net, setNet] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => { setNet(true); setRetry((n) => n + 1); }, off = () => setNet(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const online = net && !(view.simOffline && view.user?.role === "driver" && (!view.offlineVeh || view.user.vehicle === view.offlineVeh));

  // The token to read and send with: the signed-in person's.
  const readToken = auth?.token && auth.userId === local.user?.id ? auth.token : null;

  const refetch = useCallback(async () => {
    try {
      if (!readToken) return;
      const r = await api.state(readToken);
      setConf({ seq: r.seq, state: r.state });
    } catch { /* offline: keep what we have */ }
  }, [readToken]);

  // Live stream of everyone's changes.
  useEffect(() => {
    let close = () => {}, stop = false;
    (async () => {
      const tok = readToken;
      if (!tok || stop) return;
      await refetch();
      close = openEvents(tok, (m) => {
        if (m.kind === "hello") { if (m.seq !== confRef.current.seq) refetch(); return; }
        if (m.kind === "reset") { setPending([]); refetch(); return; }
        if (m.kind === "command") {
          const c = confRef.current;
          if (c.seq + 1 !== m.seq) { refetch(); }
          else { const next = { seq: m.seq, state: sharedOf(applyAt(c.state, m.action)) }; confRef.current = next; setConf(next); }
          setPending((p) => p.filter((x) => x.id !== m.id));
        }
      }, setLive);
    })();
    return () => { stop = true; close(); };
  }, [readToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send the outbox, oldest first, whenever there is signal.
  useEffect(() => {
    if (!pending.length || sending.current || !online) return;
    if (!readToken) return; // wait for this person's session
    const batch = pending.slice(0, 50);
    sending.current = true;
    (async () => {
      try {
        const r = await api.commands(readToken, batch.map(({ id, action, person, clientTime }) => ({ id, action, person, clientTime })));
        const done = new Set(r.results.map((x) => x.id));
        const rejected = r.results.filter((x) => x.status === "rejected");
        if (rejected.length) notify?.(`Not saved: ${rejected[0].error}`);
        setPending((p) => p.filter((x) => !done.has(x.id)));
        if (r.results.some((x) => x.status === "duplicate") || r.seq !== confRef.current.seq) setTimeout(() => refetch(), 400);
      } catch (e) {
        if (e.status === 401) { session.clear(); setAuth(null); }
        setTimeout(() => setRetry((n) => n + 1), e.status === 0 ? 4000 : 1500);
      } finally {
        sending.current = false;
      }
    })();
  }, [pending, online, readToken, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = useCallback((a) => {
    const now = new Date().toISOString();
    if (LOCAL_ACTIONS.has(a.type)) {
      if (a.type === "login" && a.token) { const s = { token: a.token, userId: a.user.id }; session.set(s); setAuth(s); }
      if (a.type === "logout") { session.clear(); setAuth(null); }
      setLocal((l) => {
        const next = reducer({ ...view, ...l }, a);
        return pick(next, LOCAL_KEYS);
      });
      // The live board follows a driver's real records once they sign in.
      if (a.type === "login") {
        const role = a.user?.role || a.role;
        const vehicle = a.user?.vehicle || (role === "driver" ? USERS.driver.vehicle : null);
        if (role === "driver" && vehicle && a.token) setPending((p) => [...p, { id: uuid(), action: { type: "driverSignedIn", vehicle, at: Date.now() }, clientTime: now }]);
      }
      return;
    }
    const action = { ...a, at: Date.now() }; // the server replaces this with its own time when it records it
    setLocal((l) => pick(applyAt({ ...view, ...l }, action), LOCAL_KEYS));
    setPending((p) => [...(action.type === "reset" ? [] : p), { id: uuid(), action, person: view.person, clientTime: now }]);
  }, [view]);

  const syncInfo = { live, waiting: pending.length, seq: conf.seq, online };
  return [view, dispatch, syncInfo];
}
