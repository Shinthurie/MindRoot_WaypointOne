import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEPOTS, shopPoint, truckPosition } from "./LiveMap";

/* The driver's own trip on a map: depot, the stops in order (done = filled), and where the truck is now.
   Shops sit near their town (the data has towns, not coordinates). Needs signal for the map tiles. */
export default function DriverMap({ run, now, depot = "Peliyagoda", doneOutlets = new Set(), arrived = {}, nextOutlet, height = 360 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const home = DEPOTS[depot] || DEPOTS.Peliyagoda;

  useEffect(() => {
    if (map.current || !el.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(home, 10);
    L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", { maxZoom: 17, attribution: "© Google Maps" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw only when something on the map really changes (not on every screen update), and frame the
  // route once per trip, so the driver can zoom and pan without the map jumping back.
  const doneKey = [...doneOutlets].sort().join(",");
  const arrivedKey = Object.keys(arrived).sort().join(",");
  const framedRun = useRef(null);
  useEffect(() => {
    if (!layer.current || !run) return;
    layer.current.clearLayers();
    const pts = run.stops.map((s) => shopPoint(s.outlet, s.district || run.district));
    L.polyline([home, ...pts, home], { color: "#5a2d66", weight: 4, opacity: 0.75 }).addTo(layer.current);
    L.marker(home, { icon: L.divIcon({ className: "", html: `<div class="map-depot">${depot}</div>`, iconSize: null }) }).addTo(layer.current);
    run.stops.forEach((s, i) => {
      const isDone = doneOutlets.has(s.outlet);
      const isNext = s.outlet === nextOutlet;
      L.marker(pts[i], {
        icon: L.divIcon({ className: "", html: `<div class="map-stop ${isDone ? "done" : ""} ${isNext ? "next" : ""}">${i + 1}</div>`, iconSize: null }),
        title: `${s.outlet} · ${s.eta}`,
      }).bindTooltip(`${s.outlet} · ${s.eta}`, { direction: "top", offset: [0, -12] }).addTo(layer.current);
    });
    const pos = truckPosition(run, now, home, arrived);
    L.marker(pos.at, { icon: L.divIcon({ className: "", html: `<div class="map-truck sel" style="--c:#2563eb">🚚</div>`, iconSize: null }), zIndexOffset: 1000 }).addTo(layer.current);
    const runId = `${run.run}:${run.district}`;
    if (framedRun.current !== runId) {
      framedRun.current = runId;
      setTimeout(() => { if (!map.current) return; map.current.invalidateSize(); map.current.fitBounds(L.latLngBounds([home, ...pts, pos.at]), { padding: [36, 36], maxZoom: 12 }); }, 60);
    }
  }, [run, now, depot, doneKey, arrivedKey, nextOutlet]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="live-map" style={{ height, borderRadius: 16, overflow: "hidden" }} role="img" aria-label="Map of this trip" />;
}
