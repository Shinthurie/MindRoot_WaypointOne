import { useEffect, useRef, useState } from "react";
import { CUTOFF, nextOperatingDay, runFor } from "../runs.js";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  ArrowRight, Check, ChevronLeft, CircleDot, Clock, CloudOff, LogOut, Radio, RotateCw, Signal, SignalZero,
  AlertTriangle, Truck, Volume2, ChevronDown, ShoppingBasket, Shirt, Tv, Bell,
} from "lucide-react";
import { useApp } from "../state";
import { LANGS } from "../i18n";

const ICON = import.meta.env.BASE_URL + "brand/logo-white.svg"; // white version: the sidebar is brinjal

/* Screen size → layout. Phone preview forces the phone layout inside a device frame. */
export function useLayout() {
  const { phonePreview } = useApp();
  const get = () => (typeof window === "undefined" ? 1280 : window.innerWidth);
  const [w, setW] = useState(get);
  useEffect(() => {
    const on = () => setW(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  if (phonePreview) return "phone";
  return w >= 1280 ? "wall" : w >= 768 ? "tablet" : "phone";
}

/* Mobile-first frame. Full screen and responsive by default; inside a phone frame when "Phone preview" is on.
   wide = the screen lays out its own panels on tablets and big screens (otherwise it's a centred column). */
export function MobileFrame({ children, caption, wide }) {
  const { toast, phonePreview } = useApp();
  // Loader and driver fill the whole screen at any size (phone, tablet, desktop, installed app).
  const fluid = /^#\/(loader|driver)(\/|$)/.test(window.location.hash);
  const toastEl = toast && (
    <div className="toast" role="status">
      <Check size={18} /> {toast.text}
    </div>
  );
  if (!phonePreview) {
    return (
      <div className={`app-full ${wide ? "wide" : ""} ${fluid ? "fluid" : ""}`}>
        <div className="column">
          {children}
          {toastEl}
        </div>
      </div>
    );
  }
  return (
    <div className="stage">
      {caption && (
        <div className="stage-caption">
          <div className="kicker">{caption.kicker}</div>
          <h1>{caption.title}</h1>
          {caption.lines?.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}
      <div className="device">
        {children}
        {toastEl}
      </div>
    </div>
  );
}

/* Two panels side by side on tablets and big screens. Each panel scrolls on its own. */
export function Split({ left, right, leftWidth = 400 }) {
  return (
    <div className="split" style={{ gridTemplateColumns: `minmax(300px, ${leftWidth}px) minmax(0, 1fr)` }}>
      <section className="pane list">{left}</section>
      <section className="pane detail"><div className="pane-inner">{right}</div></section>
    </div>
  );
}

export function LangChip({ light }) {
  const { lang, dispatch } = useApp();
  const next = LANGS[(LANGS.findIndex((l) => l.code === lang) + 1) % LANGS.length];
  return (
    <button className={`lang-chip ${light ? "light" : ""}`} onClick={() => dispatch({ type: "lang", lang: next.code })} aria-label="Change language">
      {LANGS.map((l) => (l.code === lang ? <b key={l.code}>{l.label}</b> : <span key={l.code}>{l.label}</span>))}
    </button>
  );
}

export function TopBar({ title, sub, back, time = "04:30", problem, lang = true, right }) {
  const nav = useNavigate();
  const { online, t } = useApp();
  const clock = useClock(); // one clock for every portal
  return (
    <header className="topbar">
      <div className="statusline">
        <span className="num">{clock.time}</span>
        <span className="sig">
          {lang && <LangChip />}
          {online ? <><Signal size={14} /> 4G</> : <><SignalZero size={14} /> {t("noSignal")}</>}
        </span>
      </div>
      <div className="topbar-row">
        {back && (
          <button className="icon-btn" onClick={() => (typeof back === "string" ? nav(back) : nav(-1))} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
        )}
        <div className="grow">
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {right}
        {problem && (
          <button className="icon-btn danger" onClick={() => nav(problem)} aria-label={t("problem")}>
            <AlertTriangle size={20} />
          </button>
        )}
      </div>
    </header>
  );
}

/* Shape + number stop badge. The same badge appears on crate stickers, the loader list and the driver's phone. */
const SHAPES = {
  1: <circle cx="8" cy="8" r="6" />,
  2: <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />,
  3: <path d="M8 2 L14.5 13.5 H1.5 Z" />,
  4: <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" />,
  5: <path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2 4.1 13.4l.9-4.4-3.3-3 4.4-.5z" />,
  6: <path d="M4.5 2h7L15 8l-3.5 6h-7L1 8z" />,
  7: <path d="M8 14s-6-3.7-6-8a3.2 3.2 0 0 1 6-1.6A3.2 3.2 0 0 1 14 6c0 4.3-6 8-6 8z" />,
};
export function Shape({ n, size = 48 }) {
  const glyph = Math.round(size * 0.3);
  return (
    <span className="shape" style={{ width: size, height: size, fontSize: size * 0.42, borderRadius: size * 0.3 }} aria-label={`Stop ${n}`}>
      <svg width={glyph} height={glyph} viewBox="0 0 16 16" fill="currentColor" aria-hidden>{SHAPES[n] || SHAPES[1]}</svg>
      {n}
    </span>
  );
}

/* Brands: the same colour and icon wherever a brand appears (Fresh green, Style pink, Tech blue). */
const BRAND_ICON = { fresh: ShoppingBasket, style: Shirt, tech: Tv };
export function BrandChip({ brand, small }) {
  const key = String(brand).toLowerCase();
  const Icon = BRAND_ICON[key];
  return <span className={`brand-chip ${key} ${small ? "sm" : ""}`}>{Icon && <Icon size={small ? 12 : 13} aria-hidden="true" />}{brand}</span>;
}
export function BrandTile({ brand, size = 40 }) {
  const key = String(brand).toLowerCase();
  const Icon = BRAND_ICON[key] || Truck;
  return <span className={`brand-tile-ic ${key}`} style={{ width: size, height: size }} aria-hidden="true"><Icon size={Math.round(size * 0.5)} /></span>;
}

/* Order number badge: the same number printed on the crate label, so the loader matches crate to line.
   A stop can hold two orders (Fresh dry + chilled), so both numbers show. */
export function OrderTag({ refs, size = "md" }) {
  const list = Array.isArray(refs) ? refs : [refs];
  return (
    <span className={`order-tag ${size}`} aria-label={`Order ${list.join(" and ")}`}>
      {list.map((r) => <span key={r}>{r}</span>)}
    </span>
  );
}

const CHIP = {
  planned: [Clock, "Planned"], way: [Truck, "On the way"], done: [Check, "Delivered"], deferred: [RotateCw, "Deferred"],
  late: [Clock, "At risk"], problem: [AlertTriangle, "Problem"], offline: [CloudOff, "Offline"],
};
export function Chip({ kind, children }) {
  const [Icon, label] = CHIP[kind];
  return <span className={`chip ${kind}`}><Icon size={13} strokeWidth={2.6} /> {children || label}</span>;
}

export function Speak({ text }) {
  const [on, setOn] = useState(false);
  const { lang } = useApp();
  // Only English has a voice today; in Sinhala and Tamil the button would stay silent, so it is hidden.
  if (lang !== "en") return null;
  const play = () => {
    setOn(true);
    try {
      if (lang === "en" && "speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch { /* audio not available: the visual state is enough for the prototype */ }
    setTimeout(() => setOn(false), 1600);
  };
  return (
    // A span with button behaviour: it often sits inside a tappable card, and a button can't contain a button.
    <span role="button" tabIndex={0} className={`speak ${on ? "playing" : ""}`} aria-label="Read aloud"
      onClick={(e) => { e.stopPropagation(); play(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); play(); } }}>
      <Volume2 size={20} />
    </span>
  );
}

export function Pic({ icon: Icon, label, selected, red, onClick }) {
  return (
    <button className={`pic ${selected ? "sel" : ""} ${red ? "red" : ""}`} onClick={onClick} aria-pressed={!!selected}>
      <span className="ic"><Icon size={24} /></span>
      {label}
    </button>
  );
}

export function SlideConfirm({ label, onDone, red }) {
  const ref = useRef(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const start = useRef(0);
  const max = () => (ref.current ? ref.current.clientWidth - 62 : 200);
  const down = (e) => { setDrag(true); start.current = e.clientX - x; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag) setX(Math.min(Math.max(0, e.clientX - start.current), max())); };
  const up = () => {
    setDrag(false);
    if (x > max() * 0.85) { setX(max()); setTimeout(() => { onDone?.(); setX(0); }, 180); } else setX(0);
  };
  return (
    <div
      ref={ref}
      className={`slide ${red ? "red" : ""} ${drag ? "dragging" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onDone?.(); }}
    >
      <span className="fill" style={{ width: x + 57 }} />
      <span className="knob" style={{ left: 5 + x }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <ArrowRight size={24} strokeWidth={2.8} />
      </span>
      <span className="label">{label}</span>
    </div>
  );
}

export function Keypad({ onKey }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <div className="keypad">
      {keys.map((k, i) =>
        k === "" ? <span key={i} /> : (
          <button key={i} className={`key ${k === "⌫" ? "ghost" : ""}`} onClick={() => onKey(k)} aria-label={k === "⌫" ? "Delete" : k}>{k}</button>
        ),
      )}
    </div>
  );
}

export function Dots({ count, total = 6 }) {
  return <div className="dots" aria-label={`${count} of ${total} digits`}>{Array.from({ length: total }, (_, i) => <i key={i} className={i < count ? "on" : ""} />)}</div>;
}

export function Codes({ value, total = 6 }) {
  return (
    <div className="codes">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < value.length ? "on" : i === value.length ? "cur" : ""}>{value[i] || ""}</span>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0 }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="Less">−</button>
      <span>{value}</span>
      <button onClick={() => onChange(value + 1)} aria-label="More">+</button>
    </div>
  );
}

export function OfflineBanner() {
  const { online, outbox, t } = useApp();
  if (online) return null;
  return (
    <div className="banner offline" role="status">
      <CloudOff size={18} /> {t("savedOnPhone")}{outbox.length ? ` (${outbox.length})` : ""}
    </div>
  );
}

/* Desktop shell for dispatcher and admin. */
export function DeskShell({ nav, title, actions, children, subtitle, peakOnly }) {
  const { user, dispatch, depot } = useApp();
  const go = useNavigate();
  // On tablets the menu is one scrolling row: keep the current page's item in view.
  const sideRef = useRef(null);
  useEffect(() => { sideRef.current?.querySelector(".nav.active")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [title]);
  return (
    <div className="desk">
      <aside className="side" ref={sideRef} aria-label="Main menu">
        <div className="brand">
          <img src={ICON} alt="" />
          <div>Waypoint One<small>{user?.role === "store" ? `${user.name.replace("Waypoint ", "")} · ${user.outlet}` : user?.role === "admin" ? "Admin" : `Dispatch · ${depot}`}</small></div>
        </div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => `nav ${isActive ? "active" : ""}`}>
            <n.icon size={19} /> {n.label} {n.count != null && <span className="count">{n.count}</span>}
          </NavLink>
        ))}
      </aside>
      <main className="main">
        <div className="topbar-desk">
          <div className="grow" />
          <span className="depot-live"><i className="dot-live" /> {user?.role === "store" ? `${user.outlet} · ${user.name?.replace("Waypoint ", "")}` : user?.role === "admin" ? "Peliyagoda & Kandy" : `${user?.depot || depot} Depot`}</span>
          {user?.role === "dispatcher" ? <NotificationBell /> : <span className="bell" aria-hidden="true"><Bell size={18} /></span>}
          <span className="user-chip">
            <span className="avatar">{user?.name?.[0] || "?"}</span>
            <span><b>{user?.name}</b><small>{{ dispatcher: "Dispatcher", store: "Store manager", admin: "Admin" }[user?.role] || user?.id}</small></span>
          </span>
          <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => { dispatch({ type: "logout" }); go("/"); }}>
            <LogOut size={17} />
          </button>
        </div>
        <div className="deskbar">
          <div className="grow">
            <h2>{title}</h2>
            {subtitle && <div className="muted small" style={{ marginTop: 2 }}>{subtitle}</div>}
          </div>
          {user?.role !== "dispatcher" && <ClockBadge />}
          {actions}
        </div>
        <div className="content">{peakOnly ? <PeakDayOnly>{children}</PeakDayOnly> : children}</div>
      </main>
    </div>
  );
}

/* Dispatcher notifications: loading started, truck loaded, problems at the dock. Opens as a list; tap to go there. */
function NotificationBell() {
  const { notifications = [], dispatch } = useApp();
  const go = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  const toggle = () => { setOpen(!open); if (!open && unread) setTimeout(() => dispatch({ type: "notifRead" }), 1500); };
  return (
    <span style={{ position: "relative" }}>
      <button className="bell-btn" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
        <Bell size={18} />{unread > 0 && <b className="nav-badge">{unread}</b>}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="notif-menu" role="dialog" aria-label="Notifications">
            <div className="row between" style={{ padding: "4px 6px 8px" }}><b>Notifications</b><span className="muted xs">{notifications.length ? `${notifications.length} today` : ""}</span></div>
            {!notifications.length && <div className="muted small" style={{ padding: 10 }}>Nothing yet. Loading, loaded trucks and dock problems show up here.</div>}
            {notifications.slice(0, 20).map((n) => (
              <button key={n.id} className={`notif ${n.kind} ${n.read ? "" : "new"}`} onClick={() => { setOpen(false); if (n.link) go(n.link); }}>
                <span className="notif-dot" />
                <span className="grow"><b>{n.title}</b><small>{n.text}</small></span>
                <span className="muted xs">{n.at}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/* Depot switch for the dispatcher: Peliyagoda or Kandy. */
export function DepotPill() {
  const { depot, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button className="pillsel" style={{ cursor: "pointer" }} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CircleDot size={14} /> {depot} <ChevronDown size={15} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="menu" role="menu" style={{ top: 46 }}>
            {["Peliyagoda", "Kandy"].map((d) => (
              <button key={d} role="menuitemradio" aria-checked={depot === d} onClick={() => { dispatch({ type: "depot", depot: d }); setOpen(false); }}>
                {depot === d ? <Check size={15} /> : <span style={{ width: 15 }} />} {d}
                <span className="muted xs" style={{ marginLeft: "auto" }}>{d === "Peliyagoda" ? "distribution centre" : "regional hub"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/* The peak-day scenario (S1) only has Peliyagoda orders; say so plainly instead of inventing Kandy data. */
export function PeakDayOnly({ children }) {
  const { depot, dispatch } = useApp();
  const go = useNavigate();
  if (depot === "Peliyagoda") return children;
  return (
    <div className="panel" style={{ maxWidth: 720 }}>
      <div className="card-title" style={{ fontSize: 18 }}><CircleDot size={18} /> {depot}: no orders in today's scenario</div>
      <p className="muted" style={{ margin: "8px 0 14px", lineHeight: 1.6 }}>
        The peak-day scenario (S1) in the competition data covers Peliyagoda only, so there is no {depot} plan to show for this day.{" "}
        {depot}'s fleet and its 10-week demand outlook come from real data.
      </p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn secondary" onClick={() => go("/dispatch/fleet")}>{depot} fleet today</button>
        <button className="btn secondary" onClick={() => go("/dispatch/outlook")}>{depot} outlook</button>
        <button className="btn primary" onClick={() => dispatch({ type: "depot", depot: "Peliyagoda" })}>Back to Peliyagoda</button>
      </div>
    </div>
  );
}
/* Planning date and time. Set by hand for now; later this reads the real clock (see AUTO_CLOCK). */
const AUTO_CLOCK = false;
export function useClock() {
  const { clock } = useApp();
  if (!AUTO_CLOCK) return clock;
  const d = new Date();
  return { date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 5) };
}
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_NAMES[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

export { CUTOFF, nextOperatingDay, runFor };
export function useRuns() {
  const clock = useClock();
  const [h, m] = clock.time.split(":").map(Number);
  const [ch, cm] = CUTOFF.split(":").map(Number);
  const left = ch * 60 + cm - (h * 60 + m);
  const next = nextOperatingDay(clock.date);
  const closed = left <= 0;
  return {
    clock, closed, next, following: nextOperatingDay(next),
    orderRun: closed ? nextOperatingDay(next) : next, // the run a new order joins right now
    leftText: closed ? "closed" : `${Math.floor(left / 60)} h ${left % 60} m left`,
  };
}

/* Read-only clock for portals that don't set the time (store, admin): same date and time everywhere. */
function ClockBadge() {
  const clock = useClock();
  return <span className="pillsel" title="Set by the dispatcher"><Clock size={14} /> {formatDate(clock.date)} · {clock.time}</span>;
}

/* The S1 day, step by step (judge walkthrough): orders close, plan, load, on the road, receipt. */
export const TIMELINE = [
  ["Store orders close", "2026-01-07", "15:30"],
  ["Plan and publish", "2026-01-07", "19:00"],
  ["Loading at the dock", "2026-01-08", "03:00"],
  ["Trucks on the road", "2026-01-08", "05:30"],
  ["Stores receive", "2026-01-08", "08:00"],
];

export function DayPill() {
  const { dispatch } = useApp();
  const clock = useClock();
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button className="pillsel" style={{ cursor: "pointer" }} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Clock size={14} /> {formatDate(clock.date)} · {clock.time} <ChevronDown size={15} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="menu" role="dialog" aria-label="Date and time" style={{ top: 46, padding: 12, minWidth: 240, gap: 10 }}>
            <label><span className="field-label">Date</span>
              <input type="date" className="input" style={{ height: 40 }} value={clock.date} onChange={(e) => e.target.value && dispatch({ type: "clock", clock: { date: e.target.value } })} />
            </label>
            <label><span className="field-label">Time</span>
              <input type="time" className="input" style={{ height: 40 }} value={clock.time} onChange={(e) => e.target.value && dispatch({ type: "clock", clock: { time: e.target.value } })} />
            </label>
            <div className="field-label" style={{ marginTop: 2 }}>Jump to a step of the S1 day</div>
            <div className="col" style={{ gap: 6 }}>
              {TIMELINE.map(([label, date, time]) => (
                <button key={label} className="option" style={{ padding: "8px 10px" }} onClick={() => { dispatch({ type: "clock", clock: { date, time } }); setOpen(false); }}>
                  <b className="small">{formatDate(date)} · {time}</b> <span className="muted small">{label}</span>
                </button>
              ))}
            </div>
            <div className="muted xs">Set by hand for now. Every portal follows this time.</div>
            <button className="btn secondary" style={{ minHeight: 38 }} onClick={() => { if (window.confirm("Reset the demo day? Everything done today (plan, loading, deliveries, reports) goes back to the start for everyone.")) { dispatch({ type: "reset" }); setOpen(false); } }}>Reset demo day</button>
          </div>
        </>
      )}
    </span>
  );
}

export function useTicker(active, ms = 1000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return n;
}

/* "Who is this?" for shared accounts (store, dock): one tap on a name, so every record has a person. */
export function useWho() {
  const { user, person, dispatch, peopleOf, tf } = useApp();
  const [pending, setPending] = useState(null);
  const ask = (title, action) => setPending({ title, action });
  const sheet = pending && (
    <div className="sheet-backdrop" onClick={() => setPending(null)}>
      <div className="sheet" role="dialog" aria-label={tf("Who is this?")} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h3 style={{ margin: "0 0 2px" }}>{tf("Who is this?")}</h3>
        <div className="muted small" style={{ marginBottom: 14 }}>{pending.title} · {user?.name}</div>
        <div className="pics" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
          {peopleOf(user?.id).map((p) => (
            <button key={p} className={`pic ${person === p ? "sel" : ""}`} onClick={() => { dispatch({ type: "person", name: p }); setPending(null); pending.action(p); }}>
              <span className="avatar" style={{ width: 52, height: 52, fontSize: 22 }}>{p[0]}</span>{p}
            </button>
          ))}
        </div>
        <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setPending(null)}>{tf("Cancel")}</button>
      </div>
    </div>
  );
  return { ask, sheet };
}

/* Field screens before the dispatcher publishes tonight's plan. */
export function PlanNotReady({ title, sub }) {
  const { t } = useApp();
  return (
    <MobileFrame>
      <div className="screen">
        <TopBar title={title} sub={sub} time="18:40" />
        <div className="body field" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <span className="shape" style={{ width: 88, height: 88, borderRadius: 26, background: "var(--planned)" }}><Clock size={42} /></span>
          <h2 style={{ margin: "8px 0 0" }}>{t("planNotReady")}</h2>
          <p className="muted" style={{ maxWidth: 340, lineHeight: 1.6, margin: 0 }}>{t("planNotReadyText")}</p>
        </div>
      </div>
    </MobileFrame>
  );
}

export { Link };
