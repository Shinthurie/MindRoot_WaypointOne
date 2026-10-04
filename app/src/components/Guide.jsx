import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Package, Thermometer, WifiOff, X } from "lucide-react";
import { useApp } from "../state";
import { SCENARIOS, stepPath } from "../scenarios";

export const SCENARIO_ICON = { dock: Package, reefer: Thermometer, dead: WifiOff };

/* #/scenario/<id>/<step>: set up that moment of the story, then show its screen. Each step is a stable link. */
export function ScenarioJump() {
  const { id, step } = useParams();
  const { dispatch } = useApp();
  const nav = useNavigate();
  const sc = SCENARIOS[id];
  const index = Math.max(0, Number(step || 1) - 1);
  const st = sc?.steps[index];
  useEffect(() => {
    if (!st) return;
    dispatch({ type: "scenarioGo", id, index });
    nav(stepPath(st), { replace: true });
  }, [id, index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <Navigate to="/" replace />;
  return null;
}

/* The story card: which bad day, which step, what is happening, and Back / Next. Hidden in clean capture links. */
export function GuideBar() {
  const { guide, hideDemo, dispatch } = useApp();
  const nav = useNavigate();
  if (!guide || hideDemo) return null;
  const sc = SCENARIOS[guide.id];
  const st = sc?.steps[guide.index];
  if (!st) return null;
  const Icon = SCENARIO_ICON[guide.id];
  const last = guide.index === sc.steps.length - 1;
  const go = (i) => nav(`/scenario/${guide.id}/${i + 1}`);
  const exit = () => { dispatch({ type: "guideExit" }); nav("/"); };
  const roleName = { loader: "Loader", dispatcher: "Dispatcher", driver: "Driver", store: "Store manager" }[st.role];
  return (
    <aside className="guide-bar" role="region" aria-label={`Bad day ${sc.n}: ${sc.title}`}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8 }}><span className="guide-ic"><Icon size={16} /></span><b>Bad day {sc.n} · {sc.title}</b></span>
        <button className="guide-x" onClick={exit} aria-label="End the story"><X size={16} /></button>
      </div>
      <div className="guide-steps" aria-hidden="true">{sc.steps.map((_, i) => <i key={i} className={i <= guide.index ? "on" : ""} />)}</div>
      <div className="small muted" style={{ fontWeight: 700 }}>Step {guide.index + 1} of {sc.steps.length} · {roleName} · {st.time}</div>
      <p className="guide-text">{st.text}</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn secondary" style={{ minHeight: 38 }} disabled={guide.index === 0} onClick={() => go(guide.index - 1)}><ChevronLeft size={16} /> Back</button>
        {last
          ? <button className="btn primary grow" style={{ minHeight: 38 }} onClick={exit}>Finish</button>
          : <button className="btn primary grow" style={{ minHeight: 38 }} onClick={() => go(guide.index + 1)}>Next <ChevronRight size={16} /></button>}
      </div>
    </aside>
  );
}

/* Sign-in page: the way into the Bad days portal. */
export function BadDayButtons() {
  const nav = useNavigate();
  return (
    <button type="button" className="bad-day" onClick={() => nav("/bad-days")}>
      <span className="ic"><Package size={18} /></span>
      <span className="grow"><b>Bad days portal</b><small>Short at the Dock · Reefer Down · Dead Zone. Run each one and see every portal react.</small></span>
      <ChevronRight size={18} />
    </button>
  );
}
