import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../sync";
import { ArrowRight, X, Eye, EyeOff, KeyRound, Languages, Lock, LogOut, MapPin, MessageSquareText, Phone, Shirt, ShieldCheck, ShoppingBasket, Store, Truck, Tv, Package, LayoutDashboard, UserCog, UserRound, Check } from "lucide-react";
import { useApp, USERS } from "../state";
import { LANGS } from "../i18n";
import { BadDayButtons } from "../components/Guide";
import { outletsAll } from "../data/accounts";
import { Codes, Dots, Keypad, MobileFrame, TopBar } from "../components/ui";

// Personal: WP-DRV (driver), WP-DSP (dispatcher), WP-ADM (admin). Shared: STORE-<outlet>, DEPOT-<depot>.
const ROLE_BY_PREFIX = { "WP-DRV": "driver", "DEPOT-": "loader", "STORE-": "store", "WP-DSP": "dispatcher", "WP-ADM": "admin" };
const QUICK = [
  ["dispatcher", LayoutDashboard, "roleDispatcher", "#6d3a8a"], ["loader", Package, "roleLoader", "#ea7a12"], ["driver", Truck, "roleDriver", "#2563eb"],
  ["store", Store, "roleStore", "#16a34a"], ["admin", UserCog, "roleAdmin", "#475569"],
];
const ROLE_COLORS = { dispatcher: "#7c3aed", loader: "#ea7a12", driver: "#2563eb", store: "#16a34a", admin: "#64748b" };
const LANG_NAMES = { en: "English", si: "සිංහල", ta: "தமிழ்" };

/* Language picker for the sign-in page: full names, so nobody has to guess what "த" means. */
function LangSwitch({ onPick }) {
  const { lang, dispatch } = useApp();
  return (
    <div className="lang-switch" role="radiogroup" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} type="button" role="radio" aria-checked={lang === l.code} className={lang === l.code ? "on" : ""}
          onClick={() => { dispatch({ type: "lang", lang: l.code }); onPick(); }}>
          <span className="full">{LANG_NAMES[l.code]}</span><span className="short">{l.label}</span>
        </button>
      ))}
    </div>
  );
}

/* Sign-in: one form, shown in the landing page's slide-in panel (/) or on its own page (/signin). */
export function SignIn({ landing = false }) {
  const { dispatch, t, lang, accounts, serverMode } = useApp();
  const nav = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(null);
  const [tries, setTries] = useState(5);
  const [picked, setPicked] = useState(false);

  // If the person chose a language here, keep it after sign-in instead of the account's default.
  const enter = (role, outlet, account) => { dispatch({ type: "login", role, keepLang: picked, outlet, account }); nav(USERS[role].home); };
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const clean = id.trim().toUpperCase();
    if (clean === "WP-DRV-027") { nav("/first"); return; }
    if (serverMode) {
      // The server checks the password or PIN (bcrypt) and locks the account after 5 wrong tries.
      setBusy(true); setErr(null);
      api.login(clean, pw).then((r) => {
        dispatch({ type: "login", user: r.user, token: r.token, keepLang: picked });
        nav(USERS[r.user.role]?.home || r.user.home);
      }).catch((ex) => setErr({ text: ex.status === 0 ? "No connection to the server. Try again when you have signal." : ex.message })).finally(() => setBusy(false));
      return;
    }
    const role = Object.entries(ROLE_BY_PREFIX).find(([p]) => clean.startsWith(p))?.[1];
    const acc = accounts.find((x) => x.id === clean);
    if (acc?.status === "Locked" || acc?.status === "Deactivated") { setErr({ key: acc.status === "Locked" ? "accountLocked" : "accountOff" }); return; }
    if (!role || pw.length < 4) {
      const left = tries - 1;
      setTries(left);
      setErr(left > 0 ? { key: "wrongTries", n: left } : { key: "tooMany" });
      return;
    }
    enter(role, role === "store" ? clean.replace("STORE-", "") : undefined, clean);
  };

  const form = (
    <form className="inner signin-form" onSubmit={submit}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 28, letterSpacing: "-0.02em" }}>{t("welcomeBack")}</h2>
        <div className="muted small">{t("workspaceSub")}</div>
      </div>
      <label>
        <span className="field-label">{t("employeeId")}</span>
        <div className="input-wrap with-icon"><UserRound size={18} className="lead" aria-hidden="true" />
          <input className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="WP-DRV-003" autoComplete="username" />
        </div>
      </label>
      <label>
        <span className="field-label">{t("passwordPin")}</span>
        <div className="input-wrap with-icon"><Lock size={18} className="lead" aria-hidden="true" />
          <input className="input" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
      </label>
      <button type="button" className="link" onClick={() => nav("/forgot")} style={{ alignSelf: "flex-start", marginTop: -4 }}>{t("forgot")}</button>
      {err && <div className="banner problem" style={{ fontSize: 13 }}>{err.text || t(err.key).replace("{n}", err.n)}</div>}
      <button className="btn primary block signin-go" type="submit" disabled={tries <= 0 || busy}>{t("signIn")} <ArrowRight size={18} /></button>
      <div className="secure-note"><ShieldCheck size={22} /><span><b>{t("secure")}</b><small>{t("secureSub")}</small></span></div>
      <div className="divider" />
      <div className="field-label" style={{ margin: 0 }}>{t("demoWorkspaces")}</div>
      <div className="role-tiles">
        {QUICK.map(([role, Icon, key]) => (
          <button type="button" key={role} className="role-tile" onClick={() => enter(role)}><span className="ic" style={{ background: ROLE_COLORS[role] }}><Icon size={18} /></span>{t(key)}</button>
        ))}
        <button type="button" className="role-tile" onClick={() => nav("/first")}><span className="ic" style={{ background: "var(--turmeric)", color: "#2a1331" }}><KeyRound size={18} /></span>{t("roleNew")}</button>
      </div>
      <div className="divider" />
      <div className="field-label" style={{ margin: 0 }}>Bad days · see what happens</div>
      <BadDayButtons />
    </form>
  );
  if (landing) return <Landing form={form} onPickLang={() => setPicked(true)} />;
  return (
    <div className={`auth signin-page lang-${lang}`}>
      <section className="auth-hero signin-hero">
        <button type="button" className="signin-brand" onClick={() => nav("/")} aria-label="Waypoint One home">
          <img src={import.meta.env.BASE_URL + "brand/logo-white.svg"} alt="" width="46" height="46" />
          <span><b>Waypoint One</b><small>{t("tagline")}</small></span>
        </button>
        <div>
          <h1>{t("signTitle1")}<br />{t("signTitle2")}</h1>
          <p>{t("signSub")}</p>
        </div>
        <span />
      </section>
      <section className="signin-glass">
        <div className="auth-lang"><LangSwitch onPick={() => setPicked(true)} /></div>
        <div className="slide-card">{form}</div>
      </section>
    </div>
  );
}

/* Landing page: the depot at dusk, a short promise, the three brands, and one "Sign in" button.
   Sign in slides the same form in from the right. Esc or a click outside closes it. */
const BRAND_LIST = [["Fresh", ShoppingBasket, "brandFresh", "#16a34a"], ["Style", Shirt, "brandStyle", "#db2777"], ["Tech", Tv, "brandTech", "#2563eb"]];
function Landing({ form, onPickLang }) {
  const { t, lang } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("input")?.focus();
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <main className={`landing lang-${lang} ${open ? "open" : ""}`}>
      <div className="landing-photo" aria-hidden="true" />
      <header className="landing-top">
        <div className="row" style={{ gap: 12 }}>
          <img src={import.meta.env.BASE_URL + "brand/logo-white.svg"} alt="" width="48" height="48" />
          <div><b style={{ fontSize: 19 }}>Waypoint One</b><div style={{ fontSize: 13, opacity: 0.8 }}>{t("tagline")}</div></div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <LangSwitch onPick={onPickLang} />
          <button className="btn primary landing-signin" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="signin-panel">{t("signIn")} <ArrowRight size={18} /></button>
        </div>
      </header>
      <section className="landing-copy">
        <h1>{t("landTitle1")}<br />{t("landTitle2")}</h1>
        <p>{t("landSub")}</p>
        <ul className="landing-brands">
          {BRAND_LIST.map(([name, Icon, key, c]) => (
            <li key={name}><span className="ic" style={{ color: c }}><Icon size={20} /></span><span><b>{name}</b><small>{t(key)}</small></span></li>
          ))}
        </ul>
      </section>
      <div className="landing-status"><MapPin size={16} /> <span><b>Peliyagoda Depot</b><small><i className="dot-live" /> {t("systemsReady")}</small></span></div>
      <div className="landing-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="signin-panel" ref={panel} className="landing-panel" role="dialog" aria-modal="true" aria-label={t("signIn")} aria-hidden={!open}>
        <button className="landing-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
        <div className="slide-card">{open && form}</div>
      </aside>
    </main>
  );
}

const CAPTION = { kicker: "Supporting flow", title: "First sign-in", lines: ["Admin gives a one-time password. The person chooses a language, verifies their phone, sets their own PIN, and checks their details."] };

/* A link can open a given step (for design capture): #/first?step=3 or ?step=3#/first. */
const stepFromLink = (max) => { const n = Number(new URLSearchParams(window.location.search).get("step")); return n >= 1 && n <= max ? n : 1; };

export function FirstSignIn() {
  const { dispatch, lang, accounts } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(() => stepFromLink(4));
  const me = accounts.find((a) => a.id === "WP-DRV-027") || {};
  const [code, setCode] = useState("482");
  const [pin, setPin] = useState(() => (stepFromLink(4) >= 3 ? "1234" : ""));
  const key = (setter, max) => (k) => setter((v) => (k === "⌫" ? v.slice(0, -1) : v.length < max ? v + k : v));

  return (
    <MobileFrame caption={CAPTION}>
      <div className="screen">
        <TopBar title="First sign-in" sub={`Step ${step} of 4 · WP-DRV-027`} back={step > 1 ? undefined : "/"} time="08:10" />
        <div className="body field">
          <div className="row" style={{ gap: 6 }}>
            {[1, 2, 3, 4].map((s) => <span key={s} style={{ flex: 1, height: 6, borderRadius: 9, background: s <= step ? "var(--brinjal)" : "var(--line-2)" }} />)}
          </div>
          {step === 1 && (
            <>
              <h2 style={{ margin: "6px 0 0" }}>Choose your language</h2>
              {LANGS.map((l) => (
                <button key={l.code} className={`stop ${lang === l.code ? "hl" : ""}`} onClick={() => dispatch({ type: "lang", lang: l.code })}>
                  <b style={{ fontSize: 20 }}>{{ en: "English", si: "සිංහල", ta: "தமிழ்" }[l.code]}</b>
                  {lang === l.code && <Check size={22} style={{ marginLeft: "auto" }} color="var(--done)" />}
                </button>
              ))}
            </>
          )}
          {step === 2 && (
            <>
              <h2 style={{ margin: "6px 0 0" }}>Add your phone number</h2>
              <div className="stop"><Phone size={20} /> <span className="muted">🇱🇰 +94</span> <b style={{ fontSize: 22 }} className="num">77 123 4521</b></div>
              <div className="card flat small"><MessageSquareText size={16} style={{ verticalAlign: "-3px" }} /> We'll send a 6-digit code to check this number. We use it only if you forget your PIN.</div>
              <Codes value={code} />
              <div className="muted small" style={{ textAlign: "center" }}>Code expires in 4:32 · Resend in 0:41</div>
              <Keypad onKey={key(setCode, 6)} />
            </>
          )}
          {step === 3 && (
            <>
              <h2 style={{ margin: "6px 0 0" }}>Make your own 6-digit PIN</h2>
              <Dots count={pin.length} />
              <div className="muted small" style={{ textAlign: "center" }}>Don't use 123456 or your birthday.</div>
              <Keypad onKey={key(setPin, 6)} />
            </>
          )}
          {step === 4 && (
            <>
              <h2 style={{ margin: "6px 0 0" }}>Is this you?</h2>
              <div className="row small" style={{ flexWrap: "wrap", gap: 6 }}>
                <span className="tag ok"><Check size={13} /> Language</span><span className="tag ok"><Check size={13} /> Phone verified</span><span className="tag ok"><Check size={13} /> PIN set</span>
              </div>
              <div className="card">
                {[["Name", me.name || "—"], ["Employee ID", "WP-DRV-027"], ["Role", "Driver"], ["Vehicle", me.vehicle || "VEH027"], ["Depot", me.depot || "Peliyagoda"]].map(([k, v]) => (
                  <div key={k} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <span className="muted"><Lock size={14} style={{ verticalAlign: "-2px" }} /> {k}</span><b>{v}</b>
                  </div>
                ))}
                <div className="muted small" style={{ marginTop: 8 }}>Something wrong? Admin will correct it.</div>
              </div>
            </>
          )}
        </div>
        <div className="dock">
          <button
            className="btn primary field block"
            disabled={(step === 2 && code.length < 6) || (step === 3 && pin.length < 6)}
            onClick={() => (step < 4 ? setStep(step + 1) : (dispatch({ type: "login", role: "driver" }), nav("/driver")))}
          >
            {step === 2 ? "Verify" : step === 4 ? "Yes, start" : "Next"}
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}

export function Forgot() {
  const nav = useNavigate();
  const { online } = useApp();
  const [step, setStep] = useState(() => stepFromLink(3));
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  return (
    <MobileFrame caption={{ kicker: "Supporting flow", title: "Forgot password", lines: ["The one-time code only opens “set a new password”. It expires in 5 minutes, allows 3 tries and works once."] }}>
      <div className="screen">
        <TopBar title={["Forgot password or PIN", "Enter the code", "Set a new password"][step - 1]} back={step === 1 ? "/" : undefined} time="09:14" lang={false} />
        <div className="body">
          {!online ? (
            <div className="banner offline">You need signal to reset. Try again when you have signal, or ask your dispatcher.</div>
          ) : step === 1 ? (
            <>
              <label><span className="field-label">Account ID</span><input className="input" defaultValue="WP-DRV-003" /></label>
              <div className="muted small">We'll send a code to your verified phone.</div>
            </>
          ) : step === 2 ? (
            <>
              <div className="card flat">Sent to <b className="num">+94 77 ••• ••4521</b></div>
              <Codes value={code} />
              <div className="muted small" style={{ textAlign: "center" }}>Expires in 4:48 · Resend in 0:52 · 3 tries</div>
              <div className="card flat small"><ShieldCheck size={16} style={{ verticalAlign: "-3px" }} /> This code works only once, only to set a new password.</div>
              <Keypad onKey={(k) => setCode((v) => (k === "⌫" ? v.slice(0, -1) : v.length < 6 ? v + k : v))} />
              <button className="link" onClick={() => nav("/")}>Lost your phone? Ask admin to reset you.</button>
            </>
          ) : (
            <>
              <label><span className="field-label">New password</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
              <label><span className="field-label">Type it again</span><input className="input" type="password" /></label>
              {[["8 or more characters", pw.length >= 8], ["Has a number", /\d/.test(pw)], ["Not your name", pw && !/fathima/i.test(pw)]].map(([r, ok]) => (
                <div key={r} className="row small" style={{ color: ok ? "var(--done)" : "var(--muted)" }}><Check size={16} /> {r}</div>
              ))}
            </>
          )}
        </div>
        {online && (
          <div className="dock">
            <button className="btn primary field block" disabled={step === 2 && code.length < 6}
              onClick={() => (step < 3 ? setStep(step + 1) : nav("/"))}>
              {["Send code", "Continue", "Save and sign in"][step - 1]}
            </button>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

export function Unlock() {
  const { t, user } = useApp();
  const nav = useNavigate();
  const [pin, setPin] = useState("");
  const u = user || USERS.driver;
  const press = (k) => {
    const v = k === "⌫" ? pin.slice(0, -1) : (pin + k).slice(0, 6);
    setPin(v);
    if (v.length === 6) setTimeout(() => nav(u.home), 250);
  };
  return (
    <MobileFrame caption={{ kicker: "Field Mode", title: "Daily unlock", lines: ["The phone remembers the driver, so it's just a PIN on a big keypad. It works offline in dead zones."] }}>
      <div className="screen">
        <TopBar title={`${t("welcomeBack")}, ${u.name}`} sub={`${u.role === "loader" ? "Loader" : "Driver"} · Peliyagoda`} time="03:05" />
        <div className="body field" style={{ justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><span className="avatar" style={{ width: 72, height: 72, fontSize: 30 }}>{u.name[0]}</span></div>
          <Dots count={pin.length} />
          <Keypad onKey={press} />
          <div className="banner offline"><Lock size={16} /> {t("pinOffline")}</div>
          <div className="muted small" style={{ textAlign: "center" }}>{t("forgotPin")}</div>
        </div>
      </div>
    </MobileFrame>
  );
}

export function Profile() {
  const { user, dispatch, tf, lang, peopleOf } = useApp();
  const nav = useNavigate();
  const u = user || USERS.store;
  const shop = u.outlet ? outletsAll.find((o) => o.id === u.outlet) : null;
  const people = peopleOf(u.id).length ? peopleOf(u.id) : u.people || [];
  const rows = u.shared
    ? [[tf("Account"), u.name], [tf("Account ID"), u.id], [tf("Type"), tf(u.role === "store" ? "Shared store account" : "Shared depot account")],
      [u.outlet ? tf("Store") : tf("Depot"), u.outlet ? `${u.outlet} · ${shop?.district || ""}` : u.depot], [tf("People"), people.join(", ")]]
    : [[tf("Name"), u.name], [tf("Employee ID"), u.id], [tf("Role"), { driver: "Driver", dispatcher: "Dispatcher", admin: "Admin" }[u.role]],
      ...(u.vehicle ? [[tf("Vehicle"), tf("{v} · one driver per vehicle", { v: u.vehicle })]] : u.depot ? [[tf("Depot"), u.depot]] : [])];
  const identity = (
    <div className="card">
      {rows.map(([k, v]) => (
        <div key={k} className="row between" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)", gap: 12 }}>
          <span className="muted"><Lock size={14} style={{ verticalAlign: "-2px" }} /> {k}</span><b style={{ textAlign: "right" }}>{v}</b>
        </div>
      ))}
      <div className="muted small" style={{ marginTop: 8 }}>{tf(u.shared ? "Add or remove people: ask admin." : "Wrong? Ask admin to correct.")}</div>
    </div>
  );
  const settings = (
    <div className="col" style={{ gap: 12 }}>
      <div className="stop"><Phone size={20} color="var(--brinjal)" /> <span className="grow">+94 77 ••• 4521</span> <button className="btn secondary" style={{ minHeight: 38 }}>{tf("Change")}</button></div>
      <div className="stop"><KeyRound size={20} color="var(--brinjal)" /> <span className="grow">{tf(u.role === "driver" || u.role === "loader" ? "PIN" : "Password")}</span> <button className="btn secondary" style={{ minHeight: 38 }}>{tf("Change")}</button></div>
      <div className="stop" style={{ flexWrap: "wrap" }}><Languages size={20} color="var(--brinjal)" /> <span className="grow">{tf("Language")}</span>
        <span className="row" style={{ gap: 6 }} role="group" aria-label={tf("Language")}>
          {LANGS.map((l) => <button key={l.code} className={`btn ${lang === l.code ? "primary" : "secondary"}`} style={{ minHeight: 38, padding: "0 12px", boxShadow: "none" }} aria-pressed={lang === l.code} onClick={() => dispatch({ type: "lang", lang: l.code })}>{{ en: "English", si: "සිංහල", ta: "தமிழ்" }[l.code]}</button>)}
        </span>
      </div>
      <div className="card flat small muted">{tf("Changing your phone needs your current password, a code sent to the new number, and we alert your old number.")}</div>
    </div>
  );
  return (
    <MobileFrame wide={u.role === "dispatcher" || u.role === "admin"} caption={{ kicker: "Supporting flow", title: "My profile", lines: ["Identity is locked and managed by admin. Phone, password and language belong to the person."] }}>
      <div className="screen">
        <TopBar title={tf("My profile")} sub={u.name} back />
        <div className="body fit">
          <div className={`fit-grid ${u.role === "dispatcher" || u.role === "admin" ? "two-col" : ""}`}>{identity}{settings}</div>
        </div>
        <div className="dock fit">
          <button className="btn secondary block" onClick={() => { dispatch({ type: "logout" }); nav("/"); }}><LogOut size={18} /> {tf("Sign out")}</button>
        </div>
      </div>
    </MobileFrame>
  );
}
