import { useMemo, useState } from "react";
import { Ban, Check, Copy, KeyRound, Lock, MoreHorizontal, Pencil, Plus, Printer, RotateCcw, Search, SlidersHorizontal, Store, Truck, Unlock, UserPlus, Users, LayoutDashboard, Warehouse, X } from "lucide-react";
import { ADMIN_NAV as NAV } from "./Fleet";
import { useApp } from "../state";
import { BRANDS, VEHICLE_CATEGORIES, districtsByDepot } from "../data/accounts";
import { Chip, DeskShell } from "../components/ui";

const TYPES = [
  ["Driver", Truck, "Personal · comes with a vehicle"],
  ["Dispatcher", LayoutDashboard, "Personal · plans a depot"],
  ["Store account", Store, "Shared · one per store"],
  ["Depot account", Warehouse, "Shared · one per depot"],
];
const FILTERS = [["All", "All"], ["Driver", "Driver"], ["Dispatcher", "Dispatcher"], ["Store account", "Store"], ["Depot account", "Depot account"], ["Not activated", "Not activated"]];
const DEPOTS = ["Peliyagoda", "Kandy"];
const isShared = (a) => a.type === "Store account" || a.type === "Depot account";

function tempPassword() {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] % c.length; // secure random, not Math.random
  const pick = () => c[rnd()] + c[rnd()];
  return `${pick()}-${pick()}-${pick()}`;
}
const nextNumber = (ids, re) => Math.max(0, ...ids.map((id) => Number((id.match(re) || [])[1] || 0))) + 1;

function Choice({ options, value, onChange }) {
  return <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>{options.map((o) => <button key={o} type="button" className={`filter ${value === o ? "on" : ""}`} onClick={() => onChange(o)}>{o}</button>)}</div>;
}

/* Store rules the planner must respect: delivery window, mall window, dock type and vehicle access. */
const DOCKS = [["rear_dock", "Rear dock"], ["street", "Street"], ["mall_bay", "Mall bay"]];
const ACCESS = [["normal", "Any vehicle"], ["van_only", "Van only"], ["mall_dock", "Mall dock"]];

/* Sensible starting rules by category: Fresh arrives before shops open; Style and Tech in the trading day. */
const DEFAULT_RULES = {
  Fresh: { open: "05:00", close: "07:30", dock: "rear_dock", parking: "normal", mall: "" },
  Style: { open: "09:00", close: "17:00", dock: "rear_dock", parking: "normal", mall: "" },
  Tech: { open: "09:00", close: "17:00", dock: "rear_dock", parking: "normal", mall: "" },
};

/* One rules form, used both when creating a store and when editing it later. */
function useRulesForm(initial) {
  const [r, setR] = useState({ ...DEFAULT_RULES.Fresh, ...initial, mall: initial?.mall || "" });
  const set = (k) => (v) => setR((x) => ({ ...x, [k]: v }));
  const problem = r.open >= r.close ? "The window must close after it opens."
    : r.parking === "mall_dock" && !/^\d\d:\d\d-\d\d:\d\d$/.test(r.mall) ? "Enter the mall window like 10:00-12:00." : null;
  const rules = { open: r.open, close: r.close, dock: r.dock, parking: r.parking, mall: r.parking === "mall_dock" ? r.mall : null };
  const Pick = ({ options, value, onChange }) => (
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>{options.map(([k, label]) => <button key={k} type="button" className={`filter ${value === k ? "on" : ""}`} onClick={() => onChange(k)}>{label}</button>)}</div>
  );
  const fields = (brand) => (
    <div className="col" style={{ gap: 14 }}>
      <div>
        <span className="field-label">Delivery window</span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="time" className="input" style={{ width: 150 }} value={r.open} onChange={(e) => set("open")(e.target.value)} aria-label="Opens" />
          <span className="muted">to</span>
          <input type="time" className="input" style={{ width: 150 }} value={r.close} onChange={(e) => set("close")(e.target.value)} aria-label="Closes" />
          {brand === "Fresh" && r.close > "08:00" && <span className="tag warn">Fresh must arrive before 8 AM</span>}
        </div>
      </div>
      <div><span className="field-label">Unloading</span><Pick options={DOCKS} value={r.dock} onChange={set("dock")} /></div>
      <div>
        <span className="field-label">Vehicle access</span><Pick options={ACCESS} value={r.parking} onChange={set("parking")} />
        {r.parking === "van_only" && <div className="muted small" style={{ marginTop: 6 }}>Trucks cannot reach this store. Only vans are planned here.</div>}
      </div>
      {r.parking === "mall_dock" && (
        <label><span className="field-label">Mall access window (HH:MM-HH:MM)</span><input className="input" style={{ width: 220 }} value={r.mall} onChange={(e) => set("mall")(e.target.value)} placeholder="10:00-12:00" /></label>
      )}
      {problem && <div className="banner problem">{problem}</div>}
    </div>
  );
  const reset = (next) => setR({ ...next, mall: next.mall || "" });
  return { rules, fields, valid: !problem, reset };
}
const describeRules = (x) => `window ${x.open}–${x.close}, ${DOCKS.find((d) => d[0] === x.dock)[1].toLowerCase()}, ${ACCESS.find((a) => a[0] === x.parking)[1].toLowerCase()}${x.mall ? ` (mall ${x.mall})` : ""}`;

function StoreRulesEditor({ account, onClose }) {
  const { storeRules, dispatch, setToast } = useApp();
  const outlet = account.id.replace("STORE-", "");
  const current = storeRules(outlet);
  const form = useRulesForm(current);
  const save = () => {
    dispatch({ type: "storeRules", outlet, rules: form.rules });
    dispatch({ type: "log", who: "Admin", role: "Admin", what: `Updated store rules for ${account.name} (${outlet}): ${describeRules(form.rules)}` });
    setToast({ text: `${account.name} · rules saved · used from the next plan` });
    onClose();
  };
  return (
    <div className="panel" style={{ maxWidth: 720, borderTop: "5px solid var(--brinjal)" }}>
      <div className="row between"><h3 style={{ margin: 0 }}>Store details · {account.name}</h3><button className="icon-btn" style={{ background: "var(--coconut)", color: "var(--ink)" }} onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="muted small" style={{ margin: "4px 0 16px" }}>{account.scope} · {account.category} · {account.depot}. The planner follows these rules automatically, so they no longer live in one dispatcher's head.</div>
      {form.fields(account.category)}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!form.valid} onClick={save}>Save rules</button>
      </div>
    </div>
  );
}

/* Row actions: reset sign-in, lock or unlock, deactivate or reactivate. */
function RowMenu({ account, onReset }) {
  const { dispatch, setToast } = useApp();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (status, what) => {
    dispatch({ type: "accountStatus", id: account.id, status });
    dispatch({ type: "log", who: "Admin", role: "Admin", what: `${what} ${account.id}` });
    setToast({ text: `${account.name} · ${status === "Active" ? "active again" : status.toLowerCase()}` });
    setOpen(false); setConfirm(false);
  };
  const locked = account.status === "Locked";
  const off = account.status === "Deactivated";
  return (
    <span style={{ position: "relative", display: "inline-block", verticalAlign: "middle" }}>
      <button className="icon-btn" style={{ background: "var(--coconut)", color: "var(--ink)" }} aria-label="Account actions" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => { setOpen(false); setConfirm(false); }} />
          <div className="menu" role="menu">
            {!confirm ? (
              <>
                {!off && <button role="menuitem" onClick={() => { setOpen(false); onReset(account); }}><KeyRound size={15} /> Reset sign-in</button>}
                {!off && <button role="menuitem" onClick={() => set(locked ? "Active" : "Locked", locked ? "Unlocked" : "Locked")}>{locked ? <Unlock size={15} /> : <Lock size={15} />} {locked ? "Unlock" : "Lock"}</button>}
                {off
                  ? <button role="menuitem" onClick={() => set("Active", "Reactivated")}><RotateCcw size={15} /> Reactivate</button>
                  : <button role="menuitem" className="danger" onClick={() => setConfirm(true)}><Ban size={15} /> Deactivate</button>}
              </>
            ) : (
              <div style={{ padding: 10, maxWidth: 260 }}>
                <b>Deactivate {account.id}?</b>
                <div className="muted small" style={{ margin: "6px 0 10px" }}>
                  {account.type === "Driver" ? `${account.vehicle} will have no driver and is left out of planning until a new driver is added.` : "They can no longer sign in. History and records are kept."}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn danger" style={{ minHeight: 36, fontSize: 13 }} onClick={() => set("Deactivated", "Deactivated")}>Deactivate</button>
                  <button className="btn ghost" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}

function StatusChip({ status }) {
  if (status === "Active") return <Chip kind="done">Active</Chip>;
  if (status === "Locked") return <Chip kind="problem">Locked</Chip>;
  if (status === "Deactivated") return <Chip kind="offline">Deactivated</Chip>;
  return <Chip kind="planned">Not activated</Chip>;
}

/* People editor for shared accounts (store managers, depot loaders). */
function PeopleEditor({ account, onClose }) {
  const { dispatch, setToast } = useApp();
  const [people, setPeople] = useState(account.people || []);
  const [name, setName] = useState("");
  const add = () => { const n = name.trim(); if (n && !people.includes(n)) setPeople([...people, n]); setName(""); };
  const save = () => {
    dispatch({ type: "setPeople", id: account.id, people });
    dispatch({ type: "log", who: "Admin", role: "Admin", what: `Updated people on ${account.id}: ${people.join(", ") || "none"}` });
    setToast({ text: `${account.name} · people updated` });
    onClose();
  };
  const word = account.type === "Depot account" ? "loader" : "person";
  return (
    <div className="panel" style={{ maxWidth: 640, borderTop: "5px solid var(--brinjal)" }}>
      <div className="row between"><h3 style={{ margin: 0 }}>People on {account.name}</h3><button className="icon-btn" style={{ background: "var(--coconut)", color: "var(--ink)" }} onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="muted small" style={{ margin: "4px 0 14px" }}>{account.id} · they appear on the {account.type === "Depot account" ? "“Who is loading?”" : "“Who is this?”"} screen. No passwords for them.</div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        {people.map((p) => (
          <span key={p} className="tag brinjal" style={{ fontSize: 14, padding: "6px 6px 6px 12px" }}>
            {p}
            <button onClick={() => setPeople(people.filter((x) => x !== p))} aria-label={`Remove ${p}`} style={{ border: 0, background: "rgba(61,31,71,.1)", borderRadius: 6, width: 22, height: 22, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 4 }}><X size={13} /></button>
          </span>
        ))}
        {!people.length && <span className="muted small">Nobody yet. Add at least one {word}.</span>}
      </div>
      <form className="row" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Add a ${word}'s name`} />
        <button className="btn secondary" type="submit"><Plus size={16} /> Add</button>
      </form>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!people.length} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function AddAccount({ accounts, onCreate, onCancel }) {
  const [type, setType] = useState("Driver");
  const [name, setName] = useState("");
  const [depot, setDepot] = useState("Peliyagoda");
  const [category, setCategory] = useState("Reefer truck");
  const [brand, setBrand] = useState("Fresh");
  const [district, setDistrict] = useState("Gampaha");
  const [people, setPeople] = useState("");
  const [storeTitle, setStoreTitle] = useState("");
  const form = useRulesForm(DEFAULT_RULES.Fresh);
  const pickBrand = (b) => { setBrand(b); form.reset(DEFAULT_RULES[b]); };
  const districts = [...(districtsByDepot[depot] || [])].sort();

  // Automatic numbers: a new driver brings a new vehicle; a new store gets the next outlet ID.
  const nextVehicle = `VEH${String(nextNumber(accounts.filter((a) => a.vehicle).map((a) => a.vehicle), /VEH(\d+)/)).padStart(3, "0")}`;
  const nextOutlet = `OUT${String(nextNumber(accounts.filter((a) => a.type === "Store account").map((a) => a.id), /OUT(\d+)/)).padStart(3, "0")}`;
  const nextDispatcher = `WP-DSP-${String(nextNumber(accounts.filter((a) => a.type === "Dispatcher").map((a) => a.id), /DSP-(\d+)/)).padStart(3, "0")}`;

  const create = () => {
    const list = people.split(",").map((s) => s.trim()).filter(Boolean);
    const d = districts.includes(district) ? district : districts[0];
    const acc = {
      Driver: { name: name || "New driver", id: `WP-DRV-${nextVehicle.slice(3)}`, category, depot, vehicle: nextVehicle, scope: `${nextVehicle} · ${depot}` },
      Dispatcher: { name: name || "New dispatcher", id: nextDispatcher, category: depot, scope: "Planning office" },
      "Store account": { name: `Waypoint ${brand} ${storeTitle.trim()}`, id: `STORE-${nextOutlet}`, category: brand, depot, scope: `${nextOutlet} · ${d}`, rules: form.rules, outlet: nextOutlet, people: list.length ? list : ["Store manager"] },
      "Depot account": { name: `${depot} depot (2)`, id: `DEPOT-${depot.toUpperCase()}-2`, category: depot, depot, scope: `${depot} loading dock`, people: list.length ? list : ["Loader"] },
    }[type];
    onCreate({ ...acc, type, status: "Not activated", last: "never" });
  };

  return (
    <div className="panel" style={{ maxWidth: 780, borderTop: "5px solid var(--turmeric)" }}>
      <h3 style={{ margin: "0 0 12px" }}>New account</h3>
      <div className="roles" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {TYPES.map(([tp, Icon, hint]) => (
          <button key={tp} className="role-btn" style={{ flexDirection: "column", alignItems: "flex-start", ...(type === tp ? { borderColor: "var(--brinjal)", boxShadow: "0 0 0 3px var(--brinjal-tint)" } : {}) }} onClick={() => setType(tp)}>
            <span className="row" style={{ gap: 8 }}><Icon size={17} /> {tp}</span><span className="muted xs" style={{ fontWeight: 500 }}>{hint}</span>
          </button>
        ))}
      </div>
      <div className="col" style={{ gap: 14, marginTop: 16 }}>
        {(type === "Driver" || type === "Dispatcher") && (
          <label><span className="field-label">Full name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></label>
        )}
        <div><span className="field-label">Depot</span><Choice options={DEPOTS} value={depot} onChange={setDepot} /></div>
        {type === "Driver" && (
          <>
            <div><span className="field-label">Vehicle category</span><Choice options={VEHICLE_CATEGORIES} value={category} onChange={setCategory} /></div>
            <div className="banner info"><Truck size={18} /> The driver comes with a new vehicle: <b style={{ marginLeft: 4 }}>{nextVehicle}</b> (assigned automatically · one driver per vehicle)</div>
          </>
        )}
        {type === "Store account" && (
          <>
            <label><span className="field-label">Store name</span>
              <div className="row" style={{ gap: 8 }}><span className="tag brinjal" style={{ fontSize: 14, padding: "8px 10px" }}>Waypoint {brand}</span><input className="input" value={storeTitle} onChange={(e) => setStoreTitle(e.target.value)} placeholder="Town or area, e.g. Kiribathgoda" /></div>
            </label>
            <div><span className="field-label">Store category</span><Choice options={BRANDS} value={brand} onChange={pickBrand} /></div>
            <div><span className="field-label">District</span><Choice options={districts} value={districts.includes(district) ? district : districts[0]} onChange={setDistrict} /></div>
            <label><span className="field-label">People who use it (comma separated)</span><input className="input" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="Manager 1, Manager 2, Night staff" /></label>
            <div className="card flat" style={{ background: "#fcfaf6" }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Store details · rules the planner follows</div>
              {form.fields(brand)}
              <div className="muted xs" style={{ marginTop: 8 }}>Started from typical {brand} settings. Editable later with “Details”.</div>
            </div>
            <div className="banner info"><Store size={18} /> New store ID: <b style={{ marginLeft: 4 }}>STORE-{nextOutlet}</b> (assigned automatically)</div>
          </>
        )}
        {type === "Depot account" && (
          <label><span className="field-label">Loaders (comma separated)</span><input className="input" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="Suresh, Kamal, Mohamed" /></label>
        )}
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={type === "Store account" && (!storeTitle.trim() || !form.valid)} onClick={create}>Create account</button>
      </div>
    </div>
  );
}

export function AdminUsers() {
  const { setToast, dispatch, accounts } = useApp();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);
  const [editing, setEditing] = useState(null);
  const [rules, setRules] = useState(null);
  const [f, setF] = useState("All");
  const [cat, setCat] = useState("All");
  const [depot, setDepot] = useState("All");
  const [q, setQ] = useState("");

  const onCreate = ({ rules: storeRulesNew, outlet, ...acc }) => {
    const pw = tempPassword();
    // The temporary password goes to the server once (stored only as a hash) for the person's first sign-in.
    dispatch({ type: "addAccount", account: { ...acc, temp: pw } });
    if (storeRulesNew) dispatch({ type: "storeRules", outlet, rules: storeRulesNew });
    setCreated({ ...acc, pw });
    setAdding(false);
    dispatch({ type: "log", who: "Admin", role: "Admin", what: `Created ${acc.type.toLowerCase()} ${acc.id}${acc.vehicle ? ` with vehicle ${acc.vehicle}` : ""}${storeRulesNew ? ` · ${describeRules(storeRulesNew)}` : ""}` });
  };
  const pickFilter = (key) => { setF(key); setCat("All"); };
  const cats = f === "Driver" ? VEHICLE_CATEGORIES : f === "Store account" ? BRANDS : null;
  const shown = useMemo(() => accounts
    .filter((a) => f === "All" || a.type === f || a.status === f)
    .filter((a) => cat === "All" || a.category === cat)
    .filter((a) => depot === "All" || a.depot === depot || a.category === depot)
    .filter((a) => !q || `${a.name} ${a.id} ${a.scope} ${a.category} ${(a.people || []).join(" ")}`.toLowerCase().includes(q.toLowerCase())),
  [accounts, f, cat, depot, q]);
  const count = (key) => accounts.filter((a) => key === "All" || a.type === key || a.status === key).length;

  return (
    <DeskShell nav={NAV} title="Accounts" subtitle="Personal accounts for drivers and dispatchers · shared accounts for stores and depots"
      actions={<>
        <button className="btn secondary" onClick={() => { if (window.confirm("Reset the demo day? Everything done today (plan, loading, deliveries, reports) goes back to the start for everyone.")) { dispatch({ type: "reset" }); setToast({ text: "Demo day reset to the start" }); } }}>Reset demo day</button>
        <button className="btn primary" onClick={() => { setAdding(true); setCreated(null); setEditing(null); }}><UserPlus size={18} /> New account</button>
      </>}>
      {adding && <AddAccount accounts={accounts} onCreate={onCreate} onCancel={() => setAdding(false)} />}
      {editing && <PeopleEditor key={editing.id} account={editing} onClose={() => setEditing(null)} />}
      {rules && <StoreRulesEditor key={rules.id} account={rules} onClose={() => setRules(null)} />}
      {created && (
        <div className="panel" style={{ maxWidth: 640, borderTop: "5px solid var(--turmeric)" }}>
          <div className="row" style={{ gap: 8 }}><Check color="var(--done)" /> <h3 style={{ margin: 0 }}>{created.reset ? "Sign-in reset" : "Account created"} · {created.id}</h3></div>
          <div className="muted small" style={{ margin: "6px 0 12px" }}>{created.name} · {created.type} · {created.category} · {created.scope}</div>
          <div className="row" style={{ background: "var(--brinjal-deep)", color: "var(--turmeric)", borderRadius: 14, padding: "16px 18px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 30, letterSpacing: ".12em" }}>
            <span className="grow">{created.pw}</span>
            <button className="icon-btn" aria-label="Copy" onClick={() => { try { navigator.clipboard.writeText(created.pw); } catch { /* clipboard blocked */ } setToast({ text: "Copied" }); }}><Copy size={18} /></button>
          </div>
          <div className="banner info" style={{ marginTop: 12 }}>
            {created.type === "Depot account" ? "Sign the depot's loading tablet in with this once. It stays signed in; loaders just tap their name." : created.reset ? "The old password no longer works. Shown only once; hand it over in person. It must be changed at next sign-in." : "Shown only once. Hand it over in person. It must be changed at first sign-in."}
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn secondary"><Printer size={16} /> Print slip</button>
            <button className="btn primary" onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      )}
      <div className="table-card">
        <div className="head">
          {FILTERS.map(([key, label]) => <button key={key} className={`filter ${f === key ? "on" : ""}`} onClick={() => pickFilter(key)}>{label} <span className="muted" style={{ fontWeight: 600, opacity: f === key ? 0.8 : 1, color: f === key ? "#fff" : undefined }}>{count(key)}</span></button>)}
          <div className="grow" />
          <div className="input-wrap" style={{ width: 220 }}><input className="input" style={{ height: 38, paddingLeft: 34, fontSize: 14 }} placeholder="Search name, ID, place" value={q} onChange={(e) => setQ(e.target.value)} /><Search size={16} style={{ position: "absolute", left: 11, top: 11 }} color="var(--muted)" /></div>
        </div>
        <div className="head" style={{ background: "#fcfaf6", paddingTop: 10, paddingBottom: 10 }}>
          {cats && <><span className="muted xs" style={{ fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Category</span>{["All", ...cats].map((c) => <button key={c} className={`filter ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}<span style={{ width: 12 }} /></>}
          <span className="muted xs" style={{ fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Depot</span>
          {["All", ...DEPOTS].map((d) => <button key={d} className={`filter ${depot === d ? "on" : ""}`} onClick={() => setDepot(d)}>{d}</button>)}
          <span className="muted small" style={{ marginLeft: "auto" }}>Showing {shown.length} of {accounts.length}</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: "calc(100vh - 290px)", overflowY: "auto" }}>
          <table className="t">
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}><tr><th>Account</th><th>ID</th><th>Type</th><th>Category</th><th>Vehicle / place</th><th>People</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td><span className="row"><span className="avatar" style={{ width: 30, height: 30, fontSize: 13, ...(isShared(a) ? { background: "var(--brinjal)", color: "#fff" } : {}) }}>{isShared(a) ? <Users size={15} /> : a.name[0]}</span><b>{a.name}</b></span></td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{a.id}</td>
                  <td><span className={`tag ${isShared(a) ? "brinjal" : ""}`}>{a.type}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{a.category}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{a.scope}</td>
                  <td className="muted small">{a.people ? a.people.join(", ") : "—"}</td>
                  <td><StatusChip status={a.status} /></td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{a.last}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {a.type === "Store account" && <button className="btn secondary" style={{ minHeight: 34, padding: "0 10px", fontSize: 13, marginRight: 6 }} onClick={() => { setRules(a); setEditing(null); setAdding(false); setCreated(null); }}><SlidersHorizontal size={14} /> Details</button>}
                    {isShared(a) && <button className="btn secondary" style={{ minHeight: 34, padding: "0 10px", fontSize: 13, marginRight: 6 }} onClick={() => { setEditing(a); setRules(null); setAdding(false); setCreated(null); }}><Pencil size={14} /> People</button>}
                    <RowMenu account={a} onReset={(acc) => { const pw = tempPassword(); dispatch({ type: "resetSignIn", id: acc.id, temp: pw }); setCreated({ ...acc, reset: true, pw }); setAdding(false); setEditing(null); setRules(null); dispatch({ type: "log", who: "Admin", role: "Admin", what: `Reset sign-in for ${acc.id}` }); }} />
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 30 }}>No accounts match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </DeskShell>
  );
}

export function AdminLog() {
  const { log } = useApp();
  return (
    <DeskShell nav={NAV} title="Activity log" subtitle="Who did what, and when">
      <div className="table-card">
        <table className="t">
          <thead><tr><th>When</th><th>Who</th><th>Role</th><th>What</th></tr></thead>
          <tbody>{log.map((e, i) => <tr key={i}><td className="muted" style={{ whiteSpace: "nowrap" }}>{e.at}</td><td><b>{e.who}</b></td><td className="muted">{e.role}</td><td>{e.what}</td></tr>)}</tbody>
        </table>
      </div>
    </DeskShell>
  );
}
