import { useState } from "react";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Camera, Check, ClipboardList, Droplets, History, Home, Mic, Monitor, PackageX, Snowflake, Split as SplitIcon, Thermometer, Truck, Undo2, UserPlus, Users, Refrigerator } from "lucide-react";
import { useApp } from "../state";
import { orders, plan, reeferDown, runsOf, stopUnits, toMin } from "../data/model";
import { BrandChip, Chip, LangChip, MobileFrame, OrderTag, Pic, PlanNotReady, SlideConfirm, Speak, Stepper, TopBar, useClock, } from "../components/ui";

/* Field portal: the phone layout on every screen size (phones, big tablets, desktops), with the bottom bar. */
const useLayout = () => "phone";
const CAPTION = { kicker: "Loader · Field Mode", title: "Peliyagoda dock", lines: ["Tap a load, say who you are, load in the order shown. Every tick and problem carries a name, and the dispatcher sees it live."] };

/* The run a truck is being loaded for at the clock time: its first run today that hasn't left yet.
   Trucks come back after run 1 and are loaded again for run 2. */
export function loadingRun(veh, time) {
  const now = toMin(time);
  return runsOf(plan, veh).find((r) => toMin(r.start) > now) || null;
}
const tickKey = (veh, run, n) => `${veh}:${run}:${n}`;

/* Every load at this depot today (each truck's next run), soonest first, with its status. */
function useLoads() {
  const clock = useClock();
  const { loaded, user, fleet, loadStarts, loadedTrucks, loaderReports } = useApp();
  const depot = user?.depot || "Peliyagoda";
  const byId = Object.fromEntries(fleet.map((v) => [v.id, v]));
  const lanes = plan.lanes.filter((l) => l.runs.length && (byId[l.vehicle.id]?.depot || "Peliyagoda") === depot);
  const now = toMin(clock.time);
  const loads = lanes
    .map((l) => ({ l, run: loadingRun(l.vehicle.id, clock.time) }))
    .filter((x) => x.run)
    .map(({ l, run }) => {
      const veh = l.vehicle.id;
      const k = `${veh}:${run.run}`;
      const done = run.stops.filter((s) => loaded[tickKey(veh, run.run, s.n)]).length;
      const finished = loadedTrucks[k];
      const started = loadStarts[k];
      const problem = loaderReports.find((r) => r.vehicle === veh && !r.acked);
      return { veh, run, k, done, total: run.stops.length, finished, started, problem, driver: byId[veh]?.driver?.name, minsLeft: toMin(run.start) - now,
        status: finished ? "loaded" : started || done ? "loading" : "toload" };
    })
    .sort((a, b) => a.run.start.localeCompare(b.run.start) || a.veh.localeCompare(b.veh));
  const gone = lanes.filter((l) => !loadingRun(l.vehicle.id, clock.time)).map((l) => l.vehicle.id);
  return { loads, gone, clock, depot };
}

/* Orders the dispatcher moved after publishing: the trucks involved must check their list again. */
function usePlanChanges() {
  const { planEdits } = useApp();
  const late = planEdits.filter((e) => e.afterPublish);
  const trucks = new Set(late.flatMap((e) => [e.from, e.to?.vehicle].filter(Boolean)));
  return { late, trucks };
}

/* Decisions and plan changes that need the dock now. */
function Alerts() {
  const { t, scenario, loaderReports, dispatch, person } = useApp();
  const nav = useNavigate();
  const answers = loaderReports.filter((r) => r.decision && !r.acked);
  const { late, trucks } = usePlanChanges();
  const last = late[late.length - 1];
  return (
    <>
      {late.length > 0 && (
        <div className="banner problem" role="status">
          <ArrowLeftRight size={18} /> {t("planChanged")} {last.at ? `${last.at} ` : ""}· {[...trucks].join(", ")} · {t("checkAgain")}
        </div>
      )}
      {answers.map((r) => (
        <div key={r.id} className="banner info" role="status" style={{ flexWrap: "wrap" }}>
          <Refrigerator size={18} /> <span className="grow">{r.decidedBy}: {r.decision === "replace" ? `replace ${r.count} cases from stock` : `send ${r.units - r.count}${r.newRef ? ` · ${r.count} re-ordered as ${r.newRef}` : ""}`} · {r.outlet} · {r.vehicle}</span>
          {r.decision === "replace"
            ? <button className="btn primary" style={{ minHeight: 36 }} onClick={() => nav(`/loader/replace/${r.id}`)}>{t("start")}</button>
            : <button className="btn secondary" style={{ minHeight: 36 }} onClick={() => { dispatch({ type: "loaderAck", id: r.id }); dispatch({ type: "log", who: person || "Loader", role: "Loader · depot", what: `Sent ${r.vehicle} short: ${r.what} for ${r.outlet}` }); }}>{t("done")} ✓</button>}
        </div>
      ))}
      {scenario.reefer === "approved" && !scenario.reeferMoved && (
        <button className="banner problem" style={{ border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => nav("/loader/move")}>
          <ArrowLeftRight size={18} /> {t("planChanged")}: VEH003 → {t("moveCrates")}
        </button>
      )}
    </>
  );
}

/* Bottom navigation on phone and tablet: Home · Today's loads · Log · Problems. */
function LoaderNav() {
  const { t, loaderReports } = useApp();
  const open = loaderReports.filter((r) => !r.acked).length;
  const tabs = [["/loader", Home, "homeTab"], ["/loader/loads", Truck, "todaysLoads"], ["/loader/log", History, "loaderLog"], ["/loader/problems", AlertTriangle, "problemsTab"]];
  return (
    <nav className="bottom-nav" aria-label="Loader menu">
      {tabs.map(([to, Icon, key]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "on" : "")}>
          <span className="ic" style={{ position: "relative" }}><Icon size={20} />{key === "problemsTab" && open > 0 && <b className="nav-badge">{open}</b>}</span>{t(key)}
        </NavLink>
      ))}
    </nav>
  );
}

function Shell({ title, sub, back, children, dock, right }) {
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={title} sub={sub} back={back} right={right} />
        <div className="body field fit">{children}</div>
        {dock && <div className="dock fit">{dock}</div>}
        <LoaderNav />
      </div>
    </MobileFrame>
  );
}

const statusChip = (x, t) => x.status === "loaded" ? <Chip kind="done">{t("loadedDone")}</Chip> : x.status === "loading" ? <Chip kind="way">{t("loadingNow")}</Chip> : <Chip kind="planned">{t("toLoad")}</Chip>;
const leavesText = (x, t) => (x.minsLeft >= 0 ? `${t("leavesIn")} ${x.minsLeft} ${t("minShort")}` : "");

/* Home: what's next, today's progress, and the way into loads, log and problems. */
function HomeScreen() {
  const { t, user, loaderReports } = useApp();
  const nav = useNavigate();
  const { loads, clock, depot } = useLoads();
  const next = loads.find((x) => x.status !== "loaded");
  const ready = loads.filter((x) => x.status === "loaded").length;
  const open = loaderReports.filter((r) => !r.acked).length;
  const layout = useLayout();
  if (layout === "wall") return <WallScreen />;
  return (
    <Shell title={`${depot} dock`} sub={`${user?.id || ""} · ${clock.time}`}>
      <Alerts />
      {next ? (
        <button className={`card load-next ${next.minsLeft < 15 ? "urgent" : ""}`} onClick={() => nav(`/loader/load/${next.veh}`)}>
          <div className="muted small" style={{ fontWeight: 800 }}>{t("nextLoad")}</div>
          <div className="row" style={{ gap: 10, marginTop: 4 }}>
            <b style={{ fontSize: 26 }}>{next.veh}</b>{next.run.chilled && <Snowflake size={20} color="var(--way)" />}
            <span className="grow" />
            <span className="big">{next.run.start}</span>
          </div>
          <div className="row small" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}><BrandChip brand={next.run.brand} small /> {next.run.district} · {next.total} {next.total === 1 ? t("stop") : t("stops")} · {leavesText(next, t)}</div>
          {next.started && <div className="small" style={{ marginTop: 6, fontWeight: 700 }}>{t("loadingBy")} {next.started.by} · {next.done}/{next.total}</div>}
        </button>
      ) : <div className="card flat">{t("noLoadsLeft")} ✓</div>}
      <div className="kpis mini">
        <div className="kpi"><div className="label"><Truck size={14} /> {t("todaysLoads")}</div><div className="value">{loads.length}</div></div>
        <div className="kpi"><div className="label"><Check size={14} /> {t("loadedDone")}</div><div className="value">{ready}</div></div>
        <div className="kpi"><div className="label"><AlertTriangle size={14} /> {t("problemsTab")}</div><div className="value">{open}</div></div>
      </div>
      <div className="tile-grid">
        <button className="tile" onClick={() => nav("/loader/loads")}><span className="ic" style={{ background: "#ea7a12" }}><Truck size={22} /></span><b>{t("todaysLoads")}</b><small>{loads.length - ready} {t("toLoad").toLowerCase()}</small></button>
        <button className="tile" onClick={() => nav("/loader/log")}><span className="ic" style={{ background: "#7c3aed" }}><History size={22} /></span><b>{t("loaderLog")}</b><small>{t("started")} · {t("finished")}</small></button>
        <button className="tile" onClick={() => nav("/loader/problems")}><span className="ic" style={{ background: "var(--problem)" }}><AlertTriangle size={22} /></span><b>{t("problemsTab")}</b><small>{open ? `${open} open` : t("reportProblem")}</small></button>
        <button className="tile" onClick={() => nav("/loader/wall")}><span className="ic" style={{ background: "#475569" }}><Monitor size={22} /></span><b>{t("dockWall")}</b><small>{loads.length} {t("todaysLoads").toLowerCase()}</small></button>
      </div>
    </Shell>
  );
}

/* Today's loads: every load with time and vehicle number; tap to start (asks who is loading). */
function LoadsScreen() {
  const { t } = useApp();
  const nav = useNavigate();
  const { loads, gone, clock } = useLoads();
  const [show, setShow] = useState("toload");
  const list = loads.filter((x) => show === "all" || (show === "toload" ? x.status !== "loaded" : x.status === "loaded"));
  const firstOpen = loads.find((x) => x.status !== "loaded");
  return (
    <Shell title={t("todaysLoads")} sub={`${clock.time} · ${loads.length} ${t("trucks") !== "trucks" ? t("trucks") : "trucks"}`}>
      <div className="seg" role="tablist">
        {[["toload", t("toLoad"), loads.filter((x) => x.status !== "loaded").length], ["loaded", t("loadedDone"), loads.filter((x) => x.status === "loaded").length], ["all", t("allTab"), loads.length]].map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={show === k} className={show === k ? "on" : ""} onClick={() => setShow(k)}>{label} · {n}</button>
        ))}
      </div>
      {!list.length && <div className="card flat muted">{show === "toload" ? t("noLoadsLeft") : t("noEntries")}</div>}
      <div className="load-grid">
      {list.map((x) => (
        <button key={x.k} className={`load-row ${x === firstOpen ? "hl" : ""} ${x.status}`} onClick={() => nav(`/loader/load/${x.veh}`)}>
          <div className="load-time"><b>{x.run.start}</b><small>{t("run")} {x.run.run}</small></div>
          <div className="grow">
            <div className="row" style={{ gap: 6 }}><b style={{ fontSize: 19 }}>{x.veh}</b>{x.run.chilled && <Snowflake size={16} color="var(--way)" />}{x.problem && <span className="tag bad">⚠ {t("problem")}</span>}</div>
            <div className="small row" style={{ gap: 6, flexWrap: "wrap" }}><BrandChip brand={x.run.brand} small /> {x.run.district} · {x.total} {x.total === 1 ? t("stop") : t("stops")}{x.driver ? ` · ${x.driver}` : ""}</div>
            <div className="progress" style={{ height: 6, marginTop: 6 }}><i style={{ width: `${(x.done / x.total) * 100}%` }} /></div>
            <div className="xs muted" style={{ marginTop: 3 }}>{x.finished ? `${t("loadedBy")} ${x.finished.by} · ${x.finished.at}` : x.started ? `${t("loadingBy")} ${x.started.by} ${t("since")} ${x.started.at} · ${x.done}/${x.total}` : leavesText(x, t)}</div>
          </div>
          {statusChip(x, t)}
        </button>
      ))}
      </div>
      {gone.length > 0 && <div className="muted small">{t("alreadyLeft")}: {gone.join(", ")}</div>}
    </Shell>
  );
}

/* "Who is loading VEH006?": asked every time a load is opened, so each load records its loader. */
function WhoForLoad({ veh, run, onPick }) {
  const { t, user, peopleOf, setToast, person } = useApp();
  const people = peopleOf(user?.id);
  return (
    <div className="body field fit">
      <div className="card flat row" style={{ gap: 10 }}><Truck size={22} /><div><b style={{ fontSize: 18 }}>{veh}</b><div className="small muted">{run.district} · {t("run")} {run.run} · {t("leaves")} {run.start}</div></div></div>
      <h2 style={{ margin: "4px 0 0" }}>{t("whoLoadingVeh")} {veh}?</h2>
      <div className="pics people-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        {people.map((p) => (
          <button key={p} className={`pic ${person === p ? "sel" : ""}`} onClick={() => onPick(p)}>
            <span className="avatar" style={{ width: 60, height: 60, fontSize: 26 }}>{p[0]}</span>
            <span style={{ fontSize: 18 }}>{p}</span>
          </button>
        ))}
        <button className="pic" onClick={() => setToast({ text: "Ask your supervisor to add your name (admin)" })}><span className="ic"><UserPlus size={24} /></span>Someone else</button>
      </div>
    </div>
  );
}

/* One load: loading order (last stop first), strict ticks, reefer check, progress, hand to driver. */
function LoadPanel({ veh, x }) {
  const { t, loaded, dispatch, setToast, user, adjusted, reeferChecked, loadStarts, fleet } = useApp();
  const nav = useNavigate();
  const run = x.run;
  const who = loadStarts[x.k]?.by;
  const order = [...run.stops].reverse();
  const isDone = (s) => !!loaded[tickKey(veh, run.run, s.n)];
  const current = order.find((s) => !isDone(s));
  const lastTicked = [...order].reverse().find(isDone);
  const checked = reeferChecked[x.k];
  const needsCheck = run.chilled && !checked;
  const driver = fleet.find((v) => v.id === veh)?.driver?.name;
  const tap = (s) => {
    if (needsCheck) { setToast({ text: t("reeferCheckHint") }); return; }
    if (s === current) dispatch({ type: "load", key: tickKey(veh, run.run, s.n), value: true });
    else if (s === lastTicked) dispatch({ type: "load", key: tickKey(veh, run.run, s.n), value: false });
    else if (!isDone(s)) setToast({ text: `${t("loadOrder")} ↓` });
  };
  const finish = () => {
    dispatch({ type: "truckLoaded", vehicle: veh, run: run.run, by: who });
    const cases = run.stops.reduce((a, s) => a + stopUnits(s, adjusted), 0);
    dispatch({ type: "log", who, role: `Loader · ${user?.depot || "Peliyagoda"} depot`, what: `Loaded ${veh} for run ${run.run}: ${run.stops.flatMap((s) => s.orders.map((o) => o.ref)).join(", ")} (${cases} cases, ${run.district})` });
    setToast({ text: `${veh} ${t("loadedDone").toLowerCase()} · ${t("handTo")} ${driver || "driver"} · dispatcher told` });
    nav("/loader/loads");
  };
  const pct = Math.round((order.filter(isDone).length / order.length) * 100);
  return (
    <>
      <div className="body field fit">
        <div className="card flat">
          <div className="row between"><b>{who ? `${t("loadingBy")} ${who}` : ""}</b><button className="link small" onClick={() => dispatch({ type: "loadWhoReset", key: x.k })}>{t("changePerson")}</button></div>
          <div className="progress" style={{ height: 8, marginTop: 8 }}><i style={{ width: `${pct}%` }} /></div>
          <div className="row between xs muted" style={{ marginTop: 4 }}><span>{order.filter(isDone).length}/{order.length} {t("loaded")}</span><span>{t("leaves")} {run.start}{driver ? ` · ${driver}` : ""}</span></div>
        </div>
        <Alerts />
        {run.chilled && (
          <button className={`stop ${checked ? "done" : "hl"}`} onClick={() => dispatch({ type: "reeferCheck", key: x.k, value: !checked, by: who })} aria-pressed={!!checked}>
            <Thermometer size={24} color="var(--way)" />
            <div className="grow"><b style={{ fontSize: 16 }}>{t("reeferCheck")}</b><div className="muted small">{checked ? `${checked.by} · ${checked.at}` : t("reeferCheckHint")}</div></div>
            {checked ? <Check size={28} color="var(--done)" strokeWidth={3} /> : <span className="tickbox" aria-hidden="true" />}
          </button>
        )}
        <div className="load-list">
          {order.map((s, i) => {
            const done = isDone(s);
            const locked = !done && (s !== current || needsCheck);
            const units = stopUnits(s, adjusted);
            const short = units !== s.units;
            return (
              <button key={s.outlet} className={`stop ${s === current && !needsCheck ? "hl" : ""} ${done ? "done" : ""}`} style={locked ? { opacity: 0.55 } : {}}
                aria-disabled={locked} aria-label={`Order ${s.orders.map((o) => o.ref).join(" and ")}, ${units} cases${done ? ", loaded" : s === current ? ", load now" : ""}`} onClick={() => tap(s)}>
                <OrderTag refs={s.orders.map((o) => o.ref)} />
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}><span className="big">{units}</span>{s.chilled && <Snowflake size={20} color="var(--way)" />}{short && <span className="tag warn">−{s.units - units}</span>}</div>
                  <div className="small" style={{ fontWeight: 700 }}>{s.outlet}{i === 0 ? ` · ${t("loadFirst")}` : i === order.length - 1 ? ` · ${t("loadLast")}` : ""}</div>
                </div>
                {done ? <Check size={30} color="var(--done)" strokeWidth={3} /> : <Speak text={`Order ${s.orders.map((o) => o.ref).join(" and ")}. ${units} cases`} />}
              </button>
            );
          })}
        </div>
        {lastTicked && !x.finished && <button className="btn ghost" onClick={() => tap(lastTicked)}><Undo2 size={16} /> {t("undoLast")}</button>}
      </div>
      <div className="dock fit">
        {x.finished
          ? <div className="banner done"><Check size={18} /> {t("loadedBy")} {x.finished.by} · {x.finished.at}</div>
          : <button className="btn primary field block" disabled={!!current || needsCheck} onClick={finish}>{t("allLoaded")} ✓{driver ? ` · ${t("handTo")} ${driver}` : ""}</button>}
      </div>
    </>
  );
}

function LoadScreen() {
  const { t, dispatch, loadStarts, setToast } = useApp();
  const { veh } = useParams();
  const nav = useNavigate();
  const { loads } = useLoads();
  const x = loads.find((l) => l.veh === veh);
  if (!x) {
    return <Shell title={veh} sub={t("alreadyLeft")} back="/loader/loads"><div className="card flat muted">{veh} · {t("alreadyLeft")}</div></Shell>;
  }
  const askWho = !x.finished && !loadStarts[x.k]?.by;
  const pick = (name) => {
    dispatch({ type: "loadStart", vehicle: veh, run: x.run.run, by: name, district: x.run.district, leaves: x.run.start });
    setToast({ text: `${name} · ${veh} · dispatcher told` });
    nav(`/loader/load/${veh}`, { replace: true });
  };
  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title={`${veh} · ${x.run.district}`} sub={`${t("run")} ${x.run.run} · ${t("leaves")} ${x.run.start} · ${t("loadOrder")} ↓`} back="/loader/loads" problem={`/loader/problem/${veh}`} />
        {askWho ? <WhoForLoad veh={veh} run={x.run} onPick={pick} /> : <LoadPanel veh={veh} x={x} />}
        <LoaderNav />
      </div>
    </MobileFrame>
  );
}

/* Loader log: who loaded which truck and orders, when; plus problems and replacements at the dock. */
function LogScreen() {
  const { t, log, loadStarts, loadedTrucks } = useApp();
  const { loads } = useLoads();
  const entries = log.filter((e) => e.role?.startsWith("Loader"));
  const rows = Object.entries(loadStarts).filter(([, v]) => v?.by).map(([k, v]) => {
    const [veh, run] = k.split(":");
    const r = runsOf(plan, veh).find((x) => String(x.run) === run);
    return { k, veh, run, start: v, end: loadedTrucks[k], refs: r ? r.stops.flatMap((s) => s.orders.map((o) => o.ref)) : [] };
  }).sort((a, b) => b.start.at.localeCompare(a.start.at));
  return (
    <Shell title={t("loaderLog")} sub={`${rows.length} · ${loads.length} ${t("todaysLoads").toLowerCase()}`}>
      <div className="card-title" style={{ margin: 0 }}><Truck size={18} /> {t("todaysLoads")}</div>
      {!rows.length && <div className="card flat muted">{t("noEntries")}</div>}
      {rows.map((r) => (
        <div key={r.k} className="card log-row">
          <div className="row between"><b style={{ fontSize: 17 }}>{r.veh} · {t("run")} {r.run}</b>{r.end ? <Chip kind="done">{t("loadedDone")}</Chip> : <Chip kind="way">{t("loadingNow")}</Chip>}</div>
          <div className="small" style={{ marginTop: 4 }}><b>{r.start.by}</b> · {t("started")} {r.start.at}{r.end ? ` · ${t("finished")} ${r.end.at}${r.end.by && r.end.by !== r.start.by ? ` (${r.end.by})` : ""}` : ""}</div>
          <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 6 }}>{r.refs.map((ref) => <span key={ref} className={`order-pill ${r.end ? "on" : ""}`}>{ref}</span>)}</div>
        </div>
      ))}
      <div className="card-title" style={{ margin: "8px 0 0" }}><History size={18} /> {t("loaderLog")}</div>
      {!entries.length && <div className="card flat muted">{t("noEntries")}</div>}
      {entries.map((e, i) => (
        <div key={i} className="row small log-line"><span className="muted num" style={{ minWidth: 44 }}>{e.at}</span><b style={{ minWidth: 70 }}>{e.who}</b><span className="grow">{e.what}</span></div>
      ))}
    </Shell>
  );
}

/* Problems: every report from this dock with where it stands; report a new one for any truck. */
function ProblemsScreen() {
  const { t, loaderReports } = useApp();
  const nav = useNavigate();
  const { loads } = useLoads();
  const [picking, setPicking] = useState(false);
  const status = (r) => r.acked ? ["done", t("done")] : r.decision === "replace" ? ["late", "Replace now"] : r.decision === "short" ? ["way", `Send short${r.newRef ? ` · ${r.newRef}` : ""}`] : ["problem", t("waitingDispatcher")];
  return (
    <Shell title={t("problemsTab")} sub={`${loaderReports.filter((r) => !r.acked).length} open`}
      dock={<button className="btn primary field block" onClick={() => setPicking(!picking)}><AlertTriangle size={18} /> {t("reportProblem")}</button>}>
      <Alerts />
      {picking && (
        <div className="card">
          <b>{t("pickTruck")}</b>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {loads.map((x) => <button key={x.k} className="btn secondary" style={{ minHeight: 40 }} onClick={() => nav(`/loader/problem/${x.veh}`)}>{x.veh} · {x.run.start}</button>)}
          </div>
        </div>
      )}
      {!loaderReports.length && <div className="card flat muted">{t("noEntries")}</div>}
      {loaderReports.map((r) => {
        const [kind, label] = status(r);
        return (
          <div key={r.id} className="card">
            <div className="row between"><b>{r.vehicle} · {r.outlet}</b><Chip kind={kind}>{label}</Chip></div>
            <div className="small" style={{ marginTop: 4 }}>{r.what} · {r.ref} · {r.by} · {r.at}</div>
            {r.decidedBy && <div className="xs muted" style={{ marginTop: 4 }}>{r.decidedBy} · {r.decidedAt}</div>}
            {r.decision === "replace" && !r.acked && <button className="btn primary" style={{ marginTop: 8, minHeight: 38 }} onClick={() => nav(`/loader/replace/${r.id}`)}>{t("start")}</button>}
          </div>
        );
      })}
    </Shell>
  );
}

/* The dock wall screen (big screen at the dock): every load still to leave, with live progress. */
function WallScreen() {
  const { t, online, person } = useApp();
  const nav = useNavigate();
  const { loads, gone, clock, depot } = useLoads();
  const { trucks: changed } = usePlanChanges();
  const count = (f) => loads.filter(f).length;
  const firstOpen = loads.find((x) => x.status !== "loaded" && !x.problem);
  return (
    <MobileFrame>
      <div className="screen">
        <header className="topbar" style={{ padding: "20px 28px 24px" }}>
          <div className="wall-head">
            <div>
              <div className="statusline" style={{ margin: 0, justifyContent: "flex-start", gap: 12 }}><LangChip /><span>{online ? "Wi-Fi" : t("noSignal")}</span></div>
              <div className="wall-clock" style={{ marginTop: 8 }}>{clock.time}</div>
              <div style={{ opacity: 0.85, marginTop: 4 }}>{depot} depot{person ? ` · ${person}` : ""}</div>
            </div>
            <div className="wall-stats">
              <div className="wall-stat"><b>{loads.length}</b><span>Trucks</span></div>
              <div className="wall-stat"><b>{count((x) => x.status === "loaded")}</b><span>Ready</span></div>
              <div className="wall-stat"><b>{count((x) => x.status === "loading")}</b><span>Loading</span></div>
              <div className="wall-stat" style={count((x) => x.problem) ? { background: "var(--problem)" } : {}}><b>{count((x) => x.problem)}</b><span>{t("problem")}</span></div>
            </div>
          </div>
        </header>
        <div style={{ padding: "16px 24px 0", display: "flex", flexDirection: "column", gap: 10 }}><Alerts />{!loads.length && <div className="card flat muted">{t("nothingToLoad")}</div>}</div>
        <div className="wall">
          {loads.map((x) => {
            const alert = x.problem || changed.has(x.veh);
            return (
              <button key={x.k} className={`truck-card ${alert ? "alert" : x.status === "loaded" ? "ready" : firstOpen === x ? "next" : ""}`} onClick={() => nav(`/loader/load/${x.veh}`)}>
                <div className="row between">
                  <span className="id">{x.veh}</span>
                  {alert ? <Chip kind="problem">{changed.has(x.veh) ? t("planChanged") : t("problem")}</Chip> : x.status === "loaded" ? <Chip kind="done">{t("done")}</Chip> : <span className="tag">{t("leaves")} {x.run.start}</span>}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {x.run.chilled && <Snowflake size={18} color="var(--way)" />}
                  <BrandChip brand={x.run.brand} small /><b>{x.run.district}</b><span className="muted">· {t("run")} {x.run.run} · {x.total} {x.total === 1 ? t("stop") : t("stops")}</span>
                </div>
                <div className="badges">{[...x.run.stops].reverse().flatMap((s, i) => s.orders.map((o) => <span key={o.ref} className={`order-pill ${i < x.done ? "on" : ""}`}>{o.ref}</span>))}</div>
                <div className="progress"><i style={{ width: `${(x.done / x.total) * 100}%` }} /></div>
                <div className="small" style={{ fontWeight: 700 }}>{x.started ? `${x.started.by} · ` : ""}{x.done} / {x.total} {t("loaded")}</div>
              </button>
            );
          })}
        </div>
        {gone.length > 0 && <div className="muted small" style={{ padding: "0 24px 14px" }}>{t("alreadyLeft")}: {gone.join(", ")}</div>}
      <LoaderNav /></div>
    </MobileFrame>
  );
}

/* Report a missing, broken or wet item for the truck being loaded, before it leaves.
   VEH006 · OUT026 is the scripted "Short at the Dock" story; any other report goes to the dispatcher's Live board. */
export function LoaderProblem() {
  const { t, dispatch, setToast, person: lastPerson, user, loadStarts } = useApp();
  const nav = useNavigate();
  const clock = useClock();
  const { veh = "VEH006" } = useParams();
  const run = loadingRun(veh, clock.time) || runsOf(plan, veh)[0];
  const stops = run ? run.stops : [];
  const person = (run && loadStarts[`${veh}:${run.run}`]?.by) || lastPerson || "Loader"; // whoever is loading this truck
  const [outlet, setOutlet] = useState(veh === "VEH006" && stops.some((s) => s.outlet === "OUT026") ? "OUT026" : stops[stops.length - 1]?.outlet);
  const stop = stops.find((s) => s.outlet === outlet) || stops[0];
  const [kind, setKind] = useState("broken");
  const [count, setCount] = useState(2);
  const [photo, setPhoto] = useState(true);
  const send = () => {
    dispatch({ type: "loaderReport", report: { vehicle: veh, run: run?.run, outlet: stop?.outlet, ref: stop?.orders.map((o) => o.ref).join(" + "), count, kind, chilled: !!stop?.chilled, units: stop?.units, what: `${count} ${stop?.chilled ? "chilled " : ""}cases ${kind}`, by: person, photo } });
    dispatch({ type: "log", who: person, role: `Loader · ${user?.depot || "Peliyagoda"} depot`, what: `Reported ${count} ${kind} cases for ${stop?.outlet} on ${veh}` });
    setToast({ text: `Sent by ${person || "Loader"} · ${veh} waits for a decision · dispatcher told` });
    nav("/loader/problems");
  };
  if (!stop) return <PlanNotReady />;
  return (
    <MobileFrame caption={{ kicker: "Bad day 1", title: "Short at the Dock · 03:10", lines: ["Two broken cases found before VEH006 leaves. The loader reports with pictures, a count and a photo. No typing."] }}>
      <div className="screen">
        <TopBar title={`⚠ ${t("problem")}`} sub={`${veh} · ${stop.outlet} · ${stop.units}${stop.chilled ? " ❄" : ""}`} back />
        <div className="body field fit">
          <b style={{ fontSize: 17 }}>{t("whichStop")}</b>
          <div className="pics" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
            {[...stops].reverse().map((s) => (
              <button key={s.outlet} className={`pic ${s.outlet === stop.outlet ? "sel" : ""}`} onClick={() => setOutlet(s.outlet)} aria-pressed={s.outlet === stop.outlet} aria-label={`Stop ${s.n}, ${s.outlet}`}>
                <OrderTag refs={s.orders.map((o) => o.ref)} size="sm" /><span className="small">{s.outlet}</span>
              </button>
            ))}
          </div>
          <div className="pics">
            <Pic icon={PackageX} label={t("missing")} selected={kind === "missing"} onClick={() => setKind("missing")} />
            <Pic icon={SplitIcon} label={t("broken")} selected={kind === "broken"} onClick={() => setKind("broken")} />
            <Pic icon={Droplets} label={t("wet")} selected={kind === "wet"} onClick={() => setKind("wet")} />
          </div>
          <div className="stop"><b className="grow" style={{ fontSize: 18 }}>{t("howMany")}</b><span className="big" style={{ marginRight: 8 }}>{count}</span><Stepper value={count} onChange={setCount} min={1} /></div>
          <div className="row">
            <button className={`stop grow ${photo ? "" : "hl"}`} onClick={() => setPhoto(true)}><Camera size={22} /> <b>{t("photo")}</b> {photo && <Check color="var(--done)" />}</button>
            <button className="stop grow"><Mic size={22} /> <b>{t("voiceNote")}</b></button>
          </div>
        </div>
        <div className="dock fit"><SlideConfirm label={t("slideSend")} onDone={send} /></div>
      <LoaderNav /></div>
    </MobileFrame>
  );
}

/* The dispatcher chose "replace from stock": fetch the cases from the store room, tick each one, then the truck can go. */
export function Replace() {
  const { t, setToast, loaderReports, dispatch, person } = useApp();
  const nav = useNavigate();
  const { id } = useParams();
  const r = loaderReports.find((x) => x.id === id) || loaderReports.find((x) => x.decision === "replace" && !x.acked);
  const [ticked, setTicked] = useState(0); // cases ticked, in order
  if (!r) return <Navigate to="/loader" replace />;
  const n = r.count || 1;
  const finish = () => {
    dispatch({ type: "loaderAck", id: r.id });
    dispatch({ type: "log", who: person, role: "Loader · depot", what: `Replaced ${n} ${r.chilled ? "chilled " : ""}cases for ${r.outlet} on ${r.vehicle}` });
    setToast({ text: `${n} cases replaced · ${r.vehicle} can leave · store told` });
    nav("/loader");
  };
  return (
    <MobileFrame caption={{ kicker: "Bad day 1", title: "Short at the Dock", lines: ["The dispatcher chose to replace the cases. The truck had time to spare, so every stop stays on time."] }}>
      <div className="screen">
        <TopBar title={`${t("replaceTitle").replace("2", String(n))}`} sub={`${r.vehicle} · ${r.outlet}`} back="/loader" />
        <div className="body field fit">
          <div className="card hl small" style={{ fontWeight: 700 }}>{r.decidedBy}: replace {n} cases{r.waitMin ? ` · ${r.vehicle} waits up to ${r.waitMin} min` : ""}</div>
          <div className="row"><OrderTag refs={r.ref || r.outlet} /><div className="grow"><div className="big">{n} {r.chilled && <Snowflake size={22} color="var(--way)" />}</div><div className="muted">{r.chilled ? "Cold room" : "Store room"} · {r.outlet}</div></div><Speak text={`Get ${n} cases for ${r.outlet}`} /></div>
          <div className="fit-grid two-col">
            {Array.from({ length: n }, (_, i) => i + 1).map((c) => (
              <button key={c} className={`stop ${c === ticked + 1 ? "hl" : ""}`} style={c > ticked + 1 ? { opacity: 0.55 } : {}}
                onClick={() => (c === ticked + 1 ? setTicked(c) : c === ticked ? setTicked(c - 1) : null)}>
                <b className="grow" style={{ fontSize: 17 }}>Case {c}</b> {c <= ticked ? <Check color="var(--done)" strokeWidth={3} /> : <span className="tickbox" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
        <div className="dock fit"><button className="btn primary field block" disabled={ticked < n} onClick={finish}>{t("done")} ✓</button></div>
      <LoaderNav /></div>
    </MobileFrame>
  );
}

export function MoveList() {
  const { t, setToast, dispatch, person } = useApp();
  const nav = useNavigate();
  const { moves } = reeferDown();
  const groups = moves.reduce((acc, m) => { (acc[m.to || "—"] ??= []).push(m); return acc; }, {});
  const [ticks, setTicks] = useState({});
  const all = moves.every((m) => ticks[m.order.ref]);
  // Crates are moved in list order: only the next one can be ticked, only the last tick undone.
  const flat = Object.values(groups).flat();
  const nextMove = flat.find((m) => !ticks[m.order.ref]);
  const lastMove = [...flat].reverse().find((m) => ticks[m.order.ref]);
  const tapMove = (m) => {
    if (m === nextMove) setTicks({ ...ticks, [m.order.ref]: true });
    else if (m === lastMove) setTicks({ ...ticks, [m.order.ref]: false });
    else if (!ticks[m.order.ref]) setToast({ text: `${t("loadOrder")} ↓` });
  };
  return (
    <MobileFrame caption={{ kicker: "Bad day 2", title: "Reefer Down · 03:30", lines: ["The re-plan moves every order from a shop skipped yesterday onto working reefers. The loader just follows the list."] }}>
      <div className="screen">
        <TopBar title={t("moveCrates")} sub={`⚠ ${t("planChanged")} · VEH003`} back="/loader" time="03:30" />
        <div className="body field fit">
          <div className="fit-grid cards">
          {Object.entries(groups).map(([to, list]) => (
            <div key={to} className="card">
              <div className="card-title" style={{ fontSize: 17 }}><ArrowLeftRight size={20} /> → {to}</div>
              {list.map((m, i) => (
                <button key={m.order.ref} className={`stop ${m === nextMove ? "hl" : ""}`} style={{ marginTop: 10, boxShadow: "none", ...(m !== nextMove && !ticks[m.order.ref] ? { opacity: 0.55 } : {}) }} onClick={() => tapMove(m)}>
                  <OrderTag refs={m.order.ref} />
                  <div className="grow"><span className="big">{m.order.units}</span> <Snowflake size={18} color="var(--way)" /><div className="muted small">{m.order.outlet}</div></div>
                  <span style={{ width: 34, height: 34, borderRadius: 10, border: "2px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", background: ticks[m.order.ref] ? "var(--done)" : "#fff" }}>
                    {ticks[m.order.ref] && <Check color="#fff" strokeWidth={3} />}
                  </span>
                </button>
              ))}
            </div>
          ))}
          </div>
        </div>
        <div className="dock fit"><button className="btn primary field block" disabled={!all} onClick={() => { dispatch({ type: "scenario", patch: { reeferMoved: true } }); dispatch({ type: "log", who: person || "Loader", role: "Loader · Peliyagoda depot", what: "Moved VEH003's crates to the re-planned trucks" }); setToast({ text: "All crates moved · drivers updated" }); nav("/loader"); }}>{t("allMoved")} ✓</button></div>
      <LoaderNav /></div>
    </MobileFrame>
  );
}

export function WhoIsLoading() {
  const { t, dispatch, user, person, setToast, peopleOf } = useApp();
  const nav = useNavigate();
  const people = peopleOf(user?.id);
  const pick = (name) => { dispatch({ type: "person", name }); setToast({ text: `${name} · ${t("start")}` }); nav("/loader"); };
  return (
    <MobileFrame caption={{ kicker: "Shared depot account", title: t("whoLoading"), lines: ["One account for the whole depot. Each loader taps their name, so every tick and every problem report carries a name. No passwords to remember."] }}>
      <div className="screen">
        <TopBar title={t("whoLoading")} sub={`${user?.name || "Peliyagoda depot"} · ${user?.id || "DEPOT-PELIYAGODA"}`} time="02:58" />
        <div className="body field fit">
          <div className="pics people-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {people.map((p) => (
              <button key={p} className={`pic ${person === p ? "sel" : ""}`} onClick={() => pick(p)}>
                <span className="avatar" style={{ width: 64, height: 64, fontSize: 28 }}>{p[0]}</span>
                <span style={{ fontSize: 18 }}>{p}</span>
              </button>
            ))}
            <button className="pic" onClick={() => setToast({ text: "Ask your supervisor to add your name (admin)" })}><span className="ic"><UserPlus size={24} /></span>Someone else</button>
          </div>
          <div className="muted small" style={{ textAlign: "center" }}>Tap your name. It stays until someone else taps theirs.</div>
        </div>
      <LoaderNav /></div>
    </MobileFrame>
  );
}

/* Before the dispatcher publishes, loaders see "plan not ready" instead of loads. */
function Gate({ children }) {
  const { published, person, user } = useApp();
  const depot = user?.depot || "Peliyagoda";
  return published ? children : <PlanNotReady title={person || `${depot} depot`} sub={`${depot} depot · loading dock`} />;
}
export const LoaderTrucks = () => <Gate><HomeScreen /></Gate>;
export const LoaderLoads = () => <Gate><LoadsScreen /></Gate>;
export const LoadList = () => <Gate><LoadScreen /></Gate>;
export const LoaderLog = () => <LogScreen />;
export const LoaderProblems = () => <Gate><ProblemsScreen /></Gate>;
export const LoaderWall = () => <Gate><WallScreen /></Gate>;
