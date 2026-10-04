import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { autoPlan } from "../domain/autoPlan";
import {
  AlertTriangle, ArrowRight, Info, Map as MapIcon, Ban, CalendarRange, Check, CloudOff, Gauge, LayoutDashboard, ListChecks, Lock, MessageSquare, Radio,
  RotateCw, Search, ShieldCheck, Snowflake, Truck, Zap, Timer, Refrigerator, Split, History, UserRound, X, Store,
} from "lucide-react";
import { useApp } from "../state";
import { outletsAll } from "../data/accounts";
import LiveMap from "../components/LiveMap";
import {
  MAX_TRUCK_M3, REEFER_TRIPS, vehicles, brandCounts, byRef, chilledM3, districts, liveStatus, n, orders, outlook, plan, protectedCount,
  reeferDown, round1, runsOf, workshopReefers, buildPlan, checkMove, moveOptions, tripOf,
} from "../data/model";
import { BrandChip, Chip, DayPill, DeskShell, DepotPill, formatDate, useClock, useRuns } from "../components/ui";

export function useDispatchNav() {
  const { scenario, depot } = useApp();
  const peak = depot === "Peliyagoda"; // S1 counts only exist for Peliyagoda
  const incidents = ["dock", "reefer"].filter((k) => scenario[k] === "reported").length + (scenario.dead === "complaint" ? 1 : 0);
  return [
    { to: "/dispatch", label: "Orders", icon: ListChecks, count: peak ? orders.length : null },
    { to: "/dispatch/plan", label: "Plan", icon: LayoutDashboard },
    { to: "/dispatch/deferrals", label: "Deferrals", icon: RotateCw, count: peak ? plan.deferred.length : null },
    { to: "/dispatch/live", label: "Live", icon: Radio, count: incidents || null },
    { to: "/dispatch/fleet", label: "Fleet today", icon: Truck },
    { to: "/dispatch/outlook", label: "Outlook", icon: CalendarRange },
    { to: "/dispatch/log", label: "Dispatcher log", icon: History },
  ];
}

const Flags = ({ o }) => (
  <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
    {o.deferredYesterday && <span className="tag shield"><ShieldCheck size={12} /> Skipped yesterday{o.daysSince >= 3 ? ` · last delivery ${o.daysSince} days ago` : ""}</span>}
    {o.parking === "van_only" && <span className="tag brinjal">Van only</span>}
    {o.mall && <span className="tag">Mall {o.mall}</span>}
    {o.m3 > MAX_TRUCK_M3 && <span className="tag bad"><AlertTriangle size={12} /> Oversize</span>}
  </span>
);

/* Today's limit per vehicle kind: ready vehicles and trips (2 per ready vehicle). */
const KINDS = [
  { key: "Rtruck", label: "Reefer truck", reefer: true, type: "truck" },
  { key: "Rvan", label: "Reefer van", reefer: true, type: "van" },
  { key: "Dtruck", label: "Dry truck", reefer: false, type: "truck" },
  { key: "Dvan", label: "Dry van", reefer: false, type: "van" },
];
function useLimits() {
  const unavailable = useUnavailable();
  return KINDS.map((k) => {
    const all = Object.values(vehicles).filter((v) => v.reefer === k.reefer && v.type === k.type);
    const ready = all.filter((v) => !unavailable.has(v.id));
    const tripsUsed = ready.reduce((s, v) => s + (plan.lanes.find((l) => l.vehicle.id === v.id)?.runs.length || 0), 0);
    return { ...k, total: all.length, ready: ready.length, trips: ready.length * 2, tripsUsed };
  });
}

function Kpis() {
  const over = orders.filter((o) => o.m3 > MAX_TRUCK_M3);
  const limits = useLimits();
  const reeferTrips = limits.filter((k) => k.reefer).reduce((s, k) => s + k.trips, 0);
  const short = REEFER_TRIPS.needed - reeferTrips;
  const cell = { padding: "5px 6px", borderTop: "1px solid var(--line)", textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const brands = [
    ["Fresh · dry", brandCounts.freshDry],
    ["Fresh · chilled ❄", brandCounts.freshChilled],
    ["Style", brandCounts.style],
    ["Tech", brandCounts.tech],
  ];
  return (
    <div className="kpis" style={{ alignItems: "start" }}>
      <div className={`kpi ${short > 0 ? "alert" : ""}`}>
        <div className="label"><Truck size={14} /> Today's limit · Peliyagoda fleet</div>
        <table className="small" style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <thead>
            <tr className="muted xs" style={{ textAlign: "right" }}>
              <th style={{ textAlign: "left", fontWeight: 600 }}>Vehicle</th><th style={{ fontWeight: 600 }}>Ready</th><th style={{ fontWeight: 600 }}>Trips used</th>
            </tr>
          </thead>
          <tbody>
            {limits.map((k) => (
              <tr key={k.key}>
                <td style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{k.reefer && <Snowflake size={12} color="var(--way)" />} {k.label}</td>
                <td style={cell}>{k.ready} / {k.total}</td>
                <td style={{ ...cell, fontWeight: k.trips && k.tripsUsed >= k.trips ? 700 : 400 }}>{k.tripsUsed} / {k.trips}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="kpi">
        <div className="label"><ListChecks size={14} /> Orders</div>
        <div className="value">{orders.length}</div>
        {brands.map(([name, count]) => (
          <div key={name} className="row between small" style={{ padding: "3px 0", borderTop: "1px solid var(--line)" }}>
            <span>{name}</span><b className="num">{count}</b>
          </div>
        ))}
      </div>
      <div className="kpi">
        <div className="label"><ShieldCheck size={14} /> Skipped yesterday</div>
        <div className="value">{protectedCount}</div>
        <div className="muted small">must not be skipped again</div>
      </div>
      <div className="kpi">
        <div className="label"><AlertTriangle size={14} /> Oversize</div>
        <div className="value">{over.length}</div>
        <div className="muted small">{over.map((o) => `${o.outlet} ${round1(o.m3)} m³`).join(", ")} &gt; largest truck {MAX_TRUCK_M3} m³</div>
      </div>
    </div>
  );
}

/* Runs follow the clock: the next run takes store orders until 4 PM, after that new orders join the following run. */
function RunStatus() {
  const { storeOrders, published, publishedBy } = useApp();
  const { clock, closed, next, following, leftText } = useRuns();
  const live = storeOrders.filter((s) => !s.cancelled); // a store can cancel before the cutoff
  const forNext = live.filter((s) => s.run === next);
  const forFollowing = live.filter((s) => s.run === following);
  const row = (s) => (
    <div key={s.ref} className="row small" style={{ padding: "6px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
      <b>{s.name}</b><span className="muted">{s.ref}</span><span className="tag">{s.dry} dry</span><span className="tag" style={{ color: "var(--way)" }}>❄ {s.cold}</span>
      <span className="tag ok"><Check size={12} /> Confirmed</span>
      <span className="muted" style={{ marginLeft: "auto" }}>{s.day !== clock.date ? `${formatDate(s.day)} ` : ""}{s.at} · {s.by}{s.changedAt ? ` · changed ${s.changedAt}` : ""}</span>
    </div>
  );
  return (
    <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="kpi">
        <div className="row between" style={{ flexWrap: "wrap", gap: 6 }}>
          <div className="label" style={{ whiteSpace: "nowrap" }}><Lock size={14} /> Today's run · {formatDate(clock.date)}</div>
          {closed ? <span className="tag"><Lock size={12} /> Orders closed 4:00 PM</span> : <span className="tag warn"><Timer size={12} /> Store orders for {formatDate(next)} close in {leftText.replace(" left", "")}</span>}
        </div>
        <div className="value" style={{ fontSize: 22 }}>{plan.served} served · {plan.deferred.length} deferred</div>
        <div className="small">{published ? <span style={{ color: "var(--done)", fontWeight: 600 }}><Check size={12} /> Plan published{publishedBy ? `${/demo/i.test(publishedBy.by) ? "" : ` by ${publishedBy.by}`} at ${publishedBy.at}` : ""}</span> : <span style={{ color: "var(--late)", fontWeight: 600 }}>Not published yet</span>}<span className="muted"> · {published ? "loaders, drivers and stores can see it" : "loaders and drivers wait until you publish"}</span></div>
      </div>
      <div className="kpi" style={{ borderColor: closed ? "var(--line)" : "#bcd3fb" }}>
        <div className="row between">
          <div className="label"><Store size={14} /> Next run · {formatDate(next)}</div>
        </div>
        <div className="value" style={{ fontSize: 22 }}>{forNext.length} store order{forNext.length === 1 ? "" : "s"} {closed ? "in the queue" : "so far"}</div>
        {forNext.length === 0 && <div className="muted small">{closed ? "No orders came in before 4:00 PM." : "Stores order in the app until 4:00 PM. Each order is confirmed to the store straight away."}</div>}
        {forNext.map(row)}
        {(closed || forFollowing.length > 0) && (
          <>
            <div className="label" style={{ marginTop: 10 }}>Following run · {formatDate(following)} · open until 4:00 PM on {formatDate(next)}</div>
            {forFollowing.length === 0 && <div className="muted small">Orders sent now go here.</div>}
            {forFollowing.map(row)}
          </>
        )}
      </div>
    </div>
  );
}

export function Orders() {
  const nav = useNavigate();
  const [f, setF] = useState("All");
  const [q, setQ] = useState("");
  const filters = ["All", "Fresh", "Style", "Tech", "Chilled", "Skipped yesterday", "Van only"];
  const { storeOrders } = useApp();
  const runs = useRuns();
  const [queue, setQueue] = useState("today");
  const nextQueue = storeOrders.filter((s) => !s.cancelled && s.run === runs.next);
  const rows = useMemo(() => orders
    .filter((o) => f === "All" || o.brand === f || (f === "Chilled" && o.chilled) || (f === "Skipped yesterday" && o.deferredYesterday) || (f === "Van only" && o.parking === "van_only"))
    .filter((o) => !q || `${o.ref} ${o.outlet} ${o.district}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.deferredYesterday) - Number(a.deferredYesterday) || b.daysSince - a.daysSince || a.ref.localeCompare(b.ref)), [f, q]);
  return (
    <DeskShell peakOnly nav={useDispatchNav()} title="Orders"
      actions={<><DepotPill /><DayPill /><button className="btn primary" onClick={() => nav("/dispatch/plan", { state: { auto: true } })}><Zap size={18} /> Auto-plan</button></>}>
      <Kpis />
      <RunStatus />
      <div className="row" style={{ gap: 8 }} role="tablist" aria-label="Order queue">
        <button role="tab" aria-selected={queue === "today"} className={`filter ${queue === "today" ? "on" : ""}`} onClick={() => setQueue("today")}>Today's run · {formatDate(runs.clock.date)} · {orders.length}</button>
        <button role="tab" aria-selected={queue === "next"} className={`filter ${queue === "next" ? "on" : ""}`} onClick={() => setQueue("next")}>Next run · {formatDate(runs.next)} · {nextQueue.length}</button>
      </div>
      {queue === "next" ? <NextQueue list={nextQueue} closed={runs.closed} /> : (
      <div className="table-card">
        <div className="head">
          {filters.map((x) => <button key={x} className={`filter ${f === x ? "on" : ""}`} onClick={() => setF(x)}>{x === "Chilled" && <Snowflake size={13} />}{x === "Skipped yesterday" && <ShieldCheck size={13} />}{x}</button>)}
          <div className="grow" />
          <div className="input-wrap" style={{ width: 220 }}><input className="input" style={{ height: 38, paddingLeft: 34, fontSize: 14 }} placeholder="Search order or shop" aria-label="Search order or shop" value={q} onChange={(e) => setQ(e.target.value)} /><Search size={16} style={{ position: "absolute", left: 11, top: 11 }} color="var(--muted)" /></div>
        </div>
        <div className="table-scroll">
          <table className="t">
            <thead><tr><th>Order</th><th>Shop</th><th>Brand</th><th>District</th><th>Temp</th><th>Cases</th><th>m³</th><th>kg</th><th>Window</th><th>Flags</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.ref}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{o.ref}</b></td><td>{o.outlet}</td><td><BrandChip brand={o.brand} /></td><td>{o.district}</td>
                  <td>{o.chilled ? <span className="tag" style={{ color: "var(--way)" }}><Snowflake size={12} /> chilled</span> : <span className="muted">dry</span>}</td>
                  <td>{n(o.units)}</td><td>{round1(o.m3)}</td><td>{n(Math.round(o.kg))}</td><td className="muted">{o.open}–{o.close}</td><td><Flags o={o} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </DeskShell>
  );
}

/* The next run's queue: store orders confirmed before 4 PM. They are planned after the cutoff (tonight). */
function NextQueue({ list, closed }) {
  return (
    <div className="table-card">
      <div className="head"><span className="muted small">{closed ? "Closed at 4:00 PM · this queue is planned tonight." : "Stores can still add, change or cancel until 4:00 PM. Planning starts after the cutoff."}</span></div>
      <div className="table-scroll">
        <table className="t">
          <thead><tr><th>Order</th><th>Shop</th><th>Brand</th><th>District</th><th>Dry</th><th>Chilled</th><th>Placed</th><th>By</th></tr></thead>
          <tbody>
            {list.map((s) => {
              const o = outletsAll.find((x) => x.id === s.outlet) || {};
              return (
                <tr key={s.ref}>
                  <td><b>{s.ref}</b>{s.replaces && <div className="xs muted">replaces part of {s.replaces}</div>}</td><td>{s.outlet}</td><td>{o.brand && <BrandChip brand={o.brand} />}</td><td>{o.district}</td><td>{s.dry || "—"}</td><td>{s.cold ? `❄ ${s.cold}` : "—"}</td>
                  <td className="muted">{formatDate(s.day)} · {s.at}{s.changedAt ? ` · changed ${s.changedAt}` : ""}</td><td>{s.by}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>No store orders for this run yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Vehicles the planner may not use today: in the workshop. (Booklet: each vehicle has a driver; driver availability
   is not a separate constraint.) */
function useUnavailable() {
  const { fleet } = useApp();
  return useMemo(() => new Set(fleet.filter((v) => v.status === "in_workshop").map((v) => v.id)), [fleet]);
}

function TripBox({ trip, vehicle, selected, onPick }) {
  const { dispatch, user, setToast } = useApp();
  const [ordering, setOrdering] = useState(false);
  if (!trip) return <div className="trip empty">No trip</div>;
  const capOk = trip.m3 <= vehicle.m3 && trip.kg <= vehicle.kg;
  const key = `${vehicle.id}:${trip.no}`;
  const move = (i, dir) => {
    const seq = trip.stops.map((s) => s.outlet);
    const j = i + dir;
    if (j < 0 || j >= seq.length) return;
    [seq[i], seq[j]] = [seq[j], seq[i]];
    dispatch({ type: "stopOrder", key, order: seq });
    dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `Changed stop order on ${vehicle.id} run ${trip.run}: ${seq.join(" → ")}` });
  };
  return (
    <div className="trip" style={trip.late.length ? { borderColor: "var(--problem)", background: "#fff6f6" } : {}}>
      <div className="t" style={{ flexWrap: "wrap" }}>
        <span className="tag brinjal">Run {trip.run} · {trip.start}–{trip.end}</span>
        <BrandChip brand={trip.brand} small /> {trip.district} {trip.chilled && <Snowflake size={14} color="var(--way)" />}
        {trip.fixedOrder && <span className="tag">order set by hand</span>}
      </div>
      <div className="stops" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {trip.stops.map((s, i) => (
          <div key={s.outlet} className="row" style={{ gap: 6 }}>
            <span className="muted xs num" style={{ width: 16 }}>{i + 1}</span>
            {s.orders.map((o) => (
              <button key={o.ref} className={`order-chip ${selected === o.ref ? "on" : ""}`} onClick={() => onPick(o.ref)} title={`${o.ref} · ${o.chilled ? "chilled" : "dry"} · ${round1(o.m3)} m³ · click to move`}>
                {o.outlet}{o.chilled && " ❄"}{o.deferredYesterday && " 🛡"}
              </button>
            ))}
            <span className={`small num ${s.lateBy > 0 ? "" : "muted"}`} style={s.lateBy > 0 ? { color: "var(--problem)", fontWeight: 700 } : {}}>
              {s.eta}{s.lateBy > 0 ? ` · ${s.lateBy} min after ${s.close}` : s.slack < 15 ? ` · ${s.slack} min to spare` : ""}
            </span>
            {ordering && (
              <span className="row" style={{ gap: 2, marginLeft: "auto" }}>
                <button className="order-chip" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Earlier">↑</button>
                <button className="order-chip" disabled={i === trip.stops.length - 1} onClick={() => move(i, 1)} aria-label="Later">↓</button>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        <span className={`tag ${capOk ? "ok" : "bad"}`}>{round1(trip.m3)} / {vehicle.m3} m³</span>
        <span className={`tag ${capOk ? "ok" : "bad"}`}>{n(Math.round(trip.kg))} / {n(vehicle.kg)} kg</span>
        {trip.chilled && <span className="tag ok">Reefer ✓</span>}
        {trip.late.length > 0 && <span className="tag bad"><AlertTriangle size={12} /> {trip.late.length} late</span>}
        {trip.stops.length > 1 && (
          <button className="link" style={{ padding: 0, marginLeft: "auto", fontSize: 12.5 }} onClick={() => { setOrdering(!ordering); if (ordering) setToast({ text: "Stop order saved · loader and driver lists follow it" }); }}>
            {ordering ? "Done" : "Change stop order"}
          </button>
        )}
      </div>
    </div>
  );
}

/* Move, serve or defer one order, with every rule checked in plain words. */
function MovePanel({ refId, onClose }) {
  const { dispatch, user, setToast } = useApp();
  const unavailable = useUnavailable();
  const o = byRef[refId];
  // The board shows runs in the order the truck drives them, so name trips by run number here too.
  const runLabel = (vehicle, trip) => { const r = tripOf(plan, vehicle, trip)?.run; return r ? `run ${r}` : "(new run)"; };
  const cur = plan.alloc[refId];
  const [reason, setReason] = useState("");
  const [showAll, setShowAll] = useState(false);
  const opts = moveOptions(plan, o, unavailable);
  // An idle truck has two identical empty trips: offer it once.
  const valid = opts.filter((x, i) => x.ok && (x.tripInfo || !opts.some((y, j) => j < i && y.ok && !y.tripInfo && y.vehicle.id === x.vehicle.id)));
  // Near misses: same brand and district, or the right kind of vehicle, so the "why not" is useful.
  const sameArea = opts.filter((x) => !x.ok && x.tripInfo && x.tripInfo.brand === o.brand && x.tripInfo.district === o.district);
  // If no truck goes to this area at all, explain using the vehicles that could carry this kind of order.
  const near = (sameArea.length ? sameArea : opts.filter((x) => !x.ok && (!o.chilled || x.vehicle.reefer) && (o.parking !== "van_only" || x.vehicle.type === "van"))).slice(0, 4);
  // Swaps for a deferred order: make room by deferring an unprotected order on a matching trip.
  const swaps = useMemo(() => {
    if (cur) return [];
    const res = [];
    plan.lanes.forEach((l) => l.trips.forEach((t) => {
      if (!t || t.brand !== o.brand || t.district !== o.district) return;
      t.orders.filter((s) => !s.deferredYesterday).forEach((s) => {
        const trial = buildPlan("fair", [...plan.__edits || [], { ref: s.ref, to: null }], plan.stopOrders);
        const r = checkMove(trial, o, l.vehicle.id, t.no, unavailable);
        if (r.ok) res.push({ out: s, vehicle: l.vehicle.id, trip: t.no });
      });
    }));
    return res.slice(0, 4);
  }, [refId, cur, unavailable]);

  // Switch: exchange places with an order on another trip, when both still pass every rule afterwards.
  const switches = useMemo(() => {
    if (!cur) return [];
    const base = plan.__edits || [];
    const mine = tripOf(plan, cur.vehicle, cur.trip);
    const res = [];
    for (const l of plan.lanes) for (const t of l.trips) {
      if (!t || (l.vehicle.id === cur.vehicle && t.no === cur.trip)) continue;
      for (const s of t.orders) {
        if (res.length >= 6) return res;
        if (s.outlet === o.outlet) continue; // same shop: nothing to gain
        if (t.orders.length > 1 && (t.brand !== o.brand || t.district !== o.district)) continue;
        if (mine.orders.length > 1 && (mine.brand !== s.brand || mine.district !== s.district)) continue;
        const to = { vehicle: l.vehicle.id, trip: t.no };
        const a = buildPlan("fair", [...base, { ref: s.ref, to: cur }, { ref: o.ref, to: null }], plan.stopOrders);
        if (!checkMove(a, o, to.vehicle, to.trip, unavailable).ok) continue;
        const b = buildPlan("fair", [...base, { ref: o.ref, to }, { ref: s.ref, to: null }], plan.stopOrders);
        if (checkMove(b, s, cur.vehicle, cur.trip, unavailable).ok) res.push({ other: s, to });
      }
    }
    return res;
  }, [refId, cur, unavailable]);


  // Oversize: no vehicle that may carry this order is big enough. The fix is two whole orders from the store.
  const { smsSent } = useApp();
  const runs = useRuns();
  const eligible = Object.values(vehicles).filter((v) => !unavailable.has(v.id) && (!o.chilled || v.reefer) && (o.parking !== "van_only" || v.type === "van"));
  const biggest = { m3: Math.max(...eligible.map((v) => v.m3)), kg: Math.max(...eligible.map((v) => v.kg)) };
  const oversize = !cur && (o.m3 > biggest.m3 || o.kg > biggest.kg);
  const asked = smsSent.find((m) => m.to === o.outlet && m.ref === o.ref);
  const askStore = () => {
    const text = `Your order ${o.ref} (${round1(o.m3)} m³) is bigger than any of our trucks, so it can't go today. Please send it again as 2 smaller orders before 4:00 PM. Both go first in line on the ${formatDate(runs.orderRun)} run.`;
    dispatch({ type: "sms", sms: { to: o.outlet, ref: o.ref, text, by: user.name } });
    dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `Asked ${o.outlet} to send ${o.ref} again as 2 orders (bigger than any truck)` });
    setToast({ text: `${o.outlet} asked to send 2 orders · the store sees it in the app` });
  };

  // Keyboard: focus moves into the panel, Esc closes it, and in the pop-up (smaller screens) Tab stays inside.
  const panelRef = useRef(null);
  const sheet = typeof window !== "undefined" && window.innerWidth <= 1100;
  useEffect(() => {
    const el = panelRef.current;
    const back = document.activeElement;
    el?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || window.innerWidth > 1100 || !el) return;
      const items = [...el.querySelectorAll("button:not([disabled]), input, [href]")];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [refId]);

  const needsReason = !cur; // serving a deferred order changes who waits
  const apply = (to, extra = [], what) => {
    const edits = [...extra, { ref: refId, to }];
    edits.forEach((e) => dispatch({ type: "planEdit", edit: { ...e, reason: reason.trim(), by: user.name } }));
    dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `${what}${reason.trim() ? ` · reason: ${reason.trim()}` : ""}` });
    setToast({ text: `${what} · every rule checked` });
    onClose();
  };
  const defer = () => apply(null, [], `Deferred ${o.outlet} (${o.ref}) by hand`);

  return (
    <>
    <div className="move-backdrop" onClick={onClose} aria-hidden="true" />
    <div className="panel move-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal={sheet} aria-labelledby="move-title">
      <div className="row between">
        <div>
          <div className="muted xs" style={{ fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>{cur ? `On ${cur.vehicle} · ${runLabel(cur.vehicle, cur.trip)}` : "Deferred"}</div>
          <h3 id="move-title" style={{ margin: "2px 0" }}>{o.outlet} · {o.district}</h3>
          <div className="muted small">{o.ref} · {o.brand} · {o.chilled ? "❄ chilled" : "dry"} · {round1(o.m3)} m³ · {n(Math.round(o.kg))} kg{o.parking === "van_only" ? " · van only" : ""}</div>
          {o.deferredYesterday && <span className="tag shield" style={{ marginTop: 6 }}><ShieldCheck size={12} /> Skipped yesterday: must not be skipped again</span>}
        </div>
        <button className="icon-btn" style={{ background: "var(--coconut)", color: "var(--ink)" }} onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      {!oversize && <label style={{ display: "block", marginTop: 12 }}>
        <span className="field-label">Reason {needsReason ? "(required: this changes who waits)" : "(optional for a move, required to defer)"}</span>
        <input className="input" style={{ height: 42 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. store has a festival promotion tomorrow" />
      </label>}

      {!oversize && <div className="section-label" style={{ marginTop: 14 }}>{cur ? "Move to" : "Serve it on"} · {valid.length} truck{valid.length === 1 ? "" : "s"} fit{valid.length === 1 ? "s" : ""}</div>}
      {(showAll ? valid : valid.slice(0, 5)).map((x) => (
        <button key={`${x.vehicle.id}-${x.trip}`} className="option" style={{ marginTop: 8 }} disabled={needsReason && !reason.trim()}
          onClick={() => apply({ vehicle: x.vehicle.id, trip: x.trip }, [], `${cur ? "Moved" : "Served"} ${o.outlet} (${o.ref}) on ${x.vehicle.id} ${runLabel(x.vehicle.id, x.trip)}`)}>
          <div className="row between"><b>{x.vehicle.id} · {runLabel(x.vehicle.id, x.trip)}</b><span className="tag ok"><Check size={12} /> fits</span></div>
          <div className="muted small">{x.tripInfo ? `${x.tripInfo.brand} · ${x.tripInfo.district} · ` : "Empty trip · "}{round1(x.m3)} / {x.vehicle.m3} m³ · {x.minutes} / {x.budget} min</div>
        </button>
      ))}
      {valid.length > 5 && !showAll && <button className="link" onClick={() => setShowAll(true)}>Show all {valid.length}</button>}
      {!valid.length && !oversize && <div className="card flat small" style={{ marginTop: 8 }}>No truck can take this order as the plan stands.{!cur && !swaps.length ? " There's also no order it could swap with: no suitable truck goes to this area tonight." : ""}</div>}

      {!cur && swaps.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 14 }}>Or make room · swap with an order that can wait</div>
          {swaps.map((s) => (
            <button key={s.out.ref} className="option" style={{ marginTop: 8 }} disabled={!reason.trim()}
              onClick={() => apply({ vehicle: s.vehicle, trip: s.trip }, [{ ref: s.out.ref, to: null }], `Served ${o.outlet} instead of ${s.out.outlet} on ${s.vehicle} ${runLabel(s.vehicle, s.trip)}`)}>
              <div className="row between"><b>Defer {s.out.outlet} instead</b><span className="small">{s.out.chilled ? "❄ " : ""}{round1(s.out.m3)} m³</span></div>
              <div className="muted small">{s.vehicle} {runLabel(s.vehicle, s.trip)} · {s.out.daysSince === 1 ? "served yesterday" : `${s.out.daysSince} days since last delivery`} · not skipped yesterday</div>
            </button>
          ))}
          <div className="muted xs" style={{ marginTop: 6 }}>Shops skipped yesterday (🛡) are never offered.</div>
        </>
      )}

      {switches.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 14 }}>Or switch places with another order</div>
          {switches.map((s) => (
            <button key={s.other.ref} className="option" style={{ marginTop: 8 }}
              onClick={() => apply(s.to, [{ ref: s.other.ref, to: cur }], `Switched ${o.outlet} (${cur.vehicle} ${runLabel(cur.vehicle, cur.trip)}) with ${s.other.outlet} (${s.to.vehicle} ${runLabel(s.to.vehicle, s.to.trip)})`)}>
              <div className="row between"><b>{s.other.outlet} on {s.to.vehicle} · {runLabel(s.to.vehicle, s.to.trip)}</b><span className="tag ok"><Check size={12} /> both fit</span></div>
              <div className="muted small">{o.outlet} goes to {s.to.vehicle}, {s.other.outlet} comes to {cur.vehicle} · {s.other.chilled ? "❄ " : ""}{round1(s.other.m3)} m³</div>
            </button>
          ))}
        </>
      )}

      {oversize && (
        <div className="card flat" style={{ marginTop: 14, borderColor: "#fbc9a3", background: "#fff8f1" }}>
          <b className="small">Bigger than any truck</b>
          <div className="small" style={{ marginTop: 4 }}>{round1(o.m3)} m³ · {n(Math.round(o.kg))} kg, but the biggest {o.chilled ? "reefer" : o.parking === "van_only" ? "van" : "truck"} holds {biggest.m3} m³ · {n(biggest.kg)} kg. An order is never split across trucks (booklet rule).</div>
          <div className="small" style={{ marginTop: 6 }}><b>What you can do:</b> ask the store to send it again as 2 smaller orders. Each one is a whole order that fits a truck, and both go first in line on the {formatDate(runs.orderRun)} run.</div>
          {asked
            ? <div className="tag ok" style={{ marginTop: 8 }}><Check size={12} /> Store asked at {asked.at}</div>
            : <button className="btn secondary block" style={{ marginTop: 8, minHeight: 40 }} onClick={askStore}><MessageSquare size={15} /> Ask {o.outlet} to send 2 orders</button>}
        </div>
      )}

      {near.length > 0 && !oversize && (
        <>
          <div className="section-label" style={{ marginTop: 14 }}>Why not these trucks?</div>
          {near.map((x) => (
            <div key={`${x.vehicle.id}-${x.trip}`} className="option locked" style={{ marginTop: 8 }}>
              <b>{x.vehicle.id} · {runLabel(x.vehicle.id, x.trip)}</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }} className="small">{x.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          ))}
        </>
      )}

      {cur && (
        <button className="btn secondary block" style={{ marginTop: 14 }} disabled={!reason.trim() || o.deferredYesterday} onClick={defer}>
          <RotateCw size={16} /> {o.deferredYesterday ? "Skipped yesterday: can't be skipped again" : "Defer this order (reason required)"}
        </button>
      )}
    </div>
    </>
  );
}

/* What publishing does, in one look: who is told what (the plan and the deferrals go out together). */
function PublishSummary({ onCancel, onPublish }) {
  const stores = new Set(orders.map((o) => o.outlet));
  const deferredStores = new Set(plan.deferred.map((o) => o.outlet));
  const drivers = plan.lanes.length;
  return (
    <div className="panel" style={{ borderTop: "5px solid var(--turmeric)", maxWidth: 760 }}>
      <div className="card-title" style={{ fontSize: 18 }}>Publish tonight's plan?</div>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 12 }}>
        <div className="kpi"><div className="label"><Truck size={14} /> Drivers</div><div className="value">{drivers}</div><div className="muted small">get their runs and stop order</div></div>
        <div className="kpi"><div className="label"><ListChecks size={14} /> Loaders</div><div className="value">1 depot</div><div className="muted small">Peliyagoda load lists, reverse stop order</div></div>
        <div className="kpi"><div className="label"><Store size={14} /> Stores</div><div className="value">{stores.size}</div><div className="muted small">{stores.size - deferredStores.size} only planned · {deferredStores.size} with a deferral + reason (SMS and app)</div></div>
      </div>
      <p className="muted small" style={{ margin: "12px 0" }}>Deferrals go out with the plan, each with its reason and what happens next. Shops deferred tonight go first on the next run.</p>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={onCancel}>Not yet</button>
        <button className="btn primary" onClick={onPublish}>Publish and notify everyone</button>
      </div>
    </div>
  );
}

/* "How to read this board": a key for every mark on a truck card, plus the booklet rules each move is checked against.
   Opens on the first visit; the ? button brings it back. */
function PlanKey({ onClose }) {
  const item = (mark, text) => <div className="small" style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "start" }}><span>{mark}</span><span>{text}</span></div>;
  return (
    <div className="panel" style={{ borderTop: "5px solid var(--brinjal)" }} role="region" aria-label="How to read this board">
      <div className="row between"><div className="card-title"><Info size={18} /> How to read this board</div><button className="btn secondary" style={{ minHeight: 34, fontSize: 13 }} onClick={onClose}>Got it</button></div>
      <div className="key-grid" style={{ marginTop: 10 }}>
        <div className="col" style={{ gap: 8 }}>
          {item(<span className="tag brinjal">Run 1 · 03:30–06:38</span>, "A trip from the depot and back. Each truck does up to 2 runs, in this order.")}
          {item(<span className="row" style={{ gap: 6 }}><span className="order-chip">OUT034</span><span className="small">07:15</span></span>, "A shop stop and when the truck arrives. Click a shop to move, switch or defer it.")}
          {item(<span>❄ · 🛡</span>, "❄ chilled goods (needs a reefer). 🛡 the shop was skipped yesterday, so it must be served today.")}
          {item(<span className="small">6 min to spare</span>, "Arrives just before the shop's window closes. Red means it would arrive late.")}
        </div>
        <div className="col" style={{ gap: 8 }}>
          {item(<span className="tag ok">21.2 / 26.4 m³</span>, "Load used out of the truck's space (and weight). Green = fits, red = over.")}
          {item(<span className="tag ok"><Gauge size={12} /> 264 / 270 min</span>, "Driving time used. Fresh must finish in 270 min (from 03:30); Style and Tech in 480 min.")}
          {item(<span className="tag">Fuel 69 L today</span>, "Fuel for today's runs, and about how much of the weekly quota is left.")}
          <div className="small muted" style={{ marginTop: 2 }}><b>Every move is checked against the booklet:</b> one brand and district per trip · chilled only on reefers · van-only shops get a van · own depot only · whole orders, never split · space and weight · up to 2 trips within the time budget · shop windows · weekly fuel.</div>
        </div>
      </div>
    </div>
  );
}

/* Which trucks need a look: late stops, over capacity or time, fuel, or not available today. */
const laneNeedsAttention = (l, unavailable) => l.late.length > 0 || l.fuelOver || unavailable.has(l.vehicle.id) || l.freshMin > 270 || l.dayMin > 480 || l.runs.some((r) => r.m3 > l.vehicle.m3 || r.kg > l.vehicle.kg);
const laneHasSpace = (l) => l.runs.length < 2 || l.runs.some((r) => r.m3 < l.vehicle.m3 * 0.7);

/* The engine's answer next to the plan on the board: the dispatcher decides whether to use it. */
function EngineResult({ result, onUse, onClose, current }) {
  const s = result.summary;
  const cur = { served: current.served, chilledWaiting: current.deferred.filter((o) => o.chilled).reduce((a, o) => a + o.m3, 0) };
  return (
    <div className="panel" style={{ borderTop: "5px solid var(--turmeric)" }}>
      <div className="row between" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="card-title" style={{ margin: 0 }}><Zap size={18} /> Planning engine · {result.ms} ms · {result.vehicles} ready vehicles</div>
        <span className={`tag ${result.check.ok ? "ok" : "bad"}`}>{result.check.ok ? "✓ Every rule checked: space, weight, cold, van-only, one brand and district per trip, time windows, fuel" : `${result.check.errors.length} rule problems`}</span>
      </div>
      <div className="table-scroll" style={{ marginTop: 10 }}><table className="t">
        <thead><tr><th></th><th>Served</th><th>Deferred</th><th>Shops skipped yesterday served</th><th>Chilled waiting</th><th>Trips</th></tr></thead>
        <tbody>
          <tr><td><b>Engine plan</b></td><td>{s.served} of {s.orders}</td><td>{s.deferred}</td><td>{s.protectedServed} of {s.protectedTotal}</td><td>{s.deferredChilledM3} m³</td><td>{s.trips}</td></tr>
          <tr><td>Current plan</td><td>{cur.served} of {s.orders}</td><td>{s.orders - cur.served}</td><td>{s.protectedTotal} of {s.protectedTotal}</td><td>{cur.chilledWaiting.toFixed(1)} m³</td><td>—</td></tr>
        </tbody>
      </table></div>
      <div className="row" style={{ gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
        <button className="btn secondary" onClick={onClose}>Keep current plan</button>
        <button className="btn primary" disabled={!result.check.ok} onClick={onUse}>Use this plan</button>
      </div>
    </div>
  );
}

export function Plan() {
  const { setToast, dispatch, user, published, publishedBy, planEdits, loadedTrucks, fleet, fleetEdits, storeEdits, planSource } = useApp();
  const [engine, setEngine] = useState(null);
  const nav = useNavigate();
  const { state: navState } = useLocation();
  const ready = fleet.filter((v) => v.depot === "Peliyagoda" && v.status !== "in_workshop" && v.driver).length;
  const [selected, setSelected] = useState(navState?.select || new URLSearchParams(window.location.search).get("select") || null);
  const [show, setShow] = useState("All");
  const [q, setQ] = useState("");
  const [keyOpen, setKeyOpen] = useState(() => { try { return !localStorage.getItem("wp-plan-key-seen"); } catch { return true; } });
  const closeKey = () => { setKeyOpen(false); try { localStorage.setItem("wp-plan-key-seen", "1"); } catch { /* storage blocked */ } };
  const [running, setRunning] = useState(!!navState?.auto);
  useEffect(() => {
    if (!running) return;
    let done = false;
    const minWait = new Promise((r) => setTimeout(r, 1200));
    autoPlan({ fleetEdits, storeEdits })
      .then((r) => minWait.then(() => { if (!done) { setEngine(r); setRunning(false); } }))
      .catch((e) => { if (!done) { setToast({ text: `Planning engine: ${e.message}` }); setRunning(false); } });
    return () => { done = true; };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const useEngine = () => {
    dispatch({ type: "planSet", alloc: engine.alloc, summary: engine.summary, source: "engine", by: user.name });
    setEngine(null);
    setToast({ text: `Engine plan in use · ${engine.summary.served} of ${engine.summary.orders} served` });
  };
  plan.__edits = planEdits;
  const protectedServed = orders.filter((o) => o.deferredYesterday && plan.alloc[o.ref]).length;
  const repeat = orders.filter((o) => o.deferredYesterday && !plan.alloc[o.ref]).length;
  const chilledDeferred = plan.deferred.filter((o) => o.chilled).length;
  const unavailable = useUnavailable();
  const term = q.trim().toUpperCase();
  const shownLanes = plan.lanes.filter((l) => (show === "All" || (show === "Needs attention" ? laneNeedsAttention(l, unavailable) : laneHasSpace(l)))
    && (!term || l.vehicle.id.includes(term) || l.runs.some((r) => r.stops.some((s) => s.outlet.includes(term)) || r.district.toUpperCase().includes(term))));
  const problems = [
    ...plan.lanes.filter((l) => unavailable.has(l.vehicle.id)).map((l) => ({ key: `u-${l.vehicle.id}`, text: `${l.vehicle.id} is not available today (workshop or no driver) but still has ${l.trips.filter(Boolean).reduce((a, x) => a + x.orders.length, 0)} orders. Move them.` })),
    ...plan.lanes.flatMap((l) => l.late.map((s) => ({ key: `l-${s.outlet}`, text: `${s.outlet} on ${l.vehicle.id} arrives ${s.eta}, after its window closes (${s.close}). Change the stop order or move it.` }))),
    ...plan.lanes.filter((l) => l.fuelOver).map((l) => ({ key: `f-${l.vehicle.id}`, text: `${l.vehicle.id} needs about ${Math.round(l.fuelL)} L today but only about ${Math.round(l.fuelLeft)} L of its weekly quota is left.` })),
    ...(repeat ? [{ key: "r", text: `${repeat} shop${repeat > 1 ? "s" : ""} skipped yesterday ${repeat > 1 ? "are" : "is"} deferred again. Serve them first.` }] : []),
  ];
  const [confirming, setConfirming] = useState(false);
  const publish = () => {
    setConfirming(false);
    dispatch({ type: "publish", by: user.name });
    dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `Published the Peliyagoda plan · ${plan.served} served, ${plan.deferred.length} deferred${planEdits.length ? `, ${planEdits.length} manual change${planEdits.length > 1 ? "s" : ""}` : ""}` });
    setToast({ text: `Plan published · loaders, drivers and ${new Set(orders.map((o) => o.outlet)).size} stores notified` });
  };
  if (running) {
    return (
      <DeskShell peakOnly nav={useDispatchNav()} title="Plan board" subtitle="Auto-plan is running">
        <div className="panel" style={{ maxWidth: 640, textAlign: "center", padding: 40 }}>
          <span className="shape" style={{ width: 72, height: 72, borderRadius: 22, background: "var(--turmeric)", color: "var(--ink)" }}><Zap size={34} /></span>
          <h3 style={{ margin: "16px 0 6px" }}>Checking {orders.length} orders against {ready} ready trucks…</h3>
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>1. Shops skipped yesterday go first (🛡)<br />2. Then shops that waited longest<br />3. Then as much chilled food as possible<br />4. Every rule is checked: space, weight, cold, van-only, one district per trip, time budgets</p>
        </div>
      </DeskShell>
    );
  }
  return (
    <DeskShell peakOnly nav={useDispatchNav()} title="Plan board" subtitle={`${plan.lanes.length} trucks · click any order to move, serve or defer it · every rule checked`}
      actions={<><DepotPill /><button className="btn primary" disabled={published || problems.length > 0} title={problems.length ? "Fix the problems first" : undefined} onClick={() => setConfirming(true)}>{published ? <><Check size={18} /> Published</> : "Publish plan"}</button></>}>
      <div className="banner-plan">
        <span className="chip done"><Check size={13} /> Served {plan.served} of {orders.length}</span>
        <span className="chip deferred"><RotateCw size={13} /> Deferred {plan.deferred.length}</span>
        <span className="muted small">{chilledDeferred} chilled · {plan.deferred.length - chilledDeferred} other</span>
        <span className={`tag ${repeat ? "bad" : "shield"}`} style={{ fontSize: 13 }}><ShieldCheck size={14} /> {repeat ? `${repeat} repeat skip${repeat > 1 ? "s" : ""}!` : `0 repeat skips · all ${protectedServed} shops skipped yesterday are served`}</span>
        {planEdits.length > 0 && (
          <span className="tag brinjal" style={{ fontSize: 13 }}>{planEdits.length} manual change{planEdits.length > 1 ? "s" : ""} by {user.name}
            {!published && <button className="link" style={{ marginLeft: 8, padding: 0 }} onClick={() => { dispatch({ type: "undoEdits" }); setToast({ text: "Back to the Auto-plan result" }); }}>Undo all</button>}
          </span>
        )}
        <button className="link" style={{ marginLeft: "auto" }} onClick={() => nav("/dispatch/deferrals")}>Why?</button>
      </div>
      {!published && problems.length > 0 && (
        <div className="panel" style={{ borderTop: "5px solid var(--problem)" }}>
          <div className="card-title"><AlertTriangle size={18} color="var(--problem)" /> Fix {problems.length} problem{problems.length > 1 ? "s" : ""} before publishing</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>{problems.map((x) => <li key={x.key} className="small" style={{ margin: "4px 0" }}>{x.text}</li>)}</ul>
        </div>
      )}
      {engine && !published && <EngineResult result={engine} current={plan} onUse={useEngine} onClose={() => setEngine(null)} />}
      {planSource?.source === "engine" && !engine && <div className="banner info"><Zap size={18} /> Using the planning engine's plan ({planSource.at}, {planSource.by}){!published && <button className="link" style={{ marginLeft: 8 }} onClick={() => dispatch({ type: "planSet", alloc: null, source: "optimiser", by: user.name, summary: null })}>Back to the published team plan</button>}</div>}
      {!published && !engine && !running && <button className="btn secondary" style={{ alignSelf: "flex-start" }} onClick={() => setRunning(true)}><Zap size={16} /> Run the planning engine</button>}
      {confirming && <PublishSummary onCancel={() => setConfirming(false)} onPublish={publish} />}
      {published && <div className="banner done"><Check size={18} /> Published{publishedBy ? ` ${publishedBy.at}${/demo/i.test(publishedBy.by) ? "" : ` by ${publishedBy.by}`}` : ""} · loaders, drivers and stores can see it now{planEdits.length ? " · later changes are sent as updates" : ""}</div>}
      {keyOpen && <PlanKey onClose={closeKey} />}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {[["All", plan.lanes.length], ["Needs attention", plan.lanes.filter((l) => laneNeedsAttention(l, unavailable)).length], ["Has space", plan.lanes.filter(laneHasSpace).length]].map(([k, c]) => (
          <button key={k} className={`filter ${show === k ? "on" : ""}`} aria-pressed={show === k} onClick={() => setShow(k)}>{k} · {c}</button>
        ))}
        <div className="input-wrap" style={{ width: 270, maxWidth: "100%", marginLeft: "auto" }}><input className="input" style={{ height: 38, paddingLeft: 34, fontSize: 14 }} placeholder="Find a shop, truck or district" aria-label="Find a shop, truck or district" value={q} onChange={(e) => setQ(e.target.value)} /><Search size={16} style={{ position: "absolute", left: 11, top: 11 }} color="var(--muted)" aria-hidden="true" /></div>
        {!keyOpen && <button className="btn secondary" style={{ minHeight: 38, padding: "0 12px" }} onClick={() => setKeyOpen(true)} aria-label="How to read this board">?</button>}
      </div>
      <div className="two">
        <div className="lanes">
          {shownLanes.length === 0 && <div className="card flat muted">No trucks match. <button className="link" onClick={() => { setShow("All"); setQ(""); }}>Show all</button></div>}
          {shownLanes.map((l) => {
            const budget = l.freshMin ? `${l.freshMin} / 270 min` : `${l.dayMin} / 480 min`;
            const edited = planEdits.some((e) => e.to?.vehicle === l.vehicle.id);
            return (
              <div key={l.vehicle.id} className="lane" style={edited ? { borderColor: "var(--brinjal-2)" } : {}}>
                <div className="lane-head">
                  <span className="shape" style={{ width: 34, height: 34, borderRadius: 10 }}><Truck size={16} /></span>
                  <b>{l.vehicle.id}</b>
                  <span className="muted small">{l.vehicle.type}{l.vehicle.reefer ? " · reefer" : ""} · {l.vehicle.m3} m³</span>
                  {l.vehicle.reefer && <Snowflake size={15} color="var(--way)" />}
                  {edited && <span className="tag brinjal">Edited</span>}
                  {loadedTrucks[`${l.vehicle.id}:${l.runs[0]?.run}`] && <span className="tag ok"><Check size={12} /> Loaded by {loadedTrucks[`${l.vehicle.id}:${l.runs[0]?.run}`].by}</span>}
                  <div className="grow" />
                  <span className={`tag ${(l.freshMin > 270 || l.dayMin > 480) ? "bad" : "ok"}`}><Gauge size={12} /> {budget}</span>
                  <span className={`tag ${l.fuelOver ? "bad" : ""}`} title="Weekly quota minus an estimate of this week's use so far">Fuel {Math.round(l.fuelL)} L today · ~{Math.round(l.fuelLeft ?? 0)} L left this week</span>
                </div>
                {unavailable.has(l.vehicle.id) && <div className="banner problem" style={{ marginBottom: 10 }}><AlertTriangle size={18} /> {l.vehicle.id} is not available today. Click each order to move it.</div>}
                <div className="trips">
                  <TripBox trip={l.runs[0]} vehicle={l.vehicle} selected={selected} onPick={setSelected} />
                  <TripBox trip={l.runs[1]} vehicle={l.vehicle} selected={selected} onPick={setSelected} />
                </div>
              </div>
            );
          })}
        </div>
        {selected ? <MovePanel key={selected} refId={selected} onClose={() => setSelected(null)} /> : (
          <div className="panel" style={{ position: "sticky", top: 90 }}>
            <div className="card-title"><RotateCw size={18} /> Deferred ({plan.deferred.length})</div>
            <div className="muted small" style={{ margin: "4px 0 10px" }}>Click a deferred order to try to serve it, or any order on a truck to move it.</div>
            {plan.deferred.map((o) => (
              <button key={o.ref} className="option" style={{ marginBottom: 8, borderLeft: "4px solid var(--deferred)" }} onClick={() => setSelected(o.ref)}>
                <div className="row between"><b>{o.outlet} · {o.district}</b><span className="small">{o.chilled && "❄ "}{round1(o.m3)} m³</span></div>
                <div className="muted small">{planEdits.find((e) => e.ref === o.ref && !e.to)?.reason || o.reason} · {o.daysSince === 1 ? "served yesterday" : `${o.daysSince} days since last delivery`}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </DeskShell>
  );
}

/* What a deferral means for the store, in plain words (the booklet asks to explain the consequences). */
export function consequence(o) {
  if (o.m3 > MAX_TRUCK_M3) return `The order is bigger than any truck (${round1(o.m3)} m³). The store is asked to send it as 2 orders; both go first on the next run.`;
  const wait = o.daysSince === 1 ? "The shop was served yesterday" : `The shop's last delivery was ${o.daysSince} days ago`;
  return `${o.units} ${o.chilled ? "chilled " : ""}cases wait one day. ${wait}, so it can cope, and it goes first on the next run.${o.chilled ? " Some chilled lines may run short tomorrow morning." : ""}`;
}

export function Deferrals() {
  const { planEdits, published } = useApp();
  const nav = useNavigate();
  const manual = (ref) => [...planEdits].reverse().find((e) => e.ref === ref && !e.to);
  const [sel, setSel] = useState(plan.deferred[0]?.ref);
  const o = byRef[sel];
  const reeferTrip = districts[o.district].outMin;
  return (
    <DeskShell peakOnly nav={useDispatchNav()} title="Deferrals" subtitle="Every deferral has a reason, a type, and a notice to the store"
      actions={<><button className="btn secondary" onClick={() => nav("/dispatch/plan", { state: { select: sel } })}>Serve this order instead…</button><button className="btn primary" onClick={() => nav("/dispatch/plan")}>{published ? <><Check size={16} /> Sent with the plan</> : "Review and publish"}</button></>}>
      <div className="two">
        <div className="table-card">
          <div className="table-scroll">
            <table className="t">
              <thead><tr><th>Shop</th><th>District</th><th>Temp</th><th>m³</th><th>Reason</th><th>Type</th><th>Store</th></tr></thead>
              <tbody>
                {plan.deferred.map((d) => (
                  <tr key={d.ref} className={`click ${sel === d.ref ? "sel" : ""}`} onClick={() => setSel(d.ref)}>
                    <td><b>{d.outlet}</b><div className="muted xs">{d.ref} · {d.brand}</div></td><td>{d.district}</td><td>{d.chilled ? "❄" : "dry"}</td><td>{round1(d.m3)}</td>
                    <td>{manual(d.ref)?.reason || d.reason}</td><td>{manual(d.ref) ? <span className="tag brinjal">Chosen by {manual(d.ref).by}</span> : d.kind === "Unavoidable" ? <Chip kind="planned">Unavoidable</Chip> : <Chip kind="deferred">Capacity</Chip>}</td>
                    <td>{published ? <span className="tag ok"><Check size={12} /> Told · SMS</span> : <span className="tag">Told when published</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="muted xs" style={{ fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Why this order?</div>
          <h3 style={{ margin: "4px 0 2px", fontSize: 20 }}>{o.outlet} · {o.district}</h3>
          <div className="muted small">{o.ref} · {o.units} cases · {round1(o.m3)} m³ · {n(Math.round(o.kg))} kg</div>
          <ul className="why">
            {o.m3 > MAX_TRUCK_M3 ? (
              <li><AlertTriangle size={18} color="var(--problem)" /> {round1(o.m3)} m³ is bigger than our largest truck ({MAX_TRUCK_M3} m³). Orders can't be split across trucks, so the store is asked to send it as 2 orders.</li>
            ) : (
              <>
                <li><Snowflake size={18} color="var(--way)" /> Chilled: needs a reefer, and all {REEFER_TRIPS.possible} reefer trips are used</li>
                <li><ShieldCheck size={18} color="var(--muted)" /> Skipped yesterday: <b>{o.deferredYesterday ? "Yes" : "No"}</b></li>
                <li><CalendarRange size={18} color="var(--muted)" /> Days since last delivery: <b>{o.daysSince}</b></li>
                <li><Timer size={18} color="var(--muted)" /> {o.district} is {reeferTrip} min from the depot, so a trip there uses much of a reefer's 270-minute morning</li>
              </>
            )}
          </ul>
          <div className="banner deferred"><RotateCw size={18} /> Deferred to tomorrow's first run · 🛡 goes first tomorrow</div>
          <div className="card flat" style={{ marginTop: 12 }}>
            <div className="section-label" style={{ margin: 0 }}>What happens</div>
            <p className="small" style={{ margin: "6px 0 0", lineHeight: 1.6 }}>{consequence(o)}</p>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>Our best plans all leave 7 chilled orders waiting today. We chose which 7 so that no shop waits twice. Deferrals are sent to stores together with the plan when you publish.</p>
        </div>
      </div>
    </DeskShell>
  );
}

/* SMS composer: works where mobile data doesn't. Recorded in the team log. */
function SmsSheet({ sms, onClose }) {
  const { dispatch, user, setToast } = useApp();
  const [text, setText] = useState(sms.text);
  const send = () => {
    dispatch({ type: "sms", sms: { to: sms.to, text, by: user.name } });
    dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `SMS to ${sms.who}: ${text}` });
    setToast({ text: `SMS sent to ${sms.who}` });
    onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Send SMS" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px" }}>SMS to {sms.who}</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>SMS reaches phones where mobile data doesn't. {text.length} characters.</div>
        <textarea className="input" style={{ height: 110, padding: 12, resize: "vertical" }} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!text.trim()} onClick={send}>Send SMS</button>
        </div>
      </div>
    </div>
  );
}

export function Live() {
  const { scenario, dispatch, log, delivered, loadedTrucks, storeReports, loaderReports, driverReports, smsSent, user, setToast, stopProgress, fleet, depot, tracked } = useApp();
  const [picked, setPicked] = useState(null); // truck selected on the map or in the list
  const [sms, setSms] = useState(null);
  const by = (text) => log.find((e) => e.what.startsWith(text))?.who;
  const nav = useNavigate();
  const clock = useClock();
  const rows = liveStatus(scenario, delivered, clock.time, tracked);
  const risks = rows.filter((r) => r.state !== "offline" && r.state !== "problem").flatMap((r) => r.risks.map((k) => ({ ...k, vehicle: r.lane.vehicle.id })));
  const offline = rows.filter((r) => r.state === "offline").length;
  const onRoad = rows.filter((r) => !["waiting", "done"].includes(r.state));
  // Trucks that need the dispatcher come first: problems, offline, at risk, then the rest.
  const RANK = { problem: 0, offline: 1, late: 2, way: 3, waiting: 4, done: 5 };
  const needsLook = (r) => ["problem", "offline", "late"].includes(r.state) || r.risks.length > 0;
  const [liveShow, setLiveShow] = useState("All");
  const shownRows = rows.filter((r) => liveShow === "All" || needsLook(r))
    .sort((a, b) => Number(needsLook(b)) - Number(needsLook(a)) || RANK[a.state] - RANK[b.state]);
  const atRisk = rows.filter((r) => r.risks.length && !["offline", "problem", "done"].includes(r.state)).length;
  const problems = [];
  // The driver's delivery record: anything short of "all given" needs the dispatcher (the store sees it too).
  Object.entries(delivered).filter(([, d]) => d.synced && d.outcome !== "all").forEach(([k, d]) => {
    const [veh, outlet] = k.split(":");
    problems.push({ key: `del-${k}`, title: `Driver · ${veh}`, text: d.outcome === "none" ? `${outlet} not delivered (${{ shopClosed: "shop closed", refused: "refused", noAccess: "no access" }[d.reason] || d.reason}) at ${d.at} · goes first on the next run · store told` : `${outlet}: ${d.missing} cases missing at ${d.at} · signed by ${d.receivedBy} · store told` });
  });
  if (scenario.reefer === "reported") problems.push({ key: "reefer", title: "Reefer Down", text: "VEH003 cooling failed at the gate · 3 orders from shops skipped yesterday on board", to: "/dispatch/incident/reefer" });
  if (scenario.reefer === "approved") problems.push({ key: "reefer-ok", title: "Reefer Down", text: `Re-plan approved${by("Reefer Down") ? ` by ${by("Reefer Down")}` : ""} · crates moved · stores notified`, ok: true });
  driverReports.filter((r) => r.synced).forEach((r) => problems.push({
    key: r.id, ok: !!r.seenBy, title: `Driver report · ${r.vehicle}`,
    text: `${r.label} before ${r.outlet}${r.delayMin ? ` · about ${r.delayMin} min late, new time about ${r.newEta}` : ""} · ${r.at} by ${r.by}${r.storeText ? " · store told" : " · store not told"}${r.seenBy ? ` · seen by ${r.seenBy} ${r.seenAt}` : ""}`,
    driver: r.seenBy ? null : r,
  }));
  loaderReports.forEach((r) => problems.push(r.decision
    ? { key: r.id, ok: true, title: `Loader report · ${r.vehicle}`, text: `${r.outlet}: ${r.what} · ${r.decidedBy} chose to ${r.decision === "replace" ? "replace from stock" : "send it short (store told)"} at ${r.decidedAt}${r.acked ? ` · done at the dock ${r.acked}` : " · waiting for the dock"}` }
    : { key: r.id, title: `Short at the Dock · ${r.vehicle}`, text: `${r.outlet}: ${r.what} · found ${r.at} by ${r.by}${r.photo ? " · photo attached" : ""}. Decide before the truck leaves.`, to: `/dispatch/incident/loader/${r.id}` }));
  storeReports.forEach((r, i) => problems.push(r.decision
    ? { key: r.id || `store-${i}`, ok: true, title: `Store report · ${r.name}`, text: `${r.outlet}: ${r.what} · ${r.decidedBy} ${r.decision === "resend" ? "is sending them on the next run" : "credited the store"} (${r.decidedAt})` }
    : { key: r.id || `store-${i}`, title: `Store report · ${r.name}`, text: r.kind === "notArrived" ? `${r.outlet}: ${r.what} · reported ${r.at} by ${r.by} · truck ${r.vehicle}` : `${r.outlet}: ${r.what} · reported ${r.at} by ${r.by} · driver's photo and signature attached`, store: r.id ? r : null }));
  if (scenario.dead === "complaint") problems.push({ key: "dead", title: "Store report", text: "OUT074: “dry order not arrived?” · waiting for VEH010 to sync", to: "/store/dispute" });
  const openProblems = problems.filter((p) => !p.ok).length;
  // The dispatcher's answer to a loader report goes back to the dock; "send short" also tells the store.
  const decideStore = (r, decision) => {
    dispatch({ type: "storeReportDecision", id: r.id, decision, by: user.name });
    dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `${r.outlet} report (${r.what}): ${decision === "resend" ? "send on the next run" : "credit the store"}` });
    setToast({ text: "The store sees your answer now" });
  };
  return (
    <DeskShell peakOnly nav={useDispatchNav()} title="Live board" subtitle={`${clock.time} · ${onRoad.length ? `${onRoad.length} truck${onRoad.length > 1 ? "s" : ""} on the road` : rows.every((r) => r.state === "done") ? "all runs finished" : `first trucks leave ${rows.map((r) => r.trip.start).sort()[0]}`}`} actions={<><DepotPill /><DayPill /></>}>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="label"><Truck size={14} /> Trucks out</div><div className="value">{onRoad.length} <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>of {rows.length}</span></div><div className="muted small">{rows.filter((r) => r.state === "waiting").length} at the depot · {rows.filter((r) => r.state === "done").length} finished</div></div>
        <div className="kpi"><div className="label"><Check size={14} /> Stops done</div><div className="value">{rows.reduce((s, r) => s + r.done, 0)} <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>of {rows.reduce((s, r) => s + r.trip.stops.length, 0)}</span></div><div className="muted small">on each truck's current run</div></div>
        <div className="kpi"><div className="label"><AlertTriangle size={14} /> Problems</div><div className="value" style={{ color: openProblems + atRisk ? "var(--problem)" : undefined }}>{openProblems + atRisk}</div><div className="muted small">{atRisk} truck{atRisk === 1 ? "" : "s"} at risk of being late · {openProblems} reported</div></div>
        <div className="kpi"><div className="label"><CloudOff size={14} /> Offline</div><div className="value">{offline}</div></div>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row between" style={{ padding: "12px 16px", flexWrap: "wrap", gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}><MapIcon size={18} /> Live map · {clock.time}</div>
          <div className="row small" style={{ gap: 12, flexWrap: "wrap" }}>
            {[["#2563eb", "On the way"], ["#c2410c", "At risk"], ["#6b7280", "Offline"], ["#15803d", "Finished"]].map(([c, l]) => <span key={l} className="row" style={{ gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 99, background: c }} />{l}</span>)}
          </div>
        </div>
        <div className="map-wrap">
          <LiveMap rows={rows} now={clock.time} depot={depot} selected={picked} onSelect={setPicked} progress={stopProgress} />
          {(() => {
            const r = rows.find((x) => x.lane.vehicle.id === picked);
            if (!r) return <div className="map-hint small">Click a truck on the map or in the list to follow it.</div>;
            const driver = fleet.find((v) => v.id === r.lane.vehicle.id)?.driver?.name;
            const nextStop = r.trip.stops[r.done];
            return (
              <div className="map-card" role="status">
                <div className="row between"><b>{r.lane.vehicle.id}{driver ? ` · ${driver}` : ""}</b><button className="icon-btn" style={{ background: "var(--coconut)", color: "var(--ink)", width: 30, height: 30 }} onClick={() => setPicked(null)} aria-label="Close"><X size={16} /></button></div>
                <div className="small muted">{r.trip.brand} · {r.trip.district} · run {r.trip.run} · {r.done}/{r.trip.stops.length} stops</div>
                <div className="small" style={{ marginTop: 6 }}>{nextStop ? <>Next: <b>{nextStop.outlet}</b> · planned {nextStop.eta} · window to {nextStop.close}</> : "All stops done · heading back"}</div>
                {r.risks.length > 0 && <div className="tag warn" style={{ marginTop: 6 }}>about {r.risks[0].predicted} at {r.risks[0].stop.outlet} · {r.risks[0].lateBy} min late</div>}
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button className="btn secondary" style={{ minHeight: 34, fontSize: 13 }} onClick={() => setSms({ to: r.lane.vehicle.id, who: `${r.lane.vehicle.id} driver`, text: "Dispatcher: please call me when you are safely stopped." })}>Message driver</button>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="muted xs" style={{ padding: "6px 16px 10px" }}>Positions follow each truck's planned times and the driver's recorded steps; shops are shown near their town (the data has no GPS).</div>
      </div>
      <div className="two">
        <div className="table-card">
          <div className="head" style={{ gap: 8 }}>
            {[["All", rows.length], ["Needs attention", rows.filter(needsLook).length]].map(([k, c]) => (
              <button key={k} className={`filter ${liveShow === k ? "on" : ""}`} aria-pressed={liveShow === k} onClick={() => setLiveShow(k)}>{k} · {c}</button>
            ))}
            <span className="muted small" style={{ marginLeft: "auto" }}>Trucks that need you are listed first</span>
          </div>
          <div className="table-scroll">
            <table className="t">
              <thead><tr><th>Truck</th><th>Current run</th><th>Loaded</th><th>Progress</th><th>Status</th></tr></thead>
              <tbody>
                {shownRows.map(({ lane, trip, done, state, risks }) => (
                  <tr key={lane.vehicle.id} className={picked === lane.vehicle.id ? "row-picked" : ""} style={{ cursor: "pointer" }} onClick={() => setPicked(lane.vehicle.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setPicked(lane.vehicle.id); }} aria-selected={picked === lane.vehicle.id}>
                    <td><b>{lane.vehicle.id}</b> {lane.vehicle.reefer && <Snowflake size={13} color="var(--way)" />}</td>
                    <td><span className="row" style={{ gap: 6 }}><BrandChip brand={trip.brand} small /> {trip.district}</span></td>
                    <td>{loadedTrucks[`${lane.vehicle.id}:${trip.run}`]
                      ? <span className="tag ok"><Check size={12} /> {loadedTrucks[`${lane.vehicle.id}:${trip.run}`].by} · {loadedTrucks[`${lane.vehicle.id}:${trip.run}`].at}</span>
                      : state === "waiting" ? <span className="muted small">not yet</span>
                      : <span className="tag ok"><Check size={12} /> Loaded</span>}</td>
                    <td>
                      <span className="row" style={{ gap: 4 }} role="img" aria-label={`${done} of ${trip.stops.length} stops done`}>
                        {trip.stops.map((s, i) => <span key={s.outlet} aria-hidden="true" title={`${s.outlet} ${s.eta || ""}`} style={{ width: 12, height: 12, borderRadius: 4, background: i < done ? "var(--done)" : "var(--line-2)" }} />)}
                        <span className="muted small" style={{ marginLeft: 6 }}>{done}/{trip.stops.length}</span>
                      </span>
                    </td>
                    <td>
                      {state === "offline" ? (
                        <span className="row" style={{ gap: 8 }}><Chip kind="offline">Offline · known dead zone</Chip><button className="btn secondary" style={{ minHeight: 30, fontSize: 12, padding: "0 10px" }} onClick={() => setSms({ to: lane.vehicle.id, who: `${lane.vehicle.id} driver`, text: "Dispatcher: please call when you have signal. OUT074 says the dry order has not arrived." })}>Send by SMS</button></span>
                      ) : state === "waiting" ? <Chip kind={risks.length ? "late" : "planned"}>Leaves {trip.start}{risks.length ? " · at risk" : ""}</Chip> : <Chip kind={state}>{state === "late" ? "At risk" : undefined}</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="card-title"><AlertTriangle size={18} /> Problems</div>
          {risks.length > 0 && (
            <div className="card flat" style={{ marginTop: 10, borderLeft: "4px solid var(--late)" }}>
              <b><Timer size={15} style={{ verticalAlign: "-2px" }} /> Running late (predicted from traffic)</b>
              <div className="muted xs" style={{ margin: "2px 0 8px" }}>Typical speed on these roads at this hour, so you can act before the delay hurts.</div>
              {risks.map((r) => {
                const told = smsSent.some((m) => m.to === r.stop.outlet);
                return (
                  <div key={r.stop.outlet} className="row small" style={{ padding: "6px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
                    <span><b>{r.stop.outlet}</b> · {r.vehicle} run {r.run}</span>
                    <span className="tag warn">about {r.predicted} · {r.lateBy} min after {r.stop.close}</span>
                    <button className="btn secondary" style={{ minHeight: 30, fontSize: 12, padding: "0 10px", marginLeft: "auto" }} disabled={told}
                      onClick={() => setSms({ to: r.stop.outlet, who: `store ${r.stop.outlet}`, text: `Waypoint: your delivery may arrive about ${r.predicted}, ${r.lateBy} min after your window, because of slow traffic. We'll update you.` })}>
                      {told ? <><Check size={13} /> Store told</> : "Tell the store"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {problems.length === 0 && risks.length === 0 && <p className="muted small">All quiet: no problems reported and no truck at risk of being late.</p>}
          {problems.map((p) => (
            <div key={p.key} className="card flat" style={{ marginTop: 10, borderLeft: `4px solid ${p.ok ? "var(--done)" : "var(--problem)"}` }}>
              <b>{p.ok ? "✓ " : "⚠ "}{p.title}</b>
              <div className="small" style={{ margin: "4px 0 8px" }}>{p.text}</div>
              {p.to && <button className="btn primary" style={{ minHeight: 38 }} onClick={() => nav(p.to)}>Open incident <ArrowRight size={16} /></button>}
              {p.driver && (
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn primary" style={{ minHeight: 38 }} onClick={() => { dispatch({ type: "driverReportSeen", id: p.driver.id, by: user.name }); setToast({ text: "Driver sees you've got it" }); }}>Got it · tell the driver</button>
                  {!p.driver.storeText && <button className="btn secondary" style={{ minHeight: 38 }} onClick={() => setSms({ to: p.driver.outlet, who: `store ${p.driver.outlet}`, text: `Waypoint: your delivery is running about ${p.driver.delayMin} min late. New time about ${p.driver.newEta}.` })}>Tell the store</button>}
                </div>
              )}
              {p.store && (
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn primary" style={{ minHeight: 38 }} onClick={() => decideStore(p.store, "resend")}>Send on the next run</button>
                  <button className="btn secondary" style={{ minHeight: 38 }} onClick={() => decideStore(p.store, "credit")}>Credit the store</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    {sms && <SmsSheet sms={sms} onClose={() => setSms(null)} />}
    </DeskShell>
  );
}

export function Incident() {
  const { type, id } = useParams();
  const { dispatch, setToast, user, loaderReports } = useApp();
  const nav = useNavigate();
  const [choice, setChoice] = useState("A");
  if (type === "loader") {
    const rep = loaderReports.find((x) => x.id === id);
    if (!rep) return <Navigate to="/dispatch/live" replace />;
    const run = runsOf(plan, rep.vehicle).find((x) => x.run === rep.run) || runsOf(plan, rep.vehicle).find((x) => x.stops.some((s) => s.outlet === rep.outlet));
    // Spare time = the least slack of any stop on this run: waiting longer than that makes a stop late.
    const spare = run ? Math.max(0, Math.min(...run.stops.map((s) => (s.slack ?? 0)))) : 0;
    const wait = Math.min(15, spare);
    const canReplace = spare >= 10;
    const pick = choice === "A" && !canReplace ? "B" : choice;
    const decide = () => {
      const decision = pick === "A" ? "replace" : "short";
      dispatch({ type: "loaderDecision", id: rep.id, decision, by: user.name, waitMin: decision === "replace" ? wait : 0 });
      // Send short: reduce the old order, create the replacement order for the next run, tell the store.
      if (decision === "short") dispatch({ type: "shortReorder", id: rep.id, by: user.name, notify: true });
      else dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `Short at the Dock ${rep.vehicle} · ${rep.outlet}: replace ${rep.count} cases, wait up to ${wait} min` });
      setToast({ text: decision === "replace" ? "Sent to the dock: replace from stock" : "Sent short · new order for the next run · store told" });
      nav("/dispatch/live");
    };
    return (
      <DeskShell peakOnly nav={useDispatchNav()} title="Incident · Short at the Dock" subtitle={`${rep.at} · reported by ${rep.by} (loader)`}>
        <div className="panel incident" style={{ maxWidth: 760 }}>
          <div className="row" style={{ gap: 10 }}><Chip kind="problem">Short at the Dock</Chip><span className="muted small">{rep.vehicle} · run {run?.run ?? "–"} · {rep.outlet}{rep.ref ? ` · ${rep.ref}` : ""}</span></div>
          <h3 style={{ margin: "12px 0 4px", fontSize: 22 }}>{rep.count} of {rep.units} {rep.chilled ? "chilled " : ""}cases {rep.kind}</h3>
          {typeof rep.photo === "string" && <a href={rep.photo} target="_blank" rel="noreferrer"><img src={rep.photo} alt="Photo from the dock" style={{ maxWidth: 260, maxHeight: 180, borderRadius: 12, margin: "6px 0" }} /></a>}
          <div className={`tag ${canReplace ? "warn" : "bad"}`} style={{ fontSize: 13 }}><Timer size={14} /> {rep.vehicle} leaves {run?.start} · {spare} min spare before a stop would be late</div>
          <div className="col" style={{ gap: 10, marginTop: 16 }}>
            <button className={`option ${pick === "A" ? "sel" : ""}`} disabled={!canReplace} onClick={() => setChoice("A")}>
              <div className="row between"><b><Refrigerator size={16} /> A · Replace from {rep.chilled ? "the cold room" : "stock"}</b>{canReplace && <span className="tag ok">Recommended</span>}</div>
              <div className="muted small">{canReplace ? `${rep.vehicle} waits up to ${wait} min · every stop still on time · store gets the full order` : `Not enough spare time: waiting would make a stop late`}</div>
            </button>
            <button className={`option ${pick === "B" ? "sel" : ""}`} onClick={() => setChoice("B")}>
              <b>B · Send {rep.units - rep.count} now, re-order {rep.count}</b>
              <div className="muted small">Old order reduced to {rep.units - rep.count} · new order for {rep.count} cases, first on the next run · store told now</div>
            </button>
            <div className="option locked"><b><Lock size={14} /> Move part of this order to another truck</b><div className="muted small">Not allowed: orders are never split</div></div>
          </div>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={decide}>Send decision to the dock</button>
          </div>
        </div>
      </DeskShell>
    );
  }
  const r = reeferDown();
  const m3 = r.affected.reduce((s, o) => s + o.m3, 0);
  return (
    <DeskShell peakOnly nav={useDispatchNav()} title="Incident · Reefer Down" subtitle="03:26 · reported by Ruwan (driver)">
      <div className="two">
        <div className="panel incident">
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}><Chip kind="problem">Reefer Down</Chip><span className="muted small">VEH003 cooling failed at the gate</span><span className="tag warn" style={{ marginLeft: "auto" }}><Timer size={12} /> Re-plan window 30 min · 26 min left</span></div>
          <h3 style={{ margin: "12px 0 4px", fontSize: 22 }}>{r.affected.length} chilled orders · {round1(m3)} m³ · all from shops skipped yesterday 🛡</h3>
          <div className="muted small">{r.affected.map((o) => o.outlet).join(", ")}</div>
          <div className="card" style={{ marginTop: 14, background: "#fffaf0", borderColor: "#ffe08a" }}>
            <div className="card-title"><Zap size={18} /> Re-plan without VEH003</div>
            <div className="col" style={{ marginTop: 8 }}>
              <span><Check size={16} color="var(--done)" /> <b>{r.served} of {orders.length}</b> still served (was {r.before})</span>
              <span><ShieldCheck size={16} color="var(--done)" /> All {protectedCount} shops skipped yesterday still served</span>
              <span><RotateCw size={16} color="var(--deferred)" /> {r.newlyDeferred.length} more deferred: all were served yesterday</span>
            </div>
          </div>
          <div className="section-label" style={{ marginTop: 16 }}>Moves</div>
          {r.moves.map((m) => (
            <div key={m.order.ref} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <b>{m.order.outlet}</b><span className="muted">{m.order.units} ❄</span><ArrowRight size={16} /><b>{m.to}</b>
            </div>
          ))}
          <div className="option locked" style={{ marginTop: 14 }}><b><Ban size={14} /> Put chilled goods on a dry truck</b><div className="muted small">Never offered: chilled goods need a reefer</div></div>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={() => { dispatch({ type: "scenario", patch: { reefer: "approved" } }); dispatch({ type: "log", who: user.name, role: "Dispatcher · Peliyagoda", what: `Reefer Down: approved re-plan without VEH003 · ${r.served} of ${orders.length} served, ${r.newlyDeferred.length} more deferred` }); setToast({ text: "Re-plan approved · loaders, drivers and stores notified" }); nav("/dispatch/live"); }}>Approve re-plan &amp; notify everyone</button>
          </div>
        </div>
        <div className="panel">
          <div className="card-title"><RotateCw size={18} /> Newly deferred ({r.newlyDeferred.length})</div>
          {r.newlyDeferred.map((o) => (
            <div key={o.ref} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span><b>{o.outlet}</b> <span className="muted small">{o.district}</span></span><span className="small">❄ {round1(o.m3)} m³</span>
            </div>
          ))}
          <div className="card flat small" style={{ marginTop: 12 }}><MessageSquare size={14} style={{ verticalAlign: "-2px" }} /> Each store gets: “↻ Chilled order → tomorrow's first trip. Reason: truck fault. Dry order today.”</div>
        </div>
      </div>
    </DeskShell>
  );
}

export function Outlook() {
  const { depot, fleet } = useApp();
  const weeks = outlook.byDepot[depot];
  // Refrigerated capacity: average reefer size at this depot, and trips possible per day with today's fleet.
  const reefers = fleet.filter((v) => v.depot === depot && v.reefer);
  const ready = reefers.filter((v) => v.status !== "in_workshop" && v.driver);
  const avgM3 = reefers.reduce((a, v) => a + (v.m3 || 0), 0) / Math.max(1, reefers.length);
  // Typical load per trip, from today's plan (brand + district rules mean trips rarely leave full).
  const tripsOf = (reefer) => plan.lanes.filter((l) => l.vehicle.reefer === reefer).flatMap((l) => l.runs.map((r) => ({ r, v: l.vehicle })));
  const fill = (reefer) => { const ts = tripsOf(reefer); return ts.length ? ts.reduce((a, x) => a + x.r.m3, 0) / ts.reduce((a, x) => a + x.v.m3, 0) : 0.8; };
  const fillR = fill(true), fillD = fill(false);
  const dryVehicles = fleet.filter((v) => v.depot === depot && !v.reefer);
  const dryReady = dryVehicles.filter((v) => v.status !== "in_workshop" && v.driver);
  const avgDryM3 = dryVehicles.reduce((a, v) => a + (v.m3 || 0), 0) / Math.max(1, dryVehicles.length);
  const perDay = (w) => w.chilled / 6 / (avgM3 * fillR); // reefer trips a day (six operating days a week)
  const dryPerDay = (w) => (w.total - w.chilled + (w.other || 0)) / 6 / (avgDryM3 * fillD); // dry vehicle trips a day
  const vehiclesNeeded = (w) => Math.ceil(perDay(w) / 2) + Math.ceil(dryPerDay(w) / 2); // 2 trips per vehicle; one driver each
  const tripsAll = reefers.length * 2;
  const tripsReady = ready.length * 2;
  const peakDaily = depot === "Peliyagoda" ? chilledM3 : null; // the S1 peak day (Peliyagoda only)
  const avgDaily = weeks.reduce((a, w) => a + w.chilled, 0) / weeks.length / 6;
  const max = Math.max(...weeks.map((w) => w.total));
  const busiest = weeks.reduce((a, b) => (b.total > a.total ? b : a));
  const quietest = weeks.reduce((a, b) => (b.total < a.total ? b : a));
  const avg = weeks.reduce((s, w) => s + w.total, 0) / weeks.length;
  return (
    <DeskShell nav={useDispatchNav()} title="Capacity outlook" subtitle={`Forecast weeks ${weeks[0].week}–${weeks[weeks.length - 1].week} · ${formatDate(weeks[0].from)} to ${formatDate(weeks[weeks.length - 1].from)} 2026 · ${depot}`} actions={<DepotPill />}>
      <div className="panel">
        <div className="row between" style={{ flexWrap: "wrap" }}>
          <div className="card-title"><CalendarRange size={18} /> Weekly Fresh demand, m³</div>
          <div className="row small" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: "var(--deferred)" }} /> Chilled</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: "var(--planned)" }} /> Dry</span>
          </div>
        </div>
        <div className="bars">
          {weeks.map((w) => (
            <div key={w.week} className="bar" title={`W${w.week}: ${w.total} m³ (${w.chilled} chilled)`}>
              <div className="col" style={{ gap: 3, alignItems: "center", minHeight: 36, justifyContent: "flex-end" }}>{w.flags.map((f) => <span key={f} className="flag">{f}</span>)}</div>
              <span className="xs num" style={{ fontWeight: 700 }}>{Math.round(w.total)}</span>
              <div className="stack" style={{ height: `${(w.total / max) * 170}px` }}>
                <i style={{ flex: w.total - w.chilled, background: "var(--planned)" }} />
                <i style={{ flex: w.chilled, background: "var(--deferred)" }} />
              </div>
              <small>W{w.week}<br />{w.from ? formatDate(w.from).replace(/^\w+ /, "") : ""}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="card-title"><Truck size={18} /> Vehicles and drivers needed on an average day</div>
        <div className="muted small" style={{ margin: "4px 0 12px" }}>We have {reefers.length} reefers and {dryVehicles.length} dry vehicles, one driver each · ready today: {ready.length} reefers, {dryReady.length} dry</div>
        <div className="table-scroll">
          <table className="t">
            <thead><tr><th />{weeks.map((w) => <th key={w.week}>W{w.week}</th>)}</tr></thead>
            <tbody>
              <tr><td className="muted" style={{ whiteSpace: "nowrap" }}><Snowflake size={13} color="var(--way)" /> Reefer trips</td>{weeks.map((w) => <td key={w.week}><b className="num" style={perDay(w) > tripsReady ? { color: "var(--problem)" } : {}}>{round1(perDay(w))}</b></td>)}</tr>
              <tr><td className="muted" style={{ whiteSpace: "nowrap" }}>Dry trips</td>{weeks.map((w) => <td key={w.week}><b className="num" style={dryPerDay(w) > dryReady.length * 2 ? { color: "var(--problem)" } : {}}>{round1(dryPerDay(w))}</b></td>)}</tr>
              <tr><td className="muted" style={{ whiteSpace: "nowrap" }}>Vehicles = drivers</td>{weeks.map((w) => <td key={w.week}><b className="num">{vehiclesNeeded(w)}</b></td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="muted xs" style={{ marginTop: 6 }}>All brands. A vehicle runs up to 2 trips a day with one driver, so vehicles needed = drivers needed. Trips are counted at the load trips really carry today (one brand and district per trip leaves space). Red = more than today's ready vehicles can do.</div>
        {peakDaily && (
          <div className="banner" style={{ marginTop: 12, background: "var(--turmeric-tint)", color: "var(--ink)", border: "1px solid #ffe08a" }}>
            <AlertTriangle size={18} /> A normal day is fine, but a peak day like today needs {round1(peakDaily / avgDaily)}× the chilled space, with only {tripsReady} reefer trips ready.
          </div>
        )}
      </div>
      <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="kpi"><div className="label">Busiest week</div><div className="value">W{busiest.week}</div><div className="muted small">{Math.round(busiest.total)} m³ · {Math.round((busiest.total / avg - 1) * 100)}% above average</div></div>
        <div className="kpi"><div className="label">Quietest week</div><div className="value">W{quietest.week}</div><div className="muted small">{Math.round(quietest.total)} m³ · {quietest.flags.join(", ") || "no events"}</div></div>
        <div className="kpi" style={{ background: "var(--turmeric-tint)", borderColor: "#ffe08a" }}><div className="label">Suggestion</div><div className="small" style={{ fontWeight: 650, marginTop: 6 }}>{quietest.week < busiest.week ? `Book reefer workshop visits in W${quietest.week}, so every reefer is ready for W${busiest.week}.` : `Keep every reefer out of the workshop in W${busiest.week}; book workshop visits in W${quietest.week}.`}</div></div>
      </div>
    </DeskShell>
  );
}

/* Dispatcher log: decisions made by dispatchers (any depot), so each dispatcher sees what the others decided.
   Loader, store and admin actions live in the admin's activity log. */
export function TeamLog() {
  const { log } = useApp();
  const rows = log.filter((e) => e.role.startsWith("Dispatcher"));
  return (
    <DeskShell nav={useDispatchNav()} title="Dispatcher log">
      <div className="table-card">
        <div className="table-scroll">
          <table className="t">
            <thead><tr><th>When</th><th>Who</th><th>Depot</th><th>Decision</th></tr></thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={i}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{e.at}</td>
                  <td><span className="row" style={{ gap: 8 }}><span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{e.who[0]}</span><b>{e.who}</b></span></td>
                  <td className="muted">{e.role.split("·")[1]?.trim() || "Peliyagoda"}</td>
                  <td>{e.what}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 30 }}>No decisions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </DeskShell>
  );
}
