/* Talking to the Waypoint One server.
   Server mode is on when the app is built with VITE_API_URL ("" = same origin, as in docker compose).
   Without it the app runs on its own (each browser keeps its own copy), which is how the design prototype worked. */
const BASE = import.meta.env.VITE_API_URL;
export const SERVER_MODE = BASE !== undefined && BASE !== "off";
const url = (p) => `${BASE || ""}${p}`;

const TOKEN_KEY = "waypoint-one-session";
const DEMO_KEY = "waypoint-one-demo-session";
const OUTBOX_KEY = "waypoint-one-outbox-v1";
const CACHE_KEY = "waypoint-one-confirmed-v1";

const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export const session = { get: () => read(TOKEN_KEY, null), set: (s) => write(TOKEN_KEY, s), clear: () => write(TOKEN_KEY, null) };
export const demoSession = { get: () => read(DEMO_KEY, null), set: (s) => write(DEMO_KEY, s) };
export const outbox = { load: () => read(OUTBOX_KEY, []), save: (list) => write(OUTBOX_KEY, list) };
export const confirmedCache = { load: () => read(CACHE_KEY, null), save: (c) => write(CACHE_KEY, c) };

export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16)));

export class ApiError extends Error { constructor(message, status, body) { super(message); this.status = status; this.body = body; } }

async function req(path, { method, body, token } = {}) {
  let r;
  try {
    r = await fetch(url(path), { method: method || (body ? "POST" : "GET"), headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new ApiError("No connection to the server", 0);
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(json.error || r.statusText, r.status, json);
  return json;
}

export const api = {
  login: (id, secret) => req("/api/auth/login", { body: { id, secret } }),
  demo: (role) => req("/api/auth/demo", { body: { role } }),
  activate: (id, temp, secret) => req("/api/auth/activate", { body: { id, temp, secret } }),
  changePassword: (token, current, next) => req("/api/auth/password", { token, body: { current, next } }),
  me: (token) => req("/api/auth/me", { token }),
  state: (token) => req("/api/state", { token }),
  commands: (token, commands) => req("/api/commands", { token, body: { commands } }),
  autoPlan: (token, body = {}) => req("/api/plan/auto", { token, body }),
  checkPlan: (token) => req("/api/plan/check", { token }),
};

/* The live stream of everyone's changes. Reconnects by itself; onMessage gets { kind: hello | command | reset, seq, ... }. */
export function openEvents(token, onMessage, onStatus) {
  if (typeof EventSource === "undefined") return () => {};
  const es = new EventSource(url(`/api/events?token=${encodeURIComponent(token)}`));
  es.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore a bad line */ } };
  es.onopen = () => onStatus?.(true);
  es.onerror = () => onStatus?.(false);
  return () => es.close();
}
