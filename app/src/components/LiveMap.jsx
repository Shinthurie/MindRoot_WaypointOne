import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toMin } from "../data/model";

/* Live tracking map for the dispatcher.
   The brief's data gives each shop's district, not coordinates, so districts sit at their real towns and shops
   are spread a little around them. Trucks move along their planned route by the clock (simulated GPS);
   VEH003 follows its driver's real steps (left, arrived) when recorded. */
export const DEPOTS = { Peliyagoda: [6.9636, 79.8801], Kandy: [7.2906, 80.6337] };
const TOWNS = {
  Colombo: [6.9271, 79.8612], Gampaha: [7.0873, 80.0144], Kalutara: [6.5854, 79.9607], Galle: [6.0535, 80.221],
  Matara: [5.9549, 80.555], Kurunegala: [7.4863, 80.3647], Puttalam: [7.7, 79.83], Kandy: [7.2906, 80.6337],
  Matale: [7.4675, 80.6234], "Nuwara Eliya": [6.9497, 80.7891], Badulla: [6.9934, 81.055], Kegalle: [7.2513, 80.3464],
};

// Same shop, same spot every time: a small offset from its district's town, from the outlet number.
export function shopPoint(outlet, district) {
  const base = TOWNS[district] || DEPOTS.Peliyagoda;
  const k = Number(outlet.replace(/\D/g, "")) || 1;
  const ang = (k * 137.5 * Math.PI) / 180;
  const r = 0.025 + (k % 5) * 0.008;
  return [base[0] + r * Math.sin(ang), base[1] + r * Math.cos(ang)];
}

const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const frac = (now, from, to) => (to <= from ? 1 : Math.min(1, Math.max(0, (now - from) / (to - from))));

/* Where a truck is at the clock time, along depot → stops → depot, from the plan's times. */
export function truckPosition(run, now, depot, progress = {}) {
  const pts = run.stops.map((s) => shopPoint(s.outlet, s.district || run.district));
  const t = toMin(now);
  // The live driver: an arrival or departure the driver recorded beats the plan.
  for (let i = run.stops.length - 1; i >= 0; i--) {
    const p = progress[run.stops[i].outlet];
    if (p?.arrivedAt) return { at: pts[i], moving: false };
  }
  let prev = depot, prevLeave = toMin(run.start);
  for (let i = 0; i < run.stops.length; i++) {
    const s = run.stops[i];
    const arrive = toMin(s.eta), leave = toMin(s.leave);
    if (t < arrive) return { at: lerp(prev, pts[i], frac(t, prevLeave, arrive)), moving: t >= prevLeave };
    if (t < leave) return { at: pts[i], moving: false };
    prev = pts[i]; prevLeave = leave;
  }
  const end = toMin(run.end);
  return { at: lerp(prev, depot, frac(t, prevLeave, end)), moving: t < end };
}

const COLORS = { late: "#c2410c", problem: "#dc2626", offline: "#6b7280", way: "#2563eb", waiting: "#334155", done: "#15803d" };

export default function LiveMap({ rows, now, depot = "Peliyagoda", selected, onSelect, progress, height = 420 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const home = DEPOTS[depot] || DEPOTS.Peliyagoda;

  useEffect(() => {
    if (map.current || !el.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([7.05, 80.15], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  const trucks = useMemo(() => rows.map((r) => {
    const pos = r.state === "waiting" || (r.state === "done" && r.lane.vehicle.id !== "VEH003") ? { at: home, moving: false } : truckPosition(r.trip, now, home, progress);
    return { ...r, pos };
  }), [rows, now, home, progress]);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    L.marker(home, { icon: L.divIcon({ className: "", html: `<div class="map-depot">${depot}</div>`, iconSize: null }) }).addTo(layer.current);
    trucks.forEach((r) => {
      const id = r.lane.vehicle.id;
      const color = COLORS[r.state] || COLORS.way;
      const isSel = selected === id;
      if (isSel || r.state === "late") {
        const route = [home, ...r.trip.stops.map((s) => shopPoint(s.outlet, s.district || r.trip.district)), home];
        L.polyline(route, { color, weight: isSel ? 4 : 2, opacity: isSel ? 0.9 : 0.45, dashArray: isSel ? null : "6 6" }).addTo(layer.current);
        r.trip.stops.forEach((s, i) => L.circleMarker(shopPoint(s.outlet, s.district || r.trip.district), { radius: 5, color, weight: 2, fillColor: i < r.done ? color : "#fff", fillOpacity: 1 })
          .bindTooltip(`${s.outlet} · ${s.eta}`).addTo(layer.current));
      }
      if (r.state === "waiting" || (r.state === "done" && !isSel)) return; // parked at the depot: counted in the depot marker
      const m = L.marker(r.pos.at, {
        icon: L.divIcon({ className: "", html: `<div class="map-truck ${isSel ? "sel" : ""}" style="--c:${color}">${id.replace("VEH", "")}</div>`, iconSize: null }),
        zIndexOffset: isSel ? 1000 : r.state === "late" ? 500 : 0, keyboard: true, title: `${id} · ${r.trip.district}`,
      });
      m.on("click", () => onSelect?.(id));
      m.bindTooltip(`${id} · ${r.trip.brand} ${r.trip.district} · ${r.done}/${r.trip.stops.length}`, { direction: "top", offset: [0, -14] });
      m.addTo(layer.current);
    });
  }, [trucks, selected, home, depot, onSelect]);

  // Frame the trucks on the road (once), and the whole route of a selected truck.
  const framed = useRef(false);
  useEffect(() => {
    if (!map.current) return;
    const r = trucks.find((x) => x.lane.vehicle.id === selected);
    if (r) {
      const pts = [home, r.pos.at, ...r.trip.stops.map((s) => shopPoint(s.outlet, s.district || r.trip.district))];
      map.current.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 12, animate: true });
      return;
    }
    if (framed.current && !selected) return;
    const pts = [home, ...trucks.filter((x) => x.state !== "waiting" && x.state !== "done").map((x) => x.pos.at)];
    if (pts.length > 1) {
      framed.current = true;
      // The container gets its size after the first paint: measure, then frame.
      setTimeout(() => { if (!map.current) return; map.current.invalidateSize(); map.current.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 11 }); }, 60);
    }
  }, [selected, trucks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="live-map" style={{ height }} role="application" aria-label="Map of trucks on the road" />;
}
