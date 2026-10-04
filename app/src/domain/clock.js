/* The day's clock, shared by every portal.

   The stored setting is either
     { real: true }                      → real Sri Lanka time (UTC+5:30), or
     { date, time, setAt }               → the time the dispatcher set, running on in real time from setAt (ms),
     { date, time }                      → a fixed time (old saved days; no setAt).
   clockAt(setting, ms) gives the day's date and time at real moment `ms`.

   Every action is applied "at" a moment: on the server that is when it arrived (stamped into the action as
   `at` ms, so every portal replays it with the same time); on a device, until confirmed, it is the device's now. */
const SL_OFFSET_MIN = 330;
const pad = (n) => String(n).padStart(2, "0");
const fromUtcMs = (ms) => { const d = new Date(ms); return { date: d.toISOString().slice(0, 10), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }; };

export const realNow = (ms = Date.now()) => fromUtcMs(ms + SL_OFFSET_MIN * 60000);

export function clockAt(c, ms = Date.now()) {
  if (!c || c.real) return realNow(ms);
  if (!c.setAt) return { date: c.date, time: c.time };
  const [y, mo, d] = c.date.split("-").map(Number);
  const [h, mi] = c.time.split(":").map(Number);
  return fromUtcMs(Date.UTC(y, mo - 1, d, h, mi) + Math.max(0, ms - c.setAt));
}

/* Actions that set the clock themselves (they carry `at` as the moment the new setting starts running). */
export const CLOCK_ACTIONS = new Set(["clock", "badReset", "reset"]);

/* Apply an action at a real moment: the reducer sees the day's current date and time in s.clock,
   and the stored clock setting is kept unless the action changes it. */
/* prepare(state, now) can move the state to the run the clock is in (see rollRun in store.js). */
export function reduceAt(reducer, s, a, ms = a.at ?? Date.now(), prepare = null) {
  const now = clockAt(s.clock, ms);
  const base = prepare ? prepare(s, now) : s;
  const act = { ...a, at: ms };
  const next = reducer({ ...base, clock: { ...base.clock, date: now.date, time: now.time } }, act);
  if (!CLOCK_ACTIONS.has(a.type)) return { ...next, clock: base.clock };
  if (!prepare) return next;
  // The clock moved: the state follows it to its run. A bad-day story is set up again on its own day.
  const rolled = prepare(next, clockAt(next.clock, ms));
  return rolled !== next && a.type === "badReset" ? reducer(rolled, act) : rolled;
}
