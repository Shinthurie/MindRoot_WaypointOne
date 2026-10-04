/* The three bad days as guided stories. Every step is a fixed screen with its own link (#/scenario/<id>/<n>),
   so the story can be played from the sign-in page and each screen can be captured for the design file.
   A step: who is signed in, the clock, the screen, what is true at that moment, and what happens. */
import { plan, runsOf } from "./data/model";

const DAY = "2026-01-08";
const report = { id: "LR-1", vehicle: "VEH006", run: 1, outlet: "OUT026", ref: "S1-028", count: 2, kind: "broken", chilled: true, units: 170, what: "2 chilled cases broken", by: "Suresh", photo: true, at: "03:10" };
const decided = { ...report, decision: "replace", decidedBy: "Nimal", decidedAt: "03:12", waitMin: 15 };

// Dead Zone: VEH010's Puttalam stop at OUT074 (dry goods), delivered with no signal.
const vehRun = () => runsOf(plan, "VEH010")[0];
const deadStop = () => vehRun()?.stops.find((s) => s.outlet === "OUT074") || vehRun()?.stops[0];
const deadRecord = (synced) => ({ outcome: "all", missing: 0, at: "07:02", synced, arrivedAt: "06:58", serviceMin: 4, receivedBy: "Night staff" });

export const SCENARIOS = {
  dock: {
    n: 1, title: "Short at the Dock", icon: "package",
    why: "Two chilled cases for a shop skipped yesterday are broken before the truck leaves. Found now, they can be replaced; found at the shop, the store opens short.",
    steps: [
      { role: "loader", person: "Suresh", time: "03:08", path: "/loader/problem/VEH006",
        text: "Suresh, loading VEH006, finds 2 broken chilled cases for OUT026. He reports with pictures, a count and a photo. No typing.",
        patch: (s) => ({ ...s, loaderReports: [] }) },
      { role: "dispatcher", time: "03:11", path: "/dispatch/incident/loader/LR-1",
        text: "Nimal sees it straight away. The app checks VEH006's spare time and recommends replacing from the cold room: every stop stays on time.",
        patch: (s) => ({ ...s, loaderReports: [report] }) },
      { role: "loader", person: "Suresh", time: "03:13", path: "/loader/replace/LR-1",
        text: "The decision reaches the dock. Suresh fetches 2 cases from the cold room and ticks each one. No phone calls.",
        patch: (s) => ({ ...s, loaderReports: [decided] }) },
      { role: "driver", account: "WP-DRV-006", time: "03:40", path: "/driver",
        text: "Kasun leaves with the full order, 10 minutes later and still inside every window. The store never knows anything went wrong.",
        patch: (s) => ({ ...s, loaderReports: [{ ...decided, acked: "03:38" }], loadedTrucks: { ...s.loadedTrucks, "VEH006:1": { by: "Suresh", at: "03:38" } } }) },
    ],
  },
  reefer: {
    n: 2, title: "Reefer Down", icon: "thermometer",
    why: "A refrigerated truck fails at the gate with chilled orders for shops that were skipped yesterday. The re-plan must keep the promise that nobody is skipped twice.",
    steps: [
      { role: "driver", time: "03:25", path: "/driver/problem",
        text: "Ruwan's VEH003 cooling fails at the gate. He reports it with one tap: cooling failed, keep the doors closed.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, reefer: "idle" } }) },
      { role: "dispatcher", time: "03:26", path: "/dispatch/incident/reefer",
        text: "Nimal gets a ready re-plan without VEH003: every shop skipped yesterday is still served, and the orders that now wait were all served yesterday.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, reefer: "reported" } }) },
      { role: "loader", person: "Suresh", time: "03:32", path: "/loader/move",
        text: "The approved re-plan reaches the dock as a move list: which crates go from VEH003 to which truck. The loader just follows it.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, reefer: "approved" } }) },
      { role: "store", outlet: "OUT034", time: "05:30", path: "/store",
        text: "Waypoint Fresh Veyangoda sees its chilled order moved to another truck, with the new arrival time, before opening.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, reefer: "approved" } }) },
    ],
  },
  dead: {
    n: 3, title: "Dead Zone", icon: "wifi-off",
    why: "Coverage drops on the Puttalam road. The driver's proof must survive with no signal, or a store's “not delivered” becomes his word against theirs.",
    steps: [
      { role: "driver", account: "WP-DRV-010", time: "07:02", offline: true, path: () => `/driver/deliver/${deadStop()?.n || 1}`,
        text: "No signal near Puttalam. The driver still records the delivery to OUT074 with a photo and signature. It is saved on the phone.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, dead: "idle" }, runStarted: { ...s.runStarted, "VEH010:1": "05:10" }, stopProgress: { ...s.stopProgress, [`VEH010:${deadStop()?.outlet}`]: { arrivedAt: "06:58" } } }) },
      { role: "store", outlet: "OUT074", time: "07:10", path: "/store/dispute",
        text: "At 07:10 the store reports “our dry order hasn't arrived”. The driver's record hasn't reached the office yet.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, dead: "complaint" }, delivered: { ...s.delivered, [`VEH010:${deadStop()?.outlet}`]: deadRecord(false) } }) },
      { role: "dispatcher", time: "07:12", path: "/dispatch/live",
        text: "Nimal sees VEH010 marked offline in a known dead zone, not lost. He can send an SMS instead of guessing.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, dead: "complaint" } }) },
      { role: "store", outlet: "OUT074", time: "07:25", path: "/store/dispute",
        text: "Signal returns at 07:25. The proof syncs by itself: delivered at 07:02, photo and signature. The store closes the report.",
        patch: (s) => ({ ...s, scenario: { ...s.scenario, dead: "synced" }, delivered: { ...s.delivered, [`VEH010:${deadStop()?.outlet}`]: deadRecord(true) } }) },
    ],
  },
};

export const stepPath = (step) => (typeof step.path === "function" ? step.path() : step.path);
export { DAY as SCENARIO_DAY };
