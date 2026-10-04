/* The shared state of a delivery day, kept as an append-only command log plus a snapshot.
   Every portal sends commands; the server authorises, validates, applies them with the same reducer the app uses,
   records them and streams them to every open portal. Commands carry an id made on the device, so a batch replayed
   after a dead zone is recognised and never applied twice. */
import { q, tx } from "./db.js";
import { reducer, sharedOf, LOCAL_ACTIONS } from "../../app/src/domain/store.js";
import { authorize } from "./permissions.js";
import { validate, effects } from "./validate.js";

const days = new Map(); // dayId -> { seq, state, seed }
const listeners = new Map(); // dayId -> Set(res)
let chain = Promise.resolve(); // one command batch at a time: the log has a single order

async function load(dayId) {
  if (days.has(dayId)) return days.get(dayId);
  const { rows } = await q("SELECT seq, state, seed_state FROM day_state WHERE day_id = $1", [dayId]);
  if (!rows[0]) throw Object.assign(new Error(`Unknown day ${dayId}`), { status: 404 });
  const d = { seq: Number(rows[0].seq), state: rows[0].state, seed: rows[0].seed_state };
  days.set(dayId, d);
  return d;
}

export async function getState(dayId) {
  const d = await load(dayId);
  return { seq: d.seq, state: d.state };
}

function broadcast(dayId, msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of listeners.get(dayId) || []) res.write(line);
}

export function subscribe(dayId, res) {
  if (!listeners.has(dayId)) listeners.set(dayId, new Set());
  listeners.get(dayId).add(res);
  return () => listeners.get(dayId)?.delete(res);
}
export const listenerCount = (dayId) => listeners.get(dayId)?.size || 0;

/* commands: [{ id, action: { type, ... }, person, clientTime }]. Returns one result per command, in order. */
export function apply(dayId, user, commands) {
  const run = async () => {
    const d = await load(dayId);
    const results = [];
    for (const cmd of commands) {
      const a = cmd.action || {};
      try {
        if (!cmd.id || !a.type) throw Object.assign(new Error("A command needs an id and an action type"), { status: 400 });
        if (LOCAL_ACTIONS.has(a.type)) { results.push({ id: cmd.id, status: "local" }); continue; }
        const dup = await q("SELECT seq FROM commands WHERE id = $1", [cmd.id]);
        if (dup.rows[0]) { results.push({ id: cmd.id, status: "duplicate", seq: Number(dup.rows[0].seq) }); continue; }
        authorize(user, a);
        await validate(dayId, d.state, a, user);
        // "Reset demo" goes back to the seeded day; everything else runs through the shared reducer.
        const next = a.type === "reset" ? d.seed : sharedOf(reducer(d.state, a));
        const seq = await tx(async (c) => {
          const r = await c.query(`INSERT INTO commands (id, day_id, type, payload, actor_id, actor_role, person, client_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING seq`,
          [cmd.id, dayId, a.type, JSON.stringify(a), user.id, user.role, cmd.person || null, cmd.clientTime || null]);
          const s = Number(r.rows[0].seq);
          await c.query("UPDATE day_state SET seq = $2, state = $3, updated_at = now() WHERE day_id = $1", [dayId, s, JSON.stringify(next)]);
          return s;
        });
        d.seq = seq; d.state = next;
        await effects(a).catch((e) => console.error("effect failed", a.type, e.message));
        broadcast(dayId, a.type === "reset" ? { kind: "reset", seq } : { kind: "command", seq, id: cmd.id, action: a, by: user.id });
        results.push({ id: cmd.id, status: "applied", seq });
      } catch (e) {
        results.push({ id: cmd.id, status: "rejected", error: e.message, code: e.status || 500 });
      }
    }
    return results;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

/* Rebuild the snapshot from the seed state and the command log (proves the log is the source of truth). */
export async function rebuild(dayId) {
  const { rows } = await q("SELECT seed_state FROM day_state WHERE day_id = $1", [dayId]);
  let state = rows[0].seed_state;
  const cmds = (await q("SELECT seq, type, payload FROM commands WHERE day_id = $1 ORDER BY seq", [dayId])).rows;
  let seq = 0;
  for (const c of cmds) { state = c.type === "reset" ? rows[0].seed_state : sharedOf(reducer(state, c.payload)); seq = Number(c.seq); }
  await q("UPDATE day_state SET seq = $2, state = $3, updated_at = now() WHERE day_id = $1", [dayId, seq, JSON.stringify(state)]);
  days.delete(dayId);
  return { seq, commands: cmds.length };
}
