import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StateProvider, useApp } from "./state";
import { FirstSignIn, Forgot, Profile, SignIn, Unlock } from "./screens/Auth";
import { Deliver, DriverAccount, DriverIssue, DriverMapScreen, DriverSync, DriverTrip, DriverTrips, StopDetails, VehicleProblem } from "./screens/Driver";
import { LoadList, LoaderLoads, LoaderLog, LoaderProblem, LoaderProblems, LoaderTrucks, LoaderWall, MoveList, Replace, WhoIsLoading } from "./screens/Loader";
import { Dispute, MyDeliveries, MyOrders, PlaceOrder, Receive } from "./screens/Store";
import { Deferrals, Incident, Live, Orders, Outlook, Plan, Replan, TeamLog } from "./screens/Dispatch";
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


export default function App() {
  return (
    <StateProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<SignIn landing />} />
          <Route path="/signin" element={<SignIn />} />
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
          <Route path="/dispatch/replan/:veh" element={<Guard role="dispatcher"><Replan /></Guard>} />
          <Route path="/dispatch/log" element={<Guard role="dispatcher"><TeamLog /></Guard>} />
          <Route path="/dispatch/fleet" element={<Guard role="dispatcher"><DispatchFleet /></Guard>} />

          <Route path="/admin" element={<Guard role="admin"><AdminUsers /></Guard>} />
          <Route path="/admin/log" element={<Guard role="admin"><AdminLog /></Guard>} />
          <Route path="/admin/fleet" element={<Guard role="admin"><AdminFleet /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </StateProvider>
  );
}
