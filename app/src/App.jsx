import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Clock, CloudOff, EyeOff, RotateCcw, Truck, Package, Store, LayoutDashboard, UserCog, Refrigerator, Thermometer, WifiOff, KeyRound, LogIn, Smartphone, Monitor } from "lucide-react";
import { StateProvider, USERS, useApp } from "./state";
import { LANGS } from "./i18n";
import { TIMELINE } from "./components/ui";
import { GuideBar, ScenarioJump } from "./components/Guide";
import { BadDayPanel, BadDaysHome } from "./screens/BadDays";
import { FirstSignIn, Forgot, Profile, SignIn, Unlock } from "./screens/Auth";
import { Deliver, DriverAccount, DriverIssue, DriverMapScreen, DriverSync, DriverTrip, DriverTrips, StopDetails, VehicleProblem } from "./screens/Driver";
import { LoadList, LoaderLoads, LoaderLog, LoaderProblem, LoaderProblems, LoaderTrucks, LoaderWall, MoveList, Replace, WhoIsLoading } from "./screens/Loader";
import { Dispute, MyDeliveries, MyOrders, PlaceOrder, Receive } from "./screens/Store";
import { Deferrals, Incident, Live, Orders, Outlook, Plan, TeamLog } from "./screens/Dispatch";
import { AdminLog, AdminUsers } from "./screens/Admin";
import { AdminFleet, DispatchFleet } from "./screens/Fleet";

/* Only people with the right role reach each portal. */
function Guard({ role, children }) {
  const { user, person } = useApp();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to={user.home} replace />;
  // Shared dock account: the loader says who they are when they open a load (see Today's loads).
  return children;
}

function DemoPanel() {
  const { dispatch, simOffline, hideDemo, lang, phonePreview } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "d" && e.altKey) dispatch({ type: "hideDemo", value: !hideDemo }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideDemo, dispatch]);
  if (hideDemo) return null;
  const as = (role, path, outlet) => {
    dispatch({ type: "login", role, outlet });
    if (USERS[role].people && path) dispatch({ type: "person", name: USERS[role].people[0] }); // demo shortcut skips "Who is this?"
    if (role !== "dispatcher" && role !== "admin") dispatch({ type: "publish", by: "Demo shortcut", __demo: true }); // demo shortcuts jump past tonight's publish
    nav(path || USERS[role].home);
    setOpen(false);
  };
  return (
    <>
      {open && (
        <div className="demo-sheet" role="dialog" aria-label="Demo controls">
          <h4>Open a portal</h4>
          <div className="demo-grid">
            <button onClick={() => as("dispatcher")}><LayoutDashboard size={15} /> Dispatcher</button>
            <button onClick={() => as("loader")}><Package size={15} /> Loader</button>
            <button onClick={() => as("driver")}><Truck size={15} /> Driver</button>
            <button onClick={() => as("store")}><Store size={15} /> Store manager</button>
            <button onClick={() => as("store", "/store", "OUT054")}><Store size={15} /> Store with a deferral</button>
            <button onClick={() => as("admin")}><UserCog size={15} /> Admin</button>
            <button onClick={() => { dispatch({ type: "logout" }); nav("/"); setOpen(false); }}><LogIn size={15} /> Sign-in page</button>
          </div>
          <h4>Time · every portal follows it</h4>
          <div className="demo-grid">
            {TIMELINE.map(([label, date, time]) => (
              <button key={label} onClick={() => dispatch({ type: "clock", clock: { date, time } })}><Clock size={15} /> {time} · {label}</button>
            ))}
          </div>
          <h4>Bad days</h4>
          <div className="demo-grid">
            <button onClick={() => { nav("/bad-days/dock"); setOpen(false); }}><Refrigerator size={15} /> 1 · Short at the Dock</button>
            <button onClick={() => { nav("/bad-days/reefer"); setOpen(false); }}><Thermometer size={15} /> 2 · Reefer Down</button>
            <button onClick={() => { nav("/bad-days/dead"); setOpen(false); }}><WifiOff size={15} /> 3 · Dead Zone</button>
            <button onClick={() => { dispatch({ type: "offline", value: !simOffline }); setOpen(false); }}><CloudOff size={15} /> {simOffline ? "Driver: signal back" : "Driver: no signal"}</button>
          </div>
          <h4>More screens</h4>
          <div className="demo-grid">
            <button onClick={() => { nav("/first"); setOpen(false); }}><KeyRound size={15} /> First sign-in</button>
            <button onClick={() => { nav("/forgot"); setOpen(false); }}><KeyRound size={15} /> Forgot password</button>
            <button onClick={() => as("driver", "/unlock")}><KeyRound size={15} /> PIN unlock</button>
            <button onClick={() => as("loader", "/loader/who")}><Package size={15} /> Who is loading?</button>
          </div>
          <h4>View</h4>
          <div className="demo-grid">
            <button style={phonePreview ? { borderColor: "var(--brinjal)", background: "var(--brinjal-tint)" } : {}} onClick={() => dispatch({ type: "phonePreview", value: !phonePreview })}><Smartphone size={15} /> Phone preview {phonePreview ? "on" : "off"}</button>
            <button onClick={() => as("loader", "/loader/wall")}><Monitor size={15} /> Dock wall screen</button>
          </div>
          <h4>Language (field screens)</h4>
          <div className="demo-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            {LANGS.map((l) => <button key={l.code} style={lang === l.code ? { borderColor: "var(--brinjal)" } : {}} onClick={() => dispatch({ type: "lang", lang: l.code })}>{l.label}</button>)}
          </div>
          <div className="demo-grid">
            <button onClick={() => { dispatch({ type: "reset" }); setOpen(false); }}><RotateCcw size={15} /> Reset demo</button>
            <button onClick={() => dispatch({ type: "hideDemo", value: true })}><EyeOff size={15} /> Hide (Alt+D)</button>
          </div>
        </div>
      )}
      <button className="demo-fab" onClick={() => setOpen(!open)}>Demo</button>
    </>
  );
}

export default function App() {
  return (
    <StateProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<SignIn landing />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/scenario/:id/:step" element={<ScenarioJump />} />
          <Route path="/bad-days" element={<BadDaysHome />} />
          <Route path="/bad-days/:id" element={<BadDayPanel />} />
          <Route path="/first" element={<FirstSignIn />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/unlock" element={<Unlock />} />

          <Route path="/driver" element={<Guard role="driver"><DriverTrip /></Guard>} />
          <Route path="/driver/trips" element={<Guard role="driver"><DriverTrips /></Guard>} />
          <Route path="/driver/map/:n" element={<Guard role="driver"><DriverMapScreen /></Guard>} />
          <Route path="/driver/account" element={<Guard role="driver"><DriverAccount /></Guard>} />
          <Route path="/driver/stop/:n" element={<Guard role="driver"><StopDetails /></Guard>} />
          <Route path="/driver/deliver/:n" element={<Guard role="driver"><Deliver /></Guard>} />
          <Route path="/driver/sync" element={<Guard role="driver"><DriverSync /></Guard>} />
          <Route path="/driver/problem" element={<Guard role="driver"><VehicleProblem /></Guard>} />
          <Route path="/driver/issue/:n" element={<Guard role="driver"><DriverIssue /></Guard>} />

          <Route path="/loader" element={<Guard role="loader"><LoaderTrucks /></Guard>} />
          <Route path="/loader/who" element={<Guard role="loader"><WhoIsLoading /></Guard>} />
          <Route path="/loader/loads" element={<Guard role="loader"><LoaderLoads /></Guard>} />
          <Route path="/loader/log" element={<Guard role="loader"><LoaderLog /></Guard>} />
          <Route path="/loader/problems" element={<Guard role="loader"><LoaderProblems /></Guard>} />
          <Route path="/loader/wall" element={<Guard role="loader"><LoaderWall /></Guard>} />
          <Route path="/loader/load/:veh" element={<Guard role="loader"><LoadList /></Guard>} />
          <Route path="/loader/problem" element={<Guard role="loader"><LoaderProblem /></Guard>} />
          <Route path="/loader/problem/:veh" element={<Guard role="loader"><LoaderProblem /></Guard>} />
          <Route path="/loader/replace/:id" element={<Guard role="loader"><Replace /></Guard>} />
          <Route path="/loader/move" element={<Guard role="loader"><MoveList /></Guard>} />

          <Route path="/store" element={<Guard role="store"><MyDeliveries /></Guard>} />
          <Route path="/store/order" element={<Guard role="store"><PlaceOrder /></Guard>} />
          <Route path="/store/orders" element={<Guard role="store"><MyOrders /></Guard>} />
          <Route path="/store/receive" element={<Guard role="store"><Receive /></Guard>} />
          <Route path="/store/dispute" element={<Guard role="store"><Dispute /></Guard>} />
          <Route path="/store/profile" element={<Guard><Profile /></Guard>} />

          <Route path="/dispatch" element={<Guard role="dispatcher"><Orders /></Guard>} />
          <Route path="/dispatch/plan" element={<Guard role="dispatcher"><Plan /></Guard>} />
          <Route path="/dispatch/deferrals" element={<Guard role="dispatcher"><Deferrals /></Guard>} />
          <Route path="/dispatch/live" element={<Guard role="dispatcher"><Live /></Guard>} />
          <Route path="/dispatch/outlook" element={<Guard role="dispatcher"><Outlook /></Guard>} />
          <Route path="/dispatch/incident/:type" element={<Guard role="dispatcher"><Incident /></Guard>} />
          <Route path="/dispatch/incident/:type/:id" element={<Guard role="dispatcher"><Incident /></Guard>} />
          <Route path="/dispatch/log" element={<Guard role="dispatcher"><TeamLog /></Guard>} />
          <Route path="/dispatch/fleet" element={<Guard role="dispatcher"><DispatchFleet /></Guard>} />

          <Route path="/admin" element={<Guard role="admin"><AdminUsers /></Guard>} />
          <Route path="/admin/log" element={<Guard role="admin"><AdminLog /></Guard>} />
          <Route path="/admin/fleet" element={<Guard role="admin"><AdminFleet /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <GuideBar />
        <DemoPanel />
      </HashRouter>
    </StateProvider>
  );
}
