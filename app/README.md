# Waypoint One: clickable prototype (PWA)

Team MindRoot · Tech-Triathlon 2026. React + Vite, installable as a Progressive Web App.
Every number on screen comes from the real S1 peak-day data and our fair allocation plans.

## Run it

```bash
cd app
npm install        # first time only
npm run dev        # live editing at http://localhost:5173
```

Test the installable, offline PWA version:

```bash
npm run build
npm run preview    # http://localhost:4173 → Chrome menu → "Install Waypoint One"
```

The service worker runs only in the build/preview version, so it never gets in the way of editing.

## Screen sizes

The app fills any screen. Driver and loader screens are designed phone-first (judges test on phones) and adapt upwards:

| Width | Driver | Loader | Store manager |
|---|---|---|---|
| Phone (< 768 px) | Single screen | Single screen | App screens |
| Tablet (768–1279 px) | Stops left, current stop right | Trucks left, load list right | Full dashboard |
| Big screen (≥ 1280 px) | Same two panels | **Dock wall screen**: every Fresh truck, live | Full dashboard |

Demo menu → **Phone preview** shows mobile screens inside a phone frame (for the video, Figma capture, or showing the phone view on a laptop). Link option: `&frame=1`.

## Getting around

- The **Demo** button (bottom-left) opens any portal, triggers the 3 bad days, switches the language, toggles offline, and resets.
- **Alt + D** hides or shows the Demo button (hide it before taking screenshots or importing to Figma).
- Direct links: add `?as=<role>&lang=<en|si|ta>&offline=1&clean=1` before the `#`, for example
  `http://localhost:5173/?as=driver&lang=si&clean=1#/driver`.
  Roles: `dispatcher`, `loader`, `driver`, `store`, `admin`.
- Sign-in accepts any password of 4+ characters. `WP-DRV-027` opens the first sign-in flow.

## Accounts

| Who | Account | ID example | How it works |
|---|---|---|---|
| Store managers | **One shared account per store** | `STORE-OUT034` | Confirming, reporting or ordering asks "Who is this?" (one tap on a name) |
| Loaders | **One shared depot account per depot** | `DEPOT-PELIYAGODA` | Tablet stays signed in; loaders tap their name (no PIN) and only see their depot's trucks |
| Drivers | Personal | `WP-DRV-003` | **One driver per vehicle, strictly** (Ruwan = VEH003); admin blocks a second driver |
| Dispatchers | Personal | `WP-DSP-001` | Every dispatcher decision is in the **Dispatcher log**, visible to all dispatchers (loader, store and admin actions are in the admin activity log) |
| Admin | Personal | `WP-ADM-001` | Creates accounts; edits store rules (window, dock, van-only, mall window) and people; resets, locks or deactivates accounts; manages the fleet and workshop status |

## Demo walkthrough (all 4 roles, connected)

Start from the sign-in page (not the Demo menu) to see the full flow:

1. **Store** (`STORE-OUT034`) → New order → Send → "Who is this?" → the order appears on the dispatcher's **Orders** page under "New orders for the next run". Before tonight's plan is published, the store sees "Ordered · plan comes out around 7 PM".
2. **Dispatcher** (`WP-DSP-001`) → Orders → **Auto-plan** (shows how it decides) → Plan board: click any order to **move** it (every truck checked against the rules, with "why not" in plain words), or click a deferred order to **serve** it (reason required; swaps never offer protected shops) → **Publish plan**.
3. **Loader** (`DEPOT-PELIYAGODA`) → tap your name → load VEH003 in reverse order → **All loaded** → the dispatcher's Live board shows "Loaded by Suresh".
4. **Driver** (`WP-DRV-003`) → deliver stop ●1 and ■2 (try **offline** first) → the Live board progress and the store's timeline update from the driver's real records.
5. **Store** → Check delivery → report 2 missing → it appears on the dispatcher's Live board with the driver's proof.
6. **A store with a deferral**: sign in as `STORE-OUT054` (or Demo → "Store with a deferral") → the chilled order shows **Deferred + the reason + protected tomorrow**.
7. **Bad days** (Demo menu): Short at the Dock, Reefer Down, Dead Zone.

Before the plan is published, drivers and loaders see "Tonight's plan isn't ready yet" (in their language). The Demo menu's role shortcuts publish automatically so you can jump straight in.

## Into Figma

1. Hide the Demo button (Alt + D) or use `&clean=1`.
2. Use the **html.to.design** Chrome extension (or plugin) on each screen to import it as editable Figma layers.
   For phone screens, open Chrome DevTools device mode at 390 × 844 first.
3. Or take screenshots and give them to Google Stitch ("Start with your design").

## Files

| Path | What |
|---|---|
| `src/data/s1.json` | Generated from the competition data (`npm run data`) |
| `src/data/model.js` | Trips, ETAs, fuel, plan results, re-plan, live status |
| `src/i18n.js` | Field Mode text in English, Sinhala, Tamil (**drafts: native speakers must check**) |
| `src/state.jsx` | Sign-in, language, offline simulation, bad-day scenarios, sync |
| `src/components/ui.jsx` | Design system components (shape badges, chips, slide-to-confirm, keypad…) |
| `src/screens/*` | Auth, Driver, Loader, Store, Dispatch, Admin |
| `public/sw.js`, `public/manifest.webmanifest` | PWA offline shell and install info |

The allocation plans come from `../datathon/s1_fair_full.csv` and `s1_fair_VEH003.csv`, which pass `check_allocation.py`.
