import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, CloudOff, ExternalLink, LayoutDashboard, Package, RotateCcw, Store, Thermometer, Truck, WifiOff } from "lucide-react";
import { useApp, storeUpdateText } from "../state";
import { orders, reeferDown, round1 } from "../data/model";
import { storeName } from "../data/accounts";
import { formatDate, nextOperatingDay } from "../components/ui";

/* Bad days portal: pick a bad day, then run it step by step. Every button here does the real thing
   (the same actions the loader, dispatcher, driver and store screens use), so each portal shows the result. */

const ROLE = {
  loader: { name: "Loader", icon: Package, color: "#ea7a12" },
  dispatcher: { name: "Dispatcher", icon: LayoutDashboard, color: "#7c3aed" },
  driver: { name: "Driver", icon: Truck, color: "#2563eb" },
  store: { name: "Store manager", icon: Store, color: "#16a34a" },
};
const base = () => `${window.location.origin}${window.location.pathname}`;
const open = (q, hash) => window.open(`${base()}?${q}#${hash}`, "_blank", "noopener");

const DAYS = {
  dock: { n: 1, title: "Short at the Dock", icon: Package, start: "03:08", people: "Loader Suresh · Dispatcher Nimal · Driver Kasun (VEH006) · Waypoint Fresh store OUT026",
    why: "Two chilled cases for a shop that was skipped yesterday are found broken before VEH006 leaves. Caught at the dock, the dispatcher can still fix it: replace the cases, or send the truck short and re-order the missing cases, and tell the store before it opens." },
  reefer: { n: 2, title: "Reefer Down", icon: Thermometer, start: "03:25", people: "Driver Ruwan (VEH003) · Dispatcher Nimal · Loader Suresh · Waypoint Fresh stores",
    why: "VEH003's cooling fails at the gate, loaded with chilled orders for shops skipped yesterday. The re-plan must keep the promise that nobody is skipped twice, and every store must know its new time." },
  dead: { n: 3, title: "Dead Zone", icon: WifiOff, start: "06:55", people: "Driver on VEH010 · Waypoint Fresh store OUT074 · Dispatcher Nimal",
    why: "Coverage drops on the Puttalam road. The driver's proof of delivery must survive with no signal, or a store's “not delivered” becomes one word against another." },
};

/* ---------------- Short at the Dock ---------------- */
function dockFlow(s, run) {
  const r = s.loaderReports.find((x) => x.vehicle === "VEH006" && x.outlet === "OUT026");
  const o = orders.find((x) => x.ref === "S1-028");
  const adj = s.adjusted["S1-028"];
  const informed = s.smsSent.find((m) => m.to === "OUT026" && m.tag === "dock");
  const loadedT = s.loadedTrucks["VEH006:1"];
  const newOrder = s.storeOrders.find((x) => x.replaces === "S1-028");
  const store = storeName.OUT026;
  const steps = [
    { role: "loader", title: "Loader finds broken cases", done: !!r,
      text: r ? `Suresh reported ${r.what} for OUT026 (order S1-028) at ${r.at}, with a photo. VEH006 waits for a decision.` : "Suresh is loading VEH006 (run 1, leaves 03:30). He finds 2 broken chilled cases for OUT026 before the truck leaves.",
      actions: !r && [{ label: "Report 2 broken cases for OUT026", primary: true, go: () => run({ type: "loaderReport", report: { vehicle: "VEH006", run: 1, outlet: "OUT026", ref: "S1-028", count: 2, kind: "broken", chilled: true, units: 170, what: "2 chilled cases broken", by: "Suresh", photo: true } }, { type: "log", who: "Suresh", role: "Loader · Peliyagoda depot", what: "Reported 2 broken chilled cases for OUT026 on VEH006" }) }] },
    { role: "dispatcher", title: "Dispatcher is alerted and decides", done: !!r?.decision, locked: !r,
      alert: r && !r.decision && `Short at the Dock · VEH006 · OUT026 · ${r.what} · reported ${r.at} by Suresh`,
      text: r?.decision === "replace" ? "Nimal chose to replace the 2 cases from the cold room. VEH006 has 102 minutes of spare time, so every stop stays on time."
        : r?.decision === "short" ? "Nimal chose to send VEH006 with 168 cases and re-order the 2 missing cases for the next run."
        : "The alert appears on the dispatcher's Live board. The app works out VEH006's spare time before a stop would be late.",
      actions: r && !r.decision && [
        { label: "A · Replace from the cold room", primary: true, note: "VEH006 waits up to 15 min · all stops still on time · store gets the full order", go: () => run({ type: "loaderDecision", id: r.id, decision: "replace", by: "Nimal", waitMin: 15 }, { type: "log", who: "Nimal", role: "Dispatcher · Peliyagoda", what: "Short at the Dock VEH006 · OUT026: replace 2 cases from the cold room" }) },
        { label: "B · Send 168 now, re-order the 2", note: "Truck leaves on time · old order reduced · new order for the next run", go: () => run({ type: "loaderDecision", id: r.id, decision: "short", by: "Nimal" }) },
      ] },
  ];
  if (r?.decision === "replace") {
    steps.push({ role: "loader", title: "Loader replaces the 2 cases", done: !!r.acked,
      text: r.acked ? `Suresh fetched 2 chilled cases from the cold room and ticked them at ${r.acked}. The order is full again.` : "The decision reaches the dock. Suresh fetches 2 cases from the cold room and ticks each one.",
      actions: !r.acked && [{ label: "2 cases replaced from the cold room", primary: true, go: () => run({ type: "loaderAck", id: r.id }, { type: "log", who: "Suresh", role: "Loader · Peliyagoda depot", what: "Replaced 2 chilled cases for OUT026 on VEH006" }) }] });
  }
  if (r?.decision === "short") {
    steps.push({ role: "dispatcher", title: "Dispatcher creates the new order", done: !!adj, form: !adj && "reorder",
      text: adj ? `Old order S1-028 adjusted: ${o.units} → ${adj.units} cases. New order ${adj.newRef}: 2 chilled cases, first in line on the ${formatDate(adj.run)} run.` : "The missing cases become their own order for the next run, so nothing is forgotten. The old order is reduced to what the truck really carries." });
    steps.push({ role: "dispatcher", title: "Store is informed", done: !!informed, locked: !adj,
      text: informed ? `Sent to ${store} at ${informed.at}: “${informed.text}”` : `Tell ${store} before it opens, so staff aren't surprised.`,
      preview: adj && !informed && storeUpdateText("S1-028", o.units, adj.missing, adj.newRef, adj.run, r),
      actions: adj && !informed && [{ label: `Send update to ${store}`, primary: true, go: () => run({ type: "sms", sms: { to: "OUT026", tag: "dock", by: "Nimal", text: storeUpdateText("S1-028", o.units, adj.missing, adj.newRef, adj.run, r) } }, { type: "log", who: "Nimal", role: "Dispatcher · Peliyagoda", what: `Told ${store}: S1-028 now ${adj.units} cases, ${adj.newRef} on the next run` }) }] });
  }
  const readyToGo = r?.decision === "replace" ? !!r.acked : r?.decision === "short" ? !!informed : false;
  steps.push({ role: "loader", title: "VEH006 is loaded and leaves", done: !!loadedT, locked: !readyToGo,
    text: loadedT ? `Loaded by ${loadedT.by} at ${loadedT.at}. Kasun's trip list shows ${adj ? `${adj.units} cases for OUT026 (2 re-ordered)` : "the full 170 cases for OUT026"}.` : "Once the decision is done, the loader marks the truck loaded and the driver can go.",
    actions: readyToGo && !loadedT && [{ label: "Mark VEH006 loaded", primary: true, go: () => run({ type: "truckLoaded", vehicle: "VEH006", run: 1, by: "Suresh" }, { type: "log", who: "Suresh", role: "Loader · Peliyagoda depot", what: "Loaded VEH006 for run 1" }) }] });
  steps.push({ role: "store", title: "What the store sees", done: !!loadedT, locked: !loadedT,
    text: adj ? `${store} sees order S1-028 as ${adj.units} of ${o.units} cases today, and new order ${adj.newRef} (2 cases) first on ${formatDate(adj.run)}, with the reason. Both appear in My orders.` : `${store} gets its full order of ${o.units} chilled cases. Nothing to tell them: the problem was fixed at the dock.` });
  const views = {
    loader: !r ? "Loading VEH006 · 0 problems" : !r.decision ? "⚠ Waiting for the dispatcher" : r.decision === "replace" ? (r.acked ? "2 cases replaced ✓" : "Replace 2 cases from the cold room") : `Send 168 · 2 re-ordered as ${adj?.newRef || "a new order"}`,
    dispatcher: !r ? "No alerts" : !r.decision ? "⚠ Short at the Dock alert on the Live board" : r.decision === "replace" ? "Decided: replace" : newOrder ? `Next-run queue: ${newOrder.ref} (2 cases) · S1-028 → ${adj.units}` : "Decided: send short · create the new order",
    driver: loadedT ? `VEH006 loaded by ${loadedT.by} · OUT026 ${adj ? adj.units : 170} cases` : "Not loaded yet",
    store: informed ? "Told: 168 today, 2 on the next run" : r?.acked ? "Full order (170) · nothing to tell" : "Order S1-028 · 170 chilled cases planned",
  };
  const links = { loader: ["as=loader&lang=en", "/loader/load/VEH006"], dispatcher: ["as=dispatcher", r && !r.decision ? `/dispatch/incident/loader/${r.id}` : newOrder ? "/dispatch" : "/dispatch/live"], driver: ["as=driver&lang=en&account=WP-DRV-006", "/driver"], store: ["as=store&store=OUT026", newOrder ? "/store/orders" : "/store"] };
  return { steps, views, links };
}

/* The form in "Dispatcher creates the new order": cases and run, prefilled from the loader's report. */
function ReorderForm({ run }) {
  const { loaderReports, clock } = useApp();
  const r = loaderReports.find((x) => x.vehicle === "VEH006" && x.outlet === "OUT026");
  const [count, setCount] = useState(r?.count || 2);
  if (!r) return null;
  const nextRun = nextOperatingDay(clock.date);
  return (
    <div className="card flat" style={{ marginTop: 10 }}>
      <b className="small">New order for {storeName.OUT026}</b>
      <div className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><span className="muted">Replaces part of</span><b>S1-028 (170 chilled cases)</b></div>
      <div className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
        <span className="muted">Chilled cases</span>
        <span className="row" style={{ gap: 6 }}><button className="order-chip" onClick={() => setCount(Math.max(1, count - 1))} aria-label="Fewer">−</button><b className="num">{count}</b><button className="order-chip" onClick={() => setCount(Math.min(r.units, count + 1))} aria-label="More">+</button></span>
      </div>
      <div className="row between small" style={{ padding: "8px 0" }}><span className="muted">Run</span><b>{formatDate(nextRun)} · first in line</b></div>
      <button className="btn primary block" style={{ marginTop: 6 }} onClick={() => run({ type: "shortReorder", id: r.id, by: "Nimal", count })}>Create the order and adjust S1-028</button>
    </div>
  );
}

/* ---------------- Reefer Down ---------------- */
function reeferFlow(s, run) {
  const st = s.scenario.reefer;
  const rd = reeferDown();
  const told = s.smsSent.some((m) => m.tag === "reefer");
  const moved = !!s.scenario.reeferMoved;
  const stores = [...new Set(rd.moves.map((m) => m.order.outlet))];
  const steps = [
    { role: "driver", title: "Driver reports: cooling failed", done: st !== "idle",
      text: st !== "idle" ? "Ruwan reported the cooling failure at the gate with one tap. Doors stay closed." : "At 03:25 VEH003's cooling fails at the gate. It carries chilled orders for shops skipped yesterday.",
      actions: st === "idle" && [{ label: "Ruwan reports: cooling failed", primary: true, go: () => run({ type: "scenario", patch: { reefer: "reported" } }, { type: "log", who: "Ruwan", role: "Driver · VEH003", what: "Reported cooling failure at the gate" }) }] },
    { role: "dispatcher", title: "Dispatcher approves the re-plan", done: st === "approved", locked: st === "idle",
      alert: st === "reported" && "Reefer Down · VEH003 cooling failed at the gate · chilled orders on board",
      text: `The app re-plans without VEH003: ${rd.served} of ${orders.length} still served (was ${rd.before}). Every shop skipped yesterday is still served; the ${rd.newlyDeferred.length} orders that now wait were all served yesterday.`,
      actions: st === "reported" && [{ label: "Approve re-plan & notify everyone", primary: true, go: () => run({ type: "scenario", patch: { reefer: "approved" } },
        ...stores.map((out) => ({ type: "sms", sms: { to: out, tag: "reefer", by: "Nimal", text: `Waypoint: your chilled order moved to truck ${rd.moves.find((m) => m.order.outlet === out)?.to || "another truck"} because of a refrigeration failure. Still inside your window.` } })),
        { type: "log", who: "Nimal", role: "Dispatcher · Peliyagoda", what: `Reefer Down: approved re-plan without VEH003 · ${rd.served} of ${orders.length} served` }) }] },
    { role: "loader", title: "Loader moves the crates", done: moved, locked: st !== "approved",
      text: moved ? "All crates moved to the working reefers and ticked off." : `The move list reaches the dock: ${rd.moves.map((m) => `${m.order.outlet} → ${m.to || "waits"}`).join(", ")}.`,
      actions: st === "approved" && !moved && [{ label: "All crates moved", primary: true, go: () => run({ type: "scenario", patch: { reeferMoved: true } }, { type: "log", who: "Suresh", role: "Loader · Peliyagoda depot", what: "Moved VEH003's crates to the re-planned trucks" }) }] },
    { role: "store", title: "Stores see their new truck and time", done: moved && told, locked: !told,
      text: told ? `${stores.length} store${stores.length > 1 ? "s were" : " was"} told by SMS and in the app: new truck, new arrival time, still inside the window.` : "Stores are told as soon as the re-plan is approved." },
  ];
  const views = {
    driver: st === "idle" ? "VEH003 · Trip 1 · ready to leave" : st === "reported" ? "Cooling reported · waiting for dispatcher" : "Trip moved to other trucks · return VEH003 to the workshop",
    dispatcher: st === "reported" ? "⚠ Reefer Down alert" : st === "approved" ? "Re-plan approved" : "No alerts",
    loader: st === "approved" ? (moved ? "Crates moved ✓" : "⚠ Move these crates") : "Normal loading",
    store: told ? "Chilled order on a new truck · new time shown" : "Planned as before",
  };
  const links = { driver: ["as=driver&lang=en", st === "idle" ? "/driver/problem" : "/driver"], dispatcher: ["as=dispatcher", st === "reported" ? "/dispatch/incident/reefer" : "/dispatch/live"], loader: ["as=loader&lang=en", st === "approved" ? "/loader/move" : "/loader"], store: ["as=store&store=OUT034", "/store"] };
  return { steps, views, links };
}

/* ---------------- Dead Zone ---------------- */
function deadFlow(s, run) {
  const key = "VEH010:OUT074";
  const d = s.delivered[key];
  const offline = s.simOffline;
  const complaint = s.storeReports.find((r) => r.outlet === "OUT074" && r.kind === "notArrived");
  const texted = s.smsSent.some((m) => m.tag === "dead");
  const synced = d?.synced;
  const closed = !!s.scenario.deadClosed;
  const steps = [
    { role: "driver", title: "Signal drops on the Puttalam road", done: offline || !!d,
      text: "VEH010 enters a known dead zone. The app keeps working: the trip list and delivery screens are on the phone.",
      actions: !offline && !d && [{ label: "VEH010 loses signal", primary: true, go: () => run({ type: "offline", value: true, vehicle: "VEH010" }) }] },
    { role: "driver", title: "Driver records the delivery offline", done: !!d, locked: !offline,
      text: d ? `Delivered to OUT074 at ${d.at}: photo, signature, received by ${d.receivedBy}. Saved on the phone, waiting for signal.` : "The driver hands over at OUT074 and records it with a photo and signature, with no signal.",
      actions: offline && !d && [{ label: "Record delivery with photo and signature", primary: true, go: () => run({ type: "delivered_offline" }) }] },
    { role: "store", title: "Store says “not delivered”", done: !!complaint, locked: !d,
      text: complaint ? `At ${complaint.at} the store reported: “our dry order hasn't arrived”. The driver's record hasn't reached the office yet.` : "The office has no record yet, so the store thinks the order hasn't come.",
      actions: d && !complaint && [{ label: "Store reports “not arrived”", primary: true, go: () => run({ type: "scenario", patch: { dead: "complaint" } }, { type: "storeReport", report: { outlet: "OUT074", name: storeName.OUT074, ref: "S1-082", vehicle: "VEH010", kind: "notArrived", what: "S1-082 not arrived", by: "Store manager" } }) }] },
    { role: "dispatcher", title: "Dispatcher sees VEH010 offline, not lost", done: texted, locked: !complaint,
      alert: complaint && !synced && "VEH010 · offline in a known dead zone · store OUT074 reports “not arrived”",
      text: texted ? "Nimal sent an SMS: “please call when you have signal”. No guessing, no blame." : "The Live board marks VEH010 offline in a known dead zone, with its last known stop.",
      actions: complaint && !texted && [{ label: "Send SMS to VEH010's driver", primary: true, go: () => run({ type: "sms", sms: { to: "VEH010", tag: "dead", by: "Nimal", text: "Dispatcher: please call when you have signal. OUT074 says the dry order has not arrived." } }) }] },
    { role: "driver", title: "Signal returns: the proof syncs", done: !!synced, locked: !texted,
      text: synced ? "The delivery record reached the office on its own: delivered 07:02, photo and signature." : "When the truck reaches coverage, the saved record is sent automatically. No retyping.",
      actions: texted && !synced && [{ label: "Signal returns", primary: true, go: () => run({ type: "offline", value: false }, { type: "sync" }, { type: "scenario", patch: { dead: "synced" } }) }] },
    { role: "store", title: "Store sees the proof and closes the report", done: closed, locked: !synced,
      text: closed ? "The store found the delivery at the back dock and closed the report." : "The store now sees “Delivered 07:02 · photo + signature”.",
      actions: synced && !closed && [{ label: "Store closes the report", primary: true, go: () => run({ type: "scenario", patch: { deadClosed: true } }, { type: "storeReportDecision", id: complaint?.id, decision: "closed", by: "Store manager" }) }] },
  ];
  const views = {
    driver: !offline && !d ? "On the way · online" : !synced ? `Offline · ${d ? "1 record waiting to send" : "working offline"}` : "Online · all records sent",
    store: closed ? "Report closed ✓" : synced ? "Delivered 07:02 · photo + signature" : complaint ? "⚠ Reported “not arrived”" : "Arriving about 06:58",
    dispatcher: synced ? "Proof received" : complaint ? "⚠ VEH010 offline · store complaint" : offline ? "VEH010 offline (known dead zone)" : "VEH010 on the way",
  };
  const links = { driver: ["as=driver&lang=en&account=WP-DRV-010", "/driver"], store: ["as=store&store=OUT074", "/store/dispute"], dispatcher: ["as=dispatcher", "/dispatch/live"] };
  return { steps, views, links };
}

const FLOWS = { dock: dockFlow, reefer: reeferFlow, dead: deadFlow };

/* ---------------- Screens ---------------- */
export function BadDaysHome() {
  const nav = useNavigate();
  return (
    <div className="bd-page">
      <header className="bd-top">
        <Link to="/" className="bd-back"><ArrowLeft size={18} /> Waypoint One</Link>
        <div><h1>Bad days</h1><p>Pick a bad day and run it. Every decision here really happens: the loader, dispatcher, driver and store screens all change.</p></div>
      </header>
      <div className="bd-grid">
        {Object.entries(DAYS).map(([id, d]) => (
          <button key={id} className="bd-card" onClick={() => nav(`/bad-days/${id}`)}>
            <span className="bd-ic"><d.icon size={24} /></span>
            <span className="muted small" style={{ fontWeight: 800 }}>BAD DAY {d.n}</span>
            <b>{d.title}</b>
            <span className="small">{d.why}</span>
            <span className="muted xs">{d.people}</span>
            <span className="bd-go">Open the panel <ChevronRight size={16} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BadDayPanel() {
  const { id } = useParams();
  const state = useApp();
  const { dispatch, clock, setToast } = state;
  const day = DAYS[id];
  // Run one or more real actions (the same ones the role screens use).
  // Every step here plays one role in the story, so it is sent as a demo command (the portal is a demo tool).
  const run = (...acts) => acts.forEach((a) => {
    if (a.type === "delivered_offline") { dispatch({ type: "arrive", vehicle: "VEH010", outlet: "OUT074", __demo: true }); dispatch({ type: "deliver", vehicle: "VEH010", outlet: "OUT074", open: "05:30", outcome: "all", online: false, receivedBy: "Night staff", __demo: true }); return; }
    dispatch({ ...a, __demo: true });
  });
  // First visit to a panel: start the story at its start time.
  useEffect(() => { if (day && clock.date !== "2026-01-08") dispatch({ type: "badReset", id, time: day.start }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!day) return <BadDaysHome />;
  const { steps, views, links } = FLOWS[id](state, run);
  const current = steps.findIndex((s) => !s.done);
  const finished = current === -1;
  const reset = () => { dispatch({ type: "badReset", id, time: day.start }); setToast({ text: `${day.title} reset to the start` }); };
  return (
    <div className="bd-page">
      <header className="bd-top">
        <Link to="/bad-days" className="bd-back"><ArrowLeft size={18} /> All bad days</Link>
        <div className="grow">
          <div className="muted small" style={{ fontWeight: 800 }}>BAD DAY {day.n} · Thu 8 Jan · {clock.time}</div>
          <h1 style={{ margin: "2px 0 4px" }}>{day.title}</h1>
          <p style={{ margin: 0 }}>{day.why}</p>
        </div>
        <button className="btn secondary" onClick={reset}><RotateCcw size={16} /> Start again</button>
      </header>
      <div className="bd-panel">
        <ol className="bd-flow" aria-label="What happens, step by step">
          {steps.map((s, i) => {
            const R = ROLE[s.role];
            const state_ = s.done ? "done" : i === current ? "now" : "later";
            return (
              <li key={i} className={`bd-step ${state_}`}>
                <span className="bd-dot">{s.done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                <div className="bd-body">
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span className="bd-role" style={{ background: R.color }}><R.icon size={13} /> {R.name}</span>
                    <b>{s.title}</b>
                    {state_ === "now" && <span className="tag warn">Now</span>}
                  </div>
                  {s.alert && <div className="banner problem" style={{ marginTop: 8 }}><AlertTriangle size={18} /> {s.alert}</div>}
                  {(state_ !== "later" || s.done) && <p className="small" style={{ margin: "6px 0 0" }}>{s.text}</p>}
                  {state_ === "later" && <p className="small muted" style={{ margin: "6px 0 0" }}>{s.locked ? "Waits for the step before." : s.text}</p>}
                  {state_ === "now" && s.preview && <div className="card flat small" style={{ marginTop: 8 }}><b>Message preview</b><div className="muted" style={{ marginTop: 4 }}>{s.preview}</div></div>}
                  {state_ === "now" && s.form === "reorder" && <ReorderForm run={run} />}
                  {state_ === "now" && s.actions && (
                    <div className="col" style={{ gap: 8, marginTop: 10 }}>
                      {s.actions.map((a) => (
                        <button key={a.label} className={`btn ${a.primary ? "primary" : "secondary"} block bd-act`} onClick={a.go}>
                          <span>{a.label}</span>{a.note && <small>{a.note}</small>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {finished && <li className="bd-step done"><span className="bd-dot"><Check size={14} strokeWidth={3} /></span><div className="bd-body"><b>Done.</b> <span className="small">Every portal now shows the result. Open any screen on the right, or start again.</span></div></li>}
        </ol>
        <aside className="bd-side">
          <div className="card-title" style={{ marginBottom: 8 }}>What each portal shows now</div>
          {Object.entries(views).map(([role, text]) => {
            const R = ROLE[role];
            const [q, hash] = links[role];
            return (
              <div key={role} className="bd-view">
                <span className="bd-role" style={{ background: R.color }}><R.icon size={13} /> {R.name}</span>
                <div className="small" style={{ margin: "6px 0 8px", fontWeight: 650 }}>{text}</div>
                <button className="link small" onClick={() => open(q, hash)}>Open the {R.name.toLowerCase()} screen <ExternalLink size={13} /></button>
              </div>
            );
          })}
          {state.simOffline && <div className="banner offline"><CloudOff size={18} /> Signal is off for the driver in this story.</div>}
          <div className="muted xs">Screens open in a new tab and update live as you go.</div>
        </aside>
      </div>
    </div>
  );
}
