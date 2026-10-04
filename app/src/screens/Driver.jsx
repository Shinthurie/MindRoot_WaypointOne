import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { ChangeSecret } from "./Auth";
import { Fuel, KeyRound, List as ListIcon, LogOut, Route as RouteIcon, UserRound } from "lucide-react";
import DriverMap from "../components/DriverMap";
import { LANGS } from "../i18n";
import { AlertTriangle, ArrowLeftRight, Camera, Car, Check, CloudOff, DoorOpen, Map, MapPinOff, Mic, Navigation, Package, PackageMinus, PenLine, Phone, ShieldCheck, Snowflake, Thermometer, Timer, TrafficCone, Truck, Wrench, X, Disc3, Construction, MessageSquare } from "lucide-react";
import { useApp } from "../state";
import { RUN_DATE, fmt, fuelThisWeek, plan, runMin, runsOf, stopKey, toMin } from "../data/model";
import { storeName } from "../data/accounts";
import { BrandTile, Chip, MobileFrame, OfflineBanner, OrderTag, Pic, PlanNotReady, SlideConfirm, Speak, Split, Stepper, TopBar, useClock, PhotoButton, SignatureButton } from "../components/ui";

/* Field portal: the phone layout on every screen size (phones, big tablets, desktops), with the bottom bar. */
const useLayout = () => "phone";
const CAPTION = { kicker: "Driver · Field Mode", title: "Ruwan · VEH003", lines: ["Big numbers and one turmeric button. Works with no signal, and every record syncs later without duplicates."] };
const dockKey = { rear_dock: "rearDock", street: "street", mall_bay: "mallBay" };

/* The signed-in driver's own vehicle (one driver per vehicle). */
function useVeh() {
  const { user } = useApp();
  return { veh: user?.vehicle || "VEH003", driver: user?.name || "Ruwan" };
}

/* The run the driver is on now (first run with an undelivered stop) and the one after it. */
function useTrip() {
  const { delivered } = useApp();
  const { veh } = useVeh();
  const runs = runsOf(plan, veh);
  const done = (s) => delivered[stopKey(veh, s.outlet)];
  const idx = runs.findIndex((r) => r.stops.some((s) => !done(s)));
  const i = idx === -1 ? runs.length - 1 : idx;
  return { t1: runs[i], t2: idx === -1 ? null : runs[i + 1] || null, all: runs, done, veh };
}

/* Orders the dispatcher moved on or off this truck after publishing. */
function useRouteChanges() {
  const { planEdits, driverAck } = useApp();
  const { veh } = useVeh();
  const changes = planEdits.filter((e) => e.afterPublish && (e.from === veh || e.to?.vehicle === veh));
  return { changes, unseen: changes.length > (driverAck[veh] || 0) };
}

function TripTop({ back }) {
  const { t } = useApp();
  const { t1, veh } = useTrip();
  if (!t1) return <TopBar title={veh} sub={t("nothingToLoad")} back={back} />;
  return <TopBar title={`${t("trip")} ${t1.run} · ${t1.district}`} sub={`${veh} · ${t1.stops.length} ${t1.stops.length === 1 ? t("stop") : t("stops")} · ${t("leaves")} ${t1.start}`} problem="/driver/problem" back={back} />;
}


/* Left panel on tablets, the whole screen on phones. */
function TripList({ active }) {
  const { t, fleetEdits, driverReports, loadedTrucks, planEdits, dispatch, stopProgress, online, user } = useApp();
  const nav = useNavigate();
  const clock = useClock();
  const [view, setView] = useState("list");
  const { t1, t2, done, veh } = useTrip();
  // Arrivals the driver recorded on this truck, by shop (the map puts the truck there).
  const arrivedMap = Object.fromEntries(Object.entries(stopProgress).filter(([k]) => k.startsWith(`${veh}:`)).map(([k, v]) => [k.split(":")[1], v]));
  const { changes, unseen } = useRouteChanges();
  // The dispatcher re-planned without this truck: its stops went to other trucks.
  const cancelled = fleetEdits?.[veh]?.status === "in_workshop";
  const workshop = cancelled && <div className="banner problem"><Wrench size={18} /> Trip moved to other trucks. Return {veh} to the workshop bay.</div>;
  if (!t1) return <div className="body field">{workshop}<div className="card flat muted">{t("nothingToLoad")}</div></div>;
  const next = t1.stops.find((s) => !done(s));
  const current = active ?? next?.n;
  const loaded = loadedTrucks[`${veh}:${t1.run}`];
  const last = changes[changes.length - 1];
  return (
    <div className="body field">
      <OfflineBanner />
      {unseen && last && (
        <div className="banner problem" role="status" style={{ flexWrap: "wrap" }}>
          <ArrowLeftRight size={18} /> <span className="grow">{t("routeChanged")} · {last.at} · {last.to?.vehicle === veh ? `+ ${last.ref}` : `− ${last.ref}`}</span>
          <button className="btn secondary" style={{ minHeight: 34 }} onClick={() => dispatch({ type: "driverAck", vehicle: veh, count: changes.length })}>{t("gotIt")}</button>
        </div>
      )}
      {workshop}
      {!cancelled && driverReports.some((r) => r.vehicle === veh && !r.outlet && !r.seenBy) && <div className="banner problem"><Thermometer size={18} /> Truck problem reported · waiting for dispatcher</div>}
      <div className={`banner ${loaded ? "done" : "info"}`}><Package size={18} /> {loaded ? `${t("loadedBy")} ${loaded.by} · ${loaded.at}` : t("notLoaded")}</div>
      <div className="seg" role="tablist" aria-label={t("navTrip")}>
        <button role="tab" aria-selected={view === "list"} className={view === "list" ? "on" : ""} onClick={() => setView("list")}><ListIcon size={16} /> {t("listView")}</button>
        <button role="tab" aria-selected={view === "map"} className={view === "map" ? "on" : ""} onClick={() => setView("map")}><Map size={16} /> {t("mapView")}</button>
      </div>
      {view === "map" && (
        <>
          <DriverMap run={t1} now={runMin(clock)} depot={user?.depot || "Peliyagoda"} doneOutlets={new Set(t1.stops.filter(done).map((s) => s.outlet))} arrived={arrivedMap} nextOutlet={next?.outlet} />
          {!online && <div className="banner offline"><CloudOff size={18} /> {t("mapNeedsSignal")}</div>}
        </>
      )}
      {view === "list" && t1.stops.map((s) => {
        const d = done(s);
        return (
          <button key={s.outlet} className={`stop ${!cancelled && current === s.n ? "hl" : ""} ${d || cancelled ? "done" : ""}`} onClick={() => !cancelled && nav(`/driver/stop/${s.n}`)}>
            <OrderTag refs={s.orders.map((o) => o.ref)} />
            <div className="grow">
              <div className="big">{s.eta}</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{s.units} {t("cases")} {s.chilled && <Snowflake size={16} style={{ verticalAlign: "-3px" }} color="var(--way)" />}</div>
              <div className="muted small"><b>{s.outlet}</b> · {t(dockKey[s.dock])} · {t("opens")} {s.open}</div>
            </div>
            {d ? (d.outcome === "none" ? <Chip kind="problem">✕</Chip> : d.synced ? <Chip kind="done">{t("sent")}</Chip> : <Chip kind="offline" />) : <Speak text={`${s.outlet}. Order ${s.orders.map((o) => o.ref).join(" and ")}. ${s.units} cases. Arrive ${s.eta}`} />}
          </button>
        );
      })}
      {t2 && (
        <div className="card flat row" style={{ opacity: 0.75 }}>
          <BrandTile brand={t2.brand} size={40} />
          <div className="grow"><b>{t("trip")} {t2.run} · {t2.district}</b><div className="muted small">{t2.stops.length} {t2.stops.length === 1 ? t("stop") : t("stops")} · {t2.stops.reduce((a, s) => a + s.units, 0)} {t("cases")} · {t("leaves")} {t2.start}</div></div>
          {t2.chilled && <Snowflake size={18} color="var(--way)" />}
        </div>
      )}
      {next && <button className="btn blue" onClick={() => nav(`/driver/map/${next.n}`)}><Map size={18} /> {t("openMap")}</button>}
    </div>
  );
}

/* A stop has two steps: on the way (the run started at the depot) and the hand-over at the shop. */
function DeliverySteps({ step }) {
  const { t } = useApp();
  const steps = [t("stepOnWay"), t("stepHandOver")];
  return (
    <ol className="steps" aria-label="Delivery steps">
      {steps.map((label, i) => (
        <li key={label} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""} aria-current={i + 1 === step ? "step" : undefined}>
          <span>{i + 1 < step ? <Check size={14} strokeWidth={3} /> : i + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}

/* Main action for the next stop: start the run once at the depot, then "I've arrived" at each shop. */
function useNextAction(s) {
  const { t, runStarted, stopProgress, dispatch, fd } = useApp();
  const nav = useNavigate();
  const clock = useClock();
  const { t1, veh } = useTrip();
  const started = runStarted[`${veh}:${t1?.run}`];
  const arrived = stopProgress[stopKey(veh, s?.outlet)]?.arrivedAt;
  if (!s) return null;
  // The evening before (the plan is published then), the run cannot start yet.
  if (!started && runMin(clock) < 0) return { label: `${t("leaves")} ${fd ? fd(RUN_DATE) : RUN_DATE} · ${t1.start}`, icon: Timer, disabled: true, go: () => {} };
  if (!started) return { label: `${t("startRun")} · ${t("trip")} ${t1.run}`, icon: Navigation, go: () => { dispatch({ type: "startRun", vehicle: veh, run: t1.run }); dispatch({ type: "log", who: veh, role: `Driver · ${veh}`, what: `Left the depot on run ${t1.run}` }); nav(`/driver/map/${s.n}`); } };
  return { label: `${arrived ? t("continueStep") : t("iArrived")} · ${s.outlet}`, go: () => { if (!arrived) dispatch({ type: "arrive", vehicle: veh, outlet: s.outlet }); nav(`/driver/deliver/${s.n}`); } };
}

function StopPanel({ s, wide }) {
  const { t, runStarted, driverReports } = useApp();
  const nav = useNavigate();
  const { t1, veh } = useTrip();
  const started = runStarted[`${veh}:${t1.run}`];
  const action = useNextAction(s);
  const reports = driverReports.filter((r) => r.outlet === s.outlet && r.vehicle === veh);
  return (
    <>
      <div className="body field">
        <DeliverySteps step={1} />
        {started && <div className="banner info" role="status"><Navigation size={18} /> {t("onTheWay")} {started} · ETA {reports.find((r) => r.newEta)?.newEta || s.eta}</div>}
        {reports.map((r) => (
          <div key={r.id} className={`banner ${r.seenBy ? "info" : "problem"}`}><AlertTriangle size={18} /> {r.label}{r.delayMin ? ` · +${r.delayMin} min` : ""} · {r.at}{!r.synced ? " · saved, sends with signal" : r.seenBy ? ` · ${t("seenBy")} ${r.seenBy}` : ""}</div>
        ))}
        <div className="row" style={{ justifyContent: wide ? "flex-start" : "center", padding: "8px 0", gap: 16 }}>
          <OrderTag refs={s.orders.map((o) => o.ref)} size="lg" />
          {wide && <div><div className="huge">{s.eta}</div><div className="muted" style={{ marginTop: 6 }}>{s.outlet} · {s.district}</div></div>}
        </div>
        {[
          [Timer, `${t("window")} ${s.open} – ${s.close}`],
          [DoorOpen, t(dockKey[s.dock])],
          [Snowflake, `${s.units} ${t("cases")}${s.chilled ? ` · ${t("chilled")}` : ""}`],
          ...(s.protected ? [[ShieldCheck, t("protectedNote")]] : []),
        ].map(([Icon, text]) => (
          <div key={text} className="stop"><Icon size={24} color="var(--brinjal)" /> <b style={{ fontSize: 17 }}>{text}</b></div>
        ))}
        <div className="row">
          <button className="btn blue grow" onClick={() => nav(`/driver/map/${s.n}`)}><Map size={18} /> {t("map")}</button>
          <button className="btn secondary grow"><Phone size={18} /> {t("callShop")}</button>
        </div>
        {started && (
          <>
            <button className="btn secondary block" style={{ borderColor: "var(--problem)", color: "var(--problem)" }} onClick={() => nav(`/driver/issue/${s.n}`)}><AlertTriangle size={18} /> {t("reportIssue")}</button>
            <div className="muted xs" style={{ textAlign: "center" }}>{t("safeStop")}</div>
          </>
        )}
      </div>
      <div className="dock">
        {action && <button className="btn primary field block" disabled={action.disabled} onClick={action.go}>{action.icon && <action.icon size={20} />} {action.label}</button>}
      </div>
    </>
  );
}

/* Hand-over: what arrived, photo and signature, who received it. Arrival time is already recorded. */
function DeliverPanel({ s, wide }) {
  const { t, online, dispatch, stopProgress, setToast, peopleOf } = useApp();
  const nav = useNavigate();
  const clock = useClock();
  const { t1, t2, done, veh, driver } = { ...useTrip(), ...useVeh() };
  const [outcome, setOutcome] = useState("all");
  const [missing, setMissing] = useState(1);
  const [reason, setReason] = useState("shopClosed");
  const [photo, setPhoto] = useState(null); // the delivery photo (small JPEG)
  const [signed, setSigned] = useState(null); // the receiver's signature (PNG)
  const staff = peopleOf(`STORE-${s.outlet}`);
  const receivers = staff.length ? staff : [`${t("nightStaff")} 1`, `${t("nightStaff")} 2`];
  const [receiver, setReceiver] = useState(receivers[0]);
  const arrivedAt = stopProgress[stopKey(veh, s.outlet)]?.arrivedAt;
  const lateBy = arrivedAt ? toMin(arrivedAt) - toMin(s.close) : 0;
  const early = arrivedAt && toMin(arrivedAt) < toMin(s.open) && toMin(clock.time) < toMin(s.open);
  const ready = outcome === "none" ? photo : photo && signed;
  const finish = () => {
    dispatch({ type: "deliver", vehicle: veh, outlet: s.outlet, open: s.open, outcome, missing: outcome === "some" ? missing : 0, reason: outcome === "none" ? reason : null, online, receivedBy: outcome === "none" ? null : receiver, photo, signature: outcome === "none" ? null : signed });
    dispatch({ type: "log", who: driver, role: `Driver · ${veh}`, what: outcome === "all" ? `Delivered to ${s.outlet}` : outcome === "some" ? `Delivered to ${s.outlet} with ${missing} cases missing` : `Could not deliver to ${s.outlet} (${t(reason)})` });
    setToast({ text: online ? `${s.outlet} sent to dispatcher and store` : `${s.outlet} saved on phone · sends when signal returns` });
    const remaining = t1.stops.filter((x) => x.outlet !== s.outlet && !done(x));
    if (!remaining.length && t2) setToast({ text: `${t("trip")} ${t1.run} ${t("done")} · ${t("backToDepot")} · ${t("trip")} ${t2.run}` });
    nav(remaining.length || t2 ? "/driver" : "/driver/sync");
  };
  return (
    <>
      <div className="body field">
        {wide && <div className="row" style={{ gap: 14 }}><OrderTag refs={s.orders.map((o) => o.ref)} /><div><div className="big">{s.units} {s.chilled && <Snowflake size={22} color="var(--way)" />}</div><div className="muted">{s.outlet} · {s.district}</div></div></div>}
        <DeliverySteps step={2} />
        <OfflineBanner />
        {arrivedAt && <div className="stop"><Timer size={22} color="var(--brinjal)" /><b className="grow" style={{ fontSize: 17 }}>{t("arrivedAt")} {arrivedAt}</b>{lateBy > 0 ? <span className="tag bad">{lateBy} min {t("late")}</span> : <span className="tag ok">{t("window")} {s.open}–{s.close}</span>}</div>}
        {early && <div className="banner info"><Timer size={18} /> {t("waitOpen")} {s.open}</div>}
        <div className="pics">
          <Pic icon={Check} label={t("allGiven")} selected={outcome === "all"} onClick={() => setOutcome("all")} />
          <Pic icon={PackageMinus} label={t("someMissing")} selected={outcome === "some"} onClick={() => setOutcome("some")} />
          <Pic icon={X} label={t("cantDeliver")} selected={outcome === "none"} red onClick={() => setOutcome("none")} />
        </div>
        {outcome === "some" && <div className="stop"><b className="grow" style={{ fontSize: 17 }}>{t("howManyMissing")}</b><span className="big" style={{ marginRight: 8 }}>{missing}</span><Stepper value={missing} onChange={(v) => setMissing(Math.min(Math.max(1, v), s.units))} min={1} /></div>}
        {outcome === "none" && (
          <>
            <div className="section-label">{t("whyNot")}</div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {["shopClosed", "refused", "noAccess"].map((r) => <button key={r} className={`btn ${reason === r ? "primary" : "secondary"} grow`} style={reason === r ? { boxShadow: "none" } : {}} aria-pressed={reason === r} onClick={() => setReason(r)}>{t(r)}</button>)}
            </div>
          </>
        )}
        <div className={wide ? "row" : "col"} style={{ gap: 12 }}>
          <PhotoButton value={photo} onChange={setPhoto} icon={Camera} label={t("takePhoto")} doneLabel={t("photo")} highlight />
          {outcome !== "none" && (
            <SignatureButton value={signed} onChange={setSigned} icon={PenLine} label={t("sign")} doneLabel={t("signed")} highlight={!!photo} who={receiver} />
          )}
        </div>
        {outcome !== "none" && (
          <>
            <div className="section-label">{t("receivedBy")}</div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {receivers.map((r) => (
                <button key={r} className={`btn ${receiver === r ? "primary" : "secondary"} grow`} style={receiver === r ? { boxShadow: "none" } : {}} aria-pressed={receiver === r} onClick={() => setReceiver(r)}>{r}</button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="dock">
        {ready ? <SlideConfirm label={`${t("slideFinish")} · ${s.outlet}`} onDone={finish} /> : <button className="btn primary field block" disabled>{t("slideFinish")} · {s.outlet}</button>}
      </div>
    </>
  );
}

/* The delivery screen shows the hand-over once the driver has arrived; before that, the stop details. */
function StepPanel({ s, wide }) {
  const { stopProgress } = useApp();
  const { veh } = useVeh();
  return stopProgress[stopKey(veh, s.outlet)]?.arrivedAt ? <DeliverPanel key={`d${s.n}`} s={s} wide={wide} /> : <StopPanel key={`a${s.n}`} s={s} wide={wide} />;
}

function AllDonePanel() {
  const { t } = useApp();
  const nav = useNavigate();
  const { t1 } = useTrip();
  return (
    <>
      <div className="body field" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <span className="shape" style={{ width: 96, height: 96, borderRadius: 28, background: "var(--done)" }}><Check size={48} /></span>
        <h2 style={{ margin: 0 }}>{t("trip")} {t1?.run ?? 1} · {t("done")}</h2>
      </div>
      <div className="dock"><button className="btn primary field block" onClick={() => nav("/driver/sync")}>{t("sync")}</button></div>
    </>
  );
}

function DriverTripScreen() {
  const { t, fleetEdits } = useApp();
  const nav = useNavigate();
  const layout = useLayout();
  const { t1, done, veh } = useTrip();
  const next = t1?.stops.find((s) => !done(s));
  const cancelled = fleetEdits?.[veh]?.status === "in_workshop";
  const action = useNextAction(next);
  if (layout !== "phone") {
    return (
      <MobileFrame>
        <div className="screen">
          <TripTop />
          <Split left={<TripList />} right={next && !cancelled ? <StopPanel s={next} wide /> : <AllDonePanel />} />
          <DriverNav />
        </div>
      </MobileFrame>
    );
  }
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TripTop />
        <TripList />
        <div className="dock">
          {next && !cancelled && action
            ? <button className="btn primary field block" disabled={action.disabled} onClick={action.go}>{action.icon && <action.icon size={20} />} {action.label}</button>
            : <button className="btn primary field block" onClick={() => nav("/driver/sync")}>{t("sync")}</button>}
        </div>
        <DriverNav />
      </div>
    </MobileFrame>
  );
}

function StopDetailsScreen() {
  const layout = useLayout();
  const { n } = useParams();
  const s = useTrip().t1?.stops[Number(n) - 1];
  if (!s) return <PlanNotReady title="Driver" sub="Peliyagoda" />;
  if (layout !== "phone") {
    return (
      <MobileFrame>
        <div className="screen"><TripTop /><Split left={<TripList active={s.n} />} right={<StopPanel s={s} wide />} /><DriverNav /></div>
      </MobileFrame>
    );
  }
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={s.outlet} sub={s.district} back="/driver" problem="/driver/problem" />
        <StopPanel s={s} />
      <DriverNav /></div>
    </MobileFrame>
  );
}

function DeliverScreen() {
  const layout = useLayout();
  const { n } = useParams();
  const s = useTrip().t1?.stops[Number(n) - 1];
  if (!s) return <PlanNotReady title="Driver" sub="Peliyagoda" />;
  if (layout !== "phone") {
    return (
      <MobileFrame>
        <div className="screen"><TripTop /><Split left={<TripList active={s.n} />} right={<StepPanel s={s} wide />} /><DriverNav /></div>
      </MobileFrame>
    );
  }
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={<span className="row" style={{ gap: 10 }}><OrderTag refs={s.orders.map((o) => o.ref)} size="sm" /> {s.units} {s.chilled && <Snowflake size={20} />}</span>} sub={`${s.outlet} · ${s.district}`} back problem="/driver/problem" />
        <StepPanel s={s} />
      <DriverNav /></div>
    </MobileFrame>
  );
}

export function DriverSync() {
  const { t, online, outbox, delivered } = useApp();
  const nav = useNavigate();
  const { all, veh } = useTrip();
  const stops = all.flatMap((r) => r.stops);
  const mine = stops.filter((s) => delivered[stopKey(veh, s.outlet)]);
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={t("sync")} sub={veh} back="/driver" />
        <div className="body field">
          {stops.map((s) => {
            const d = delivered[stopKey(veh, s.outlet)];
            return (
              <div key={s.outlet} className="stop">
                <OrderTag refs={s.orders.map((o) => o.ref)} size="sm" />
                <b className="grow">{s.outlet} · {d ? d.at : "—"}</b>
                {!d ? <Chip kind="planned" /> : d.synced ? <Chip kind="done">{t("sent")}</Chip> : <Chip kind="offline" />}
              </div>
            );
          })}
          {online && outbox.length === 0 && mine.length > 0 && <div className="banner done"><Check size={20} /> {t("allSent")}</div>}
          {!online && <div className="banner offline"><CloudOff size={18} /> {outbox.length} {t("waiting")}</div>}
        </div>
        <div className="dock"><button className="btn primary field block" onClick={() => nav("/driver")}>{t("backToDepot")}</button></div>
      <DriverNav /></div>
    </MobileFrame>
  );
}

export function VehicleProblem() {
  const { t, dispatch, setToast, online, driverReports, user } = useApp();
  const nav = useNavigate();
  const { veh } = useVeh();
  const [kind, setKind] = useState("cool");
  const already = driverReports.some((r) => r.vehicle === veh && !r.outlet && !r.seenBy);
  const send = () => {
    dispatch({ type: "driverReport", online, report: { vehicle: veh, outlet: null, kind, label: kind === "cool" ? t("coolingFailed") : kind === "engine" ? t("engine") : t("tyre"), by: user?.name || veh } });
    setToast({ text: "Dispatcher alerted · keep the doors closed" });
    nav("/driver");
  };
  return (
    <MobileFrame>
      <div className="screen">
        <TopBar title={t("vehicleProblem")} sub={veh} back />
        <div className="body field">
          <div className="pics">
            <Pic icon={Thermometer} label={t("coolingFailed")} selected={kind === "cool"} red onClick={() => setKind("cool")} />
            <Pic icon={Wrench} label={t("engine")} selected={kind === "engine"} red onClick={() => setKind("engine")} />
            <Pic icon={Disc3} label={t("tyre")} selected={kind === "tyre"} red onClick={() => setKind("tyre")} />
          </div>
          <div className="card" style={{ fontSize: 17, fontWeight: 650, lineHeight: 1.5 }}>{t("keepClosed")}</div>
          <button className="stop"><Mic size={24} color="var(--brinjal)" /> <b style={{ fontSize: 17 }}>{t("voiceNote")}</b></button>
          {already && <div className="banner problem">Already reported · waiting for the dispatcher</div>}
        </div>
        <div className="dock"><SlideConfirm red label={t("slideReport")} onDone={send} /></div>
      <DriverNav /></div>
    </MobileFrame>
  );
}

/* Before the dispatcher publishes, the trip pages show "plan not ready"; the menu, account, sync and vehicle problem
   work as usual. */
function Gate({ children }) {
  const { published, user, t } = useApp();
  if (published) return children;
  return (
    <MobileFrame>
      <div className="screen">
        <TopBar title={`${user?.name || "Driver"} · ${user?.vehicle || ""}`} sub={t("navTrip")} problem="/driver/problem" />
        <div className="body field" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <span className="shape" style={{ width: 72, height: 72, borderRadius: 22, background: "var(--planned)" }}><Timer size={34} /></span>
          <h2 style={{ margin: "8px 0 0" }}>{t("planNotReady")}</h2>
          <p className="muted" style={{ maxWidth: 340, lineHeight: 1.6, margin: 0 }}>{t("planNotReadyText")}</p>
        </div>
        <DriverNav />
      </div>
    </MobileFrame>
  );
}
export const DriverTrip = () => <Gate><DriverTripScreen /></Gate>;
export const StopDetails = () => <Gate><StopDetailsScreen /></Gate>;
export const Deliver = () => <Gate><DeliverScreen /></Gate>;

/* Report an issue on the road: the dispatcher sees it on the Live board and, if chosen, the store gets the new time.
   Works offline: it is saved on the phone and sent when signal returns. */
function IssueScreen() {
  const { t, dispatch, online, setToast } = useApp();
  const nav = useNavigate();
  const { n } = useParams();
  const { veh, driver } = useVeh();
  const s = useTrip().t1?.stops[Number(n) - 1];
  const [kind, setKind] = useState("traffic");
  const [delay, setDelay] = useState(20);
  const [tellStore, setTellStore] = useState(true);
  if (!s) return <PlanNotReady title={driver} sub={veh} />;
  const KINDS = [
    ["traffic", TrafficCone, t("issueTraffic")], ["blocked", Construction, t("issueBlocked")], ["vehicle", Wrench, t("issueVehicle")],
    ["accident", Car, t("issueAccident")], ["cantfind", MapPinOff, t("issueCantFind")], ["other", MessageSquare, t("issueOther")],
  ];
  const label = KINDS.find((k) => k[0] === kind)[2];
  const newEta = fmt(toMin(s.eta) + delay);
  const send = () => {
    const refs = s.orders.map((o) => o.ref).join(", ");
    const storeText = tellStore ? `Waypoint: your delivery (${refs}) is running about ${delay} min late (${label.toLowerCase()}). New time about ${newEta}.` : null;
    dispatch({ type: "driverReport", online, report: { vehicle: veh, outlet: s.outlet, kind, label, delayMin: delay, newEta, storeText, by: driver } });
    dispatch({ type: "log", who: driver, role: `Driver · ${veh}`, what: `Reported ${label.toLowerCase()} before ${s.outlet} · about ${delay} min late` });
    setToast({ text: online ? `Sent to dispatcher${tellStore ? ` and ${s.outlet}` : ""}` : "Saved on phone · sends when signal returns" });
    nav(-1);
  };
  return (
    <MobileFrame caption={{ kicker: "Driver · on the road", title: "Report an issue", lines: ["One tap to say what's wrong and how late, when safely stopped. The dispatcher sees it on the Live board and the store gets the new time."] }}>
      <div className="screen">
        <TopBar title={`⚠ ${t("reportIssue")}`} sub={`${veh} · ${s.outlet} · ETA ${s.eta}`} back />
        <div className="body field fit">
          <div className="banner info"><AlertTriangle size={18} /> {t("safeStop")}</div>
          <div className="pics">
            {KINDS.map(([k, Icon, text]) => <Pic key={k} icon={Icon} label={text} selected={kind === k} red={k === "accident" || k === "vehicle"} onClick={() => setKind(k)} />)}
          </div>
          <div className="stop"><Timer size={22} color="var(--brinjal)" /><b className="grow" style={{ fontSize: 18 }}>{t("delayBy")}</b><span className="big" style={{ marginRight: 8 }}>{delay}</span><span className="muted">min</span>
            <span className="row" style={{ gap: 6, marginLeft: 10 }}>
              <button className="order-chip" onClick={() => setDelay(Math.max(0, delay - 10))} aria-label="Less delay">−10</button>
              <button className="order-chip" onClick={() => setDelay(delay + 10)} aria-label="More delay">+10</button>
            </span>
          </div>
          <div className="muted" style={{ fontWeight: 650 }}>{t("newEta")} {newEta} · {t("window")} {s.open}–{s.close}{toMin(newEta) > toMin(s.close) ? ` · ${toMin(newEta) - toMin(s.close)} min ${t("late")}` : ""}</div>
          <button className={`stop ${tellStore ? "hl" : ""}`} onClick={() => setTellStore(!tellStore)} aria-pressed={tellStore}>
            <MessageSquare size={22} color="var(--brinjal)" /><b className="grow" style={{ fontSize: 17 }}>{t("tellStore")} · {s.outlet}</b>{tellStore ? <Check color="var(--done)" strokeWidth={3} /> : <span className="tickbox" aria-hidden="true" />}
          </button>
          <button className="stop"><Mic size={22} color="var(--brinjal)" /> <b style={{ fontSize: 17 }}>{t("voiceNote")}</b></button>
          <div className="muted small">{t("sentTo")}: Dispatcher{tellStore ? ` · ${s.outlet}` : ""}{!online ? " · saved on the phone until signal returns" : ""}</div>
        </div>
        <div className="dock fit"><SlideConfirm red label={t("slideReport")} onDone={send} /></div>
      <DriverNav /></div>
    </MobileFrame>
  );
}

export const DriverIssue = () => <Gate><IssueScreen /></Gate>;

/* ---------------- Bottom navigation (phone and tablet): Trip · All trips · Account ---------------- */
function DriverNav() {
  const { t } = useApp();
  const tabs = [["/driver", Truck, "navTrip"], ["/driver/trips", RouteIcon, "navTrips"], ["/driver/account", UserRound, "navAccount"]];
  return (
    <nav className="bottom-nav" aria-label="Driver menu">
      {tabs.map(([to, Icon, key]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "on" : "")}>
          <span className="ic"><Icon size={20} /></span>{t(key)}
        </NavLink>
      ))}
    </nav>
  );
}

/* All trips: today's runs in order, what happened at each stop, distance and fuel. */
function TripsScreen() {
  const { t, loadedTrucks, fd, runStarted } = useApp();
  const clock = useClock();
  const nav = useNavigate();
  const { all, t1, done, veh } = useTrip();
  const [openRun, setOpenRun] = useState(t1?.run ?? null);
  const stops = all.flatMap((r) => r.stops);
  const doneStops = stops.filter(done);
  const failed = doneStops.filter((s) => done(s).outcome === "none").length;
  const statusOf = (r) => (r.stops.every(done) ? ["done", t("tripDone")] : r === t1 ? ["way", t("tripNow")] : ["planned", t("tripNext")]);
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={t("todayTrips")} sub={`${veh} · ${fd(clock.date)}`} problem="/driver/problem" />
        <div className="body field fit">
          <div className="kpis mini">
            <div className="kpi"><div className="label"><Check size={14} /> {t("stopsDone")}</div><div className="value">{doneStops.length} / {stops.length}</div></div>
            <div className="kpi"><div className="label"><X size={14} /> {t("notDeliveredCount")}</div><div className="value">{failed}</div></div>
            <div className="kpi"><div className="label"><Fuel size={14} /> {t("fuelToday")}</div><div className="value">{Math.round(all.reduce((a, r) => a + r.fuelL, 0))} L</div></div>
          </div>
          {!all.length && <div className="card flat muted">{t("nothingToLoad")}</div>}
          {all.map((r) => {
            const [kind, label] = statusOf(r);
            const loaded = loadedTrucks[`${veh}:${r.run}`];
            const isOpen = openRun === r.run;
            return (
              <div key={r.run} className={`card trip-card ${r === t1 ? "current" : ""}`}>
                <button className="trip-head" onClick={() => setOpenRun(isOpen ? null : r.run)} aria-expanded={isOpen}>
                  <BrandTile brand={r.brand} size={44} />
                  <div className="grow" style={{ textAlign: "left" }}>
                    <b style={{ fontSize: 17 }}>{t("trip")} {r.run} · {r.district}</b>
                    <div className="muted small">{r.start}–{r.end} · {r.stops.length} {r.stops.length === 1 ? t("stop") : t("stops")} · {r.stops.reduce((a, s) => a + s.units, 0)} {t("cases")}{r.chilled ? " · ❄" : ""}</div>
                    <div className="muted xs">{t("distance")} {Math.round(r.km)} km · {Math.round(r.fuelL)} L{loaded ? ` · ${t("loadedBy")} ${loaded.by}` : ""}{runStarted[`${veh}:${r.run}`] ? ` · ${t("onTheWay")} ${runStarted[`${veh}:${r.run}`]}` : ""}</div>
                  </div>
                  <Chip kind={kind}>{label}</Chip>
                </button>
                {isOpen && (
                  <div className="col" style={{ gap: 8, marginTop: 10 }}>
                    {r.stops.map((s) => {
                      const d = done(s);
                      return (
                        <button key={s.outlet} className="stop" style={{ boxShadow: "none" }} onClick={() => r === t1 && !d && nav(`/driver/stop/${s.n}`)}>
                          <OrderTag refs={s.orders.map((o) => o.ref)} size="sm" />
                          <div className="grow" style={{ textAlign: "left" }}><b>{s.outlet}</b> · {s.eta}<div className="muted small">{s.units} {t("cases")} · {t("window")} {s.open}–{s.close}</div></div>
                          {d ? (d.outcome === "none" ? <Chip kind="problem">✕ {d.at}</Chip> : d.outcome === "some" ? <Chip kind="late">−{d.missing} · {d.at}</Chip> : <Chip kind="done">{d.at}</Chip>) : <Chip kind="planned" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DriverNav />
      </div>
    </MobileFrame>
  );
}

/* Account: who I am, my vehicle, fuel this week, language, records waiting to send, sign out. */
function AccountScreen() {
  const { t, tf, user, fleet, delivered, tracked, lang, dispatch, online, outbox } = useApp();
  const clock = useClock();
  const nav = useNavigate();
  const { veh, driver } = useVeh();
  const v = fleet.find((x) => x.id === veh) || {};
  const f = fuelThisWeek(veh, runMin(clock), delivered, tracked);
  const pct = f ? Math.min(100, (f.total / f.quota) * 100) : 0;
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={t("navAccount")} sub={`${driver} · ${user?.id || ""}`} />
        <div className="body field fit">
          <div className="card row" style={{ gap: 14 }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 24 }}>{driver[0]}</span>
            <div className="grow"><b style={{ fontSize: 19 }}>{driver}</b><div className="muted small">{user?.id} · {v.depot || user?.depot || "Peliyagoda"}</div></div>
          </div>
          <div className="card">
            <div className="card-title"><Truck size={18} /> {t("myVehicle")} · {veh}</div>
            <div className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}><span className="muted">{t("capacity")}</span><b>{v.m3} m³ · {v.kg?.toLocaleString("en-US")} kg</b></div>
            <div className="row between small" style={{ padding: "6px 0" }}><span className="muted">{v.type === "van" ? "Van" : "Truck"}</span><b>{v.reefer ? `❄ ${t("reefer")}` : t("dry")}</b></div>
          </div>
          {f && (
            <div className="card">
              <div className="card-title"><Fuel size={18} /> {t("fuelThisWeek")}</div>
              <div className="row between"><b className="big">{Math.round(f.total)} / {f.quota} L</b><span className="muted">{Math.round(pct)}%</span></div>
              <div className="progress" style={{ height: 8, marginTop: 6 }}><i style={{ width: `${pct}%`, background: pct >= 90 ? "var(--problem)" : pct >= 70 ? "var(--late)" : "var(--done)" }} /></div>
              <div className="muted xs" style={{ marginTop: 4 }}>{t("fuelToday")}: +{Math.round(f.today)} L</div>
            </div>
          )}
          <button className="stop" onClick={() => nav("/driver/sync")}>
            <CloudOff size={22} color="var(--brinjal)" /><b className="grow" style={{ fontSize: 16 }}>{outbox.length ? `${outbox.length} ${t("waitingToSend")}` : t("allSaved")}</b>{!online && <Chip kind="offline" />}
          </button>
          <div className="stop" style={{ flexWrap: "wrap" }}>
            <b className="grow" style={{ fontSize: 16 }}>{tf("Language")}</b>
            <span className="row" style={{ gap: 6 }}>
              {LANGS.map((l) => <button key={l.code} className={`btn ${lang === l.code ? "primary" : "secondary"}`} style={{ minHeight: 38, padding: "0 12px", boxShadow: "none" }} aria-pressed={lang === l.code} onClick={() => dispatch({ type: "lang", lang: l.code })}>{{ en: "English", si: "සිංහල", ta: "தமிழ்" }[l.code]}</button>)}
            </span>
          </div>
          <button className="stop" onClick={() => nav("/driver/problem")}><Wrench size={22} color="var(--problem)" /><b className="grow" style={{ fontSize: 16 }}>{t("vehicleProblem")}</b></button>
          <ChangeSecret field tf={tf} />
          <button className="btn secondary block" onClick={() => { dispatch({ type: "logout" }); nav("/"); }}><LogOut size={18} /> {t("signOut")}</button>
        </div>
        <DriverNav />
      </div>
    </MobileFrame>
  );
}

export const DriverTrips = () => <Gate><TripsScreen /></Gate>;
export const DriverAccount = () => <AccountScreen />;

/* In-app map for the trip: the route from the depot through every stop, the stop you're heading to, and the truck.
   Opens from "Start run", the Map buttons and "Open map"; nothing leaves the app. */
function MapScreen() {
  const { t, stopProgress, online, user } = useApp();
  const nav = useNavigate();
  const clock = useClock();
  const { n } = useParams();
  const { t1, done, veh } = useTrip();
  const target = t1 ? t1.stops[Number(n) - 1] || t1.stops.find((s) => !done(s)) || t1.stops[0] : null;
  const action = useNextAction(target && !done(target) ? target : null); // every hook runs before any early return
  if (!t1 || !target) return <PlanNotReady title={veh} sub="" />;
  const arrived = Object.fromEntries(Object.entries(stopProgress).filter(([k]) => k.startsWith(`${veh}:`)).map(([k, v]) => [k.split(":")[1], v]));
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={`${t("trip")} ${t1.run} · ${t1.district}`} sub={`${veh} · ${target.outlet} · ETA ${target.eta}`} back="/driver" problem="/driver/problem" />
        <div className="body field fit" style={{ paddingBottom: 8 }}>
          <DriverMap run={t1} now={runMin(clock)} depot={user?.depot || "Peliyagoda"} doneOutlets={new Set(t1.stops.filter(done).map((s) => s.outlet))} arrived={arrived} nextOutlet={target.outlet} height="calc(100dvh - 330px)" />
          {!online && <div className="banner offline"><CloudOff size={18} /> {t("mapNeedsSignal")}</div>}
          <div className="stop" style={{ boxShadow: "none" }}>
            <OrderTag refs={target.orders.map((o) => o.ref)} size="sm" />
            <div className="grow"><b style={{ fontSize: 17 }}>{target.outlet} · {target.eta}</b><div className="muted small">{target.units} {t("cases")} · {t("window")} {target.open}–{target.close} · {t(dockKey[target.dock])}</div></div>
          </div>
        </div>
        <div className="dock fit">
          {action && <button className="btn primary field block" disabled={action.disabled} onClick={action.go}>{action.icon && <action.icon size={20} />} {action.label}</button>}
        </div>
      <DriverNav /></div>
    </MobileFrame>
  );
}
export const DriverMapScreen = () => <Gate><MapScreen /></Gate>;
