import { useMemo, useState } from "react";
import { AlertTriangle, Fuel, Snowflake, Truck, UserX, Wrench, History, Users, CheckCircle2, RotateCcw } from "lucide-react";
import { useApp } from "../state";
import { VEHICLE_CATEGORIES } from "../data/accounts";
import { Chip, DeskShell, DepotPill, formatDate, useClock } from "../components/ui";
import { fuelThisWeek } from "../data/model";
import { useDispatchNav } from "./Dispatch";

const ADMIN_NAV = [
  { to: "/admin", label: "Accounts", icon: Users },
  { to: "/admin/fleet", label: "Fleet", icon: Truck },
  { to: "/admin/log", label: "Activity log", icon: History },
];
export { ADMIN_NAV };

const DEPOTS = ["Peliyagoda", "Kandy"];
const category = (v) => `${v.reefer ? "Reefer" : "Dry"} ${v.type}`;

function FuelBar({ v }) {
  const { delivered, tracked } = useApp();
  const clock = useClock();
  const f = fuelThisWeek(v.id, clock.time, delivered, tracked);
  if (!v.quotaL || !f) return <span className="muted small">new vehicle</span>;
  const pct = Math.min(100, (f.total / f.quota) * 100);
  const color = pct >= 90 ? "var(--problem)" : pct >= 70 ? "var(--late)" : "var(--done)";
  return (
    <div style={{ minWidth: 150 }}>
      <div className="row between small"><b className="num">{Math.round(f.total)} / {f.quota} L</b><span className="muted">{Math.round(pct)}%</span></div>
      <div className="progress" style={{ height: 7, marginTop: 4 }}><i style={{ width: `${pct}%`, background: color }} /></div>
      <div className="muted xs" style={{ marginTop: 3 }}>{f.today ? `+${Math.round(f.today)} L today (${f.runs} run${f.runs > 1 ? "s" : ""} done)` : "nothing today yet"} · last week {Math.round(f.lastWeek)} L</div>
    </div>
  );
}

function StatusCell({ v }) {
  if (!v.driver) return <Chip kind="problem">No driver</Chip>;
  if (v.status === "in_workshop") return <span className="col" style={{ gap: 2 }}><Chip kind="late">In workshop</Chip>{v.back && <span className="muted xs">back {v.back}</span>}</span>;
  return <Chip kind="done">Available</Chip>;
}

/* mode "admin": manages the fleet list, workshop with a return date.
   mode "dispatcher": marks a truck in or out of the workshop for today. */
function FleetView({ mode }) {
  const { fleet, dispatch, user, setToast, fleetEdits, depot: viewDepot } = useApp();
  const { date } = useClock();
  const weekStart = (() => { const [y, m, d] = date.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); })();
  const [adminDepot, setAdminDepot] = useState("All");
  // The dispatcher's depot follows the depot switch in the top bar; admin filters freely.
  const depot = mode === "dispatcher" ? viewDepot : adminDepot;
  const setDepot = (d) => (mode === "dispatcher" ? dispatch({ type: "depot", depot: d }) : setAdminDepot(d));
  const [cat, setCat] = useState("All");
  const [status, setStatus] = useState("All");
  const [editing, setEditing] = useState(null);
  const [back, setBack] = useState("");

  const inDepot = fleet.filter((v) => depot === "All" || v.depot === depot);
  const shown = useMemo(() => inDepot
    .filter((v) => cat === "All" || category(v) === cat)
    .filter((v) => status === "All" || (status === "No driver" ? !v.driver : status === "In workshop" ? v.status === "in_workshop" : v.status !== "in_workshop" && v.driver)),
  [inDepot, cat, status]);
  const usable = (v) => v.driver && v.status !== "in_workshop";
  const reefers = inDepot.filter((v) => v.reefer);
  const changed = Object.keys(fleetEdits).length;

  const setWorkshop = (v, inShop, when) => {
    dispatch({ type: "fleetStatus", vehicle: v.id, change: { status: inShop ? "in_workshop" : "available", back: inShop ? when || null : null, by: user.name } });
    dispatch({ type: "log", who: user.name, role: mode === "admin" ? "Admin" : `Dispatcher · ${user.depot || "Peliyagoda"}`, what: `${v.id} ${inShop ? `marked in workshop${when ? ` until ${when}` : " for today"}` : "back in service"}` });
    setToast({ text: `${v.id} ${inShop ? "in workshop" : "back in service"} · Auto-plan will use this` });
    setEditing(null); setBack("");
  };

  return (
    <>
      {mode === "dispatcher" && changed > 0 && (
        <div className="banner" style={{ background: "var(--turmeric-tint)", color: "var(--ink)", border: "1px solid #ffe08a" }}>
          <RotateCcw size={18} /> The fleet changed since tonight's plan ({changed} vehicle{changed > 1 ? "s" : ""}). Run Auto-plan again before publishing.
        </div>
      )}
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="label"><Truck size={14} /> Vehicles</div><div className="value">{inDepot.length}</div><div className="muted small">{depot === "All" ? "both depots" : depot}</div></div>
        <div className="kpi"><div className="label"><CheckCircle2 size={14} /> Ready to plan</div><div className="value">{inDepot.filter(usable).length}</div><div className="muted small">available with a driver</div></div>
        <div className={`kpi ${reefers.filter(usable).length < reefers.length / 2 ? "alert" : ""}`}><div className="label"><Snowflake size={14} /> Reefers ready</div><div className="value">{reefers.filter(usable).length} of {reefers.length}</div><div className="muted small">the scarcest vehicles</div></div>
        <div className="kpi"><div className="label"><Wrench size={14} /> In workshop</div><div className="value">{inDepot.filter((v) => v.status === "in_workshop").length}</div><div className="muted small">{inDepot.filter((v) => !v.driver).length} with no driver</div></div>
      </div>
      <div className="table-card">
        <div className="head">
          <span className="muted xs" style={{ fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Depot</span>
          {[...(mode === "admin" ? ["All"] : []), ...DEPOTS].map((d) => <button key={d} className={`filter ${depot === d ? "on" : ""}`} onClick={() => setDepot(d)}>{d}</button>)}
          <span style={{ width: 10 }} />
          <span className="muted xs" style={{ fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Type</span>
          {["All", ...VEHICLE_CATEGORIES].map((c) => <button key={c} className={`filter ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="head" style={{ background: "#fcfaf6", paddingTop: 10, paddingBottom: 10 }}>
          <span className="muted xs" style={{ fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Status</span>
          {["All", "Available", "In workshop", "No driver"].map((s) => <button key={s} className={`filter ${status === s ? "on" : ""}`} onClick={() => setStatus(s)}>{s}</button>)}
          <span className="muted small" style={{ marginLeft: "auto" }}><Fuel size={13} style={{ verticalAlign: "-2px" }} /> Fuel this week from {formatDate(weekStart)} · starts at 0 every Monday</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: "calc(100vh - 360px)", overflowY: "auto" }}>
          <table className="t">
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}><tr><th>Vehicle</th><th>Type</th><th>Depot</th><th>Driver</th><th>Capacity</th><th>Fuel this week</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{v.id}</b> {v.reefer && <Snowflake size={13} color="var(--way)" />}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{category(v)}</td>
                  <td>{v.depot}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{v.driver ? <span>{v.driver.name} <span className="muted xs">{v.driver.id}</span></span> : <span className="row" style={{ gap: 6, color: "var(--problem)" }}><UserX size={15} /> none · cannot be planned</span>}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{v.m3 ? `${v.m3} m³ · ${v.kg.toLocaleString("en-US")} kg` : "—"}</td>
                  <td><FuelBar v={v} /></td>
                  <td><StatusCell v={v} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {editing === v.id ? (
                      <span className="row" style={{ gap: 6 }}>
                        {mode === "admin" && <input type="date" className="input" style={{ height: 36, width: 150, fontSize: 13 }} value={back} onChange={(e) => setBack(e.target.value)} aria-label="Back on" />}
                        <button className="btn primary" style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }} onClick={() => setWorkshop(v, true, mode === "admin" ? back : null)}>Confirm</button>
                        <button className="btn ghost" style={{ minHeight: 36, padding: "0 8px", fontSize: 13 }} onClick={() => setEditing(null)}>Cancel</button>
                      </span>
                    ) : v.status === "in_workshop" ? (
                      <button className="btn secondary" style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }} onClick={() => setWorkshop(v, false)}>Back in service</button>
                    ) : (
                      <button className="btn secondary" style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }} disabled={!v.driver && mode === "dispatcher"} onClick={() => setEditing(v.id)}>
                        <Wrench size={14} /> {mode === "admin" ? "To workshop" : "In workshop today"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 30 }}>No vehicles match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {mode === "admin" && <p className="muted small"><AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> One driver per vehicle. A vehicle whose driver is deactivated shows “No driver” and is left out of planning until a new driver is added.</p>}
    </>
  );
}

export function AdminFleet() {
  return <DeskShell nav={ADMIN_NAV} title="Fleet" subtitle="All 60 vehicles · capacity, driver, fuel against the weekly quota, and workshop status"><FleetView mode="admin" /></DeskShell>;
}

export function DispatchFleet() {
  return <DeskShell nav={useDispatchNav()} actions={<DepotPill />} title="Fleet today" subtitle="Mark a truck in or out of the workshop for today · Auto-plan only uses ready vehicles"><FleetView mode="dispatcher" /></DeskShell>;
}
