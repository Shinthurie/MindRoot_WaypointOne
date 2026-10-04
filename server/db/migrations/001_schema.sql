-- Waypoint One database schema.
-- Three layers: reference data (seeded from the shared datasets), the delivery day (orders, fleet status, accounts),
-- and operations (an append-only command log plus the current state of each day, rebuilt from that log).

-- ---------- Reference data (shared datasets) ----------
CREATE TABLE IF NOT EXISTS depots (
  name text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS districts (
  name              text PRIMARY KEY,
  depot             text NOT NULL REFERENCES depots(name),
  road_class        text NOT NULL,
  free_flow_kmh     numeric NOT NULL,
  depot_km          numeric NOT NULL,   -- depot_to_district_km
  depot_min         numeric NOT NULL,   -- depot_to_district_freeflow_min
  stop_km           numeric NOT NULL,   -- inter_stop_km
  stop_min          numeric NOT NULL    -- inter_stop_freeflow_min
);

CREATE TABLE IF NOT EXISTS outlets (
  id            text PRIMARY KEY,       -- OUT001
  name          text NOT NULL,          -- "Waypoint Fresh Veyangoda"
  brand         text NOT NULL CHECK (brand IN ('Fresh', 'Style', 'Tech')),
  district      text NOT NULL REFERENCES districts(name),
  depot         text NOT NULL REFERENCES depots(name),
  dock_type     text NOT NULL,          -- rear_dock | street | mall_bay
  parking       text NOT NULL,          -- none | van_only | ...
  mall_window   text,                   -- "10:00-12:00" or NULL
  window_open   text NOT NULL,          -- "05:00"
  window_close  text NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id              text PRIMARY KEY,     -- VEH001
  type            text NOT NULL CHECK (type IN ('truck', 'van')),
  temp            text NOT NULL CHECK (temp IN ('reefer', 'ambient')),
  weight_cap_kg   numeric NOT NULL,
  volume_cap_m3   numeric NOT NULL,
  fuel_type       text NOT NULL,
  km_per_l        numeric NOT NULL,
  weekly_quota_l  numeric NOT NULL,
  depot           text NOT NULL REFERENCES depots(name)
);

CREATE TABLE IF NOT EXISTS service_allowance (
  brand      text NOT NULL,
  dock_type  text NOT NULL,
  minutes    numeric NOT NULL,
  PRIMARY KEY (brand, dock_type)
);

CREATE TABLE IF NOT EXISTS calendar (
  date          date PRIMARY KEY,
  dow           int NOT NULL,
  iso_year      int NOT NULL,
  iso_week      int NOT NULL,
  is_weekend    boolean NOT NULL,
  is_payday     boolean NOT NULL,
  festival      text,
  festival_ramp numeric,
  is_holiday    boolean NOT NULL,
  monsoon       boolean NOT NULL,
  is_operating  boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic_speed (
  district     text NOT NULL,
  hour         int NOT NULL,
  monsoon      boolean NOT NULL,
  speed_index  numeric NOT NULL,
  PRIMARY KEY (district, hour, monsoon)
);

CREATE TABLE IF NOT EXISTS road_conditions (
  district          text NOT NULL,
  date              date NOT NULL,
  disruption_index  numeric NOT NULL,
  PRIMARY KEY (district, date)
);

-- Two years of history: what was delivered, and the route legs driven (fuel use, days since last served).
CREATE TABLE IF NOT EXISTS delivery_history (
  delivery_id       text PRIMARY KEY,
  order_date        date NOT NULL,
  dispatch_date     date,
  dispatch_status   text NOT NULL,
  outlet_id         text NOT NULL REFERENCES outlets(id),
  brand             text NOT NULL,
  district          text NOT NULL,
  depot             text NOT NULL,
  temp_requirement  text NOT NULL,
  order_units       int NOT NULL,
  order_weight_kg   numeric NOT NULL,
  order_volume_m3   numeric NOT NULL,
  route_id          text,
  vehicle_id        text,
  planned_arrival   text
);
CREATE INDEX IF NOT EXISTS delivery_history_outlet ON delivery_history (outlet_id, dispatch_date);

CREATE TABLE IF NOT EXISTS route_legs (
  leg_id        text PRIMARY KEY,
  date          date NOT NULL,
  route_id      text NOT NULL,
  depot         text NOT NULL,
  vehicle_id    text NOT NULL,
  brand         text NOT NULL,
  district      text NOT NULL,
  seq           int NOT NULL,
  to_outlet     text NOT NULL,
  distance_km   numeric NOT NULL,
  planned_arrival text,
  arrival_time  text,
  leave_time    text
);
CREATE INDEX IF NOT EXISTS route_legs_vehicle_date ON route_legs (vehicle_id, date);

-- ---------- The delivery day ----------
CREATE TABLE IF NOT EXISTS delivery_days (
  id         text PRIMARY KEY,          -- "S1"
  date       date NOT NULL,
  depot      text NOT NULL REFERENCES depots(name),
  label      text NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  ref                     text PRIMARY KEY,   -- S1-041, or R-001 for a replacement order
  day_id                  text NOT NULL REFERENCES delivery_days(id),
  outlet_id               text NOT NULL REFERENCES outlets(id),
  chilled                 boolean NOT NULL,
  units                   int NOT NULL CHECK (units >= 0),
  weight_kg               numeric NOT NULL CHECK (weight_kg >= 0),
  volume_m3               numeric NOT NULL CHECK (volume_m3 >= 0),
  deferred_yesterday      boolean NOT NULL DEFAULT false,
  days_since_last_served  int NOT NULL DEFAULT 0,
  source                  text NOT NULL DEFAULT 'dataset'   -- dataset | store | replacement
);
CREATE INDEX IF NOT EXISTS orders_day ON orders (day_id);

CREATE TABLE IF NOT EXISTS vehicle_day_status (
  day_id      text NOT NULL REFERENCES delivery_days(id),
  vehicle_id  text NOT NULL REFERENCES vehicles(id),
  status      text NOT NULL CHECK (status IN ('available', 'in_workshop')),
  PRIMARY KEY (day_id, vehicle_id)
);

-- Plans the engine (or the team's optimiser) produced; plan_items is the allocation, one row per order.
CREATE TABLE IF NOT EXISTS plans (
  id          serial PRIMARY KEY,
  day_id      text NOT NULL REFERENCES delivery_days(id),
  source      text NOT NULL,            -- engine | optimiser
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  summary     jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_items (
  plan_id     int NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  order_ref   text NOT NULL REFERENCES orders(ref),
  decision    text NOT NULL CHECK (decision IN ('served', 'deferred')),
  vehicle_id  text REFERENCES vehicles(id),
  trip_id     int CHECK (trip_id IN (1, 2)),
  reason      text,
  PRIMARY KEY (plan_id, order_ref)
);

-- ---------- People ----------
CREATE TABLE IF NOT EXISTS accounts (
  id               text PRIMARY KEY,     -- WP-DRV-003, STORE-OUT034, DEPOT-PELIYAGODA, WP-DSP-001, WP-ADM-001
  role             text NOT NULL CHECK (role IN ('dispatcher', 'loader', 'driver', 'store', 'admin')),
  name             text NOT NULL,
  depot            text REFERENCES depots(name),
  outlet_id        text REFERENCES outlets(id),
  vehicle_id       text REFERENCES vehicles(id),
  category         text,
  shared           boolean NOT NULL DEFAULT false,
  people           text[] NOT NULL DEFAULT '{}',   -- names on a shared store or depot account
  lang             text NOT NULL DEFAULT 'en',
  status           text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Locked', 'Deactivated', 'Not activated')),
  secret_hash      text NOT NULL,        -- bcrypt of the password (office) or 6-digit PIN (field)
  failed_attempts  int NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_login       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- One driver per vehicle, strictly.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_driver_per_vehicle ON accounts (vehicle_id) WHERE vehicle_id IS NOT NULL;

-- ---------- Operations ----------
-- Every change anyone makes is a command. The id is created on the device, so a command replayed after
-- a dead zone is recognised and never applied twice.
CREATE TABLE IF NOT EXISTS commands (
  seq          bigserial PRIMARY KEY,
  id           uuid NOT NULL UNIQUE,
  day_id       text NOT NULL REFERENCES delivery_days(id),
  type         text NOT NULL,
  payload      jsonb NOT NULL,
  actor_id     text NOT NULL,
  actor_role   text NOT NULL,
  person       text,                    -- who tapped their name on a shared account
  client_time  timestamptz,             -- when the device recorded it (may be long before it synced)
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commands_day ON commands (day_id, seq);

-- The day's current state: the result of applying every command in order (a projection, rebuildable from commands).
CREATE TABLE IF NOT EXISTS day_state (
  day_id      text PRIMARY KEY REFERENCES delivery_days(id),
  seq         bigint NOT NULL DEFAULT 0,
  state       jsonb NOT NULL,
  seed_state  jsonb NOT NULL,           -- the state before any command (used to rebuild or reset)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
