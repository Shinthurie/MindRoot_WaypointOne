/* Domain checks the server makes before a command is recorded, and the database changes some commands cause.
   The app already guides people towards valid choices; the server makes sure nothing invalid gets in anyway. */
import bcrypt from "bcryptjs";
import { q } from "./db.js";
import { config } from "./config.js";
import { checkAlloc, effectiveAlloc, loadDay, runOrders } from "./planning.js";
import { isS1Run } from "../../app/src/domain/store.js";

export class Invalid extends Error { constructor(message, details) { super(message); this.status = 422; this.details = details; } }

export async function validate(dayId, state, a, user) {
  switch (a.type) {
    case "planEdit": {
      const e = a.edit || {};
      const d = await loadDay(dayId);
      const o = runOrders(d, state).find((x) => x.ref === e.ref);
      if (!o) throw new Invalid(`Unknown order ${e.ref}`);
      if (!e.to && o.deferredYesterday && !String(e.reason || "").trim()) throw new Invalid(`${o.outlet} was deferred yesterday: deferring it again needs a written reason`);
      if (e.to) {
        const alloc = { ...effectiveAlloc(state), [e.ref]: e.to };
        const r = await checkAlloc(dayId, state, alloc);
        const mine = r.errors.filter((x) => x.startsWith(e.to.vehicle) || x.startsWith(e.ref));
        if (mine.length) throw new Invalid(`Move not allowed: ${mine[0]}`, mine);
      }
      return;
    }
    case "planSet": {
      if (a.alloc === null) return; // back to the team's published plan
      if (typeof a.alloc !== "object") throw new Invalid("planSet needs an allocation");
      const r = await checkAlloc(dayId, { ...state, planEdits: [] }, a.alloc);
      if (!r.ok) throw new Invalid(`Plan breaks ${r.errors.length} rule(s): ${r.errors[0]}`, r.errors);
      return;
    }
    case "publish": {
      // A real run with orders needs a plan first (S1 starts from the team's plan).
      if (!isS1Run(state) && !state.planAlloc) {
        const d = await loadDay(dayId);
        if (runOrders(d, state).length) throw new Invalid("There is no plan for this run yet: run Auto-plan and use a plan before publishing");
      }
      const r = await checkAlloc(dayId, state);
      if (!r.ok) throw new Invalid(`The plan breaks ${r.errors.length} rule(s); fix them before publishing: ${r.errors[0]}`, r.errors);
      return;
    }
    case "deliver":
      if (!["all", "some", "none"].includes(a.outcome)) throw new Invalid("Hand-over outcome must be all, some or none");
      if ((a.missing || 0) < 0) throw new Invalid("Missing cases cannot be negative");
      return;
    case "loaderReport":
      if (!a.report?.vehicle || !(a.report?.count > 0)) throw new Invalid("A dock problem needs the truck and how many cases");
      return;
    case "storeOrder": {
      const o = a.order || {};
      if ((o.dry ?? 0) < 0 || (o.cold ?? 0) < 0 || (o.dry ?? 0) + (o.cold ?? 0) <= 0) throw new Invalid("An order needs at least one case");
      return;
    }
    case "fleetStatus": {
      const { rows } = await q("SELECT 1 FROM vehicles WHERE id = $1", [a.vehicle]);
      if (!rows[0]) throw new Invalid(`Unknown vehicle ${a.vehicle}`);
      return;
    }
    case "addAccount": {
      const id = a.account?.id;
      if (!id) throw new Invalid("A new account needs an ID");
      const { rows } = await q("SELECT 1 FROM accounts WHERE id = $1", [id]);
      if (rows[0]) throw new Invalid(`Account ${id} already exists`);
      return;
    }
    default:
      return;
  }
}

/* Database changes that go with some commands (after the command is recorded). */
export async function effects(a, secrets = {}) {
  if (a.type === "accountStatus") await q("UPDATE accounts SET status = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1", [a.id, a.status === "Active" ? "Active" : a.status]);
  if (a.type === "setPeople") await q("UPDATE accounts SET people = $2 WHERE id = $1", [a.id, a.people || []]);
  if (a.type === "addAccount") {
    const x = a.account;
    const role = { Dispatcher: "dispatcher", Driver: "driver", "Store account": "store", "Depot account": "loader" }[x.type] || "admin";
    const field = role === "driver" || role === "loader";
    const hash = await bcrypt.hash(String(secrets.temp || (field ? config.seedPin : config.seedPassword)), 10);
    const veh = x.vehicle ? (await q("SELECT id FROM vehicles WHERE id = $1", [x.vehicle])).rows[0]?.id || null : null;
    const outlet = role === "store" ? (await q("SELECT id FROM outlets WHERE id = $1", [String(x.id).replace("STORE-", "")])).rows[0]?.id || null : null;
    await q(`INSERT INTO accounts (id, role, name, depot, outlet_id, vehicle_id, category, shared, people, status, secret_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $11, $10) ON CONFLICT (id) DO NOTHING`,
    [x.id, role, x.name, x.depot || null, outlet, veh, x.category || null, role === "store" || role === "loader", x.people || [], hash, secrets.temp ? "Not activated" : "Active"]);
  }
  if (a.type === "resetSignIn" && secrets.temp) {
    await q("UPDATE accounts SET secret_hash = $2, status = 'Not activated', failed_attempts = 0, locked_until = NULL WHERE id = $1", [a.id, await bcrypt.hash(String(secrets.temp), 10)]);
  }
}
