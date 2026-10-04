import { useState } from "react";
import { NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Camera, Check, ClipboardCheck, CloudOff, Info, ListOrdered, MessageSquare, PackageX, Pencil, Phone, PlusCircle, RotateCcw, ShieldCheck, Snowflake, Split as SplitIcon, Thermometer, Timer, Truck, UserRound, Bell, CalendarClock, Clock, X } from "lucide-react";
import { useApp } from "../state";
import { S1_DATE, downPlan, n, orders, outletOrders, plan, round1, stopKey, toMin, tripOf, unitsOf, vehicleOf } from "../data/model";
import { outletsAll, storeName } from "../data/accounts";
import { BrandTile, Chip, MobileFrame, Pic, Stepper, TopBar, nextOperatingDay, useClock, useRuns, useWho } from "../components/ui";

const NAV = [
  { to: "/store", label: "Deliveries", icon: Truck },
  { to: "/store/orders", label: "My orders", icon: ListOrdered },
  { to: "/store/order", label: "New order", icon: PlusCircle },
  { to: "/store/receive", label: "Check delivery", icon: ClipboardCheck },
  { to: "/store/profile", label: "My profile", icon: UserRound },
];

/* The signed-in store: any of the 120 store accounts. */
function useStore() {
  const { user } = useApp();
  const outlet = user?.outlet || "OUT034";
  const info = outletsAll.find((o) => o.id === outlet) || {};
  return { outlet, name: storeName[outlet] || user?.name, district: info.district, brand: info.brand || "Fresh" };
}

/* The phone layout at every size: on a big tablet or desktop it is one centred phone-like column. */
function StoreFrame({ title, sub, back, caption, dock, actions, children }) {
  const nav = useNavigate();
  const store = useStore();
  const { tf } = useApp();
  const cap = caption || { kicker: "Store account", title: `${store.name} · ${store.outlet}`, lines: ["One card per order: dry and chilled goods can travel on different trucks. Deferrals arrive with a reason, before opening."] };
  return (
    <MobileFrame caption={cap}>
      <div className="screen">
        <TopBar title={title} sub={sub} back={back} />
        <div className="body">{typeof children === "function" ? children(false) : children}</div>
        {dock && <div className="dock">{dock}</div>}
        <nav className="bottom-nav five" aria-label="Store menu">
          {NAV.map((x) => (
            <NavLink key={x.to} to={x.to} end className={({ isActive }) => (isActive ? "on" : "")}><span className="ic"><x.icon size={20} /></span>{tf(x.label)}</NavLink>
          ))}
        </nav>
      </div>
    </MobileFrame>
  );
}

// The planned stop for this store on a truck (arrival time, time the truck leaves the shop).
function stopFor(p, vehicle, outlet) {
  for (const no of [1, 2]) {
    const trip = tripOf(p, vehicle, no);
    const s = trip?.stops.find((x) => x.outlet === outlet);
    if (s) return { ...s, run: trip.run };
  }
  return null;
}

function orderInfo(o, scenario) {
  const moved = o.chilled && scenario.reefer === "approved" && vehicleOf(o.ref) === "VEH003";
  const vehicle = moved ? vehicleOf(o.ref, "veh003Down") : vehicleOf(o.ref);
  const stop = vehicle ? stopFor(moved ? downPlan : plan, vehicle, o.outlet) : null;
  return { moved, vehicle, stop, eta: stop ? stop.eta || null : null };
}

/* What happened to this order? A truck whose driver has signed in follows the driver's real records
   (all given, some missing, or not delivered); other trucks follow the plan's times at the clock. */
export function deliveryOf(info, outlet, delivered, now, tracked = { VEH003: true }) {
  if (!info.vehicle) return null;
  if (tracked[info.vehicle]) {
    const d = delivered[stopKey(info.vehicle, outlet)];
    return d?.synced ? { at: d.at, by: d.receivedBy || null, outcome: d.outcome, missing: d.missing || 0, reason: d.reason } : null;
  }
  const s = info.stop;
  return s?.leave && toMin(s.leave) <= toMin(now) ? { at: s.eta, by: null, outcome: "all" } : null;
}

/* The S1 plan is for Wed 30 Sep: "today" on that day, "tomorrow" the evening before, the date otherwise. */
const PLAN_DATE = S1_DATE;
const dayBefore = (iso) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - 1); return dt.toISOString().slice(0, 10); };
/* A run takes orders until 4:00 PM the day before it (booklet cutoff). */
const stillOpen = (run, clock) => { const cut = dayBefore(run); return clock.date < cut || (clock.date === cut && clock.time < "16:00"); };

/* Why an order waits: the dispatcher's own reason if they overrode the plan, otherwise the planner's. */
function deferralReason(o, planEdits, tf) {
  const edit = [...planEdits].reverse().find((e) => e.ref === o.ref && !e.to);
  if (edit) return edit.reason;
  return tf(o.m3 > 38 ? "The order is bigger than our largest truck. Please send it again as 2 smaller orders." : o.chilled ? "No refrigerated truck was left for your area on this run." : "No space was left on this run.");
}

function OrderCard({ o }) {
  const { scenario, delivered, published, planEdits, stopProgress, driverReports, publishedBy, tf, fd, tracked, runStarted, storeReports, dispatch, setToast, adjusted } = useApp();
  const who = useWho();
  const info = orderInfo(o, scenario);
  const adj = adjusted?.[o.ref]; // sent short at the depot: fewer cases today, the rest re-ordered
  const { moved, vehicle, eta } = info;
  const clock = useClock();
  const title = <div className="card-title"><BrandTile brand={o.brand} size={36} /> {o.chilled ? <><Snowflake size={18} color="var(--way)" /> {tf("Chilled")}</> : tf("Dry goods")} · <span>{adj ? <>{adj.units}<span className="muted" style={{ fontWeight: 600 }}> / {o.units}</span></> : o.units} {tf("{n} cases", { n: "" }).trim()}</span></div>;
  const size = <div className="muted small">{o.ref} · {round1(o.m3)} m³ · {n(Math.round(o.kg))} kg</div>;

  if (!published) {
    return (
      <div className="card">
        <div className="row between">{title}<Chip kind="planned">{tf("Ordered")}</Chip></div>{size}
        <div className="row small" style={{ marginTop: 10, gap: 8 }}><Clock size={16} color="var(--muted)" /> {tf("Tonight's plan comes out around 7 PM. The truck and arrival time will show here.")}</div>
      </div>
    );
  }
  if (!vehicle) {
    return (
      <div className="card" style={{ borderColor: "#99d6cf", background: "#f2fbf9" }}>
        <div className="row between">{title}<Chip kind="deferred">{tf("Deferred")}</Chip></div>{size}
        <div style={{ marginTop: 10, fontWeight: 700 }}>{tf("Moved to the {date} run.", { date: fd(nextOperatingDay(PLAN_DATE)) })}</div>
        <div className="small" style={{ marginTop: 4 }}><b>{tf("Why:")}</b> {deferralReason(o, planEdits, tf)}</div>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span className="tag shield"><ShieldCheck size={12} /> {tf("Goes first on the next run: it won't be skipped twice")}</span>
          <span className="tag ok"><Check size={12} /> {publishedBy?.at ? tf("You were told by SMS at {time}", { time: publishedBy.at }) : tf("You were told by SMS")}</span>
        </div>
      </div>
    );
  }
  const got = deliveryOf(info, o.outlet, delivered, clock.time, tracked);
  const failed = got?.outcome === "none";
  const done = !!got && !failed;
  // Live driver steps for trucks whose driver has signed in: on the way, arrived, delays the driver reported.
  const live = !!tracked[vehicle];
  const prog = live ? { ...(stopProgress[stopKey(vehicle, o.outlet)] || {}), leftAt: runStarted[`${vehicle}:${info.stop?.run}`] } : {};
  const delay = live ? driverReports.find((r) => r.outlet === o.outlet && r.vehicle === vehicle && r.synced && r.delayMin) : null;
  // The dispatcher moved this order after publishing: say so, with the new truck and time.
  const change = [...planEdits].reverse().find((e) => e.afterPublish && e.ref === o.ref && e.to);
  // Window closed and nothing yet: the store can ask where it is.
  const overdue = !got && toMin(clock.time) > toMin(o.close);
  const asked = storeReports.find((r) => r.ref === o.ref && r.kind === "notArrived");
  const notArrived = () => who.ask(tf("Report a problem"), (name) => {
    dispatch({ type: "storeReport", report: { outlet: o.outlet, name: storeName[o.outlet] || o.outlet, ref: o.ref, vehicle, kind: "notArrived", what: `${o.ref} not arrived (window closed ${o.close})`, by: name } });
    dispatch({ type: "log", who: name, role: `Store · ${o.outlet}`, what: `Reported ${o.ref} not arrived` });
    setToast({ text: tf("Sent by {name} · the dispatcher sees it now, with the driver's proof", { name }) });
  });
  const arriving = got ? (prog.arrivedAt ? tf("Arrived {time}", { time: prog.arrivedAt }) : tf("Arrived about {time}", { time: got.at }))
    : prog.arrivedAt ? tf("Arrived {time} · unloading", { time: prog.arrivedAt })
    : delay ? tf("Running about {n} min late · new time about {time}", { n: delay.delayMin, time: delay.newEta })
    : eta ? tf("Arriving about {time}", { time: eta }) : tf("Arriving after the truck's first run");
  const steps = [
    { label: <>{tf("Planned")} {o.deferredYesterday && <span className="tag shield"><ShieldCheck size={12} /> {tf("first in line: skipped yesterday")}</span>}</>, state: "done" },
    { label: tf("Truck {v}", { v: vehicle }), state: "done" },
    ...(prog.leftAt ? [{ label: tf("On the way · left {time}", { time: prog.leftAt }), state: "done" }] : []),
    { label: <b>{arriving} · {tf("window {from}–{to}", { from: o.open, to: o.close })}</b>, state: done || prog.arrivedAt ? "done" : "next" },
    { label: failed ? `${tf("Not delivered")} · ${got.at} · ${tf("goes first on the next run")}` : done ? `${tf("Delivered {time} · received by {name}", { time: got.at, name: got.by || tf("store staff") })}${got.missing ? ` · ${tf("{n} cases missing", { n: got.missing })}` : ""}${live ? ` · ${tf("photo + signature")}` : ""}` : tf("Delivered"), state: done || failed ? "done" : "todo" },
  ];
  return (
    <div className="card">
      <div className="row between">{title}{failed ? <Chip kind="problem">{tf("Not delivered")}</Chip> : done ? <Chip kind={got.missing ? "late" : "done"}>{tf(got.missing ? "Some missing" : "Delivered")}</Chip> : prog.arrivedAt ? <Chip kind="way">{tf("Unloading")}</Chip> : prog.leftAt ? <Chip kind="way">{tf("On the way")}</Chip> : <Chip kind="planned">{tf("Planned")}</Chip>}</div>{size}
      {adj && <div className="banner info" style={{ marginTop: 10 }}><Info size={18} /> <span>{adj.reason}. Today brings {adj.units}. The {adj.missing} are re-ordered as <b>{adj.newRef}</b> for the {fd(adj.run)} run, first in line.</span></div>}
      {change && <div className="banner info" style={{ marginTop: 10 }}><Info size={18} /> {tf("Changed {time}: now on truck {v}, about {eta}", { time: change.at, v: vehicle, eta: eta || "—" })}</div>}
      {overdue && !asked && <button className="btn secondary block" style={{ marginTop: 10 }} onClick={notArrived}><MessageSquare size={16} /> {tf("Not arrived yet? Tell the dispatcher")}</button>}
      {asked && <div className="banner info" style={{ marginTop: 10 }}><MessageSquare size={18} /> {tf("Your report {time}", { time: asked.at })} · {asked.decision ? `${asked.decidedBy}: ${tf(asked.decision === "resend" ? "we'll send them on the {date} run" : "credited to your account", { date: fd(nextOperatingDay(PLAN_DATE)) })}` : tf("the dispatcher is looking at it")}</div>}
      {who.sheet}
      {moved && <div className="banner info" style={{ marginTop: 10 }}><Info size={18} /> {tf("Your chilled order is on another truck ({v}) because of a refrigeration failure. Still inside your window.", { v: vehicle })}</div>}
      <ul className="tl">
        {steps.map((s, i) => (
          <li key={i} className={s.state === "next" ? "next" : s.state === "todo" ? "todo" : ""}>
            <span className="dot">{s.state === "done" && <Check size={10} strokeWidth={4} />}</span>{s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* "10 h 30 m left" in the reader's language. */
function useLeftText() {
  const { tf } = useApp();
  const runs = useRuns();
  const m = /(\d+) h (\d+) m/.exec(runs.leftText);
  return m ? tf("{h} h {m} m left", { h: m[1], m: m[2] }) : runs.leftText;
}

export function MyDeliveries() {
  const { scenario, delivered, published, storeOrders, smsSent, storeReports, tf, fd, tracked } = useApp();
  const nav = useNavigate();
  const store = useStore();
  const clock = useClock();
  const runs = useRuns();
  const left = useLeftText();
  const mine = outletOrders(store.outlet).sort((a, b) => Number(b.chilled) - Number(a.chilled));
  const infos = mine.map((o) => ({ o, ...orderInfo(o, scenario) }));
  const served = infos.filter((x) => x.vehicle);
  const deferred = infos.filter((x) => !x.vehicle);
  const arrived = served.filter((x) => deliveryOf(x, store.outlet, delivered, clock.time, tracked));
  const next = served.filter((x) => !arrived.includes(x)).sort((a, b) => (a.eta || "99").localeCompare(b.eta || "99"))[0];
  const done = arrived.length > 0;
  const word = clock.date === PLAN_DATE ? "Today's deliveries" : nextOperatingDay(clock.date) === PLAN_DATE ? "Tomorrow's deliveries" : null;
  const trucks = new Set(served.map((x) => x.vehicle)).size;
  const mineNext = storeOrders.filter((s) => s.outlet === store.outlet && !s.cancelled && s.run >= runs.next); // upcoming runs only
  const alerts = smsSent.filter((m) => m.to === store.outlet);
  const myReports = storeReports.filter((r) => r.outlet === store.outlet);
  const nextRunDate = fd(nextOperatingDay(PLAN_DATE));
  const extras = (
    <>
      {alerts.map((m, i) => <div key={`a${i}`} className="banner info"><Info size={18} /> {m.at} · {m.text}</div>)}
      {myReports.map((r) => (
        <div key={r.id} className={`banner ${r.decision ? "info" : "problem"}`}><MessageSquare size={18} /> {tf("Your report {time}", { time: r.at })}: {r.count ? tf("{n} cases {kind}", { n: r.count, kind: tf(r.kind) }) : r.what}{r.ref ? ` (${r.ref})` : ""} · {r.decision ? `${r.decidedBy}: ${r.decision === "resend" ? tf("we'll send them on the {date} run", { date: nextRunDate }) : tf("credited to your account")}` : tf("the dispatcher is looking at it")}</div>
      ))}
      {mineNext.map((s) => (
        <div key={s.ref} className="card flat" style={{ borderColor: "#bfe6cb", background: "#f3fbf5" }}>
          <div className="row between"><b>{tf("Order confirmed · {ref}", { ref: s.ref })}</b><span className="tag ok">{tf(s.run === runs.next ? "next run" : "following run")} · {fd(s.run)}</span></div>
          <div className="small muted">{tf("{dry} dry + {cold} chilled cases · sent {time} by {name}", { dry: s.dry, cold: s.cold, time: `${s.day !== clock.date ? `${fd(s.day)} ` : ""}${s.at}`, name: s.by })}</div>
        </div>
      ))}
      <button className="stop" onClick={() => nav("/store/order")}><RotateCcw size={20} color="var(--brinjal)" /> <b className="grow">{tf("Place an order · {date} run", { date: fd(runs.orderRun) })}</b> <span className="tag warn"><Timer size={12} /> {runs.closed ? tf("until 4:00 PM {date}", { date: fd(runs.next) }) : left}</span></button>
      <button className="stop" onClick={() => nav("/store/receive")}><MessageSquare size={20} color="var(--brinjal)" /> <span className="grow">{tf("Something wrong?")} <b>{tf("Report a problem")}</b></span></button>
    </>
  );
  const notices = (
    <>
      {published && deferred.length > 0 && <p className="muted small">{deferred.length === 1 ? tf("One order moved to the {date} run. The reason is on the order card.", { date: nextRunDate }) : tf("{n} orders moved to the {date} run. The reason is on the order card.", { n: deferred.length, date: nextRunDate })}</p>}
      {scenario.reefer === "approved" && served.some((x) => x.moved) && (
        <div className="banner info" style={{ marginTop: 10 }}><Info size={18} /> 03:31 · {tf("Chilled order moved to truck {v}. New arrival about {time}.", { v: served.find((x) => x.moved).vehicle, time: served.find((x) => x.moved).eta })}</div>
      )}
      {!published && <p className="muted small">{tf("Tonight's plan isn't out yet. We'll tell you here and by SMS as soon as it is.")}</p>}
      {published && !deferred.length && !served.some((x) => x.moved) && <p className="muted small">{tf("No changes to your deliveries. We'll tell you here and by SMS if anything changes.")}</p>}
    </>
  );
  const primary = done
    ? <button className="btn primary block" onClick={() => nav("/store/receive")}>{tf("Check what arrived")}</button>
    : <button className="btn secondary block"><Phone size={18} /> {tf("Call dispatcher")}</button>;
  const nextLabel = published && next ? (next.eta || tf("Second run")) : published ? "✓" : "—";
  return (
    <StoreFrame title={word ? tf(word) : tf("Deliveries · {date}", { date: fd(PLAN_DATE) })} sub={`${store.name} · ${store.outlet} ${store.district || ""} · ${mine.length === 1 ? tf("1 order") : tf("{n} orders", { n: mine.length })}`}
      dock={primary}
      actions={done ? <button className="btn primary" onClick={() => nav("/store/receive")}>{tf("Check what arrived")}</button> : <button className="btn secondary"><Phone size={18} /> {tf("Call dispatcher")}</button>}>
      {(wide) => wide ? (
        <>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="kpi"><div className="label"><CalendarClock size={14} /> {tf("Next arrival")}</div><div className="value" style={/^\d/.test(nextLabel) ? {} : { fontSize: 18, marginTop: 12 }}>{nextLabel}</div><div className="muted small">{published && next ? tf(next.o.chilled ? "Chilled · truck {v}" : "Dry · truck {v}", { v: next.vehicle }) : published ? tf("everything has arrived") : tf("after tonight's plan")}</div></div>
            <div className="kpi"><div className="label"><Truck size={14} /> {tf("Orders · {date}", { date: fd(PLAN_DATE) })}</div><div className="value">{mine.length}</div><div className="muted small">{published ? (trucks === 1 ? tf("on 1 truck") : tf("on {n} trucks", { n: trucks })) : tf("waiting for the plan")}</div></div>
            <div className="kpi"><div className="label"><Timer size={14} /> {tf("Order cutoff")}</div><div className="value">4:00 PM</div><div className="muted small">{tf("for the next run")}</div></div>
            <div className="kpi"><div className="label"><ShieldCheck size={14} /> {tf("Status")}</div><div className="value" style={{ fontSize: 20, marginTop: 12 }}>{!published ? tf("Waiting") : done && !next ? tf("Delivered") : deferred.length ? tf("{n} deferred", { n: deferred.length }) : mine.some((o) => o.deferredYesterday) ? tf("First in line today") : tf("On plan")}</div><div className="muted small">{!published ? tf("plan comes out tonight") : deferred.length ? tf("see the reason below") : mine.some((o) => o.deferredYesterday) ? tf("skipped yesterday, so first in line") : tf("everything is planned")}</div></div>
          </div>
          <div className="store-grid">
            <div className="col" style={{ gap: 14 }}>{mine.map((o) => <OrderCard key={o.ref} o={o} />)}</div>
            <div className="col" style={{ gap: 14 }}>
              <div className="panel"><div className="card-title"><Bell size={18} /> {tf("Notices")}</div>{notices}</div>
              {extras}
            </div>
          </div>
        </>
      ) : (
        <>
          {published && deferred.length > 0 && notices}
          {mine.map((o) => <OrderCard key={o.ref} o={o} />)}
          {!mine.length && <div className="card muted">{tf("No orders for this run.")}</div>}
          {extras}
        </>
      )}
    </StoreFrame>
  );
}

/* Size check while ordering: volume per case from the S1 orders (by brand), compared with the biggest vehicle that may
   serve this store. Orders are never split across trucks, so a too-big order is sent as several whole orders. */
const M3_PER_CASE = orders.reduce((acc, o) => {
  const k = `${o.brand}|${o.chilled ? "cold" : "dry"}`;
  acc[k] = acc[k] || { m3: 0, units: 0 };
  acc[k].m3 += o.m3; acc[k].units += o.units;
  return acc;
}, {});
const perCase = (brand, k) => { const x = M3_PER_CASE[`${brand}|${k}`] || M3_PER_CASE[`Fresh|${k}`]; return x.m3 / x.units; };
function biggestFor(outlet, chilled, fleet) {
  const o = outletsAll.find((x) => x.id === outlet);
  const ok = fleet.filter((v) => v.depot === (o?.depot || "Peliyagoda") && v.status !== "in_workshop" && (!chilled || v.reefer) && (o?.parking !== "van_only" || v.type === "van"));
  return { m3: Math.max(0, ...ok.map((v) => v.m3)), van: o?.parking === "van_only" };
}

/* What each brand orders (booklet: Fresh = groceries + chilled; Style = garments in cartons; Tech = appliances).
   Only Fresh has chilled goods. */
const ITEMS = {
  Fresh: { dry: [["Rice 5 kg bag", 30], ["Dhal 1 kg", 24], ["Tea 400 g", 18], ["Biscuits box", 12]], cold: [["Fresh milk crate", 80], ["Yoghurt crate", 48], ["Chicken 1 kg crate", 40], ["Cheese crate", 24]] },
  Style: { dry: [["Shirts carton", 12], ["Sarees carton", 8], ["Kids wear carton", 10], ["Hanging garments rail", 4]], cold: [] },
  Tech: { dry: [["TV 43-inch", 2], ["Refrigerator", 1], ["Washing machine", 1], ["Small appliances box", 4]], cold: [] },
};

function OrderSection({ title, rows, vals, set, icon }) {
  const { tf } = useApp();
  return (
    <div className="card">
      <div className="card-title">{icon} {title}</div>
      {rows.map(([name], i) => (
        <div key={name} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
          <span>{tf(name)}</span><Stepper value={vals[i]} onChange={(v) => set(vals.map((x, j) => (j === i ? v : x)))} />
        </div>
      ))}
      <div className="small" style={{ marginTop: 8, fontWeight: 700 }}>{tf("{n} cases", { n: vals.reduce((s, x) => s + x, 0) })} <span className="muted" style={{ fontWeight: 500 }}>· {tf("weight and volume calculated for you")}</span></div>
    </div>
  );
}

/* New order, or a change to one that is still before its cutoff (opened from My orders). */
export function PlaceOrder() {
  const nav = useNavigate();
  const { state: navState } = useLocation();
  const { setToast, dispatch, storeOrders, fleet, tf, fd } = useApp();
  const runs = useRuns();
  const left = useLeftText();
  const store = useStore();
  const brand = store.brand;
  const DRY = ITEMS[brand].dry, COLD = ITEMS[brand].cold;
  const editing = navState?.edit ? storeOrders.find((o) => o.ref === navState.edit && !o.cancelled && o.outlet === store.outlet) : null;
  const [dry, setDry] = useState(editing?.items?.dry || DRY.map((d) => d[1]));
  const [cold, setCold] = useState(editing?.items?.cold || COLD.map((d) => d[1]));
  const who = useWho();
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const run = editing ? editing.run : runs.orderRun;
  // Fresh sends dry and chilled as separate orders; each must fit one vehicle.
  const size = ["dry", "cold"].map((k) => {
    const cases = sum(k === "dry" ? dry : cold);
    const m3 = cases * perCase(brand, k);
    const big = biggestFor(store.outlet, k === "cold", fleet);
    return { k, cases, m3, big, parts: m3 > big.m3 ? Math.ceil(m3 / big.m3) : 1 };
  });
  const tooBig = size.filter((s) => s.parts > 1);
  const save = () => who.ask(tf("Change order {ref}", { ref: editing.ref }), (name) => {
    dispatch({ type: "storeOrderUpdate", ref: editing.ref, patch: { dry: sum(dry), cold: sum(cold), items: { dry, cold }, changedBy: name } });
    dispatch({ type: "log", who: name, role: `Store · ${store.outlet}`, what: `Changed order ${editing.ref} for the ${fd(run)} run: ${sum(dry)} dry + ${sum(cold)} chilled cases` });
    setToast({ text: tf("Order {ref} changed", { ref: editing.ref }) });
    nav("/store/orders");
  });
  const send = () => who.ask(tf("Send the order for {date}", { date: fd(runs.orderRun) }), (name) => {
    // A too-big order goes as several whole orders, each one small enough for a truck.
    const pieces = size.flatMap((s) => Array.from({ length: s.parts }, (_, i) => ({ k: s.k, cases: Math.floor(s.cases / s.parts) + (i < s.cases % s.parts ? 1 : 0) })));
    const groups = tooBig.length ? pieces.filter((p) => p.cases).map((p) => ({ dry: p.k === "dry" ? p.cases : 0, cold: p.k === "cold" ? p.cases : 0 })) : [{ dry: sum(dry), cold: sum(cold), items: { dry, cold } }];
    const refs = groups.map((g, i) => {
      const ref = `N-${String(storeOrders.length + i + 1).padStart(3, "0")}`;
      dispatch({ type: "storeOrder", order: { ref, outlet: store.outlet, name: store.name, dry: g.dry, cold: g.cold, items: g.items || null, by: name } });
      return ref;
    });
    dispatch({ type: "log", who: name, role: `Store · ${store.outlet}`, what: `Sent ${refs.length > 1 ? `${refs.length} orders (${refs.join(", ")})` : `order ${refs[0]}`} for the ${fd(runs.orderRun)} run: ${sum(dry)} dry + ${sum(cold)} chilled cases` });
    const head = refs.length > 1 ? tf("{n} orders confirmed for {date}", { n: refs.length, date: fd(runs.orderRun) }) : tf("Order {ref} confirmed for {date}", { ref: refs[0], date: fd(runs.orderRun) });
    setToast({ text: `${head} · ${runs.closed ? tf("today's 4 PM cutoff has passed") : tf("sent by {name}", { name })}` });
    nav("/store/orders");
  });
  const fits = tf(size[0].big.van ? (size.filter((s) => s.cases).length > 1 ? "fits one van each" : "fits one van") : size.filter((s) => s.cases).length > 1 ? "fits one truck each" : "fits one truck");
  const sizeNote = (
    <div className="card flat small" style={tooBig.length ? { borderColor: "#fbc9a3", background: "#fff8f1" } : {}}>
      {tooBig.length ? (
        <>
          <b>{tf("Too big for one vehicle")}</b>
          {tooBig.map((s) => <div key={s.k}>{tf("Order about {n} m³ · the biggest vehicle holds {max} m³", { n: round1(s.m3), max: s.big.m3 })}</div>)}
          <div style={{ marginTop: 4 }}>{tf("An order can't be split across trucks, so it will be sent as {n} separate orders that each fit.", { n: tooBig.reduce((a, s) => a + s.parts, 0) + size.filter((s) => s.parts === 1 && s.cases).length })}</div>
        </>
      ) : (
        <span className="muted">{size.filter((s) => s.cases).map((s) => tf(COLD.length ? (s.k === "dry" ? "Dry about {n} m³" : "Chilled about {n} m³") : "About {n} m³", { n: round1(s.m3) })).join(" · ")} · {fits} <Check size={12} /></span>
      )}
    </div>
  );
  const repeat = !editing && (
    <button className="stop" onClick={() => { setDry(DRY.map((d) => d[1])); setCold(COLD.map((d) => d[1])); }}>
      <RotateCcw size={20} color="var(--brinjal)" /> <b className="grow">{tf("Repeat yesterday's order")}</b> <span className="tag brinjal">{tf("Use")}</span>
    </button>
  );
  const cutoff = <div className="tag warn" style={{ alignSelf: "flex-start", fontSize: 13, padding: "5px 10px", whiteSpace: "normal", lineHeight: 1.35 }}><Timer size={14} /> {editing ? tf("Change until 4:00 PM {date}", { date: fd(dayBefore(run)) }) : runs.closed ? tf("Past 4:00 PM · this order goes on the {date} run", { date: fd(runs.orderRun) }) : tf("For the {date} run · closes 4:00 PM · {left}", { date: fd(runs.orderRun), left })}</div>;
  const button = editing ? tf("Save changes") : tooBig.length ? tf("Send as separate orders") : tf("Send order");
  const go = editing ? save : send;
  return (
    <StoreFrame title={editing ? tf("Change order {ref}", { ref: editing.ref }) : tf("New order · {date} run", { date: fd(run) })} sub={`${store.name} · ${store.outlet}`} back={editing ? "/store/orders" : "/store"}
      dock={<button className="btn primary block" disabled={editing && tooBig.length > 0} onClick={go}>{button}</button>}
      actions={<button className="btn primary" disabled={editing && tooBig.length > 0} onClick={go}>{button}</button>}>
      {(wide) => (
        <>
          {cutoff}
          {brand !== "Fresh" && <div className="card flat small">{tf(brand === "Style" ? "Style orders once a week for your delivery day. Order more before seasonal peaks." : "Tech orders as needed. Heavy and fragile items: one line per item.")}</div>}
          {repeat}
          <div className={wide ? "store-grid" : "col"} style={wide ? { gridTemplateColumns: "1fr 1fr" } : { gap: 12 }}>
            <OrderSection title={tf(COLD.length ? "Dry goods" : brand === "Tech" ? "Appliances" : "Garments")} rows={DRY} vals={dry} set={setDry} />
            {COLD.length > 0 && <OrderSection title={tf("Chilled goods")} rows={COLD} vals={cold} set={setCold} icon={<Snowflake size={18} color="var(--way)" />} />}
          </div>
          {sizeNote}
          {who.sheet}
        </>
      )}
    </StoreFrame>
  );
}

/* My orders: every order this store placed, when and by whom, for which run, and what happened to it.
   An order can be changed or cancelled until its run's 4:00 PM cutoff. */
export function MyOrders() {
  const nav = useNavigate();
  const { storeOrders, scenario, delivered, published, dispatch, setToast, tf, fd, tracked, adjusted } = useApp();
  const clock = useClock();
  const store = useStore();
  const who = useWho();
  const placed = storeOrders.filter((o) => o.outlet === store.outlet).map((o) => {
    const open = !o.cancelled && stillOpen(o.run, clock);
    return {
      key: o.ref, ref: o.ref, placed: `${fd(o.day)} · ${o.at}`, by: o.by, run: o.run, dry: o.dry, cold: o.cold, raw: o, open,
      status: o.cancelled ? ["deferred", tf("Cancelled")] : open ? ["planned", tf("Confirmed")] : ["way", tf("Closed · being planned")],
      note: o.changedAt ? tf("Changed {time}", { time: `${o.changedDay !== clock.date ? `${fd(o.changedDay)} ` : ""}${o.changedAt}` }) : open ? tf("Change until 4:00 PM {date}", { date: fd(dayBefore(o.run)) }) : "",
    };
  });
  // Today's run: the orders in the S1 plan, placed before yesterday's cutoff.
  const today = outletOrders(store.outlet).map((o) => {
    const info = orderInfo(o, scenario);
    const got = deliveryOf(info, store.outlet, delivered, clock.time, tracked);
    const status = !published ? ["planned", tf("Ordered")] : !info.vehicle ? ["deferred", tf("Deferred")] : got?.outcome === "none" ? ["problem", tf("Not delivered")] : got ? ["done", tf("Delivered")] : ["planned", tf("Planned")];
    return { key: o.ref, ref: o.ref, placed: tf("Before 4:00 PM {date}", { date: fd(dayBefore(PLAN_DATE)) }), by: "—", run: PLAN_DATE, dry: o.chilled ? 0 : unitsOf(o, adjusted), cold: o.chilled ? unitsOf(o, adjusted) : 0, open: false, status,
      note: [info.vehicle ? tf("Truck {v}", { v: info.vehicle }) : "", adjusted[o.ref] ? `${o.units} → ${adjusted[o.ref].units} · ${adjusted[o.ref].missing} re-ordered as ${adjusted[o.ref].newRef}` : ""].filter(Boolean).join(" · ") };
  });
  const rows = [...placed.sort((a, b) => b.raw.day.localeCompare(a.raw.day) || b.raw.at.localeCompare(a.raw.at)), ...today];
  const cancel = (r) => who.ask(tf("Cancel order"), (name) => {
    dispatch({ type: "storeOrderCancel", ref: r.ref, by: name });
    dispatch({ type: "log", who: name, role: `Store · ${store.outlet}`, what: `Cancelled order ${r.ref} for the ${fd(r.run)} run` });
    setToast({ text: tf("Order {ref} cancelled", { ref: r.ref }) });
  });
  const actions = (r) => r.open && (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn secondary" style={{ minHeight: 36, padding: "0 12px" }} onClick={() => nav("/store/order", { state: { edit: r.ref } })}><Pencil size={14} /> {tf("Change")}</button>
      <button className="btn ghost" style={{ minHeight: 36, padding: "0 10px", color: "var(--problem)" }} onClick={() => cancel(r)} aria-label={`${tf("Cancel order")} ${r.ref}`}><X size={14} /> {tf("Cancel order")}</button>
    </span>
  );
  const items = (r) => `${r.dry ? `${tf("Dry")} ${r.dry}` : ""}${r.dry && r.cold ? " · " : ""}${r.cold ? `❄ ${r.cold}` : ""}`;
  return (
    <StoreFrame title={tf("My orders")} sub={`${store.name} · ${store.outlet}`} back="/store"
      dock={<button className="btn primary block" onClick={() => nav("/store/order")}><PlusCircle size={18} /> {tf("New order")}</button>}
      actions={<button className="btn primary" onClick={() => nav("/store/order")}><PlusCircle size={18} /> {tf("New order")}</button>}>
      {(wide) => (
        <>
          <div className="muted small">{tf("Every order you placed, when, and by whom. You can change or cancel an order until its 4:00 PM cutoff.")}</div>
          {!rows.length && <div className="card muted">{tf("No orders yet.")}</div>}
          {wide ? (
            <div className="table-card">
              <div className="table-scroll">
                <table className="t">
                  <thead><tr><th>#</th><th>{tf("Placed")}</th><th>{tf("By")}</th><th>{tf("For run")}</th><th>{tf("Items")}</th><th>{tf("Status")}</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} style={r.raw?.cancelled ? { opacity: 0.6 } : {}}>
                        <td style={{ whiteSpace: "nowrap" }}><b>{r.ref}</b></td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.placed}</td>
                        <td>{r.by}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fd(r.run)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{items(r)}</td>
                        <td><Chip kind={r.status[0]}>{r.status[1]}</Chip>{r.note && <div className="muted xs" style={{ marginTop: 4 }}>{r.note}</div>}</td>
                        <td>{actions(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : rows.map((r) => (
            <div key={r.key} className="card" style={r.raw?.cancelled ? { opacity: 0.6 } : {}}>
              <div className="row between"><b>{r.ref}</b><Chip kind={r.status[0]}>{r.status[1]}</Chip></div>
              <div className="small" style={{ marginTop: 6 }}>{tf("Placed")}: {r.placed}{r.by !== "—" ? ` · ${r.by}` : ""}</div>
              <div className="small">{tf("For run")}: <b>{fd(r.run)}</b> · {items(r)}</div>
              {r.note && <div className="muted xs" style={{ marginTop: 4 }}>{r.note}</div>}
              {r.open && <div style={{ marginTop: 10 }}>{actions(r)}</div>}
            </div>
          ))}
          {who.sheet}
        </>
      )}
    </StoreFrame>
  );
}

export function Receive() {
  const { delivered, scenario, tf, tracked } = useApp();
  const clock = useClock();
  const store = useStore();
  const infos = outletOrders(store.outlet).map((o) => ({ o, ...orderInfo(o, scenario) })).filter((x) => x.vehicle);
  const arrived = infos.map((x) => ({ ...x, got: deliveryOf(x, store.outlet, delivered, clock.time, tracked) })).filter((x) => x.got && x.got.outcome !== "none");
  const [ref, setRef] = useState(arrived[0]?.o.ref);
  const pick = arrived.find((x) => x.o.ref === ref) || arrived[0];
  if (!pick) {
    const next = [...infos].sort((a, b) => (a.eta || "99").localeCompare(b.eta || "99"))[0];
    return (
      <StoreFrame title={tf("Check what arrived")} sub={store.name} back="/store">
        <div className="card muted">{tf("Nothing has arrived yet.")}{next?.eta ? ` ${tf(next.o.chilled ? "Next: chilled order, about {time}." : "Next: dry order, about {time}.", { time: next.eta })}` : ""} {tf("You can check an order once the driver has delivered it.")}</div>
      </StoreFrame>
    );
  }
  return <ReceiveOrder key={pick.o.ref} x={pick} arrived={arrived} onPick={setRef} />;
}

function ReceiveOrder({ x, arrived, onPick }) {
  const nav = useNavigate();
  const { setToast, dispatch, tf } = useApp();
  const store = useStore();
  const order = x.o;
  const [ok, setOk] = useState(order.units - (x.got.missing || 0)); // the driver's count of missing cases, if any
  const [kind, setKind] = useState(null);
  const who = useWho();
  const missing = order.units - ok;
  const receiver = x.got.by || tf("store staff");
  const send = () => who.ask(tf("Report a problem"), (name) => {
    dispatch({ type: "storeReport", report: { outlet: store.outlet, name: store.name, ref: order.ref, vehicle: x.vehicle, count: missing, kind, what: `${missing} ${order.chilled ? "chilled " : ""}${missing === 1 ? "case" : "cases"} ${kind}`, by: name } });
    dispatch({ type: "log", who: name, role: `Store · ${store.outlet}`, what: `Reported ${missing} ${order.chilled ? "chilled " : ""}${missing === 1 ? "case" : "cases"} ${kind} on ${order.ref}` });
    setToast({ text: tf("Sent by {name} · the dispatcher sees it now, with the driver's proof", { name }) });
    nav("/store");
  });
  const allOk = () => who.ask(tf("Confirm delivery"), (name) => {
    dispatch({ type: "log", who: name, role: `Store · ${store.outlet}`, what: `Confirmed ${order.ref} arrived in full` });
    setToast({ text: tf("Confirmed by {name}", { name }) });
    nav("/store");
  });
  const picker = arrived.length > 1 && (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {arrived.map((a) => <button key={a.o.ref} className={`filter ${a.o.ref === order.ref ? "on" : ""}`} aria-pressed={a.o.ref === order.ref} onClick={() => onPick(a.o.ref)}>{a.o.chilled ? `❄ ${tf("Chilled")}` : tf("Dry")} · {a.o.ref}</button>)}
    </div>
  );
  const proof = (
    <div className="card">
      <div className="section-label" style={{ margin: 0 }}>{tf("Proof from driver · {v}", { v: x.vehicle })}</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div style={{ flex: 1, height: 110, borderRadius: 12, background: "linear-gradient(135deg,#d9cfe0,#f3ecf5)", display: "flex", alignItems: "center", justifyContent: "center" }} role="img" aria-label="Delivery photo"><Camera color="var(--brinjal)" /></div>
        <div style={{ flex: 1, height: 110, borderRadius: 12, background: "#fff", border: "1px dashed var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "cursive", fontSize: 22, color: "var(--brinjal)" }} role="img" aria-label={`Signed by ${receiver}`}>{receiver}</div>
      </div>
    </div>
  );
  const report = (
    <>
      <div className="stop"><span className="big">{ok}</span><span className="grow">{tf("of {n} cases OK", { n: order.units })}</span><Stepper value={ok} onChange={(v) => setOk(Math.min(v, order.units))} /></div>
      {missing > 0 && (
        <>
          <div className="section-label">{tf("What's wrong with the other {n}?", { n: missing })}</div>
          <div className="pics">
            <Pic icon={PackageX} label={tf("Missing")} selected={kind === "missing"} onClick={() => setKind("missing")} />
            <Pic icon={SplitIcon} label={tf("Damaged")} selected={kind === "damaged"} onClick={() => setKind("damaged")} />
            {order.chilled && <Pic icon={Thermometer} label={tf("Warm")} selected={kind === "warm"} onClick={() => setKind("warm")} />}
          </div>
          {kind && <div className="stop"><Camera size={20} /> <b className="grow">{tf("Add a photo")}</b> <span className="tag">{tf("{n} cases {kind}", { n: missing, kind: tf(kind) })}</span></div>}
        </>
      )}
    </>
  );
  const canSend = missing > 0 && kind;
  const main = missing > 0
    ? <button className="btn primary block" disabled={!canSend} onClick={send}>{tf("Send to dispatcher")}</button>
    : <button className="btn primary block" onClick={allOk}>{tf("Everything is OK")} ✓</button>;
  return (
    <StoreFrame title={tf("Check what arrived")} sub={`${order.chilled ? tf("Chilled") : tf("Dry")} · ${tf("{ref} · delivered {time} · received by {name}", { ref: order.ref, time: x.got.at, name: receiver })}`} back="/store"
      dock={main}
      actions={missing > 0 ? <button className="btn primary" disabled={!canSend} onClick={send}>{tf("Send to dispatcher")}</button> : <button className="btn primary" onClick={allOk}>{tf("Everything is OK")} ✓</button>}>
      {(wide) => <>{picker}{wide ? <div className="store-grid">{proof}<div className="col" style={{ gap: 12 }}>{report}</div></div> : <>{proof}{report}</>}{who.sheet}</>}
    </StoreFrame>
  );
}

export function Dispute() {
  const { scenario, dispatch, setToast, hideDemo, user, peopleOf, tf } = useApp();
  const nav = useNavigate();
  if (user?.outlet && user.outlet !== "OUT074") return <Navigate to="/store" replace />;
  const synced = scenario.dead === "synced";
  const signer = peopleOf("STORE-OUT074")[0] || tf("store staff");
  const close = () => { dispatch({ type: "scenario", patch: { dead: "idle" } }); setToast({ text: tf("Report closed · thank you") }); nav("/store"); };
  const release = () => { dispatch({ type: "scenario", patch: { dead: "synced" } }); dispatch({ type: "offline", value: false }); };
  const waiting = hideDemo ? <div className="muted small" style={{ textAlign: "center" }}>{tf("Waiting for {v}'s records…", { v: "VEH010" })}</div> : <button className="btn secondary block" onClick={release}>Demo: signal returns for VEH010</button>;
  return (
    <StoreFrame title={tf("Deliveries · {date}", { date: storeName.OUT074 })} sub="OUT074 · Puttalam"
      caption={{ kicker: "Bad day 3", title: "Dead Zone · Puttalam", lines: ["The store says “not delivered”. The driver recorded proof offline. When the signal returns, the proof settles it automatically."] }}
      dock={synced ? <><button className="btn primary block" onClick={close}>{tf("Found it ✓ close report")}</button><button className="btn ghost block">{tf("Still a problem")}</button></> : waiting}
      actions={synced ? <><button className="btn ghost">{tf("Still a problem")}</button><button className="btn primary" onClick={close}>{tf("Found it ✓ close report")}</button></> : hideDemo ? null : <button className="btn secondary" onClick={release}>Demo: signal returns for VEH010</button>}>
      {(wide) => (
        <div className={wide ? "store-grid" : "col"} style={wide ? {} : { gap: 12 }}>
          <div className="card">
            <div className="row between"><b>{tf("Your report {time}", { time: "07:10" })}</b><Chip kind="problem">{tf("Problem")}</Chip></div>
            <div style={{ marginTop: 6 }}>“{tf("Our dry order hasn't arrived.")}”</div>
          </div>
          {synced ? (
            <div className="card" style={{ borderColor: "#bfe6cb", background: "#f3fbf5" }}>
              <div className="row between"><b style={{ color: "var(--done)" }}>{tf("✓ Delivered at {time}", { time: "07:02" })}</b><Chip kind="done">{tf("Delivered")}</Chip></div>
              <div className="small" style={{ margin: "6px 0 10px" }}>{tf("Recorded offline by the driver ({v}) · signed by {name} · sent {time}", { v: "VEH010", name: signer, time: "07:25" })}</div>
              <div className="row">
                <div style={{ flex: 1, height: 90, borderRadius: 12, background: "linear-gradient(135deg,#d9cfe0,#f3ecf5)", display: "flex", alignItems: "center", justifyContent: "center" }} role="img" aria-label="Delivery photo"><Camera color="var(--brinjal)" /></div>
                <div style={{ flex: 1, height: 90, borderRadius: 12, border: "1px dashed var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "cursive", fontSize: 20, color: "var(--brinjal)" }} role="img" aria-label={`Signed by ${signer}`}>{signer}</div>
              </div>
              <div className="muted small" style={{ marginTop: 10 }}>{tf("The driver had no signal on the Puttalam road. The proof was saved on the phone and sent when the signal returned.")}</div>
            </div>
          ) : (
            <div className="banner offline"><CloudOff size={18} /> {tf("{v} is in a known dead zone · waiting for its records", { v: "VEH010" })}</div>
          )}
        </div>
      )}
    </StoreFrame>
  );
}
