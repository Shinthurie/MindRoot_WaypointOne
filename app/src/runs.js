/* Runs and the 4 PM cutoff (booklet: orders for the next run close at 4 PM). Operating days come from calendar.csv:
   Monday to Saturday, except festivals and public holidays (is_operating = 0). */
import data from "./data/s1.json";
export const CUTOFF = "16:00";
const CLOSED = new Set(data.closedDays || []);

export function nextOperatingDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  do { dt.setUTCDate(dt.getUTCDate() + 1); } while (dt.getUTCDay() === 0 || CLOSED.has(dt.toISOString().slice(0, 10)));
  return dt.toISOString().slice(0, 10);
}

/* The run an order sent at this clock time joins: the next run before 4 PM, the one after it from 4 PM. */
export function runFor(clock) {
  const next = nextOperatingDay(clock.date);
  return clock.time < CUTOFF ? next : nextOperatingDay(next);
}
