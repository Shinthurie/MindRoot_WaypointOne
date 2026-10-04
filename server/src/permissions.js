/* Who may send which command, and on whose behalf. The server checks every command before it is recorded. */
import { config } from "./config.js";

const ANY = ["log"];
export const ROLE_COMMANDS = {
  // Only a dispatcher sets the day's clock (every portal follows it).
  dispatcher: ["publish", "planEdit", "planSet", "undoEdits", "stopOrder", "sms", "loaderDecision", "shortReorder", "storeReportDecision",
    "driverReportSeen", "fleetStatus", "notifRead", "scenario", "clock"],
  loader: ["loadStart", "load", "truckLoaded", "truckUnloaded", "loaderReport", "loaderAck", "reeferCheck", "loadWhoReset", "scenario"],
  driver: ["startRun", "arrive", "deliver", "driverReport", "driverAck", "sync", "driverSignedIn", "scenario"],
  store: ["storeOrder", "storeOrderUpdate", "storeOrderCancel", "storeReport", "storeReportDecision", "scenario"],
  admin: ["setPeople", "addAccount", "resetSignIn", "storeRules", "accountStatus", "fleetStatus"],
};
// "Reset demo day" (back to the seeded day): dispatcher or admin, and only on a demo server.
const RESETTERS = ["dispatcher", "admin"];
// Story controls of the bad days portal (a simulated dead zone, putting a story back to its start): only the portal's
// demo session sends them, and only on a demo server.
export const DEMO_COMMANDS = ["offline", "badReset"];
// Bad-day story steps may only touch their own story's fields.
const SCENARIO_FIELDS = { dispatcher: ["reefer", "dead", "dock"], loader: ["reeferMoved", "dock"], driver: ["reefer", "dead"], store: ["dead", "deadClosed"] };

export class Forbidden extends Error { constructor(message) { super(message); this.status = 403; } }

/* Throws Forbidden unless `user` may send action `a` (type + payload). */
export function authorize(user, a) {
  const t = a.type;
  if (ANY.includes(t)) return;
  if (user.role === "demo") {
    if (!config.demoMode) throw new Forbidden("Demo controls are switched off on this server");
    return; // the bad days portal plays every role in turn
  }
  if (t === "reset") {
    if (!config.demoMode) throw new Forbidden("Reset is switched off on this server");
    if (!RESETTERS.includes(user.role)) throw new Forbidden("Only a dispatcher or admin can reset the demo day");
    return;
  }
  if (DEMO_COMMANDS.includes(t)) throw new Forbidden(`"${t}" belongs to the bad days portal`);
  if (!(ROLE_COMMANDS[user.role] || []).includes(t)) throw new Forbidden(`A ${user.role} cannot send "${t}"`);
  if (t === "scenario" && !config.demoMode) {
    const allowed = SCENARIO_FIELDS[user.role] || [];
    const bad = Object.keys(a.patch || {}).filter((k) => !allowed.includes(k));
    if (bad.length) throw new Forbidden(`A ${user.role} cannot change ${bad.join(", ")}`);
  }
  // Ownership: a driver acts only for their own vehicle, a store only for its own outlet.
  if (user.role === "driver") {
    const veh = a.vehicle || a.report?.vehicle;
    if (veh && veh !== user.vehicle) throw new Forbidden(`You drive ${user.vehicle}, not ${veh}`);
  }
  if (user.role === "store") {
    const outlet = a.order?.outlet || a.report?.outlet;
    if (outlet && outlet !== user.outlet) throw new Forbidden(`This account is for ${user.outlet}, not ${outlet}`);
  }
}
