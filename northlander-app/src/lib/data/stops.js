/* ==================================================================
   Canonical stop catalog for the Northlander route.
   Sourced from /site/data.js on the Guide. Hand-maintained so the
   app doesn't have to ship the full STOPS array (which carries the
   Guide's listings, fun facts, FAQs and packing tips - none of
   which the app needs at trip-planning time).

   `offsetMinutes` is the cumulative train travel time from Toronto
   Union, derived from the Guide's `time` field (H:MM) so the schedule
   helpers in ./schedule.js can compute boarding/arrival times for
   any departure clock.
   ================================================================== */

/**
 * @typedef {Object} Stop
 * @property {string} id
 * @property {string} name
 * @property {string} region
 * @property {string} hook
 * @property {string} image       - guide-hosted path, lets us share assets
 * @property {number} lat
 * @property {number} lng
 * @property {number} offsetMinutes
 */

const GUIDE_BASE = 'https://northlanderguide.com';

/** Toronto Union -> Cochrane, in route order. */
export const STOPS = [
  { id: 'union',        name: 'Toronto Union',      region: 'Toronto',                hook: "Canada's grandest railway hall, where your journey north begins.", lat: 43.6453, lng: -79.3806, offsetMinutes:   0, image: 'images/northlander-toronto-union.jpeg' },
  { id: 'langstaff',    name: 'Langstaff',           region: 'Richmond Hill',          hook: 'A kettle-lake boardwalk and a century-old observatory.',           lat: 43.8400, lng: -79.4280, offsetMinutes:  35, image: 'images/northlander-langstaff.jpeg' },
  { id: 'gormley',      name: 'Gormley',             region: 'Whitchurch-Stouffville', hook: 'Pick-your-own orchards on the rim of the Oak Ridges Moraine.',     lat: 43.9460, lng: -79.3650, offsetMinutes:  50, image: 'images/northlander-gormley.jpeg' },
  { id: 'washago',      name: 'Washago',             region: 'Gateway to Muskoka',     hook: 'Where two rivers meet, the doorstep of cottage country.',           lat: 44.7350, lng: -79.3450, offsetMinutes: 120, image: 'images/northlander-washago.jpeg' },
  { id: 'gravenhurst',  name: 'Gravenhurst',         region: 'Muskoka',                hook: "Home of North America's oldest working steamship.",                lat: 44.9170, lng: -79.3700, offsetMinutes: 145, image: 'images/northlander-gravenhurst.jpeg' },
  { id: 'bracebridge',  name: 'Bracebridge',         region: 'Muskoka',                hook: 'A town built around an illuminated waterfall.',                     lat: 45.0400, lng: -79.3100, offsetMinutes: 170, image: 'images/northlander-bracebridge.jpeg' },
  { id: 'huntsville',   name: 'Huntsville',          region: 'Muskoka',                hook: '100-plus Group of Seven murals, and the gateway to Algonquin.',     lat: 45.3270, lng: -79.2160, offsetMinutes: 205, image: 'images/northlander-huntsville.jpeg' },
  { id: 'southriver',   name: 'South River',         region: 'Almaguin Highlands',     hook: "The quiet back door into Algonquin's wild west side.",              lat: 45.8370, lng: -79.3800, offsetMinutes: 260, image: 'images/northlander-south-river.jpeg' },
  { id: 'temagami',     name: 'Temagami',            region: 'Lake Temagami',          hook: 'Paddle beneath 400-year-old red and white pines.',                   lat: 47.0640, lng: -79.7900, offsetMinutes: 360, image: 'images/northlander-temagami.jpeg' },
  { id: 'northbay',     name: 'North Bay',           region: 'Lake Nipissing',         hook: 'A carousel, a beach and a heritage train on Lake Nipissing.',       lat: 46.3090, lng: -79.4610, offsetMinutes: 405, image: 'images/northlander-north-bay.jpeg' },
  { id: 'temiskaming',  name: 'Temiskaming Shores',  region: 'New Liskeard',           hook: 'Northern dairy country beneath a 100-metre cliff.',                  lat: 47.5090, lng: -79.6770, offsetMinutes: 480, image: 'images/northlander-temiskaming-shores.jpeg' },
  { id: 'englehart',    name: 'Englehart',           region: 'Timiskaming District',   hook: 'A town the railway itself built, gorge falls nearby.',               lat: 47.8210, lng: -79.8680, offsetMinutes: 515, image: 'images/northlander-englehart.jpeg' },
  { id: 'kirklandlake', name: 'Kirkland Lake',       region: 'Swastika stop',          hook: 'The town that gold built, and a hockey legend factory.',             lat: 48.1470, lng: -80.0370, offsetMinutes: 550, image: 'images/northlander-kirkland-lake.jpeg' },
  { id: 'matheson',     name: 'Matheson',            region: 'Black River-Matheson',   hook: '22 spring-fed kettle lakes and the coach north to Cochrane.',        lat: 48.5340, lng: -80.4640, offsetMinutes: 595, image: 'images/northlander-matheson.jpeg' },
  { id: 'timmins',      name: 'Timmins-Porcupine',   region: 'Timmins',                hook: 'Descend a real gold mine at the northern end of the line.',          lat: 48.4758, lng: -81.3305, offsetMinutes: 640, image: 'images/northlander-timmins-porcupine.jpeg' },
  { id: 'cochrane',     name: 'Cochrane',            region: 'Polar Bear Express link',hook: 'Meet polar bears, then ride the rails to James Bay.',                lat: 49.0660, lng: -81.0150, offsetMinutes: 680, image: 'images/northlander-cochrane.jpeg' }
];

/** Quick lookup by id. */
const BY_ID = Object.fromEntries(STOPS.map((s) => [s.id, s]));

export function getStop(id) {
  return BY_ID[id] || null;
}

/** Resolve an array of stop ids to full stops, keeping the input order. */
export function getStopsByIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => BY_ID[id]).filter(Boolean);
}

/** Stable position of a stop along the route (0 = Toronto Union,
    15 = Cochrane). Used to keep selected stops sorted in route
    order regardless of selection order. */
export function routeIndex(id) {
  return STOPS.findIndex((s) => s.id === id);
}

/** Absolute URL for a stop's hero image, served by the Guide so the
    app doesn't have to ship them. */
export function stopImageUrl(stop) {
  if (!stop || !stop.image) return '';
  return `${GUIDE_BASE}/${stop.image.replace(/^\//, '')}`;
}

/** Link back to the stop's editorial guide on northlanderguide.com. */
export function stopGuideUrl(stop) {
  if (!stop) return GUIDE_BASE;
  return `${GUIDE_BASE}/stops/${stop.id}`;
}
