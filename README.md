# MindRoot · Waypoint One

One delivery system for Waypoint Group's four roles: the **dispatcher** who plans, the **loader** who packs, the
**driver** who delivers and the **store manager** who receives. Every deferral is fair and explained, every role sees
the same order, and field work carries on without signal.

Team MindRoot · Tech-Triathlon 2026 (Rootcode) · Hackathon

- **Deployed system:** https://mindroot-waypointone-app.onrender.com (accounts below). It runs on a free plan:
  after 15 minutes without visitors the first page can take about a minute to wake up.
- **Architecture and data model:** [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md)
- **AI tool disclosure:** [docs/AI_disclosure.md](docs/AI_disclosure.md)

---

## Run it

### With Docker (recommended)

```bash
cp .env.example .env        # optional: change ports and secrets
docker compose up --build
```

Open **http://localhost:8080**. The first start creates the tables and seeds the database from `data/` (about 20 s).
Later starts keep the data (`docker compose down -v` wipes it).

### Without Docker (development)

Needs Node 20+ and PostgreSQL 14+.

```bash
# API + database
cd server
npm install
export DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/waypoint   # an empty database
npm run setup           # create tables + seed
npm run dev             # API on http://localhost:8080

# Web app (second terminal)
cd app
npm install
VITE_API_URL=http://localhost:8080 npm run dev    # http://localhost:5173
```

`VITE_API_URL` switches the app to server mode. Built without it, the app runs stand-alone in one browser (the
Designathon prototype mode): useful for design reviews, but nothing is shared between devices.

### Configuration

All settings are environment variables; see [.env.example](.env.example).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | set by compose | PostgreSQL connection |
| `JWT_SECRET` | `change-me-in-production` | signs session tokens: set a long random value |
| `DEMO_MODE` | `false` | leave off. `true` allows a test-only command that puts the seeded day back to its start |
| `SEED_PASSWORD` / `SEED_PIN` | `waypoint@mr2026` | password for all seeded accounts (change and restart to update them) |
| `PORT` | `8080` | port of the app |
| `CORS_ORIGIN` | `*` | allowed origins when the app is hosted separately |
| `VITE_API_URL` | unset | (build time) API URL for a separately hosted web app |

### Datasets

The database is seeded from the competition's shared datasets in `data/` (`General Data`, `Test Data`,
`Training Data`, exactly as shipped). They are used only for this competition and are not published anywhere else;
keep this repository private.

### Tests

```bash
cd server
DATABASE_URL=postgres://.../waypoint_test npm test   # reseeds that database
```

- `test/flow.test.js` runs the judge walkthrough through the real API: sign-in (and a wrong PIN), the planning
  engine, publish, loading, a driver's offline batch **sent twice and applied once**, the store's confirmation, and
  commands the server must refuse (a driver publishing, a driver delivering for another truck, a store reporting for
  another outlet, a chilled order moved to a dry truck).
- `test/planner.test.js` checks the engine's S1 plan against every rule, the fairness guard, that the oversize order
  is deferred (never split), that the search is deterministic, and that the checker catches broken rules.

---

## Seeded accounts

One delivery day is seeded: **S1, the peak day, Thu 8 Jan 2026** at the Peliyagoda depot (85 orders, 38 vehicles of
which 10 are in the workshop). The day starts on **Wed 7 Jan at 19:00**: store orders have closed and tonight's
plan is not yet published.

| Role | Account ID | Secret | Who |
|---|---|---|---|
| Dispatcher | `WP-DSP-001` | `waypoint@mr2026` | Nimal, Peliyagoda planning office |
| Loader (shared depot account) | `DEPOT-PELIYAGODA` | `waypoint@mr2026` | Suresh, Kamal, Mohamed tap their name |
| Driver | `WP-DRV-003` | `waypoint@mr2026` | Ruwan, reefer truck VEH003 |
| Store manager (shared store account) | `STORE-OUT074` | `waypoint@mr2026` | Waypoint Fresh Chilaw (Ruwan's first stop) |
| Admin | `WP-ADM-001` | `waypoint@mr2026` | accounts and fleet |

All 185 seeded accounts work the same way: `WP-DSP-00x` (dispatchers), `WP-DRV-001`…`060` (one per vehicle),
`STORE-OUT001`…`OUT120`, `DEPOT-PELIYAGODA`, `DEPOT-KANDY`. Five wrong tries lock an account for 15 minutes.
`WP-DRV-027` is a new, not-yet-activated account: sign in with the temporary password `waypoint@mr2026` and the app
asks you to set your own 6-digit PIN (first sign-in). Admin's *New account* and *Reset sign-in* give a temporary
password the same way. Everyone can change their own password or PIN on their profile.

### The day's clock and the runs

Every portal follows one clock. It **keeps running** like a real clock. Only the **dispatcher** can change it, in the
**date and time** menu at the top right of Orders or the Live board: *Use real time* (Sri Lanka time), or set any date
and time (it runs on from there).

The system works on the **run** the clock is in (booklet: orders for a run close at 4 PM the day before):
before 4 PM it is today's run (or the next operating day if today is closed), from 4 PM the next run, which the
dispatcher plans that evening. When the clock passes into a new run, plans, loading, deliveries and reports start
fresh, and every order the last run could not serve is carried over and goes first.

- **Real runs (any real date):** the orders are the ones stores place in the app. The dispatcher plans them with
  Auto-plan, publishes, and loaders, drivers and stores carry on from there. This is how the system runs every day.
- **S1 (Thu 8 Jan 2026)** is the dataset's peak day, kept as a reference day: its 85 orders and fleet status come
  from the shared datasets. The app starts on real time; the dispatcher opens S1 by setting the clock to
  **7 Jan 2026, 19:00** (the evening before).

### A real day, step by step (today's date)

1. Dispatcher (`WP-DSP-001`): **date and time → Use real time**. The Orders page shows *This run* (the next run if it
   is past 4 PM, or a Sunday) with no orders yet.
2. Store managers place orders: e.g. `STORE-OUT034` → **New order** → *Repeat yesterday's order* → **Send order**
   (also `STORE-OUT026`, `STORE-OUT074`…). Each order appears at once on the dispatcher's Orders page.
3. Dispatcher: **Auto-plan** → the engine plans exactly these orders → **Use this plan** → **Publish plan**.
4. Dispatcher sets the time to the run's morning (e.g. 03:00) → loader (`DEPOT-PELIYAGODA`) sees *Today's loads*,
   says who is loading, checks the reefer and loads each truck.
5. Dispatcher sets e.g. 06:00 → the truck's driver (`WP-DRV-0xx`, the vehicle number on Today's loads) starts the run,
   arrives, and hands over with a real photo and signature.
6. The store sees *Delivered · photo + signature* and confirms in **Check delivery**.
7. **A truck breaks down** (any truck, any day): its driver opens **Vehicle problem** → *Cooling failed*, *Engine* or
   *Tyre* → slides to report. The dispatcher's **Live board** shows *Truck problem* → the planning engine re-plans
   without that truck: every other truck keeps its orders, delivered stops stay done, its other orders go to trucks
   with room (chilled only on reefers) or are deferred with a reason → **Approve re-plan & notify everyone**. The truck
   goes to the workshop, its driver sees *Return to the workshop bay*, and loaders, drivers and stores see the new plan.

## Judge walkthrough on the S1 reference day (planning → loading → delivery → receipt)

Use two or more browsers (or one normal and one private window) to see the roles update each other live.
Driver and loader screens are designed for a phone: use a phone or your browser's device toolbar (390 px).

**Dispatcher, evening before (Wed 7 Jan 19:00)**

1. Sign in as `WP-DSP-001` / `waypoint@mr2026`. Click the **date and time** at the top right, set **7 Jan 2026,
   19:00** → **Set this time** (every portal follows). Press **Use real time** in the same menu to go back to today. **Orders** shows the 85 orders: 26 chilled, 10 shops skipped yesterday
   (they must not be skipped again), one Style order of 40.7 m³ that is bigger than any truck, and today's real limit:
   every reefer trip is already used.
2. Press **Auto-plan**. The planning engine runs on the server: it shows its plan (served, deferred, shops skipped
   yesterday served, chilled volume waiting) next to the team's plan, and confirms every rule is met. Choose
   **Keep current plan** (the team's published plan, which this walkthrough follows) or **Use this plan** to adopt the
   engine's plan.
3. On the **Plan board**, click any shop (e.g. OUT034 on VEH003). The panel offers only moves that follow the rules
   and explains why other trucks don't fit ("Chilled goods need a refrigerated vehicle", "Space 38.6 / 33.4 m³").
   Close it. **Deferrals** shows each deferred order with its reason and the store notice.
4. Press **Publish plan** → **Publish and notify everyone**. Loaders, drivers and stores can now see it.

**Loader, at the dock (Thu 8 Jan 03:00)**

5. Move the day forward: in the dispatcher's window, click the **date and time** at the top right, set **8 Jan 2026,
   03:00** → **Set this time** (loading at the dock). Every portal follows the shared clock.
6. In a phone-sized window, sign in as `DEPOT-PELIYAGODA` / `waypoint@mr2026`. **Home** shows the next load. Open
   **Today's loads** → **VEH003** → tap **Suresh** ("Who is loading VEH003?"). The dispatcher's bell shows
   *Loading started*.
7. Tick the **reefer check (2–5 °C)**, tick **S1-083** (load in reverse stop order), press **All loaded · Hand to
   Ruwan**. The dispatcher's bell shows *Loaded · VEH003*; the **Loader log** records who loaded it and when.

**Driver, on the road (05:30)**

8. **Dispatcher's date and time → 8 Jan 2026, 05:30 → Set this time** (trucks on the road). Sign in as `WP-DRV-003` / `waypoint@mr2026` in a phone-sized window (the
   screens are in Sinhala for Ruwan; tap **EN** at the top for English). The trip shows *Loaded by Suresh*.
9. **Start run · Trip 1** → the route map opens inside the app → **I've arrived · OUT074** → **All given** → **Take
   photo** → **Sign here** → **Slide to finish**. The dispatcher's **Live board** shows the stop done.
10. *Offline (optional):* turn the network off (browser device toolbar → Offline, or airplane mode), do the next
    stop, then turn it back on. The records wait on the phone and sync once, with no duplicates.

**Store manager, receiving (08:00)**

11. **Dispatcher's date and time → 8 Jan 2026, 08:00 → Set this time** (stores receive). Sign in as `STORE-OUT074` / `waypoint@mr2026`. **Deliveries** shows the
    chilled order delivered with the driver's proof (time, receiver, photo, signature).
12. **Check delivery** → **Everything is OK ✓** (or report missing, damaged or warm cases with a photo; it goes to
    the dispatcher). That completes the order's journey.

**Bad days (degradation and recovery), in the normal portals**

13. **Short at the Dock:** the loader opens **Problems → Report a problem** on a truck (e.g. 2 broken chilled cases,
    with a photo). The dispatcher's Live board shows it; they replace the cases from stock or send the truck short with
    a replacement order first on the next run, and the store is told before it opens.
14. **Truck down:** the driver reports **Vehicle problem** (cooling, engine or tyre). The dispatcher re-plans without
    that truck (step 7 of the real day above): no chilled goods on a dry truck, shops skipped yesterday stay
    protected, and every store sees its new truck.
15. **Dead Zone:** the driver's phone loses signal (airplane mode, or the browser's device toolbar → Offline). The
    driver keeps recording deliveries; they wait on the phone, the dispatcher sees the truck as offline (not lost),
    and the proof syncs once, with no duplicates, when the signal returns.

---

## Repository layout

```
app/                 React web app (PWA) for all roles
  src/domain/        shared domain code: store.js (reducer), planner.js (planning engine), autoPlan.js,
                     clock.js (the shared clock), day.js (runs and their orders)
  src/sync.js        API client, outbox, live stream
  src/useServerState.js  server mode for the app's state (optimistic view, outbox, live updates)
  src/screens/       Dispatch, Loader, Driver, Store, Admin, Auth, Fleet
server/              API server (Node + Express + PostgreSQL)
  src/               index.js (routes), auth.js, permissions.js, validate.js, daystore.js, planning.js
  db/                migrations/, migrate.js, seed.js
  test/              end-to-end API and planner tests
data/                shared datasets (seed input)
docs/                architecture, data model, AI disclosure
docker-compose.yml, Dockerfile, .env.example
```

---

## What is real, and what is not connected yet

Real: accounts and passwords (bcrypt, lockout, first sign-in, password change, admin create/reset), role permissions
checked by the server, the planning engine, the shared day with live updates, offline outbox with duplicate-free
replay, delivery photos (phone camera) and signatures, the running clock (dispatcher-controlled), each run's records
kept when the clock moves, carry-over of every undelivered order, replacement orders for short and missing cases,
sessions that end when admin switches an account off, and **Google Maps directions**: the driver's *Navigate* (next
stop) and *Whole route* buttons and the dispatcher's *Route in Google Maps* open Google Maps (no key needed). A store's
place is the address or Google Maps link admin sets in its store rules, otherwise its town; admin can also set the
store's phone so *Call shop* dials it.

Not connected yet (shown honestly in the app where it matters): sending SMS (store notices and the one-time codes
at first sign-in and *Forgot password*: any 6 digits are accepted at first sign-in), voice notes, and live GPS
(positions on the in-app map follow the plan and the drivers' recorded steps; the datasets give each shop's district,
not its exact location). The seeded data has one delivery day
(S1); real runs take their orders from the stores in the app. Real runs are planned for the Peliyagoda depot (like S1):
Kandy stores' orders are recorded but not yet planned.

## Departures from the Designathon submission

- **Real planning engine.** In the Designathon, Auto-plan showed our optimiser's precomputed S1 plan. Now Auto-plan
  runs a planning engine on the server (every booklet rule, delivery windows, fuel, fairness first) and the
  dispatcher chooses whether to use it. On S1 it serves 76 of 85 with all 10 protected shops and leaves 49.6 m³ of
  chilled goods waiting, less than the published plan's 55.4 m³. On S1 the team's published plan (77 of 85)
  stays until the dispatcher chooses the engine's plan.
- **Shared server state.** The prototype kept each browser's own copy; now every role on every device shares one
  day through the server, with live updates.
- **Real offline.** The Designathon showed offline with a demo switch. Now a real lost connection works the same way
  (outbox, replay, no duplicates), and "No signal" shows whenever the device is really offline.
- **Short at the Dock timing.** The design said VEH006 waits up to 12 minutes; the timing engine computes up to
  15 minutes within every window, and all screens now say 15.
- **Loader flow.** After the Designathon review we added *Home*, *Today's loads*, *Loader log* and a "who is loading?"
  question per truck (the design had one sign-in per shift), plus a reefer temperature check before chilled loading.
- **No demo layer.** The Designathon prototype had a demo clock, guided bad-day stories and a reset button. The app
  now runs as a real system: real Sri Lanka time by default, only the dispatcher can set the clock, bad days are
  handled in the normal portals (a truck breakdown is re-planned by the engine on any day), and nothing is reset.
