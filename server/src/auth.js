/* Sign-in and tokens. Office roles use a password, field roles a 6-digit PIN; both are bcrypt hashes.
   Five wrong tries lock the account for 15 minutes (the Designathon sign-in design). */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { q } from "./db.js";
import { config } from "./config.js";

const HOME = { dispatcher: "/dispatch", loader: "/loader", driver: "/driver", store: "/store", admin: "/admin" };
const MAX_TRIES = 5, LOCK_MIN = 15;

/* The account as the app uses it (same shape as the app's built-in demo users). */
export function profile(a) {
  return {
    role: a.role, id: a.id, name: a.name, lang: a.lang, home: HOME[a.role],
    ...(a.vehicle_id ? { vehicle: a.vehicle_id } : {}),
    ...(a.depot ? { depot: a.depot } : {}),
    ...(a.outlet_id ? { outlet: a.outlet_id } : {}),
    ...(a.shared ? { shared: true, people: a.people } : {}),
  };
}

export const sign = (user) => jwt.sign({ sub: user.id, role: user.role, vehicle: user.vehicle, outlet: user.outlet, depot: user.depot, name: user.name }, config.jwtSecret, { expiresIn: `${config.jwtHours}h` });

export class AuthError extends Error { constructor(code, message, status = 401) { super(message); this.code = code; this.status = status; } }

export async function login(id, secret) {
  const clean = String(id || "").trim().toUpperCase();
  const { rows } = await q("SELECT * FROM accounts WHERE id = $1", [clean]);
  const a = rows[0];
  if (!a) throw new AuthError("wrong", "Account ID or password is wrong");
  if (a.status === "Deactivated") throw new AuthError("deactivated", "This account is switched off. Ask admin.", 403);
  if (a.locked_until && new Date(a.locked_until) > new Date()) throw new AuthError("locked", `Too many tries. Try again after ${new Date(a.locked_until).toISOString().slice(11, 16)} UTC.`, 423);
  const ok = await bcrypt.compare(String(secret || ""), a.secret_hash);
  if (!ok) {
    const tries = a.failed_attempts + 1;
    await q("UPDATE accounts SET failed_attempts = $2, locked_until = $3 WHERE id = $1",
      [a.id, tries >= MAX_TRIES ? 0 : tries, tries >= MAX_TRIES ? new Date(Date.now() + LOCK_MIN * 60000) : null]);
    throw new AuthError(tries >= MAX_TRIES ? "locked" : "wrong", tries >= MAX_TRIES ? `Too many tries: locked for ${LOCK_MIN} minutes` : `Wrong password or PIN · ${MAX_TRIES - tries} tries left`);
  }
  if (a.status === "Not activated") throw new AuthError("first", "Welcome! This is your first sign-in: set your own PIN or password.", 409);
  await q("UPDATE accounts SET failed_attempts = 0, locked_until = NULL, last_login = now() WHERE id = $1", [a.id]);
  const user = profile(a);
  return { token: sign(user), user };
}

/* First sign-in: the temporary password from admin, then the person's own PIN (field) or password (office). */
const strong = (s, field) => (field ? /^\d{6}$/.test(s) && !/^(\d)\1{5}$/.test(s) && !["123456", "654321", "012345"].includes(s) : String(s).length >= 8);
export async function activate(id, temp, secret) {
  const clean = String(id || "").trim().toUpperCase();
  const a = (await q("SELECT * FROM accounts WHERE id = $1", [clean])).rows[0];
  if (!a || a.status !== "Not activated") throw new AuthError("wrong", "This account is not waiting for a first sign-in", 400);
  if (!(await bcrypt.compare(String(temp || ""), a.secret_hash))) throw new AuthError("wrong", "The temporary password is wrong");
  const field = a.role === "driver" || a.role === "loader";
  if (!strong(String(secret || ""), field)) throw new AuthError("weak", field ? "Choose 6 digits that are not all the same or in a row" : "Choose a password of at least 8 characters", 400);
  await q("UPDATE accounts SET secret_hash = $2, status = 'Active', failed_attempts = 0, locked_until = NULL, last_login = now() WHERE id = $1", [a.id, await bcrypt.hash(String(secret), 10)]);
  const user = profile({ ...a, status: "Active" });
  return { token: sign(user), user };
}

/* Change your own password or PIN: the current one first. */
export async function changeSecret(userId, current, next) {
  const a = (await q("SELECT * FROM accounts WHERE id = $1", [userId])).rows[0];
  if (!a) throw new AuthError("wrong", "Account not found", 404);
  if (!(await bcrypt.compare(String(current || ""), a.secret_hash))) throw new AuthError("wrong", "Your current password or PIN is wrong");
  const field = a.role === "driver" || a.role === "loader";
  if (!strong(String(next || ""), field)) throw new AuthError("weak", field ? "Choose 6 digits that are not all the same or in a row" : "Choose a password of at least 8 characters", 400);
  await q("UPDATE accounts SET secret_hash = $2 WHERE id = $1", [a.id, await bcrypt.hash(String(next), 10)]);
  return { ok: true };
}

/* The bad days portal plays each role of a story in turn: it gets a "demo" session, only while DEMO_MODE is on.
   It cannot sign in as any real account; people always sign in with their own password or PIN. */
export async function demoLogin(role) {
  if (!config.demoMode) throw new AuthError("off", "Demo sessions are switched off on this server", 403);
  if (role !== "demo") throw new AuthError("password", "Sign in with your account ID and password", 403);
  const user = { role: "demo", id: "DEMO", name: "Bad days portal", home: "/bad-days" };
  return { token: sign(user), user };
}

export function verify(token) {
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}

/* Express middleware: needs "Authorization: Bearer <token>" (or ?token= for the live event stream). */
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : req.query.token;
  const claims = token && verify(token);
  if (!claims) return res.status(401).json({ error: "Sign in first" });
  req.user = { id: claims.sub, role: claims.role, vehicle: claims.vehicle, outlet: claims.outlet, depot: claims.depot, name: claims.name };
  next();
}
export const requireRole = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: `Only ${roles.join(" or ")} can do this` }));
