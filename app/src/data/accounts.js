// Seed accounts built from the real reference data: 120 outlets → 120 store accounts, 60 vehicles → 60 drivers.
import data from "./s1.json";

export const outletsAll = data.outletsAll;
export const fleetAll = data.fleetAll;
export const fuelWeek = data.fuelWeek;

export const BRANDS = ["Fresh", "Style", "Tech"];
export const VEHICLE_CATEGORIES = ["Reefer truck", "Dry truck", "Reefer van", "Dry van"];
export const vehicleCategory = (v) => `${v.reefer ? "Reefer" : "Dry"} ${v.type}`;
export const districtsByDepot = outletsAll.reduce((acc, o) => {
  (acc[o.depot] ??= new Set()).add(o.district);
  return acc;
}, {});

// Fictional first names for the 60 drivers (driver 003 is our persona Ruwan).
const DRIVER_NAMES = [
  "Sunil", "Chaminda", "Ruwan", "Pradeep", "Nuwan", "Kasun", "Mahesh", "Asanka", "Lahiru", "Tharindu",
  "Dinesh", "Saman", "Janaka", "Roshan", "Chathura", "Sudath", "Rizwan", "Imran", "Farook", "Nazeer",
  "Ravi", "Murugan", "Sivakumar", "Thilak", "Prasanna", "Upul", "Nalin", "Isuru", "Dilshan", "Sanjeewa",
  "Gayan", "Harsha", "Kumara", "Ajith", "Rohan", "Priyantha", "Sampath", "Wasantha", "Lalith", "Anura",
  "Buddhika", "Kelum", "Malinda", "Ranjith", "Selvam", "Karthik", "Rajesh", "Arjun", "Fazal", "Rifkhan",
  "Shiyam", "Hemantha", "Jagath", "Sameera", "Viraj", "Nishantha", "Duminda", "Pradeepan", "Ganesh", "Thusitha",
];

// Store names: the data only has outlet codes, so each store gets a real town or suburb in its own district.
const AREAS = {
  Colombo: ["Kollupitiya", "Bambalapitiya", "Wellawatte", "Dehiwala", "Mount Lavinia", "Nugegoda", "Maharagama", "Kotte", "Rajagiriya", "Battaramulla", "Borella", "Maradana", "Pettah", "Kotahena", "Grandpass", "Havelock Town", "Kirulapone", "Narahenpita", "Moratuwa", "Piliyandala", "Homagama", "Kottawa", "Boralesgamuwa", "Malabe"],
  Gampaha: ["Gampaha Town", "Negombo", "Wattala", "Kiribathgoda", "Kadawatha", "Ragama", "Kelaniya", "Minuwangoda", "Ja-Ela", "Veyangoda", "Nittambuwa", "Divulapitiya", "Kandana", "Ekala", "Seeduwa"],
  Kalutara: ["Kalutara Town", "Panadura", "Horana", "Beruwala", "Aluthgama", "Wadduwa", "Bandaragama", "Matugama", "Ingiriya", "Payagala"],
  Galle: ["Galle Fort", "Galle Town", "Hikkaduwa", "Ambalangoda", "Karapitiya", "Baddegama", "Elpitiya", "Unawatuna", "Habaraduwa"],
  Matara: ["Matara Town", "Weligama", "Dikwella", "Akuressa", "Kamburupitiya", "Hakmana"],
  Kurunegala: ["Kurunegala Town", "Kuliyapitiya", "Pannala", "Narammala", "Wariyapola", "Polgahawela", "Mawathagama", "Nikaweratiya"],
  Puttalam: ["Puttalam Town", "Chilaw", "Wennappuwa"],
  Kandy: ["Kandy City", "Peradeniya", "Katugastota", "Kundasale", "Digana", "Gampola", "Nawalapitiya", "Pilimathalawa", "Akurana", "Kadugannawa", "Tennekumbura", "Ampitiya", "Gelioya", "Wattegama", "Menikhinna", "Pallekele", "Mahaiyawa", "Hantana", "Aniwatte", "Galagedara"],
  Matale: ["Matale Town", "Dambulla", "Galewela", "Ukuwela", "Rattota", "Naula", "Palapathwela", "Sigiriya"],
  "Nuwara Eliya": ["Nuwara Eliya Town", "Hatton", "Talawakele", "Nanu Oya", "Ragala", "Walapane"],
  Badulla: ["Badulla Town", "Bandarawela", "Ella", "Haputale", "Welimada", "Mahiyanganaya"],
  Kegalle: ["Kegalle Town", "Mawanella", "Warakapola", "Rambukkana", "Ruwanwella"],
};
const used = {};
export const storeName = Object.fromEntries(outletsAll.map((o) => {
  const i = (used[o.district] = (used[o.district] ?? -1) + 1);
  return [o.id, `Waypoint ${o.brand} ${AREAS[o.district]?.[i] || `${o.district} ${i + 1}`}`];
}));

const STORE_PEOPLE = { OUT034: ["Fathima", "Dilani", "Night staff"] };

export const SEED_ACCOUNTS = [
  { name: "Nimal", id: "WP-DSP-001", type: "Dispatcher", category: "Peliyagoda", scope: "Planning office", status: "Active", last: "today 16:02" },
  { name: "Kavinda", id: "WP-DSP-002", type: "Dispatcher", category: "Kandy", scope: "Planning office", status: "Active", last: "yesterday 18:45" },
  ...fleetAll.map((v, i) => ({
    name: DRIVER_NAMES[i] || `Driver ${i + 1}`,
    id: `WP-DRV-${v.id.slice(3)}`,
    type: "Driver",
    category: vehicleCategory(v),
    depot: v.depot,
    vehicle: v.id,
    scope: `${v.id} · ${v.depot}`,
    status: v.id === "VEH027" ? "Not activated" : "Active",
    last: v.id === "VEH003" ? "today 03:05" : v.id === "VEH027" ? "never" : "—",
  })),
  ...outletsAll.map((o) => ({
    name: storeName[o.id],
    id: `STORE-${o.id}`,
    type: "Store account",
    category: o.brand,
    depot: o.depot,
    scope: `${o.id} · ${o.district}`,
    people: STORE_PEOPLE[o.id] || ["Store manager"],
    status: "Active",
    last: o.id === "OUT034" ? "today 04:50" : "—",
  })),
  { name: "Peliyagoda depot", id: "DEPOT-PELIYAGODA", type: "Depot account", category: "Peliyagoda", depot: "Peliyagoda", scope: "Peliyagoda loading dock", people: ["Suresh", "Kamal", "Mohamed"], status: "Active", last: "today 02:58" },
  { name: "Kandy depot", id: "DEPOT-KANDY", type: "Depot account", category: "Kandy", depot: "Kandy", scope: "Kandy loading dock", people: ["Ravi", "Nuwan"], status: "Active", last: "today 02:40" },
];
