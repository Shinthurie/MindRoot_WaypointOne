"""Builds src/data/s1.json for the prototype from the competition data and our fair S1 plans.

Run from the app folder:  python scripts/build_data.py
"""
import json
import os

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "data")
PLANS = os.path.join(ROOT, "datathon")
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "s1.json")

scn = pd.read_csv(os.path.join(DATA, "Test Data", "task2b_peak_day_scenarios.csv"))
fleet = pd.read_csv(os.path.join(DATA, "Test Data", "task2b_peak_day_fleet.csv"))
veh = pd.read_csv(os.path.join(DATA, "General Data", "vehicles.csv"))
dist = pd.read_csv(os.path.join(DATA, "General Data", "district_travel.csv"))
allow = pd.read_csv(os.path.join(DATA, "General Data", "service_allowance.csv"))
cal = pd.read_csv(os.path.join(DATA, "General Data", "calendar.csv"))


def plan(name):
    p = pd.read_csv(os.path.join(PLANS, name))
    p["trip_id"] = p["trip_id"].astype("Int64")
    out = {}
    for r in p.itertuples():
        out[r.order_ref] = None if r.decision == "deferred" else {"vehicle": r.vehicle_id, "trip": int(r.trip_id)}
    return out


fair = plan("s1_fair_full.csv")
down = plan("s1_fair_VEH003.csv")

# Display VEH003's Gampaha trip first (trip numbering is free; feasibility is unchanged).
for p in (fair,):
    for ref, a in p.items():
        if a and a["vehicle"] == "VEH003":
            a["trip"] = 1 if a["trip"] == 2 else 2

orders = []
for r in scn.itertuples():
    orders.append({
        "ref": r.order_ref, "outlet": r.outlet_id, "brand": r.brand, "district": r.district,
        "dock": r.dock_type, "parking": r.parking_constraint,
        "mall": None if pd.isna(r.mall_window) else r.mall_window,
        "open": r.window_open_time, "close": r.window_close_time,
        "chilled": r.temp_requirement == "chilled", "units": int(r.order_units),
        "kg": round(float(r.order_weight_kg), 1), "m3": round(float(r.order_volume_m3), 3),
        "deferredYesterday": bool(r.deferred_yesterday), "daysSince": int(r.days_since_last_served),
    })

avail = fleet.merge(veh, on="vehicle_id")
vehicles = [{
    "id": r.vehicle_id, "type": r.type, "reefer": r.temp == "reefer", "kg": int(r.weight_cap_kg),
    "m3": float(r.volume_cap_m3), "kmPerL": float(r.km_per_l), "quotaL": int(r.weekly_fuel_quota_l),
    "status": r.status,
} for r in avail.itertuples()]

districts = {r.district: {"outMin": int(r.depot_to_district_freeflow_min), "stopMin": int(r.inter_stop_freeflow_min),
                          "outKm": float(r.depot_to_district_km), "stopKm": float(r.inter_stop_km)}
             for r in dist.itertuples()}
allowance = {f"{r.brand}|{r.dock_type}": int(r.service_allowance_min) for r in allow.itertuples()}

# Outlook baseline: same ISO weeks last year (2025 W14-W23), Peliyagoda Fresh, every order counted.
d = pd.read_csv(os.path.join(DATA, "Training Data", "deliveries_train.csv"),
                usecols=["order_date", "depot", "brand", "temp_requirement", "order_volume_m3"])
d = d.merge(cal[["date", "iso_year", "iso_week"]], left_on="order_date", right_on="date")
def weekly(depot):
    base = d[(d.depot == depot) & (d.iso_year == 2025) & (d.iso_week.between(14, 23))]
    fresh = base[base.brand == "Fresh"].groupby("iso_week").apply(lambda g: pd.Series({
        "total": g.order_volume_m3.sum(), "chilled": g[g.temp_requirement == "chilled"].order_volume_m3.sum()}))
    # Style + Tech volume: needs dry trucks too, so it counts toward trucks and drivers needed.
    fresh["other"] = base[base.brand != "Fresh"].groupby("iso_week").order_volume_m3.sum().reindex(fresh.index).fillna(0)
    return fresh
wk = weekly("Peliyagoda")
wk_kandy = weekly("Kandy")
reefers = veh[(veh.depot == "Peliyagoda") & (veh.temp == "reefer")]
reefer_week = float(reefers.volume_cap_m3.sum() * 2 * 6)
c26 = cal[(cal.iso_year == 2026) & (cal.iso_week.between(14, 23))]
flags = {}
for r in c26.itertuples():
    tags = flags.setdefault(int(r.iso_week), [])
    if r.is_payday == 1 and "Payday" not in tags:
        tags.append("Payday")
    if isinstance(r.festival, str):
        name = {"new_year": "Sinhala & Tamil New Year", "vesak": "Vesak", "poson": "Poson"}.get(r.festival, r.festival.title())
        if name not in tags:
            tags.append(name)
def to_weeks(frame):
    return [{"week": int(w), "total": round(float(row.total), 1), "chilled": round(float(row.chilled), 1),
             "other": round(float(row.other), 1), "flags": flags.get(int(w), [])} for w, row in frame.iterrows()]
outlook = to_weeks(wk)

# Full reference lists (all 120 outlets, all 60 vehicles) for accounts and admin screens.
outlets_df = pd.read_csv(os.path.join(DATA, "General Data", "outlets.csv"))
outlets_all = [{"id": r.outlet_id, "brand": r.brand, "district": r.district, "depot": r.depot, "dock": r.dock_type,
                "parking": r.parking_constraint, "open": r.window_open_time, "close": r.window_close_time} for r in outlets_df.itertuples()]
# Fuel used in the latest week of history: logged route legs + the return trip to the depot, / km per litre.
legs = pd.read_csv(os.path.join(DATA, "Training Data", "route_legs_train.csv"), usecols=["date", "route_id", "vehicle_id", "district", "distance_km"])
legs = legs.merge(cal[["date", "iso_year", "iso_week"]], on="date")
# The S1 day is Thu 8 Jan 2026: the only 2026 dates that match the brief (festival a week away: Thai Pongal 15 Jan,
# not payday, no monsoon, operating day) are 7-10 Jan. Fuel "last week" = ISO 2026 W1; "this week so far" = Mon 5 - Wed 7 Jan.
S1_DATE = "2026-01-08"
def km_by_vehicle(frame):
    routes = frame.groupby(["route_id", "vehicle_id", "district"]).distance_km.sum().reset_index()
    routes["km"] = routes.distance_km + routes.district.map(dist.set_index("district").depot_to_district_km)
    return routes.groupby("vehicle_id").km.sum()
week = legs[(legs.iso_year == 2026) & (legs.iso_week == 1)]
km_week = km_by_vehicle(week)
so_far = legs[(legs.date >= "2026-01-05") & (legs.date < S1_DATE)]
km_so_far = km_by_vehicle(so_far)
fuel_week = {"label": f"ISO week 1, 2026 ({week.date.min()} to {week.date.max()})", "soFarFrom": "2026-01-05"}
fleet_all = [{"id": r.vehicle_id, "type": r.type, "reefer": r.temp == "reefer", "depot": r.depot,
              "m3": float(r.volume_cap_m3), "kg": int(r.weight_cap_kg), "kmPerL": float(r.km_per_l),
              "quotaL": int(r.weekly_fuel_quota_l), "fuel": r.fuel_type,
              "usedL": round(float(km_week.get(r.vehicle_id, 0)) / float(r.km_per_l), 1),
              "weekSoFarL": round(float(km_so_far.get(r.vehicle_id, 0)) / float(r.km_per_l), 1),
              "status": {x.vehicle_id: x.status for x in fleet.itertuples()}.get(r.vehicle_id, "available")} for r in veh.itertuples()]

# Typical traffic by district and hour (S1 has no monsoon), for running-late predictions on the live board.
ts = pd.read_csv(os.path.join(DATA, "General Data", "traffic_speed.csv"))
traffic = {f"{r.district}|{int(r.hour)}": int(r.speed_index) for r in ts[ts.monsoon == 0].itertuples()}

# Days with no deliveries (calendar is_operating = 0) and the date each forecast week starts.
closed_days = sorted(cal[(cal.is_operating == 0) & (cal.date >= "2025-12-01")].date.astype(str).str[:10].tolist())
week_start = {int(w): str(g.date.min())[:10] for w, g in cal[cal.iso_year == 2026].groupby("iso_week")}
for w in outlook: w["from"] = week_start.get(w["week"])

json.dump({
    "s1Date": S1_DATE, "closedDays": closed_days,
    "traffic": traffic,
    "outletsAll": outlets_all, "fleetAll": fleet_all, "fuelWeek": fuel_week,
    "orders": orders, "vehicles": vehicles, "districts": districts, "allowance": allowance,
    "plans": {"fair": fair, "veh003Down": down},
    "outlook": {"weeks": outlook, "byDepot": {"Peliyagoda": outlook, "Kandy": to_weeks(wk_kandy)}, "reeferWeekM3": round(reefer_week, 1), "basis": "Same weeks in 2025 (baseline until our demand model is ready)"},
}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("wrote", os.path.abspath(OUT), len(orders), "orders", len(vehicles), "vehicles")
print("outlook", outlook, "reefer/week", reefer_week)
