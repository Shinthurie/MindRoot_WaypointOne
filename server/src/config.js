/* Settings from the environment (see .env.example at the repository root). */
import { fileURLToPath } from "node:url";
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const env = process.env;
export const config = {
  port: Number(env.PORT || 8080),
  databaseUrl: env.DATABASE_URL || "postgres://waypoint:waypoint@localhost:5432/waypoint",
  jwtSecret: env.JWT_SECRET || "dev-only-secret-change-me",
  jwtHours: Number(env.JWT_HOURS || 12),
  // Demo tools (story sessions, resetting the seeded day) exist only when DEMO_MODE=true.
  demoMode: env.DEMO_MODE === "true", // off unless switched on (no demo tools in a real deployment)
  corsOrigin: env.CORS_ORIGIN || "*",
  dataDir: env.DATA_DIR || here("../../data"),
  staticDir: env.STATIC_DIR || here("../../app/dist"),
  seedPassword: env.SEED_PASSWORD || "waypoint@mr2026",
  seedPin: env.SEED_PIN || "waypoint@mr2026",
  dayId: env.DAY_ID || "S1",
};
if (config.jwtSecret === "dev-only-secret-change-me" && env.NODE_ENV === "production") {
  console.warn("JWT_SECRET is not set: using the development secret. Set it in production.");
}
