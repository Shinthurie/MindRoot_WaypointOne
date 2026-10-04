/* Google Maps directions (no key needed): opens the Google Maps app on a phone, or maps.google.com on a computer.
   A store's place is the exact address or Google Maps link admin set in its store rules; otherwise its town. */
import { storeName } from "./data/accounts";

const DEPOT_PLACE = { Peliyagoda: "Peliyagoda, Sri Lanka", Kandy: "Kandy, Sri Lanka" };
const q = encodeURIComponent;
const isLink = (x) => /^https?:\/\//i.test(x || "");

/* The store's address, or "<town>, <district>, Sri Lanka" from its name (e.g. Waypoint Fresh Veyangoda → Veyangoda). */
export function placeOf(outlet, district, storeEdits = {}) {
  const set = storeEdits[outlet]?.address;
  if (set) return set;
  const town = (storeName[outlet] || "").replace(/^Waypoint \S+ /, "").replace(/ \d+$/, "");
  return [town, district, "Sri Lanka"].filter(Boolean).join(", ");
}

/* Directions from here to one place. */
export const directionsTo = (place) => (isLink(place) ? place : `https://www.google.com/maps/dir/?api=1&destination=${q(place)}&travelmode=driving`);

/* A whole trip: from the depot, through every stop in order. */
export function routeUrl(depot, places) {
  const stops = places.filter((p) => p && !isLink(p));
  if (!stops.length) return null;
  const last = stops[stops.length - 1];
  const via = stops.slice(0, -1).map(q).join("%7C");
  return `https://www.google.com/maps/dir/?api=1&origin=${q(DEPOT_PLACE[depot] || `${depot}, Sri Lanka`)}&destination=${q(last)}${via ? `&waypoints=${via}` : ""}&travelmode=driving`;
}
