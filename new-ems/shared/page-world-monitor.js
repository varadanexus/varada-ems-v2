import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import {
  INTELLIGENCE_LAYERS,
  INTELLIGENCE_LENSES,
  LAND_POLYGONS,
  PANEL_CATALOG,
  REFERENCE_POINTS,
  layerById,
  lensById
} from "./intelligence/catalog.js?v=commercial-intelligence-1";
import { cacheAgeLabel, captureLeadToEms, loadCountryProfile, loadCountryTravelAdvisory, loadIntelligenceFeeds, loadLocationAirQuality, loadLocationWeather, loadMobilityFeeds, sourceCatalog } from "./intelligence/feeds.js?v=commercial-intelligence-1";

const PREFS_KEY = "nexus_intelligence_native_v1";
const PREFS_SCHEMA = 9;
const MIGRATED_DEFAULT_LAYERS = Object.freeze(["business-opportunities", "stock-exchanges", "live-aircraft", "live-vessels", "air-quality", "sanctions", "day-night", "service-status", "travel-advisories"]);
// Market-first focus: the map layers and operational panels shown by default. Every other
// module stays fully built but minimised (hidden) until revealed via the "More modules" toggle.
const MARKET_DEFAULT_LAYERS = Object.freeze(["business-opportunities", "stock-exchanges", "reporting", "day-night"]);
const MARKET_FIRST_PANELS = Object.freeze(["leads", "priority", "commercial-opportunities", "exchange-hours", "predictions", "macro-risk", "global-reporting", "official-wire"]);
const marketFirstPanelOrder = () => [...MARKET_FIRST_PANELS, ...PANEL_CATALOG.map((panel) => panel.id).filter((id) => !MARKET_FIRST_PANELS.includes(id))];
const minimizedPanelSet = () => new Set(PANEL_CATALOG.map((panel) => panel.id).filter((id) => !MARKET_FIRST_PANELS.includes(id)));
const SEVERITY = ["Reference", "Routine", "Elevated", "High", "Critical"];
const TIME_WINDOWS = Object.freeze({ "1h": 60 * 60_000, "6h": 6 * 60 * 60_000, "24h": 24 * 60 * 60_000, "48h": 48 * 60 * 60_000, "7d": 7 * 24 * 60 * 60_000, all: Infinity });
const REGION_PRESETS = Object.freeze({
  global: { label: "Global", latitude: 0, longitude: 0, zoom: 1 },
  americas: { label: "Americas", latitude: 18, longitude: -85, zoom: 1.8 },
  europe: { label: "Europe", latitude: 51, longitude: 15, zoom: 2.5 },
  mena: { label: "MENA", latitude: 27, longitude: 42, zoom: 2.4 },
  asia: { label: "Asia", latitude: 28, longitude: 98, zoom: 1.9 },
  africa: { label: "Africa", latitude: 2, longitude: 20, zoom: 2 },
  oceania: { label: "Oceania", latitude: -24, longitude: 135, zoom: 2.1 }
});
const STRATEGIC_THEATERS = Object.freeze([
  { id: "baltic", label: "Baltic", latitude: 57, longitude: 22, zoom: 4.2, bounds: [10, 32, 53, 62] },
  { id: "black-sea", label: "Black Sea", latitude: 44, longitude: 34, zoom: 4.4, bounds: [25, 43, 39, 49] },
  { id: "eastern-med", label: "Eastern Mediterranean", latitude: 34, longitude: 30, zoom: 4.0, bounds: [17, 40, 27, 39] },
  { id: "red-sea", label: "Red Sea", latitude: 20, longitude: 40, zoom: 4.0, bounds: [31, 50, 10, 31] },
  { id: "persian-gulf", label: "Persian Gulf", latitude: 26, longitude: 52, zoom: 5.0, bounds: [45, 58, 22, 31] },
  { id: "south-china-sea", label: "South China Sea", latitude: 13, longitude: 114, zoom: 3.8, bounds: [103, 123, 2, 24] },
  { id: "taiwan-strait", label: "Taiwan Strait", latitude: 24, longitude: 120, zoom: 5.6, bounds: [116, 124, 20, 28] },
  { id: "korean-peninsula", label: "Korean Peninsula", latitude: 38, longitude: 127, zoom: 5.0, bounds: [123, 132, 32, 44] },
  { id: "sahel", label: "Sahel", latitude: 15, longitude: 2, zoom: 2.8, bounds: [-18, 35, 8, 22] }
]);

const state = {
  lens: "full",
  enabledLayers: new Set(MARKET_DEFAULT_LAYERS),
  events: [],
  selected: null,
  query: "",
  timeRange: "7d",
  region: "global",
  mapMode: "globe",
  sourceState: {},
  feeds: {},
  weather: null,
  weatherLocation: null,
  selectedCountry: null,
  countryWeather: null,
  countryWeatherLoading: false,
  countryAirQuality: null,
  countryAirQualityLoading: false,
  countryProfile: null,
  countryProfileLoading: false,
  countryProfileError: "",
  countryTravelAdvisory: null,
  countryTravelAdvisoryLoading: false,
  countryTravelAdvisoryError: "",
  countryCoordinates: {},
  watchlist: new Set(),
  monitors: [],
  panelOrder: marketFirstPanelOrder(),
  hiddenPanels: minimizedPanelSet(),
  snapshots: [],
  routeOrigin: "port-mumbai",
  routeDestination: "port-rotterdam",
  scenario: "conflict",
  officialSourceFilter: "all",
  lastUpdated: 0,
  refreshing: false,
  mobilityRefreshing: false,
  worker: null,
  map: null
};

async function loadNaturalEarthBasemap() {
  const response = await fetch("/new-ems/assets/data/natural-earth-countries-110m.geojson?v=natural-earth-countries-110m-1", { cache: "force-cache" });
  if (!response.ok) throw new Error(`Basemap HTTP ${response.status}`);
  const collection = await response.json();
  return (collection.features || []).flatMap((feature) => {
    const geometry = feature.geometry || {};
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    if (!polygons.length) return [];
    const properties = feature.properties || {};
    return [{
      name: String(properties.ADMIN || properties.NAME || "Unknown"),
      shortName: String(properties.NAME || properties.ADMIN || "Unknown"),
      iso: String(properties.ADM0_A3 || properties.ISO_A3 || ""),
      iso2: String(properties.ISO_A2 || properties.WB_A2 || "").toUpperCase(),
      labelLongitude: Number(properties.LABEL_X),
      labelLatitude: Number(properties.LABEL_Y),
      labelRank: Number(properties.LABELRANK || properties.SCALERANK || 6),
      formalName: String(properties.FORMAL_EN || properties.NAME_LONG || properties.ADMIN || ""),
      region: String(properties.REGION_WB || properties.REGION_UN || properties.CONTINENT || ""),
      subregion: String(properties.SUBREGION || ""),
      incomeGroup: String(properties.INCOME_GRP || "").replace(/^\d+\.\s*/, ""),
      economyGroup: String(properties.ECONOMY || "").replace(/^\d+\.\s*/, ""),
      populationEstimate: Number(properties.POP_EST),
      populationYear: Number(properties.POP_YEAR),
      polygons
    }];
  });
}

async function loadEarthTexture() {
  const image = new Image();
  image.decoding = "async";
  image.src = "/new-ems/assets/data/nasa-blue-marble-2004-12.jpg?v=nasa-bmng-2004-12-1";
  await image.decode();
  return image;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function solarEphemeris(date = new Date()) {
  const radians = Math.PI / 180;
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const daysSinceJ2000 = julianDay - 2_451_545;
  const meanLongitude = (280.46 + .9856474 * daysSinceJ2000) * radians;
  const meanAnomaly = (357.528 + .9856003 * daysSinceJ2000) * radians;
  const eclipticLongitude = meanLongitude + 1.915 * radians * Math.sin(meanAnomaly) + .02 * radians * Math.sin(2 * meanAnomaly);
  const obliquity = (23.439 - .0000004 * daysSinceJ2000) * radians;
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const greenwichSidereal = (280.46061837 + 360.98564736629 * daysSinceJ2000) * radians;
  const subsolarLongitude = Math.atan2(Math.sin(rightAscension - greenwichSidereal), Math.cos(rightAscension - greenwichSidereal));
  return { declination, subsolarLongitude };
}

function solarIllumination(latitude, longitude, solar) {
  const dot = Math.sin(latitude) * Math.sin(solar.declination) + Math.cos(latitude) * Math.cos(solar.declination) * Math.cos(longitude - solar.subsolarLongitude);
  return clamp((dot + .08) / .18, 0, 1);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function relativeTime(timestamp) {
  if (!timestamp) return "Current";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (saved?.lens && INTELLIGENCE_LENSES[saved.lens]) state.lens = saved.lens;
    if (Array.isArray(saved?.layers)) {
      const allowed = new Set(INTELLIGENCE_LAYERS.map((layer) => layer.id));
      state.enabledLayers = new Set(saved.layers.filter((id) => allowed.has(id)));
      if (Number(saved.schema || 0) < PREFS_SCHEMA) {
        const lensDefaults = new Set(lensById(state.lens).layers);
        MIGRATED_DEFAULT_LAYERS.filter((id) => lensDefaults.has(id)).forEach((id) => state.enabledLayers.add(id));
      }
    }
    if (Array.isArray(saved?.watchlist)) state.watchlist = new Set(saved.watchlist.map(String));
    if (TIME_WINDOWS[saved?.timeRange] != null) state.timeRange = saved.timeRange;
    if (REGION_PRESETS[saved?.region]) state.region = saved.region;
    if (["globe", "flat"].includes(saved?.mapMode)) state.mapMode = saved.mapMode;
    if (Array.isArray(saved?.monitors)) state.monitors = saved.monitors.map(String).filter(Boolean).slice(0, 20);
    if (Array.isArray(saved?.panelOrder)) {
      const allowedPanels = new Set(PANEL_CATALOG.map((panel) => panel.id));
      state.panelOrder = [...saved.panelOrder.filter((id) => allowedPanels.has(id)), ...PANEL_CATALOG.map((panel) => panel.id).filter((id) => !saved.panelOrder.includes(id))];
    }
    if (Array.isArray(saved?.hiddenPanels)) state.hiddenPanels = new Set(saved.hiddenPanels.map(String));
    if (Number(saved?.schema || 0) < PREFS_SCHEMA) {
      // One-time pivot to the market-first workspace: reposition panels and minimise the rest.
      state.panelOrder = marketFirstPanelOrder();
      state.hiddenPanels = minimizedPanelSet();
      MARKET_DEFAULT_LAYERS.forEach((id) => state.enabledLayers.add(id));
    }
    if (Array.isArray(saved?.snapshots)) state.snapshots = saved.snapshots.filter((snapshot) => snapshot?.savedAt > Date.now() - 7 * 24 * 60 * 60_000).slice(-72);
    if (REFERENCE_POINTS.some((point) => point.id === saved?.routeOrigin && point.layer === "maritime")) state.routeOrigin = saved.routeOrigin;
    if (REFERENCE_POINTS.some((point) => point.id === saved?.routeDestination && point.layer === "maritime")) state.routeDestination = saved.routeDestination;
    if (["conflict", "weather", "cyber", "energy"].includes(saved?.scenario)) state.scenario = saved.scenario;
  } catch {
    // Device-local preferences are optional.
  }
}

function savePreferences() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ schema: PREFS_SCHEMA, lens: state.lens, layers: [...state.enabledLayers], watchlist: [...state.watchlist], timeRange: state.timeRange, region: state.region, mapMode: state.mapMode, monitors: state.monitors, panelOrder: state.panelOrder, hiddenPanels: [...state.hiddenPanels], snapshots: state.snapshots, routeOrigin: state.routeOrigin, routeDestination: state.routeDestination, scenario: state.scenario }));
  } catch {
    // Device-local preferences are optional.
  }
}

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const lens = params.get("lens");
  const time = params.get("time");
  const region = params.get("region");
  const mode = params.get("mode");
  if (lens && INTELLIGENCE_LENSES[lens]) state.lens = lens;
  if (time && TIME_WINDOWS[time] != null) state.timeRange = time;
  if (region && REGION_PRESETS[region]) state.region = region;
  if (["globe", "flat"].includes(mode)) state.mapMode = mode;
  const layers = params.get("layers")?.split(",").filter(Boolean);
  if (layers?.length) {
    const allowed = new Set(INTELLIGENCE_LAYERS.map((layer) => layer.id));
    state.enabledLayers = new Set(layers.filter((id) => allowed.has(id)));
  }
}

function syncUrlState() {
  const params = new URLSearchParams(location.search);
  params.set("lens", state.lens);
  params.set("time", state.timeRange);
  params.set("region", state.region);
  params.set("mode", state.mapMode);
  params.set("layers", [...state.enabledLayers].join(","));
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
}

class NexusMap {
  constructor(canvas, onSelect, onCountrySelect) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.onSelect = onSelect;
    this.onCountrySelect = onCountrySelect;
    this.points = [];
    this.countries = [{ name: "World", shortName: "World", iso: "", labelRank: 99, polygons: LAND_POLYGONS.map((ring) => [ring]) }];
    this.countryRisk = new Map();
    this.earthTexture = null;
    this.texturePixels = null;
    this.textureCanvas = document.createElement("canvas");
    this.textureCacheKey = "";
    this.dayNightCanvas = document.createElement("canvas");
    this.dayNightCacheKey = "";
    this.screenPoints = [];
    this.width = 1;
    this.height = 1;
    this.zoom = 1;
    this.mode = state.mapMode;
    this.panX = 0;
    this.panY = 0;
    this.drag = null;
    this.lastPickAt = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.bind();
    this.resize();
  }

  bind() {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY, moved: false };
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      this.panX = this.drag.panX + dx;
      this.panY = this.drag.panY + dy;
      this.constrainPan();
      this.draw();
    });
    const finish = (event) => {
      if (!this.drag) return;
      const moved = this.drag.moved;
      this.drag = null;
      if (!moved) {
        this.lastPickAt = Date.now();
        this.pick(event.offsetX, event.offsetY);
      }
    };
    this.canvas.addEventListener("pointerup", finish);
    this.canvas.addEventListener("pointercancel", () => { this.drag = null; });
    this.canvas.addEventListener("click", (event) => {
      if (Date.now() - this.lastPickAt < 120) return;
      this.lastPickAt = Date.now();
      this.pick(event.offsetX, event.offsetY);
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const previous = this.zoom;
      this.zoom = clamp(this.zoom * (event.deltaY > 0 ? 0.88 : 1.14), 1, 8);
      const ratio = this.zoom / previous;
      this.panX = event.offsetX - (event.offsetX - this.panX) * ratio;
      this.panY = event.offsetY - (event.offsetY - this.panY) * ratio;
      this.constrainPan();
      this.draw();
    }, { passive: false });
  }

  resize() {
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, Math.round(bounds.width));
    this.height = Math.max(300, Math.round(bounds.height));
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  setPoints(points) {
    this.points = points;
    this.countryRisk = this.buildCountryRisk(points);
    this.draw();
  }

  setCountries(countries) {
    if (Array.isArray(countries) && countries.length) this.countries = countries;
    this.textureCacheKey = "";
    this.draw();
  }

  setEarthTexture(image) {
    const source = document.createElement("canvas");
    source.width = 1440;
    source.height = 720;
    const sourceContext = source.getContext("2d", { alpha: false, willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0, source.width, source.height);
    this.earthTexture = image;
    this.texturePixels = sourceContext.getImageData(0, 0, source.width, source.height);
    this.textureCacheKey = "";
    this.draw();
  }

  buildCountryRisk(points) {
    const aliases = { "united states": "united states of america", usa: "united states of america", uk: "united kingdom", russia: "russia", "russian federation": "russia", korea: "south korea", "south korea": "south korea", "north korea": "north korea", "czech republic": "czechia", "democratic republic of the congo": "democratic republic of the congo", congo: "democratic republic of the congo" };
    const risk = new Map();
    points.forEach((point) => {
      if (!point.country || (point.layer === "conflicts" && point.geoBasis === "publisher") || !["conflicts", "disaster-alerts", "wildfires", "storms", "floods", "earthquakes", "volcanoes"].includes(point.layer)) return;
      const raw = String(point.country).split(/[\/;,]/)[0].trim().toLowerCase();
      const key = aliases[raw] || raw;
      const current = risk.get(key) || { severity: 0, count: 0 };
      current.severity = Math.max(current.severity, Number(point.severity || 1));
      current.count += 1;
      risk.set(key, current);
    });
    risk.forEach((value) => {
      if (value.count >= 4) value.severity = 4;
      else if (value.count >= 2) value.severity = Math.max(3, value.severity);
    });
    return risk;
  }

  reset() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.draw();
  }

  setMode(mode) {
    this.mode = mode === "flat" ? "flat" : "globe";
    this.reset();
  }

  focusRegion(preset) {
    if (!preset) return;
    this.zoom = preset.zoom;
    if (this.mode === "globe") {
      this.panX = -preset.longitude / 360 * this.width * this.zoom;
      this.panY = preset.latitude / 180 * this.height * this.zoom;
    } else {
      this.panX = -preset.longitude / 360 * this.width * this.zoom;
      this.panY = preset.latitude / 180 * this.height * this.zoom;
    }
    this.constrainPan();
    this.draw();
  }

  focus(point) {
    if (!Number.isFinite(point?.longitude) || !Number.isFinite(point?.latitude)) return;
    this.zoom = Math.max(this.zoom, 2.4);
    this.panX = -point.longitude / 360 * this.width * this.zoom;
    this.panY = point.latitude / 180 * this.height * this.zoom;
    this.constrainPan();
    this.draw();
  }

  constrainPan() {
    if (this.mode === "globe") {
      this.panX = clamp(this.panX, -this.width * this.zoom / 2, this.width * this.zoom / 2);
      this.panY = clamp(this.panY, -this.height * this.zoom * .42, this.height * this.zoom * .42);
      return;
    }
    const extraX = this.width * (this.zoom - 1) / 2;
    const extraY = this.height * (this.zoom - 1) / 2;
    this.panX = clamp(this.panX, -extraX, extraX);
    this.panY = clamp(this.panY, -extraY, extraY);
  }

  project(longitude, latitude, panX = this.panX, panY = this.panY) {
    if (this.mode === "globe") {
      const radians = Math.PI / 180;
      const centerLongitude = -panX / (this.width * this.zoom) * 360;
      const centerLatitude = clamp(panY / (this.height * this.zoom) * 180, -75, 75);
      const lambda = (longitude - centerLongitude) * radians;
      const phi = latitude * radians;
      const phi0 = centerLatitude * radians;
      const cosPhi = Math.cos(phi);
      const visibility = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(lambda);
      const radius = Math.min(this.width, this.height) * .43 * this.zoom;
      return {
        x: this.width / 2 + radius * cosPhi * Math.sin(lambda),
        y: this.height / 2 - radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(lambda)),
        visible: visibility >= 0
      };
    }
    const worldWidth = this.width * this.zoom;
    const worldHeight = this.height * this.zoom;
    return {
      x: ((longitude + 180) / 360) * worldWidth + (this.width - worldWidth) / 2 + panX,
      y: ((90 - latitude) / 180) * worldHeight + (this.height - worldHeight) / 2 + panY,
      visible: true
    };
  }

  unproject(x, y) {
    if (this.mode === "flat") {
      const worldWidth = this.width * this.zoom;
      const worldHeight = this.height * this.zoom;
      return {
        longitude: ((x - (this.width - worldWidth) / 2 - this.panX) / worldWidth) * 360 - 180,
        latitude: 90 - ((y - (this.height - worldHeight) / 2 - this.panY) / worldHeight) * 180
      };
    }
    const radius = Math.min(this.width, this.height) * .43 * this.zoom;
    const horizontal = (x - this.width / 2) / radius;
    const up = (this.height / 2 - y) / radius;
    const rho = Math.hypot(horizontal, up);
    if (rho > 1) return null;
    const radians = Math.PI / 180;
    const centerLongitude = -this.panX / (this.width * this.zoom) * 360;
    const centerLatitude = clamp(this.panY / (this.height * this.zoom) * 180, -75, 75);
    const phi0 = centerLatitude * radians;
    if (rho < .000001) return { longitude: centerLongitude, latitude: centerLatitude };
    const c = Math.asin(rho);
    const latitude = Math.asin(Math.cos(c) * Math.sin(phi0) + (up * Math.sin(c) * Math.cos(phi0)) / rho);
    const longitude = centerLongitude * radians + Math.atan2(horizontal * Math.sin(c), rho * Math.cos(phi0) * Math.cos(c) - up * Math.sin(phi0) * Math.sin(c));
    return { longitude: ((longitude / radians + 540) % 360) - 180, latitude: latitude / radians };
  }

  ringContains(ring, longitude, latitude) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = Number(ring[i][0]);
      const bx = Number(ring[j][0]);
      const ay = Number(ring[i][1]);
      const by = Number(ring[j][1]);
      if (((ay > latitude) !== (by > latitude)) && longitude < ((bx - ax) * (latitude - ay)) / ((by - ay) || Number.EPSILON) + ax) inside = !inside;
    }
    return inside;
  }

  countryAt(longitude, latitude) {
    return this.countries.find((country) => country.polygons.some((polygon) => this.ringContains(polygon[0] || [], longitude, latitude) && !(polygon.slice(1).some((hole) => this.ringContains(hole, longitude, latitude))))) || null;
  }

  pick(x, y) {
    let nearest = null;
    let distance = 18;
    this.screenPoints.forEach((candidate) => {
      const delta = Math.hypot(candidate.x - x, candidate.y - y);
      if (delta < distance) { distance = delta; nearest = candidate.point; }
    });
    if (nearest?.clusterPoints?.length) {
      const longitude = nearest.clusterPoints.reduce((sum, point) => sum + point.longitude, 0) / nearest.clusterPoints.length;
      const latitude = nearest.clusterPoints.reduce((sum, point) => sum + point.latitude, 0) / nearest.clusterPoints.length;
      this.zoom = clamp(this.zoom * 1.65, 1, 8);
      this.focus({ longitude, latitude });
    } else if (nearest) this.onSelect(nearest);
    else {
      const coordinate = this.unproject(x, y);
      const country = coordinate ? this.countryAt(coordinate.longitude, coordinate.latitude) : null;
      if (country && country.name !== "World") this.onCountrySelect?.(country);
    }
  }

  draw() {
    const context = this.context;
    if (!context) return;
    context.fillStyle = this.mode === "globe" ? "#000012" : "#1a1b1d";
    context.fillRect(0, 0, this.width, this.height);
    if (this.mode === "globe") {
      const radius = Math.min(this.width, this.height) * .43 * this.zoom;
      context.save();
      context.beginPath(); context.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2); context.clip();
      if (!this.drawEarthTexture(context, radius)) {
        const globe = context.createRadialGradient(this.width * .42, this.height * .35, radius * .05, this.width / 2, this.height / 2, radius);
        globe.addColorStop(0, "#15344a"); globe.addColorStop(.65, "#071b2c"); globe.addColorStop(1, "#02070d");
        context.fillStyle = globe; context.fillRect(0, 0, this.width, this.height);
      }
    }
    if (this.mode === "flat") this.drawGrid(context);
    this.drawCountries(context);
    if (this.mode === "flat") this.drawCountryLabels(context);
    if (this.mode === "flat") this.drawDayNightFlat(context);
    this.drawPoints(context);
    if (this.mode === "globe") {
      context.restore();
      const radius = Math.min(this.width, this.height) * .43 * this.zoom;
      const atmosphere = context.createRadialGradient(this.width / 2, this.height / 2, radius * .94, this.width / 2, this.height / 2, radius * 1.055);
      atmosphere.addColorStop(0, "rgba(30,130,220,0)"); atmosphere.addColorStop(.72, "rgba(35,145,255,.16)"); atmosphere.addColorStop(1, "rgba(22,110,255,0)");
      context.fillStyle = atmosphere; context.beginPath(); context.arc(this.width / 2, this.height / 2, radius * 1.06, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2); context.strokeStyle = "rgba(70,170,255,.38)"; context.lineWidth = 1.5; context.stroke();
    }
  }

  drawEarthTexture(context, radius) {
    if (!this.texturePixels) return false;
    const centerLongitude = -this.panX / (this.width * this.zoom) * 360;
    const centerLatitude = clamp(this.panY / (this.height * this.zoom) * 180, -75, 75);
    const size = Math.min(480, Math.max(256, Math.round(radius * 1.55)));
    const dayNightEnabled = state.enabledLayers.has("day-night");
    const solarMinute = dayNightEnabled ? Math.floor(Date.now() / 60_000) : 0;
    const solar = dayNightEnabled ? solarEphemeris() : null;
    const cacheKey = `${size}:${centerLongitude.toFixed(1)}:${centerLatitude.toFixed(1)}:${dayNightEnabled}:${solarMinute}`;
    if (cacheKey !== this.textureCacheKey) {
      this.textureCanvas.width = size;
      this.textureCanvas.height = size;
      const textureContext = this.textureCanvas.getContext("2d", { alpha: true });
      const output = textureContext.createImageData(size, size);
      const source = this.texturePixels;
      const sourceData = source.data;
      const phi0 = centerLatitude * Math.PI / 180;
      const lambda0 = centerLongitude * Math.PI / 180;
      const sinPhi0 = Math.sin(phi0);
      const cosPhi0 = Math.cos(phi0);
      for (let y = 0; y < size; y += 1) {
        const down = ((y + .5) / size) * 2 - 1;
        const up = -down;
        for (let x = 0; x < size; x += 1) {
          const horizontal = ((x + .5) / size) * 2 - 1;
          const rho2 = horizontal * horizontal + up * up;
          if (rho2 > 1) continue;
          const rho = Math.sqrt(rho2);
          const c = Math.asin(Math.min(1, rho));
          const sinC = Math.sin(c);
          const cosC = Math.cos(c);
          const latitude = rho < .00001 ? phi0 : Math.asin(cosC * sinPhi0 + (up * sinC * cosPhi0) / rho);
          const longitude = rho < .00001 ? lambda0 : lambda0 + Math.atan2(horizontal * sinC, rho * cosPhi0 * cosC - up * sinPhi0 * sinC);
          const normalizedLongitude = ((longitude / (Math.PI * 2) + .5) % 1 + 1) % 1;
          const normalizedLatitude = clamp(.5 - latitude / Math.PI, 0, 1);
          const sourceX = Math.min(source.width - 1, Math.floor(normalizedLongitude * source.width));
          const sourceY = Math.min(source.height - 1, Math.floor(normalizedLatitude * source.height));
          const sourceIndex = (sourceY * source.width + sourceX) * 4;
          const outputIndex = (y * size + x) * 4;
          const depth = Math.sqrt(Math.max(0, 1 - rho2));
          const daylight = solar ? solarIllumination(latitude, longitude, solar) : null;
          const illumination = solar
            ? (.09 + .91 * daylight) * (.55 + .45 * depth)
            : .18 + .64 * clamp(depth * .84 - horizontal * .24 - down * .12, 0, 1);
          output.data[outputIndex] = sourceData[sourceIndex] * illumination * .72;
          output.data[outputIndex + 1] = sourceData[sourceIndex + 1] * illumination * .84;
          output.data[outputIndex + 2] = Math.min(255, sourceData[sourceIndex + 2] * illumination * 1.08);
          output.data[outputIndex + 3] = 255;
        }
      }
      textureContext.putImageData(output, 0, 0);
      this.textureCacheKey = cacheKey;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(this.textureCanvas, this.width / 2 - radius, this.height / 2 - radius, radius * 2, radius * 2);
    return true;
  }

  drawDayNightFlat(context) {
    if (!state.enabledLayers.has("day-night")) return;
    const minute = Math.floor(Date.now() / 60_000);
    if (this.dayNightCacheKey !== String(minute)) {
      const width = 360;
      const height = 180;
      this.dayNightCanvas.width = width;
      this.dayNightCanvas.height = height;
      const mask = this.dayNightCanvas.getContext("2d", { alpha: true });
      const image = mask.createImageData(width, height);
      const solar = solarEphemeris();
      for (let y = 0; y < height; y += 1) {
        const latitude = (90 - (y + .5)) * Math.PI / 180;
        for (let x = 0; x < width; x += 1) {
          const longitude = ((x + .5) - 180) * Math.PI / 180;
          const daylight = solarIllumination(latitude, longitude, solar);
          const index = (y * width + x) * 4;
          image.data[index] = 0;
          image.data[index + 1] = 4;
          image.data[index + 2] = 14;
          image.data[index + 3] = Math.round(178 * (1 - daylight));
        }
      }
      mask.putImageData(image, 0, 0);
      this.dayNightCacheKey = String(minute);
    }
    const worldWidth = this.width * this.zoom;
    const worldHeight = this.height * this.zoom;
    const left = (this.width - worldWidth) / 2 + this.panX;
    const top = (this.height - worldHeight) / 2 + this.panY;
    context.imageSmoothingEnabled = true;
    context.drawImage(this.dayNightCanvas, left, top, worldWidth, worldHeight);
  }

  drawGrid(context) {
    context.lineWidth = 1;
    context.strokeStyle = "rgba(100, 151, 183, .12)";
    for (let longitude = -150; longitude <= 180; longitude += 30) {
      context.beginPath(); let drawing = false;
      for (let latitude = -85; latitude <= 85; latitude += 5) {
        const point = this.project(longitude, latitude);
        if (!point.visible) { drawing = false; continue; }
        if (!drawing) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        drawing = true;
      }
      context.stroke();
    }
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      context.beginPath(); let drawing = false;
      for (let longitude = -180; longitude <= 180; longitude += 5) {
        const point = this.project(longitude, latitude);
        if (!point.visible) { drawing = false; continue; }
        if (!drawing) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        drawing = true;
      }
      context.stroke();
    }
  }

  countryRiskFor(country) {
    const names = [country.name, country.shortName].map((name) => String(name || "").toLowerCase());
    return names.map((name) => this.countryRisk.get(name)).find(Boolean) || null;
  }

  traceCountry(context, country) {
    context.beginPath();
    let hasVisibleGeometry = false;
    country.polygons.forEach((polygon) => polygon.forEach((ring) => {
      let drawing = false;
      ring.forEach(([longitude, latitude]) => {
        const point = this.project(longitude, latitude);
        if (!point.visible) { drawing = false; return; }
        if (!drawing) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        drawing = true;
        hasVisibleGeometry = true;
      });
      if (this.mode === "flat" && drawing) context.closePath();
    }));
    return hasVisibleGeometry;
  }

  drawCountries(context) {
    this.countries.forEach((country) => {
      if (!this.traceCountry(context, country)) return;
      const risk = this.countryRiskFor(country);
      const selected = state.selectedCountry?.name === country.name;
      if (this.mode === "flat") {
        context.fillStyle = risk?.severity >= 4 ? "rgba(174, 11, 17, .78)" : risk?.severity >= 3 ? "rgba(123, 48, 9, .78)" : risk?.severity >= 2 ? "rgba(114, 89, 12, .62)" : "#07090b";
        context.fill("evenodd");
        context.strokeStyle = risk ? (risk.severity >= 4 ? "rgba(255,48,56,.96)" : "rgba(224,115,36,.86)") : "rgba(72,77,82,.68)";
        context.lineWidth = risk ? 1.05 : .55;
      } else {
        if (risk) {
          context.fillStyle = risk.severity >= 4 ? "rgba(196, 18, 28, .42)" : risk.severity >= 3 ? "rgba(183, 63, 16, .34)" : "rgba(205, 151, 24, .28)";
          context.fill("evenodd");
        }
        context.strokeStyle = risk ? (risk.severity >= 4 ? "rgba(255,50,65,.95)" : "rgba(255,137,42,.86)") : "rgba(175,214,230,.16)";
        context.lineWidth = risk ? 1.2 : .45;
      }
      if (selected) {
        context.fillStyle = "rgba(69, 222, 210, .16)";
        context.fill("evenodd");
        context.strokeStyle = "#79fff1";
        context.lineWidth = 2;
      }
      context.stroke();
    });
  }

  drawCountryLabels(context) {
    const boxes = [];
    const maximumRank = this.zoom < 1.35 ? 3 : this.zoom < 2.2 ? 5 : 7;
    const fontSize = clamp(6.5 + this.zoom * 1.25, 7.5, 12);
    context.font = `500 ${fontSize}px ui-monospace, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    this.countries.filter((country) => country.labelRank <= maximumRank && Number.isFinite(country.labelLongitude) && Number.isFinite(country.labelLatitude)).sort((a, b) => a.labelRank - b.labelRank).forEach((country) => {
      const point = this.project(country.labelLongitude, country.labelLatitude);
      if (point.x < 20 || point.y < 12 || point.x > this.width - 20 || point.y > this.height - 12) return;
      const label = String(country.shortName || country.name).toUpperCase();
      const width = context.measureText(label).width + 5;
      const box = { left: point.x - width / 2, right: point.x + width / 2, top: point.y - fontSize / 2, bottom: point.y + fontSize / 2 };
      if (boxes.some((existing) => box.left < existing.right && box.right > existing.left && box.top < existing.bottom && box.bottom > existing.top)) return;
      boxes.push(box);
      const risk = this.countryRiskFor(country);
      context.fillStyle = risk ? "rgba(245,213,183,.88)" : "rgba(144,149,153,.50)";
      context.fillText(label, point.x, point.y);
    });
  }

  drawPoints(context) {
    this.screenPoints = [];
    const selectedId = state.selected?.id;
    const projected = this.points.flatMap((point) => {
      if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return [];
      const position = this.project(point.longitude, point.latitude);
      if (!position.visible || position.x < -20 || position.y < -20 || position.x > this.width + 20 || position.y > this.height + 20) return [];
      return [{ point, position }];
    });
    const groups = new Map();
    const gridSize = this.zoom < 1.6 ? 42 : this.zoom < 2.7 ? 32 : 0;
    projected.forEach((entry) => {
      const key = gridSize ? `${Math.round(entry.position.x / gridSize)}:${Math.round(entry.position.y / gridSize)}` : entry.point.id;
      groups.set(key, [...(groups.get(key) || []), entry]);
    });
    groups.forEach((entries) => {
      const point = entries.sort((a, b) => Number(b.point.severity || 0) - Number(a.point.severity || 0))[0].point;
      const position = { x: entries.reduce((sum, item) => sum + item.position.x, 0) / entries.length, y: entries.reduce((sum, item) => sum + item.position.y, 0) / entries.length };
      const layer = layerById(point.layer);
      const radius = entries.length > 1 ? clamp(8 + Math.log2(entries.length) * 2, 9, 20) : clamp(3 + Number(point.severity || 1) * 1.25 + (point.magnitude || 0) * 0.22, 4, 13);
      context.beginPath();
      context.arc(position.x, position.y, point.id === selectedId ? radius + 5 : radius, 0, Math.PI * 2);
      context.fillStyle = point.id === selectedId ? "rgba(255,255,255,.26)" : `${layer?.color || "#e8c66a"}33`;
      context.fill();
      context.beginPath();
      context.arc(position.x, position.y, radius * 0.55, 0, Math.PI * 2);
      context.fillStyle = layer?.color || "#e8c66a";
      context.fill();
      if (entries.length > 1) {
        context.fillStyle = "#effbff"; context.font = "700 9px ui-monospace, monospace"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(String(entries.length), position.x, position.y);
      }
      if (point.severity >= 4) {
        context.strokeStyle = layer?.color || "#e8c66a";
        context.lineWidth = 1;
        context.beginPath(); context.arc(position.x, position.y, radius + 3, 0, Math.PI * 2); context.stroke();
      }
      this.screenPoints.push({ x: position.x, y: position.y, point: entries.length > 1 ? { ...point, clusterPoints: entries.map((entry) => entry.point) } : point });
    });
  }
}

function renderShell() {
  const lensOptions = Object.entries(INTELLIGENCE_LENSES).map(([id, lens]) => `<option value="${id}"${id === state.lens ? " selected" : ""}>${escapeHtml(lens.label)}</option>`).join("");
  renderModuleContent(`
    <main class="nx-intel" id="nexusIntelligenceApp">
      <header class="nx-commandbar">
        <div class="nx-brand"><span class="nx-brand-mark">N</span><span><strong>NEXUS INTELLIGENCE</strong><small>Varada internal situational awareness</small></span></div>
        <label class="nx-lens"><span>Lens</span><select id="nxLens">${lensOptions}</select></label>
        <label class="nx-search"><span aria-hidden="true">⌕</span><input id="nxSearch" type="search" placeholder="Filter live signals…" autocomplete="off" /></label>
        <button class="nx-button" id="nxRefresh" type="button">Refresh feeds</button>
        <button class="nx-button" id="nxSources" type="button">Sources</button>
        <a class="nx-button" href="${ROUTES.DASHBOARD}">Command Center</a>
      </header>
      <section class="nx-healthbar" aria-label="Intelligence health">
        <span class="nx-live-dot"></span><strong id="nxHealth">Starting native intelligence engine</strong>
        <span id="nxUpdated">Preparing public feeds</span>
        <span class="nx-health-spacer"></span>
        <span id="nxCounts">0 active signals</span>
      </section>
      <nav class="nx-viewbar" aria-label="Map view controls">
        <div class="nx-region-presets" id="nxRegionPresets">${Object.entries(REGION_PRESETS).map(([id, preset]) => `<button type="button" data-region="${id}"${state.region === id ? ' aria-pressed="true"' : ""}>${escapeHtml(preset.label)}</button>`).join("")}</div>
        <label><span>Window</span><select id="nxTimeRange">${Object.keys(TIME_WINDOWS).map((id) => `<option value="${id}"${state.timeRange === id ? " selected" : ""}>${id === "all" ? "All retained" : id}</option>`).join("")}</select></label>
        <button class="nx-button" id="nxMapMode" type="button">${state.mapMode === "globe" ? "Flat map" : "3D globe"}</button>
        <button class="nx-button" id="nxShareView" type="button">Copy view</button>
      </nav>
      <section class="nx-workspace">
        <aside class="nx-layers" aria-label="Map layers">
          <div class="nx-pane-head"><span>Layers</span><button id="nxAllLayers" type="button">Lens defaults</button></div>
          <div id="nxLayerList"></div>
        </aside>
        <section class="nx-map-wrap" aria-label="Interactive global intelligence map">
          <canvas id="nxMap" tabindex="0" aria-label="World map. Drag to pan, use the mouse wheel to zoom, and select a signal for details."></canvas>
          <div class="nx-map-tools">
            <button id="nxZoomIn" type="button" aria-label="Zoom in">+</button>
            <button id="nxZoomOut" type="button" aria-label="Zoom out">−</button>
            <button id="nxResetMap" type="button" aria-label="Reset map">⌂</button>
          </div>
          <div class="nx-map-caption"><span id="nxLensCaption">${escapeHtml(lensById(state.lens).description)}</span><span>NASA Blue Marble · Natural Earth · drag · wheel to zoom</span></div>
        </section>
        <aside class="nx-stream" aria-label="Priority intelligence stream">
          <div class="nx-pane-head"><span>Priority stream</span><span id="nxStreamCount">0</span></div>
          <div id="nxStreamList" class="nx-stream-list"></div>
        </aside>
      </section>
      <section class="nx-panel-toolbar">
        <div><strong>Operational panels</strong><span id="nxPanelSummary">Live, cached and reference intelligence</span></div>
        <div class="nx-panel-actions"><button class="nx-button" id="nxExportCsv" type="button">CSV</button><button class="nx-button" id="nxExportJson" type="button">JSON</button><button class="nx-button" id="nxMorePanels" type="button">More modules</button><button class="nx-button" id="nxPanelSettings" type="button">Panels</button><button class="nx-button" id="nxCollapsePanels" type="button">Compact view</button></div>
      </section>
      <section class="nx-panels" id="nxPanels"></section>
      <aside class="nx-detail" id="nxDetail" hidden aria-live="polite"></aside>
      <aside class="nx-country-detail" id="nxCountryDetail" hidden aria-live="polite"></aside>
      <div class="nx-modal-backdrop" id="nxSourceModal" hidden>
        <section class="nx-modal" role="dialog" aria-modal="true" aria-labelledby="nxSourceTitle">
          <header><div><strong id="nxSourceTitle">Public data sources</strong><small>Independent feeds with source-by-source health and caching.</small></div><button id="nxCloseSources" type="button" aria-label="Close">×</button></header>
          <div id="nxSourceList" class="nx-source-list"></div>
        </section>
      </div>
      <div class="nx-modal-backdrop" id="nxPanelModal" hidden>
        <section class="nx-modal" role="dialog" aria-modal="true" aria-labelledby="nxPanelModalTitle">
          <header><div><strong id="nxPanelModalTitle">Panel visibility</strong><small>Choose panels; drag visible panel headers to reorder them.</small></div><button id="nxClosePanels" type="button" aria-label="Close">×</button></header>
          <div id="nxPanelChoices" class="nx-panel-choices"></div>
        </section>
      </div>
      <div class="nx-modal-backdrop" id="nxLayerModal" hidden>
        <section class="nx-modal nx-layer-modal" role="dialog" aria-modal="true" aria-labelledby="nxLayerModalTitle">
          <header><div><strong id="nxLayerModalTitle">Layer details</strong><small id="nxLayerModalSource"></small></div><button id="nxCloseLayerInfo" type="button" aria-label="Close layer details">×</button></header>
          <div id="nxLayerModalBody" class="nx-layer-info"></div>
        </section>
      </div>
    </main>
  `);
}

function renderLayers() {
  const container = document.querySelector("#nxLayerList");
  const groups = Map.groupBy ? Map.groupBy(INTELLIGENCE_LAYERS, (layer) => layer.group) : INTELLIGENCE_LAYERS.reduce((map, layer) => map.set(layer.group, [...(map.get(layer.group) || []), layer]), new Map());
  container.innerHTML = [...groups].map(([group, layers]) => `
    <section class="nx-layer-group"><h3>${escapeHtml(group)}</h3>${layers.map((layer) => `
      <div class="nx-layer-item"><label class="nx-layer-row">
        <input type="checkbox" value="${layer.id}" ${state.enabledLayers.has(layer.id) ? "checked" : ""} />
        <span class="nx-layer-swatch" style="--layer:${layer.color}">${layer.icon}</span>
        <span><strong>${escapeHtml(layer.label)}</strong><small>${escapeHtml(layer.source)}${layer.live ? " · live" : ""}</small></span>
      </label><button type="button" data-layer-info="${layer.id}" aria-label="About ${escapeHtml(layer.label)}">i</button></div>`).join("")}
    </section>`).join("");
}

function showLayerInfo(layerId) {
  const layer = layerById(layerId);
  if (!layer) return;
  const purposes = {
    "Natural hazards": "Shows observed or reported natural hazards for rapid geographic screening.",
    "Weather and climate": "Shows active weather, climate, or environmental conditions that may affect operations.",
    Environment: "Shows source-attributed environmental observations or modelled exposure context for operational screening.",
    Security: "Provides security and strategic context; markers do not by themselves confirm hostile activity.",
    Mobility: "Supports aviation, maritime, rail, and logistics exposure screening.",
    Infrastructure: "Maps publicly documented strategic infrastructure and operational dependencies.",
    Economy: "Maps major exchange infrastructure and indicative regular-session context without implying live prices or licensed market status."
  };
  document.querySelector("#nxLayerModalTitle").textContent = layer.label;
  document.querySelector("#nxLayerModalSource").textContent = `${layer.group} · ${layer.source}`;
  document.querySelector("#nxLayerModalBody").innerHTML = `<dl><div><dt>Purpose</dt><dd>${escapeHtml(layer.derived ? "Shows the current solar day/night boundary for geographic and operational time context." : purposes[layer.group] || "Provides geographic context for this intelligence domain.")}</dd></div><div><dt>Provider</dt><dd>${escapeHtml(layer.source)}</dd></div><div><dt>Freshness</dt><dd>${layer.derived ? "Calculated locally from UTC and refreshed once per minute; no network request is required." : layer.live ? "Refreshed from the public source with source-specific caching." : "Versioned reference context maintained with the EMS module."}</dd></div><div><dt>Confidence</dt><dd>${layer.derived ? "Astronomical visualization suitable for situational context; not a precision observatory product." : layer.live ? "Source-reported; validate critical items through the linked primary record." : "Reference location only; it does not indicate a live incident."}</dd></div><div><dt>Limitations</dt><dd>${layer.derived ? "Uses an approximate solar ephemeris and a visually smoothed civil-twilight band; terrain and atmospheric refraction are not modelled." : layer.live ? "Coverage, latency and classification depend on the upstream public dataset." : "Publicly documented locations are intentionally selective and may not be exhaustive."}</dd></div></dl>`;
  document.querySelector("#nxLayerModal").hidden = false;
}

function visibleEvents() {
  const query = state.query.toLowerCase();
  const windowMs = TIME_WINDOWS[state.timeRange] ?? TIME_WINDOWS["7d"];
  const cutoff = Date.now() - windowMs;
  return [...state.events, ...REFERENCE_POINTS]
    .filter((event) => state.enabledLayers.has(event.layer))
    .filter((event) => event.retainedReference || !Number.isFinite(windowMs) || !event.timestamp || event.timestamp >= cutoff)
    .filter((event) => !query || `${event.title} ${event.detail || ""} ${event.country || ""} ${event.source || ""}`.toLowerCase().includes(query));
}

function renderHealth() {
  const backgroundSources = sourceCatalog().filter((source) => !source.onDemand);
  const backgroundIds = new Set(backgroundSources.map((source) => source.id));
  const sourceStates = Object.values(state.sourceState).filter((source) => backgroundIds.has(source.key));
  const available = sourceStates.filter((source) => source.data).length;
  const total = backgroundSources.length;
  const stale = sourceStates.filter((source) => source.stale && source.data).length;
  const failed = sourceStates.filter((source) => !source.data).length;
  document.querySelector("#nxHealth").textContent = state.refreshing
    ? "Refreshing independent public feeds"
    : failed === total ? "Offline · showing reference and cached intelligence"
      : `${available}/${total} public feeds operational${stale ? ` · ${stale} cached` : ""}`;
  document.querySelector("#nxUpdated").textContent = state.lastUpdated ? `Updated ${relativeTime(state.lastUpdated)}` : "Awaiting first refresh";
  const visible = visibleEvents();
  const signals = visible.filter((event) => !event.structural && !event.observation).length;
  const tracks = visible.filter((event) => ["live-aircraft", "live-vessels"].includes(event.layer)).length;
  const airCells = visible.filter((event) => event.layer === "air-quality").length;
  document.querySelector("#nxCounts").textContent = `${signals} active signals${tracks ? ` · ${tracks} live tracks` : ""}${airCells ? ` · ${airCells} AQ cells` : ""}`;
  document.querySelector("#nxRefresh").disabled = state.refreshing;
  document.querySelector("#nxRefresh").textContent = state.refreshing ? "Refreshing…" : "Refresh feeds";
}

function severityBadge(event) {
  if (event.structural) return `<span class="nx-severity nx-reference">Reference</span>`;
  return `<span class="nx-severity nx-s${clamp(Number(event.severity || 0), 0, 4)}">${SEVERITY[clamp(Number(event.severity || 0), 0, 4)]}</span>`;
}

function eventRow(event, compact = false) {
  const layer = layerById(event.layer);
  const monitored = state.monitors.some((term) => `${event.title} ${event.detail || ""}`.toLowerCase().includes(term.toLowerCase()));
  return `<button class="nx-event-row${compact ? " nx-event-compact" : ""}" type="button" data-event-id="${escapeHtml(event.id)}"${state.watchlist.has(event.id) ? ' data-watched="true"' : ""}${monitored ? ' data-monitored="true"' : ""}>
    <span class="nx-event-symbol" style="--event:${layer?.color || "#e8c66a"}">${escapeHtml(layer?.icon || "IN")}</span>
    <span class="nx-event-copy"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.source || layer?.source || "Nexus")} · ${event.structural ? "reference context" : relativeTime(event.timestamp)}</small></span>
    ${severityBadge(event)}
  </button>`;
}

function renderStream() {
  const stream = visibleEvents().filter((event) => !event.structural && !event.observation).sort((a, b) => (b.severity - a.severity) || ((b.timestamp || 0) - (a.timestamp || 0))).slice(0, 60);
  document.querySelector("#nxStreamCount").textContent = stream.length;
  document.querySelector("#nxStreamList").innerHTML = stream.length
    ? stream.map((event) => eventRow(event, true)).join("")
    : `<div class="nx-empty"><strong>No matching signals</strong><span>Enable more layers or clear the search filter.</span></div>`;
}

function listPanelEvents(filter, limit = 8) {
  const rows = state.events.filter(filter).slice(0, limit);
  return rows.length ? rows.map((event) => eventRow(event)).join("") : `<div class="nx-empty"><strong>No active items</strong><span>The source may be quiet, unavailable, or refreshing.</span></div>`;
}

function marketPanel() {
  const crypto = state.feeds.crypto?.data || {};
  const rates = state.feeds.currencies?.data?.rates || {};
  const metric = (label, value, detail = "") => `<div class="nx-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
  return `<div class="nx-metric-grid">
    ${metric("Bitcoin", crypto.bitcoin?.usd ? `$${Number(crypto.bitcoin.usd).toLocaleString()}` : "Unavailable", crypto.bitcoin?.usd_24h_change != null ? `${crypto.bitcoin.usd_24h_change.toFixed(2)}% / 24h` : "")}
    ${metric("Ethereum", crypto.ethereum?.usd ? `$${Number(crypto.ethereum.usd).toLocaleString()}` : "Unavailable", crypto.ethereum?.usd_24h_change != null ? `${crypto.ethereum.usd_24h_change.toFixed(2)}% / 24h` : "")}
    ${metric("USD / INR", rates.INR ? Number(rates.INR).toFixed(3) : "Unavailable", "ECB reference")}
    ${metric("USD / EUR", rates.EUR ? Number(rates.EUR).toFixed(3) : "Unavailable", "ECB reference")}
  </div>`;
}

function commercialOpportunityPanel() {
  const rows = state.events
    .filter((event) => event.layer === "business-opportunities")
    .sort((a, b) => (Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0)) || ((b.timestamp || 0) - (a.timestamp || 0)));
  if (!rows.length) return `<div class="nx-empty"><strong>No current commercial leads</strong><span>The discovery feed may be quiet, unavailable, or refreshing. Existing risk and market feeds remain active.</span></div>`;
  const countries = new Set(rows.map((event) => event.country).filter(Boolean)).size;
  const industries = new Set(rows.flatMap((event) => event.industries || [])).size;
  const highScore = rows.filter((event) => Number(event.opportunityScore || 0) >= 70).length;
  return `<div class="nx-metric-grid">
    <div class="nx-metric"><span>Current leads</span><strong>${rows.length}</strong><small>last 48 hours</small></div>
    <div class="nx-metric"><span>High potential</span><strong>${highScore}</strong><small>score 70+</small></div>
    <div class="nx-metric"><span>Countries</span><strong>${countries}</strong><small>headline-located</small></div>
    <div class="nx-metric"><span>Industries</span><strong>${industries}</strong><small>classified locally</small></div>
  </div><div class="nx-commercial-list">${rows.slice(0, 14).map((event) => `<div class="nx-commercial-lead"><div><span>${escapeHtml(event.commercialType || "Commercial lead")}</span><b>${Number(event.opportunityScore || 0)}/100 opportunity</b></div>${eventRow(event)}<small>${escapeHtml((event.industries || []).join(", ") || "Cross-industry")} · ${Number(event.confidence || 0)}% confidence · ${escapeHtml(event.evidenceLevel || "Discovery lead")}</small></div>`).join("")}</div><p class="nx-panel-disclaimer">Discovery leads are derived from linked public reporting. Open and verify the original publication before committing capital, bidding, trading, or contacting a counterparty.</p>`;
}

// Deterministic market-session lead: is a major exchange about to open/close (within 45 min)?
// Computed locally from the exchange time zone — genuinely live, no external feed, no AI.
function exchangeLeadStatus(exchange, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: exchange.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const toMinutes = (value) => { const [hours, minutes] = String(value || "00:00").split(":").map(Number); return hours * 60 + minutes; };
  const local = Number(parts.hour) * 60 + Number(parts.minute);
  const weekdays = exchange.weekdays || [1, 2, 3, 4, 5];
  const openM = toMinutes(exchange.open);
  const closeM = toMinutes(exchange.close);
  const trading = weekdays.includes(day);
  const open = trading && local >= openM && local < closeM;
  const WINDOW = 45;
  let phase = open ? "open" : "closed";
  let minutes = 0;
  let event = "";
  if (trading && Math.abs(local - closeM) <= WINDOW) { phase = "closing"; minutes = closeM - local; event = "close"; }
  else if (trading && Math.abs(local - openM) <= WINDOW) { phase = "opening"; minutes = openM - local; event = "open"; }
  return { phase, minutes, event, open, localTime: `${parts.hour}:${parts.minute}` };
}

function leadsPanel() {
  const now = new Date();
  const exchanges = REFERENCE_POINTS.filter((point) => point.layer === "stock-exchanges");
  const sessionLeads = exchanges.map((exchange) => ({ exchange, status: exchangeLeadStatus(exchange, now) }))
    .filter(({ status }) => status.phase === "opening" || status.phase === "closing")
    .sort((left, right) => Math.abs(left.status.minutes) - Math.abs(right.status.minutes)).slice(0, 8);
  const opportunities = state.events
    .filter((event) => event.layer === "business-opportunities")
    .sort((left, right) => (Number(right.leadScore ?? right.opportunityScore ?? 0) - Number(left.leadScore ?? left.opportunityScore ?? 0)) || ((right.timestamp || 0) - (left.timestamp || 0)))
    .slice(0, 12);
  const openingNow = sessionLeads.filter(({ status }) => status.phase === "opening").length;
  const closingNow = sessionLeads.filter(({ status }) => status.phase === "closing").length;
  const phrase = (status) => status.minutes > 0 ? `${status.event}s in ${status.minutes}m` : `${status.event}ed ${Math.abs(status.minutes)}m ago`;
  const sessionHtml = sessionLeads.length
    ? sessionLeads.map(({ exchange, status }) => `<button type="button" data-event-id="${escapeHtml(exchange.id)}" data-lead-phase="${status.phase}"><b>${escapeHtml(exchange.code)}</b><span><strong>${escapeHtml(exchange.title)}</strong><small>${escapeHtml(exchange.country)} · ${escapeHtml(phrase(status))} · ${escapeHtml(status.localTime)} local</small></span><em data-phase="${status.phase}">${status.phase === "opening" ? "Opening" : "Closing"}</em></button>`).join("")
    : `<div class="nx-empty"><strong>No market opening or closing right now</strong><span>Session leads fire within 45 minutes of a major exchange opening or closing.</span></div>`;
  const scoreTier = (value) => value >= 75 ? "high" : value >= 60 ? "mid" : "low";
  const oppHtml = opportunities.length
    ? opportunities.map((event) => `<div class="nx-lead-opp"><button type="button" class="nx-lead-open" data-event-id="${escapeHtml(event.id)}"><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.tradeCategory || "Trade opportunity")} · ${escapeHtml(event.country || "—")} · ${escapeHtml((event.indiaReasons || []).slice(0, 2).join("; ") || "curated for India")}</small></span><em class="nx-lead-score" data-tier="${scoreTier(Number(event.leadScore || 0))}">${Number(event.leadScore ?? event.opportunityScore ?? 0)}</em></button><button type="button" class="nx-lead-capture" data-capture-lead="${escapeHtml(event.id)}" title="Send this lead to the EMS workflow">＋ EMS</button></div>`).join("")
    : `<div class="nx-empty"><strong>No curated opportunities yet</strong><span>The discovery feed may be quiet, unavailable, or refreshing.</span></div>`;
  return `<div class="nx-leads">
    <header><div><span>Opening</span><strong>${openingNow}</strong></div><div><span>Closing</span><strong>${closingNow}</strong></div><div><span>Curated leads</span><strong>${opportunities.length}</strong></div></header>
    <section><strong>Market session windows</strong><div class="nx-lead-sessions">${sessionHtml}</div></section>
    <section><strong>Curated opportunities · India fit</strong><div class="nx-lead-opps">${oppHtml}</div></section>
    <p class="nx-panel-disclaimer">Session windows are computed locally from exchange time zones (regular sessions only; excludes holidays, auctions and special sessions). Opportunity leads are unverified discovery signals ranked by a transparent India-relevance heuristic — open and verify the original publication before acting.</p>
  </div>`;
}

function exchangeClock(exchange, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: exchange.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const toMinutes = (value) => {
    const [hours, minutes] = String(value || "00:00").split(":").map(Number);
    return hours * 60 + minutes;
  };
  const localMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekdays = exchange.weekdays || [1, 2, 3, 4, 5];
  return {
    open: weekdays.includes(day) && localMinutes >= toMinutes(exchange.open) && localMinutes < toMinutes(exchange.close),
    localTime: `${parts.hour}:${parts.minute}`
  };
}

function exchangeHoursPanel() {
  const rows = REFERENCE_POINTS.filter((point) => point.layer === "stock-exchanges").map((exchange) => ({ exchange, clock: exchangeClock(exchange) })).sort((a, b) => Number(b.clock.open) - Number(a.clock.open) || a.exchange.code.localeCompare(b.exchange.code));
  return `<div class="nx-exchange-list">${rows.map(({ exchange, clock }) => `<button type="button" data-event-id="${escapeHtml(exchange.id)}"><b>${escapeHtml(exchange.code)}</b><span><strong>${escapeHtml(exchange.title)}</strong><small>${escapeHtml(exchange.country)} · ${clock.localTime} local</small></span><em data-open="${clock.open}">${clock.open ? "Open" : "Closed"}</em></button>`).join("")}<small>Indicative regular-session status calculated locally from the exchange time zone. Excludes holidays, auctions, lunch breaks and special sessions; it is not a licensed market-status or price feed.</small></div>`;
}

function macroSparkline(history) {
  const values = (history || []).map((item) => Number(item.value)).filter(Number.isFinite);
  if (values.length < 2) return "";
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1) * 100).toFixed(1)},${(26 - ((value - minimum) / range * 22)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 100 30" role="img" aria-label="Recent observation trend"><polyline points="${points}"></polyline></svg>`;
}

function macroRiskPanel() {
  const data = state.feeds.macroRisk?.data;
  const rows = Array.isArray(data?.series) ? data.series : [];
  if (!rows.length) return `<div class="nx-empty"><strong>Macro observations unavailable</strong><span>The cached public FRED connector will retry on the next source refresh.</span></div>`;
  const formatted = (item) => {
    if (!Number.isFinite(Number(item.value))) return "Unavailable";
    const value = Number(item.value).toLocaleString(undefined, { minimumFractionDigits: Number(item.decimals || 0), maximumFractionDigits: Number(item.decimals || 3) });
    return item.unit === "USD/bbl" ? `$${value}` : item.unit === "%" ? `${value}%` : item.unit === "pp" ? `${value} pp` : value;
  };
  return `<div class="nx-macro-grid">${rows.map((item) => {
    const change = Number(item.change);
    const changeText = Number.isFinite(change) ? `${change > 0 ? "+" : ""}${change.toFixed(Number(item.decimals || 2))} ${escapeHtml(item.unit || "")}` : "No comparison";
    const url = safeExternalUrl(item.url);
    return `<article><header><span>${escapeHtml(item.id)}</span><small>${escapeHtml(item.date || "No date")}</small></header><strong>${escapeHtml(formatted(item))}</strong><p>${escapeHtml(item.label)}</p>${macroSparkline(item.history)}<footer><span data-direction="${change > 0 ? "up" : change < 0 ? "down" : "flat"}">${escapeHtml(changeText)}</span>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Series</a>` : ""}</footer></article>`;
  }).join("")}<small>${escapeHtml(data.disclaimer || "Latest published observations; frequencies and release dates differ. Values are not live market quotes.")}</small></div>`;
}

function officialWirePanel() {
  const data = state.feeds.officialWire?.data;
  const items = Array.isArray(data?.items) ? data.items : [];
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const filter = state.officialSourceFilter === "all" || sources.some((source) => source.id === state.officialSourceFilter) ? state.officialSourceFilter : "all";
  const rows = items.filter((item) => filter === "all" || item.sourceId === filter).slice(0, 24);
  if (!items.length) return `<div class="nx-empty"><strong>Official wire unavailable</strong><span>The isolated RSS/Atom connector will retry on the next refresh.</span></div>`;
  return `<div class="nx-wire"><nav aria-label="Official source filter"><button type="button" data-official-source="all" aria-pressed="${filter === "all"}">All ${items.length}</button>${sources.map((source) => `<button type="button" data-official-source="${escapeHtml(source.id)}" aria-pressed="${filter === source.id}" data-health="${source.ok ? "ok" : "down"}" title="${escapeHtml(source.ok ? `${source.count || 0} retained items` : `Unavailable: ${source.error || "upstream feed error"}`)}">${escapeHtml(source.label)} ${source.count || 0}</button>`).join("")}</nav><div>${rows.length ? rows.map((item) => {
    const url = safeExternalUrl(item.url);
    return `<article><header><span>${escapeHtml(item.source)}</span><time>${item.timestamp ? relativeTime(item.timestamp) : "Undated"}</time></header><strong>${escapeHtml(item.title)}</strong>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open official source</a>` : ""}</article>`;
  }).join("") : `<div class="nx-empty"><strong>No retained items</strong><span>This official source returned no current headline item.</span></div>`}</div><footer><span>${sources.filter((source) => source.ok).length}/${sources.length} publishers available${sources.some((source) => !source.ok) ? ` · unavailable: ${escapeHtml(sources.filter((source) => !source.ok).map((source) => source.label).join(", "))}` : ""}</span><small>${escapeHtml(data.disclaimer || "Open the linked official source for the authoritative record.")}</small></footer></div>`;
}

function serviceStatusPanel() {
  const data = state.feeds.serviceStatus?.data;
  const providers = Array.isArray(data?.providers) ? data.providers : [];
  const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
  if (!providers.length) return `<div class="nx-empty"><strong>Official platform status unavailable</strong><span>The isolated EMS connector will retry on the next source refresh.</span></div>`;
  const active = incidents.filter((incident) => incident.active);
  const available = providers.filter((provider) => provider.available).length;
  const statusClass = (indicator) => ["none", "operational"].includes(String(indicator || "").toLowerCase()) ? "ok" : ["unknown"].includes(String(indicator || "").toLowerCase()) ? "unknown" : "degraded";
  return `<div class="nx-service-status"><header><div><strong>${available}/${providers.length}</strong><span>official providers reachable</span></div><div><strong>${active.length}</strong><span>active incidents</span></div></header><div class="nx-service-providers">${providers.map((provider) => {
    const url = safeExternalUrl(provider.url);
    const degraded = Array.isArray(provider.components) ? provider.components.length : 0;
    const body = `<i data-status="${statusClass(provider.indicator)}"></i><span><strong>${escapeHtml(provider.label)}</strong><small>${escapeHtml(provider.description || (provider.available ? "Status available" : "Endpoint unavailable"))}${degraded ? ` · ${degraded} degraded components` : ""}</small></span><em>${provider.available ? escapeHtml(String(provider.indicator || "none").replace(/_/g, " ")) : "unavailable"}</em>`;
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<div>${body}</div>`;
  }).join("")}</div><section><strong>Current and recent incidents</strong>${incidents.length ? incidents.slice(0, 12).map((incident) => {
    const url = safeExternalUrl(incident.url);
    const when = Date.parse(incident.updatedAt || incident.startedAt || "");
    const body = `<span><b>${escapeHtml(incident.provider)}</b><strong>${escapeHtml(incident.title)}</strong><small>${escapeHtml(incident.status || "reported")} · ${Number.isFinite(when) ? relativeTime(when) : "official status"}${incident.components?.length ? ` · ${escapeHtml(incident.components.slice(0, 3).join(", "))}` : ""}</small></span><em data-active="${Boolean(incident.active)}">${incident.active ? "Active" : "Resolved"}</em>`;
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${body}</a>` : `<div>${body}</div>`;
  }).join("") : `<p>No current or recently resolved incident was returned by the available official endpoints.</p>`}</section><footer>${escapeHtml(data.disclaimer || "Provider-reported status; confirm local business impact with EMS telemetry.")}</footer></div>`;
}

function travelAdvisoryPanel() {
  const country = state.selectedCountry;
  if (!country) return `<div class="nx-empty"><strong>Select a country on the map</strong><span>The EMS will request that destination's latest official FCDO advisory on demand.</span></div>`;
  if (state.countryTravelAdvisoryLoading) return `<div class="nx-empty"><strong>Loading ${escapeHtml(country.shortName || country.name)} advice…</strong><span>Requesting the current official destination publication.</span></div>`;
  if (state.countryTravelAdvisoryError) return `<div class="nx-empty"><strong>Official advice unavailable</strong><span>${escapeHtml(state.countryTravelAdvisoryError)}</span></div>`;
  const advisory = state.countryTravelAdvisory;
  if (!advisory?.available) return `<div class="nx-empty"><strong>No matching foreign-travel document</strong><span>${escapeHtml(advisory?.reason || "The source did not publish a matching destination record.")}</span></div>`;
  const sourceUrl = safeExternalUrl(advisory.sourceUrl);
  const updated = Date.parse(advisory.updatedAt || "");
  const alerts = Array.isArray(advisory.alerts) ? advisory.alerts : [];
  return `<div class="nx-travel-advisory" data-severity="${Number(advisory.severity || 1)}"><header><span>UK FCDO · ${escapeHtml(advisory.country || country.name)}</span><strong>${escapeHtml(advisory.level || "Official destination advice")}</strong><small>${Number.isFinite(updated) ? `Updated ${relativeTime(updated)}` : "Official publication date unavailable"}</small></header>${alerts.length ? `<div class="nx-advisory-tags">${alerts.map((item) => `<span>${escapeHtml(String(item).replace(/_/g, " "))}</span>`).join("")}</div>` : ""}${advisory.latestChange ? `<section><b>Latest change</b><p>${escapeHtml(advisory.latestChange)}</p></section>` : ""}${advisory.warning ? `<section><b>Warnings and insurance</b><p>${escapeHtml(advisory.warning)}</p></section>` : ""}${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open the official destination advice</a>` : ""}<footer>${escapeHtml(advisory.disclaimer || "Official national travel advice; verify applicability for your nationality and circumstances.")}</footer></div>`;
}

function predictionPanel() {
  const raw = Array.isArray(state.feeds.predictions?.data) ? state.feeds.predictions.data : [];
  const strategic = /\b(war|conflict|ceasefire|invasion|military|missile|nuclear|sanction|tariff|trade|shipping|strait|election|president|prime minister|congress|government|fed|interest rate|inflation|gdp|recession|oil|gas|gold|bitcoin|ethereum|crypto|climate|temperature|hurricane|earthquake|artificial intelligence|openai|china|russia|ukraine|iran|israel|palestine|india|pakistan|united states|u\.s\.|european union|nato)\b/i;
  const sports = /\b(atp|wta|lol|dota|esports|bo[135]|game [0-9]|vs\.?|tournament|cup qualifier)\b/i;
  const parseArray = (value) => {
    if (Array.isArray(value)) return value;
    try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  };
  const compactUsd = new Intl.NumberFormat("en", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const rows = raw.filter((market) => strategic.test(`${market.question || ""} ${market.category || ""}`) && !sports.test(`${market.question || ""} ${market.category || ""}`)).flatMap((market) => {
    const outcomes = parseArray(market.outcomes);
    const prices = parseArray(market.outcomePrices).map(Number);
    const finiteIndexes = prices.map((price, index) => Number.isFinite(price) ? index : -1).filter((index) => index >= 0);
    if (!market.question || !finiteIndexes.length) return [];
    const yesIndex = outcomes.findIndex((outcome) => String(outcome).toLowerCase() === "yes");
    const selectedIndex = yesIndex >= 0 && Number.isFinite(prices[yesIndex]) ? yesIndex : finiteIndexes.reduce((best, index) => prices[index] > prices[best] ? index : best, finiteIndexes[0]);
    const probability = clamp(prices[selectedIndex] * 100, 0, 100);
    const outcome = outcomes[selectedIndex] || "Leading outcome";
    const dayChange = Number(market.oneDayPriceChange) * 100;
    const slug = market.events?.[0]?.slug || market.slug || "";
    const url = safeExternalUrl(slug ? `https://polymarket.com/event/${slug}` : "");
    return [{ market, probability, outcome, dayChange, url }];
  }).slice(0, 12);
  if (!rows.length) return `<div class="nx-empty"><strong>Prediction data unavailable</strong><span>Public market probabilities will appear after the next feed refresh.</span></div>`;
  return `<div class="nx-prediction-list">${rows.map(({ market, probability, outcome, dayChange, url }) => `
    <article class="nx-prediction">
      <div class="nx-prediction-head"><${url ? `a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"` : "span"}>${escapeHtml(market.question)}</${url ? "a" : "span"}><strong>${probability.toFixed(probability >= 10 ? 0 : 1)}%</strong></div>
      <div class="nx-probability"><i style="--probability:${probability.toFixed(2)}%"></i></div>
      <div class="nx-prediction-meta"><span>${escapeHtml(outcome)}</span><span>24h ${Number.isFinite(dayChange) ? `${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(1)} pts` : "—"}</span><span>Vol ${compactUsd.format(Number(market.volume24hr || 0))}</span><span>Liq ${compactUsd.format(Number(market.liquidityNum || market.liquidity || 0))}</span></div>
    </article>`).join("")}<small>Market-implied estimates, not verified forecasts. Read-only intelligence; EMS does not place trades or hold funds.</small></div>`;
}

function aviationPanel() {
  const live = state.events.filter((event) => event.layer === "aviation-weather").slice(0, 10);
  const reference = REFERENCE_POINTS.filter((point) => point.layer === "aviation").slice(0, Math.max(0, 10 - live.length));
  return [...live, ...reference].map((event) => eventRow(event)).join("") || `<div class="nx-empty"><strong>Aviation data unavailable</strong><span>Hub references and current METAR conditions will appear after refresh.</span></div>`;
}

function liveAircraftPanel() {
  const rows = state.events.filter((event) => event.layer === "live-aircraft").sort((left, right) => Number(right.groundSpeed || 0) - Number(left.groundSpeed || 0));
  const airborne = rows.filter((item) => item.altitude !== "ground").length;
  const identified = rows.filter((item) => item.callsign || item.registration).length;
  if (!rows.length) return `<div class="nx-empty"><strong>No current military ADS-B positions</strong><span>The community receiver network may be quiet, unavailable, or refreshing.</span></div>`;
  return `<div class="nx-live-tracks"><header><div><span>Current positions</span><strong>${rows.length}</strong></div><div><span>Airborne</span><strong>${airborne}</strong></div><div><span>Identified</span><strong>${identified}</strong></div></header><div>${rows.slice(0, 30).map((item) => `<button type="button" data-event-id="${escapeHtml(item.id)}"><b>✈</b><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.aircraftType || "Type unavailable")} · ${item.altitude === "ground" ? "ground" : Number.isFinite(Number(item.altitude)) ? `${Number(item.altitude).toLocaleString()} ft` : "alt —"}</small></span><em>${Number.isFinite(Number(item.groundSpeed)) ? `${Math.round(Number(item.groundSpeed))} kt` : "—"}</em></button>`).join("")}</div><footer>Global military-registration screen from community ADS-B reception. Classification, identity, position and availability may be incomplete or inaccurate; presence does not imply intent. ADSB.lol data is ODbL 1.0.</footer></div>`;
}

function maritimePanel() {
  const live = state.events.filter((event) => event.layer === "maritime-conditions").slice(0, 8);
  const reference = REFERENCE_POINTS.filter((point) => point.layer === "maritime").slice(0, Math.max(0, 8 - live.length));
  return [...live, ...reference].map((event) => eventRow(event)).join("") || `<div class="nx-empty"><strong>Maritime data unavailable</strong><span>Strategic port references and modeled marine conditions will appear after refresh.</span></div>`;
}

function liveVesselPanel() {
  const rows = state.events.filter((event) => event.layer === "live-vessels").sort((left, right) => Number(right.speedOverGround || 0) - Number(left.speedOverGround || 0));
  const moving = rows.filter((item) => Number(item.speedOverGround) >= .5).length;
  const commercial = rows.filter((item) => ["Cargo", "Tanker", "Passenger"].includes(item.vesselType)).length;
  if (!rows.length) return `<div class="nx-empty"><strong>No recent open AIS positions</strong><span>Fintraffic coverage may be quiet, unavailable, or refreshing.</span></div>`;
  return `<div class="nx-live-tracks"><header><div><span>Recent positions</span><strong>${rows.length}</strong></div><div><span>Underway</span><strong>${moving}</strong></div><div><span>Commercial</span><strong>${commercial}</strong></div></header><div>${rows.slice(0, 30).map((item) => `<button type="button" data-event-id="${escapeHtml(item.id)}"><b>◆</b><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.vesselType || "Type unavailable")}${item.destination ? ` · ${escapeHtml(item.destination)}` : ""}</small></span><em>${Number.isFinite(Number(item.speedOverGround)) ? `${Number(item.speedOverGround).toFixed(1)} kt` : "—"}</em></button>`).join("")}</div><footer>Finnish and adjacent Baltic Class A AIS coverage. Source: Fintraffic / Digitraffic.fi, CC BY 4.0; normalized and capped by Varada Nexus. Not global satellite AIS.</footer></div>`;
}

function airQualityPanel() {
  const rows = state.events.filter((event) => event.layer === "air-quality").sort((left, right) => Number(right.usAqi ?? right.europeanAqi ?? 0) - Number(left.usAqi ?? left.europeanAqi ?? 0));
  const elevated = rows.filter((item) => Number(item.usAqi) > 100 || Number(item.europeanAqi) > 60).length;
  const pm25High = rows.filter((item) => Number(item.pm25) > 35).length;
  if (!rows.length) return `<div class="nx-empty"><strong>Air-quality model unavailable</strong><span>The cached Open-Meteo / CAMS connector will retry on the next refresh.</span></div>`;
  return `<div class="nx-live-tracks nx-air-quality"><header><div><span>Metro grid cells</span><strong>${rows.length}</strong></div><div><span>Elevated AQI</span><strong>${elevated}</strong></div><div><span>PM2.5 &gt; 35</span><strong>${pm25High}</strong></div></header><div>${rows.map((item) => `<button type="button" data-event-id="${escapeHtml(item.id)}"><b>AQ</b><span><strong>${escapeHtml(item.title)}</strong><small>PM2.5 ${Number.isFinite(Number(item.pm25)) ? `${Number(item.pm25).toFixed(1)} µg/m³` : "—"} · PM10 ${Number.isFinite(Number(item.pm10)) ? Number(item.pm10).toFixed(1) : "—"}</small></span><em>${Number.isFinite(Number(item.usAqi)) ? `AQI ${Number(item.usAqi) > 500 ? "500+" : Math.round(Number(item.usAqi))}` : `EU ${Math.round(Number(item.europeanAqi))}`}</em></button>`).join("")}</div><footer>Representative metropolitan CAMS model grid cells through Open-Meteo. These are modelled atmospheric conditions—not certified ground-sensor readings or health directives. CAMS and Open-Meteo attribution applies.</footer></div>`;
}

function sanctionsPanel() {
  const data = state.feeds.sanctions?.data;
  const rows = state.events.filter((event) => event.layer === "sanctions").sort((left, right) => Number(right.sanctionsRecords || 0) - Number(left.sanctionsRecords || 0));
  if (!data || !rows.length) return `<div class="nx-empty"><strong>Official sanctions context unavailable</strong><span>The cached OFAC SDN connector will retry on the next refresh.</span></div>`;
  return `<div class="nx-live-tracks nx-sanctions"><header><div><span>Current SDN records</span><strong>${Number(data.declaredRecords || data.parsedRecords || 0).toLocaleString()}</strong></div><div><span>Mapped countries</span><strong>${rows.length}</strong></div><div><span>Program tags</span><strong>${Number(data.programs?.length || 0)}</strong></div></header><div>${rows.slice(0, 40).map((item) => `<button type="button" data-event-id="${escapeHtml(item.id)}"><b>SC</b><span><strong>${escapeHtml(item.country)}</strong><small>${item.individuals.toLocaleString()} individuals · ${item.entities.toLocaleString()} entities · ${(item.programs || []).slice(0, 2).map((program) => escapeHtml(program.program)).join(", ") || "mixed programs"}</small></span><em>${item.sanctionsRecords.toLocaleString()}</em></button>`).join("")}</div><footer>OFAC SDN publication ${escapeHtml(data.publishDate || "current")}. Country totals are EMS aggregations of country fields associated with listed records—not an OFAC country list, prohibition score, legal conclusion, or substitute for name and ownership screening.</footer></div>`;
}

function logisticsPanel() {
  return REFERENCE_POINTS.filter((point) => ["maritime", "infrastructure"].includes(point.layer)).slice(0, 8).map((event) => eventRow(event)).join("");
}

function referencePanel(layerIds, limit = 12) {
  return REFERENCE_POINTS.filter((point) => layerIds.includes(point.layer)).slice(0, limit).map((event) => eventRow(event)).join("")
    || `<div class="nx-empty"><strong>No reference assets</strong><span>No assets are configured for this category.</span></div>`;
}

function watchlistPanel() {
  const watched = [...state.events, ...REFERENCE_POINTS].filter((event) => state.watchlist.has(event.id));
  return watched.length ? watched.map((event) => eventRow(event)).join("") : `<div class="nx-empty"><strong>Your watchlist is clear</strong><span>Open any signal and add it to the device-local watchlist.</span></div>`;
}

function monitorsPanel() {
  const matches = state.monitors.length ? state.events.filter((event) => state.monitors.some((term) => `${event.title} ${event.detail || ""} ${event.country || ""}`.toLowerCase().includes(term.toLowerCase()))).slice(0, 12) : [];
  return `<form class="nx-monitor-form" id="nxMonitorForm"><input id="nxMonitorInput" maxlength="60" placeholder="Keyword, country, company…" aria-label="Monitor keyword"><button class="nx-button" type="submit">Add</button></form>
    <div class="nx-monitor-tags">${state.monitors.map((term) => `<button type="button" data-remove-monitor="${escapeHtml(term)}" title="Remove monitor">${escapeHtml(term)} ×</button>`).join("") || "<span>No keyword monitors configured.</span>"}</div>
    <div>${matches.length ? matches.map((event) => eventRow(event)).join("") : `<div class="nx-empty"><strong>No monitor matches</strong><span>Add keywords to highlight matching incoming signals.</span></div>`}</div>`;
}

function historyPanel() {
  const rows = [...state.snapshots].reverse().slice(0, 12);
  return rows.length ? `<div class="nx-history-list">${rows.map((snapshot) => `<article><strong>${new Date(snapshot.savedAt).toLocaleString()}</strong><span>${snapshot.total} signals · ${snapshot.critical} critical · ${snapshot.sources} sources</span></article>`).join("")}</div>` : `<div class="nx-empty"><strong>No snapshots yet</strong><span>A compact snapshot is stored after each completed refresh.</span></div>`;
}

function captureSnapshot() {
  const last = state.snapshots[state.snapshots.length - 1];
  if (last && Date.now() - last.savedAt < 4 * 60_000) return;
  state.snapshots.push({ savedAt: Date.now(), total: state.events.length, critical: state.events.filter((event) => event.severity >= 4).length, sources: Object.values(state.sourceState).filter((source) => source.data).length, layers: Object.fromEntries(INTELLIGENCE_LAYERS.map((layer) => [layer.id, state.events.filter((event) => event.layer === layer.id).length]).filter(([, count]) => count)) });
  state.snapshots = state.snapshots.filter((snapshot) => snapshot.savedAt > Date.now() - 7 * 24 * 60 * 60_000).slice(-72);
  savePreferences();
}

function distributionPanel() {
  const counts = new Map();
  state.events.filter((event) => !event.observation).forEach((event) => counts.set(event.layer, (counts.get(event.layer) || 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maximum = Math.max(1, ...ranked.map(([, count]) => count));
  return ranked.length ? `<div class="nx-distribution">${ranked.map(([layerId, count]) => {
    const layer = layerById(layerId);
    return `<div><span>${escapeHtml(layer?.label || layerId)}</span><i style="--bar:${layer?.color || "#61d8c3"};--width:${Math.round(count / maximum * 100)}%"></i><strong>${count}</strong></div>`;
  }).join("")}</div>` : `<div class="nx-empty"><strong>Awaiting signals</strong><span>Distribution appears after a live refresh.</span></div>`;
}

function regionPanel() {
  const regions = { "Asia Pacific": 0, "Europe": 0, "Middle East and Africa": 0, "Americas": 0, "Global / non-geographic": 0 };
  state.events.filter((event) => !event.observation).forEach((event) => {
    if (!Number.isFinite(event.longitude) || !Number.isFinite(event.latitude)) { regions["Global / non-geographic"] += 1; return; }
    if (event.longitude < -25) regions.Americas += 1;
    else if (event.longitude >= 60 || (event.longitude >= 25 && event.latitude < 5)) regions["Asia Pacific"] += 1;
    else if (event.longitude >= 25 || event.latitude < 0) regions["Middle East and Africa"] += 1;
    else regions.Europe += 1;
  });
  return `<div class="nx-region-grid">${Object.entries(regions).map(([region, count]) => `<div><span>${escapeHtml(region)}</span><strong>${count}</strong><small>active signals</small></div>`).join("")}</div>`;
}

function strategicPosturePanel() {
  const operationalLayers = new Set(["conflicts", "disaster-alerts", "earthquakes", "wildfires", "storms", "floods", "internet-outages", "radiation", "aviation-weather", "maritime-conditions"]);
  const inBounds = (item, bounds) => Number.isFinite(item.longitude) && Number.isFinite(item.latitude) && item.longitude >= bounds[0] && item.longitude <= bounds[1] && item.latitude >= bounds[2] && item.latitude <= bounds[3];
  const rows = STRATEGIC_THEATERS.map((theater) => {
    const signals = state.events.filter((item) => operationalLayers.has(item.layer) && item.geoBasis !== "publisher" && inBounds(item, theater.bounds));
    const assets = REFERENCE_POINTS.filter((item) => inBounds(item, theater.bounds));
    const conflict = signals.filter((item) => item.layer === "conflicts").length;
    const hazards = signals.filter((item) => ["disaster-alerts", "earthquakes", "wildfires", "storms", "floods", "radiation"].includes(item.layer)).length;
    const mobility = signals.filter((item) => ["aviation-weather", "maritime-conditions"].includes(item.layer)).length;
    const connectivity = signals.filter((item) => item.layer === "internet-outages").length;
    const military = assets.filter((item) => item.layer === "military-bases").length;
    const infrastructure = assets.filter((item) => ["nuclear", "energy", "infrastructure", "telecom", "maritime"].includes(item.layer)).length;
    const raw = signals.reduce((total, item) => {
      const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || Date.now())) / 3_600_000);
      const recency = ageHours < 6 ? 1 : ageHours < 24 ? .7 : ageHours < 168 ? .3 : .08;
      return total + Number(item.severity || 1) * recency;
    }, 0) + military * .35 + infrastructure * .15;
    const posture = raw >= 14 ? "Critical" : raw >= 7 ? "High" : raw >= 2.5 ? "Elevated" : "Monitoring";
    return { ...theater, signals: signals.length, conflict, hazards, mobility, connectivity, military, infrastructure, score: Math.min(100, Math.round(100 * (1 - Math.exp(-raw / 12)))), posture };
  }).sort((left, right) => right.score - left.score);
  return `<div class="nx-posture-list">${rows.map((row) => `<button type="button" data-theater="${row.id}" title="Focus ${escapeHtml(row.label)}"><span><strong>${escapeHtml(row.label)}</strong><small>${row.conflict} conflict · ${row.hazards} hazard · ${row.mobility} mobility · ${row.connectivity} outage</small></span><i style="--posture:${row.score}%"></i><b data-level="${row.posture.toLowerCase()}">${row.posture}</b><em>${row.signals} live · ${row.military} military refs · ${row.infrastructure} infrastructure</em></button>`).join("")}<small>Transparent recency/severity screen from public signals and reference exposure. Presence does not imply intent, attribution, readiness, or confirmed disruption.</small></div>`;
}

function countryRiskPanel() {
  const scores = new Map();
  state.events.forEach((event) => {
    const country = event.country && event.country !== "Global" ? event.country : "";
    if (!country) return;
    const ageHours = Math.max(0, (Date.now() - Number(event.timestamp || Date.now())) / 3_600_000);
    const recency = ageHours < 6 ? 1 : ageHours < 24 ? .75 : ageHours < 168 ? .4 : .15;
    scores.set(country, (scores.get(country) || 0) + Number(event.severity || 1) * recency);
  });
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maximum = Math.max(1, ...ranked.map(([, score]) => score));
  return ranked.length ? `<div class="nx-risk-list">${ranked.map(([country, raw]) => {
    const score = Math.min(100, Math.round(raw / maximum * 100));
    return `<article><span>${escapeHtml(country)}</span><i style="--risk:${score}%"></i><strong>${score}</strong></article>`;
  }).join("")}<small>Relative operational stress from current public signals; not a structural country rating.</small></div>` : `<div class="nx-empty"><strong>Insufficient country signals</strong><span>Country scoring appears when geocoded reporting is available.</span></div>`;
}

function routeExposurePanel() {
  const ports = REFERENCE_POINTS.filter((point) => point.layer === "maritime");
  const origin = ports.find((point) => point.id === state.routeOrigin) || ports[0];
  const destination = ports.find((point) => point.id === state.routeDestination) || ports[1];
  const chokepoints = REFERENCE_POINTS.filter((point) => point.id.startsWith("chokepoint-"));
  const exposures = [];
  const eastWest = Math.abs(origin.longitude - destination.longitude) > 45;
  if (eastWest && Math.max(origin.longitude, destination.longitude) > 95 && Math.min(origin.longitude, destination.longitude) < 35) exposures.push(chokepoints.find((point) => point.id === "chokepoint-malacca"));
  if (eastWest && Math.max(origin.longitude, destination.longitude) > 45 && Math.min(origin.longitude, destination.longitude) < 35) exposures.push(chokepoints.find((point) => point.id === "chokepoint-suez"));
  if ([origin, destination].some((point) => point.longitude > 45 && point.longitude < 60 && point.latitude > 20)) exposures.push(chokepoints.find((point) => point.id === "chokepoint-hormuz"));
  if (Math.min(origin.longitude, destination.longitude) < -70 && Math.max(origin.longitude, destination.longitude) > -20) exposures.push(chokepoints.find((point) => point.id === "chokepoint-panama"));
  const unique = exposures.filter((point, index, list) => point && list.indexOf(point) === index);
  const nearbySignals = unique.flatMap((point) => state.events.filter((event) => Number.isFinite(event.longitude) && Math.hypot(event.longitude - point.longitude, event.latitude - point.latitude) < 12)).filter((event, index, list) => list.findIndex((item) => item.id === event.id) === index);
  const options = (selected) => ports.map((point) => `<option value="${point.id}"${point.id === selected ? " selected" : ""}>${escapeHtml(point.title)}</option>`).join("");
  return `<div class="nx-workflow"><div class="nx-route-selects"><label>Origin<select id="nxRouteOrigin">${options(origin.id)}</select></label><span>→</span><label>Destination<select id="nxRouteDestination">${options(destination.id)}</select></label></div>
    <div class="nx-workflow-summary"><strong>${unique.length} modeled chokepoint${unique.length === 1 ? "" : "s"}</strong><span>${nearbySignals.length} current signals within screening radius</span></div>
    <div>${unique.length ? unique.map((point) => eventRow(point)).join("") : `<div class="nx-empty"><strong>Direct regional corridor</strong><span>No global chokepoint is inferred for this screening pair.</span></div>`}</div><small>Screening estimate only; not a navigational route.</small></div>`;
}

function scenarioPanel() {
  const definitions = {
    conflict: { label: "Regional conflict escalation", layers: ["conflicts", "military-bases", "nuclear", "energy"] },
    weather: { label: "Severe weather disruption", layers: ["storms", "floods", "wildfires", "aviation-weather", "maritime-conditions"] },
    cyber: { label: "Critical cyber disruption", layers: ["cyber", "telecom", "infrastructure", "energy"] },
    energy: { label: "Energy supply shock", layers: ["energy", "maritime", "maritime-conditions", "conflicts"] }
  };
  const selected = definitions[state.scenario] || definitions.conflict;
  const affected = [...state.events, ...REFERENCE_POINTS].filter((event) => selected.layers.includes(event.layer));
  const critical = affected.filter((event) => event.severity >= 3).length;
  return `<div class="nx-workflow"><label class="nx-scenario-select">Scenario<select id="nxScenario">${Object.entries(definitions).map(([id, definition]) => `<option value="${id}"${id === state.scenario ? " selected" : ""}>${escapeHtml(definition.label)}</option>`).join("")}</select></label>
    <div class="nx-metric-grid"><div class="nx-metric"><span>Exposed signals/assets</span><strong>${affected.length}</strong><small>${selected.layers.length} affected layers</small></div><div class="nx-metric"><span>High priority</span><strong>${critical}</strong><small>Severity high or critical</small></div></div>
    <div>${affected.sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0)).slice(0, 6).map((event) => eventRow(event)).join("")}</div><small>Local what-if screening; it does not predict occurrence probability.</small></div>`;
}

function sourceHealthPanel() {
  return `<div class="nx-source-compact">${sourceCatalog().map((source) => {
    const status = state.sourceState[source.id];
    return `<div><span class="nx-source-state ${status?.data ? "ok" : "down"}"></span><strong>${escapeHtml(source.attribution)}</strong><small>${status?.data ? cacheAgeLabel(status.savedAt) : "Unavailable"}</small></div>`;
  }).join("")}</div>`;
}

function weatherPanel() {
  if (!state.weather) return `<div class="nx-empty"><strong>Select a mapped signal</strong><span>Nexus will load free current weather for that location.</span></div>`;
  const current = state.weather.current || {};
  const units = state.weather.current_units || {};
  return `<div class="nx-weather">
    <div class="nx-weather-main"><strong>${escapeHtml(state.weatherLocation?.title || "Selected location")}</strong><span>${current.temperature_2m ?? "—"}${escapeHtml(units.temperature_2m || "°C")}</span></div>
    <div class="nx-metric-grid">
      <div class="nx-metric"><span>Feels like</span><strong>${current.apparent_temperature ?? "—"}${escapeHtml(units.apparent_temperature || "°C")}</strong></div>
      <div class="nx-metric"><span>Wind</span><strong>${current.wind_speed_10m ?? "—"} ${escapeHtml(units.wind_speed_10m || "km/h")}</strong></div>
      <div class="nx-metric"><span>Humidity</span><strong>${current.relative_humidity_2m ?? "—"}%</strong></div>
      <div class="nx-metric"><span>Cloud cover</span><strong>${current.cloud_cover ?? "—"}%</strong></div>
    </div>
  </div>`;
}

function briefPanel() {
  const critical = state.events.filter((event) => event.severity >= 4).slice(0, 5);
  const high = state.events.filter((event) => event.severity === 3).slice(0, 5);
  const hazards = state.events.filter((event) => ["earthquakes", "wildfires", "volcanoes", "storms", "floods"].includes(event.layer)).length;
  const security = state.events.filter((event) => ["conflicts", "travel-advisories", "cyber", "space-weather", "service-status"].includes(event.layer)).length;
  const opportunities = state.events.filter((event) => event.layer === "business-opportunities").length;
  return `<article class="nx-brief">
    <p><strong>Operational picture:</strong> Nexus is tracking ${state.events.length} live items across independent public sources, including ${opportunities} commercial leads, ${hazards} hazard signals and ${security} security or technology notices.</p>
    <p><strong>Priority:</strong> ${critical.length ? critical.map((event) => escapeHtml(event.title)).join("; ") : high.length ? high.map((event) => escapeHtml(event.title)).join("; ") : "No critical public signals in the current refresh window."}</p>
    <p><strong>Assessment:</strong> Validate high-impact items against the linked primary source before operational action. Reference infrastructure markers indicate exposure, not a confirmed disruption.</p>
  </article>`;
}

function panelBody(panel) {
  if (panel.id === "leads") return leadsPanel();
  if (panel.id === "commercial-opportunities") return commercialOpportunityPanel();
  if (panel.id === "priority") return listPanelEvents((event) => event.severity >= 3, 10);
  if (panel.id === "earthquakes") return listPanelEvents((event) => event.layer === "earthquakes", 10);
  if (panel.id === "natural-events") return listPanelEvents((event) => ["wildfires", "volcanoes", "storms", "floods", "drought", "ice"].includes(event.layer), 10);
  if (panel.id === "disaster-alerts") return listPanelEvents((event) => event.source === "GDACS", 10);
  if (panel.id === "security") return listPanelEvents((event) => event.layer === "conflicts", 10);
  if (panel.id === "travel-advisories") return travelAdvisoryPanel();
  if (panel.id === "sanctions") return sanctionsPanel();
  if (panel.id === "global-reporting") return listPanelEvents((event) => event.layer === "reporting", 14);
  if (panel.id === "official-wire") return officialWirePanel();
  if (panel.id === "service-status") return serviceStatusPanel();
  if (panel.id === "cyber") return listPanelEvents((event) => event.layer === "cyber", 10);
  if (panel.id === "space-weather") return listPanelEvents((event) => event.layer === "space-weather", 10);
  if (panel.id === "orbital") return listPanelEvents((event) => event.layer === "satellites", 12);
  if (panel.id === "markets") return marketPanel();
  if (panel.id === "exchange-hours") return exchangeHoursPanel();
  if (panel.id === "macro-risk") return macroRiskPanel();
  if (panel.id === "predictions") return predictionPanel();
  if (panel.id === "internet-outages") return listPanelEvents((event) => event.layer === "internet-outages", 12);
  if (panel.id === "displacement") return listPanelEvents((event) => event.layer === "displacement", 12);
  if (panel.id === "disease-outbreaks") return listPanelEvents((event) => event.layer === "disease-outbreaks", 12);
  if (panel.id === "radiation") return listPanelEvents((event) => event.layer === "radiation", 12);
  if (panel.id === "air-quality") return airQualityPanel();
  if (panel.id === "weather") return weatherPanel();
  if (panel.id === "logistics") return logisticsPanel();
  if (panel.id === "brief") return briefPanel();
  if (panel.id === "watchlist") return watchlistPanel();
  if (panel.id === "aviation") return aviationPanel();
  if (panel.id === "live-aircraft") return liveAircraftPanel();
  if (panel.id === "maritime") return maritimePanel();
  if (panel.id === "live-vessels") return liveVesselPanel();
  if (panel.id === "infrastructure") return referencePanel(["infrastructure", "nuclear", "telecom", "water", "military-bases", "critical-minerals"], 20);
  if (panel.id === "energy") return referencePanel(["energy"]);
  if (panel.id === "timeline") return distributionPanel();
  if (panel.id === "regions") return regionPanel();
  if (panel.id === "strategic-posture") return strategicPosturePanel();
  if (panel.id === "country-risk") return countryRiskPanel();
  if (panel.id === "route-exposure") return routeExposurePanel();
  if (panel.id === "scenario") return scenarioPanel();
  if (panel.id === "monitors") return monitorsPanel();
  if (panel.id === "history") return historyPanel();
  return sourceHealthPanel();
}

function renderPanels() {
  const byId = new Map(PANEL_CATALOG.map((panel) => [panel.id, panel]));
  const panels = state.panelOrder.map((id) => byId.get(id)).filter((panel) => panel && !state.hiddenPanels.has(panel.id));
  document.querySelector("#nxPanels").innerHTML = panels.map((panel) => `
    <article class="nx-panel" data-panel="${panel.id}">
      <header title="Drag to reorder" draggable="true"><div><strong>${escapeHtml(panel.title)}</strong><small>${escapeHtml(panel.source)}</small></div><span>${escapeHtml(panel.group)}</span></header>
      <div class="nx-panel-body">${panelBody(panel)}</div>
    </article>`).join("");
  document.querySelector("#nxPanelSummary").textContent = `${panels.length}/${PANEL_CATALOG.length} panels visible · drag headers to reorder`;
}

function renderPanelChoices() {
  const byId = new Map(PANEL_CATALOG.map((panel) => [panel.id, panel]));
  document.querySelector("#nxPanelChoices").innerHTML = state.panelOrder.map((id) => byId.get(id)).filter(Boolean).map((panel) => `<label><input type="checkbox" value="${panel.id}"${state.hiddenPanels.has(panel.id) ? "" : " checked"}><span><strong>${escapeHtml(panel.title)}</strong><small>${escapeHtml(panel.group)} · ${escapeHtml(panel.source)}</small></span></label>`).join("");
}

function downloadBlob(filename, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportDashboard(format) {
  const events = visibleEvents().map(({ id, layer, title, detail, country, source, severity, timestamp, latitude, longitude, url, commercialType, industries, opportunityScore, riskScore, confidence, freshness, recommendedAction, evidenceLevel }) => ({ id, layer, title, detail, country, source, severity, observedAt: timestamp ? new Date(timestamp).toISOString() : "", latitude, longitude, url, commercialType, industries: (industries || []).join("; "), opportunityScore, riskScore, confidence, freshness, recommendedAction, evidenceLevel }));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (format === "json") return downloadBlob(`nexus-intelligence-${stamp}.json`, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), lens: state.lens, region: state.region, timeRange: state.timeRange, events }, null, 2));
  const fields = ["id", "layer", "title", "detail", "country", "source", "severity", "observedAt", "latitude", "longitude", "url", "commercialType", "industries", "opportunityScore", "riskScore", "confidence", "freshness", "recommendedAction", "evidenceLevel"];
  const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  downloadBlob(`nexus-intelligence-${stamp}.csv`, "text/csv;charset=utf-8", [fields.join(","), ...events.map((event) => fields.map((field) => cell(event[field])).join(","))].join("\r\n"));
}

function renderSources() {
  document.querySelector("#nxSourceList").innerHTML = sourceCatalog().map((source) => {
    const status = state.sourceState[source.id];
    const detail = status?.data ? `${status.cached ? "Cached" : "Live"} · ${cacheAgeLabel(status.savedAt)}${status.stale ? " · stale fallback" : ""}` : source.onDemand ? "On demand · select a country" : `Unavailable${status?.error ? ` · ${escapeHtml(status.error)}` : ""}`;
    return `<article><span class="nx-source-state ${status?.data ? "ok" : source.onDemand ? "standby" : "down"}"></span><div><strong>${escapeHtml(source.attribution)}</strong><small>${detail}</small></div></article>`;
  }).join("");
}

const COUNTRY_ALIASES = Object.freeze({
  US: ["united states", "united states of america", "usa", "u.s.", "american"], GB: ["united kingdom", "britain", "british"],
  RU: ["russia", "russian federation", "russian"], KR: ["south korea", "republic of korea", "south korean"], KP: ["north korea", "north korean"],
  TR: ["turkey", "türkiye", "turkish"], CD: ["democratic republic of the congo", "drc", "dr congo"], IR: ["iran", "iranian"],
  IN: ["india", "indian"], CN: ["china", "chinese"], JP: ["japan", "japanese"], UA: ["ukraine", "ukrainian"],
  IL: ["israel", "israeli"], PK: ["pakistan", "pakistani"], AE: ["united arab emirates", "uae", "emirati"]
});

function countryTerms(country) {
  return [...new Set([country.name, country.shortName, ...(COUNTRY_ALIASES[country.iso2] || [])].filter(Boolean).map((value) => String(value).toLowerCase()))];
}

function textMatchesCountry(value, country) {
  const text = String(value || "").toLowerCase();
  return countryTerms(country).some((term) => text === term || text.split(/[\/;,]/).map((part) => part.trim()).includes(term) || text.includes(` ${term} `));
}

function itemsForCountry(country, items) {
  return items.filter((item) => {
    if (textMatchesCountry(item.country, country) || (item.iso2 && item.iso2 === country.iso2) || (item.iso3 && item.iso3 === country.iso)) return true;
    if (!Number.isFinite(item.longitude) || !Number.isFinite(item.latitude)) return false;
    return state.map?.countryAt(item.longitude, item.latitude)?.name === country.name;
  });
}

function relatedPredictionMarkets(country) {
  const markets = Array.isArray(state.feeds.predictions?.data) ? state.feeds.predictions.data : [];
  return markets.filter((market) => countryTerms(country).some((term) => `${market.question || ""} ${market.description || ""}`.toLowerCase().includes(term))).slice(0, 4);
}

function countryStress(signals) {
  const raw = signals.reduce((sum, item) => {
    const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || Date.now())) / 3_600_000);
    return sum + Number(item.severity || 1) * (ageHours < 6 ? 1 : ageHours < 24 ? .72 : ageHours < 168 ? .35 : .12);
  }, 0);
  return Math.min(100, Math.round(100 * (1 - Math.exp(-raw / 18))));
}

function countryResilienceContext(indicators, signals) {
  const components = [];
  const valueOf = (indicator) => indicator?.value == null ? NaN : Number(indicator.value);
  const add = (id, label, value, basis) => {
    if (!Number.isFinite(value)) return;
    components.push({ id, label, value: Math.round(clamp(value, 0, 100)), basis });
  };
  const inflation = valueOf(indicators.inflation);
  const unemployment = valueOf(indicators.unemployment);
  if (Number.isFinite(inflation) || Number.isFinite(unemployment)) add("macro", "Macro stability", 100 - (Number.isFinite(inflation) ? Math.abs(inflation - 2) * 4 : 0) - (Number.isFinite(unemployment) ? unemployment * 2.5 : 0), "Inflation and unemployment");
  const debt = valueOf(indicators.publicDebt);
  add("fiscal", "Fiscal capacity", 100 - Math.max(0, debt - 30) * .85, "Public debt / GDP");
  add("digital", "Digital access", valueOf(indicators.internetUsage), "Population using the internet");
  const life = valueOf(indicators.lifeExpectancy);
  add("human", "Human capacity", Number.isFinite(life) ? (life - 50) / 35 * 100 : NaN, "Life expectancy");
  const energyImports = valueOf(indicators.energyImports);
  add("energy", "Energy exposure", Number.isFinite(energyImports) ? 65 - energyImports * .5 : NaN, "Net energy imports; higher score means lower external exposure");
  const gdp = valueOf(indicators.gdp);
  const population = valueOf(indicators.population);
  if (Number.isFinite(gdp) && Number.isFinite(population) && population > 0) add("economic", "Economic capacity", (Math.log10(Math.max(1, gdp / population)) - 3) / 2 * 100, "GDP per person, logarithmic context");
  add("operations", "Current operating stability", 100 - countryStress(signals), "Inverse of the current recency/severity stress screen");
  const score = components.length ? Math.round(components.reduce((sum, item) => sum + item.value, 0) / components.length) : null;
  return { score, coverage: components.length, total: 7, components };
}

function formatCountryIndicator(indicator, options = {}) {
  if (indicator?.value == null) return "Unavailable";
  const value = Number(indicator?.value);
  if (!Number.isFinite(value)) return "Unavailable";
  if (options.currency) return new Intl.NumberFormat("en", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
  if (options.compact) return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  if (options.percent) return `${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function countryTrendCard(label, indicator, options = {}) {
  const history = Array.isArray(indicator?.history) ? indicator.history.filter((item) => Number.isFinite(Number(item?.value))) : [];
  if (history.length < 2) return "";
  const latest = history.at(-1);
  const previous = history.at(-2);
  const change = Number(latest.value) - Number(previous.value);
  const changeLabel = options.currency
    ? new Intl.NumberFormat("en", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2, signDisplay: "always" }).format(change)
    : options.percent
      ? `${change > 0 ? "+" : ""}${change.toFixed(Math.abs(change) >= 10 ? 1 : 2)} pp`
      : `${change > 0 ? "+" : ""}${change.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `<article><header><span>${escapeHtml(label)}</span><small>${escapeHtml(latest.year)}</small></header><strong>${escapeHtml(formatCountryIndicator({ ...indicator, value: latest.value }, options))}</strong><p>${escapeHtml(`${history[0].year}–${latest.year} published observations`)}</p>${macroSparkline(history)}<footer><span data-direction="${change > 0 ? "up" : change < 0 ? "down" : "flat"}">${escapeHtml(`${changeLabel} vs ${previous.year}`)}</span><small>${history.length} points</small></footer></article>`;
}

function countryTrendsPanel(indicators) {
  const cards = [
    countryTrendCard("Public debt / GDP", indicators.publicDebt, { percent: true }),
    countryTrendCard("Imports", indicators.imports, { currency: true }),
    countryTrendCard("Exports", indicators.exports, { currency: true }),
    countryTrendCard("Applied tariff", indicators.tariffRate, { percent: true }),
    countryTrendCard("Trade / GDP", indicators.tradeShare, { percent: true }),
    countryTrendCard("Current account / GDP", indicators.currentAccount, { percent: true }),
    countryTrendCard("GDP growth", indicators.gdpGrowth, { percent: true }),
    countryTrendCard("Inflation", indicators.inflation, { percent: true })
  ].filter(Boolean);
  if (!cards.length) return `<p>No comparable annual history is published for this territory in the retained series.</p>`;
  return `<div class="nx-macro-grid nx-country-trends">${cards.join("")}<small>Annual World Bank and IMF WEO observations. The delta is the latest published value minus the preceding available observation; upward or downward direction is not a risk judgment. Years and release cycles differ, and IMF values may include estimates.</small></div>`;
}

function renderCountryTimeline(signals) {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (6 - offset));
    const end = start.getTime() + 86_400_000;
    return { label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: signals.filter((item) => item.timestamp >= start.getTime() && item.timestamp < end).length };
  });
  const maximum = Math.max(1, ...days.map((day) => day.count));
  return `<div class="nx-country-timeline">${days.map((day) => `<div title="${day.count} signals"><i style="--height:${Math.max(4, day.count / maximum * 100)}%"></i><strong>${day.count}</strong><span>${escapeHtml(day.label)}</span></div>`).join("")}</div>`;
}

// Separate, explicitly-labelled PREDICTED opportunity outlook for a country — a transparent
// heuristic over live signals, never presented as a verified forecast (no AI).
function countryOpportunityOutlook(commercialSignals, reports, indicators, predictions) {
  const drivers = [];
  let score = 42;
  const leadCount = commercialSignals.length;
  if (leadCount) { score += Math.min(18, leadCount * 3); drivers.push(`${leadCount} live opportunity lead${leadCount === 1 ? "" : "s"}`); }
  const avgIndia = leadCount ? Math.round(commercialSignals.reduce((sum, item) => sum + Number(item.indiaRelevance || 0), 0) / leadCount) : 0;
  if (avgIndia >= 60) { score += 12; drivers.push(`strong India relevance (avg ${avgIndia})`); }
  else if (avgIndia >= 45) { score += 6; drivers.push(`moderate India relevance (avg ${avgIndia})`); }
  const reformCount = reports.length;
  if (reformCount) { score += Math.min(10, reformCount * 2); drivers.push(`${reformCount} recent reform / reporting item${reformCount === 1 ? "" : "s"}`); }
  const tradeShare = Number(indicators?.tradeShare?.value || 0);
  if (tradeShare >= 60) { score += 8; drivers.push(`open trade economy (${Math.round(tradeShare)}% trade / GDP)`); }
  const growth = Number(indicators?.gdpGrowth?.value || 0);
  if (growth >= 4) { score += 8; drivers.push(`fast growth (${growth.toFixed(1)}% GDP)`); }
  else if (growth < 0) { score -= 8; drivers.push(`contracting economy (${growth.toFixed(1)}% GDP)`); }
  if ((predictions || []).length) { score += 4; drivers.push(`${predictions.length} related prediction market${predictions.length === 1 ? "" : "s"}`); }
  score = Math.max(5, Math.min(97, Math.round(score)));
  const band = score >= 75 ? "Strong" : score >= 60 ? "Promising" : score >= 45 ? "Moderate" : "Limited";
  return { score, band, drivers: drivers.length ? drivers.slice(0, 5) : ["Insufficient live signal — outlook is a low-confidence baseline"] };
}

function renderCountryDetail() {
  const country = state.selectedCountry;
  const drawer = document.querySelector("#nxCountryDetail");
  if (!country || !drawer) return;
  const countryEvents = itemsForCountry(country, state.events).filter((item) => !item.structural);
  const observations = countryEvents.filter((item) => item.observation).sort((a, b) => b.timestamp - a.timestamp);
  const signals = countryEvents.filter((item) => !item.observation).sort((a, b) => (b.severity - a.severity) || (b.timestamp - a.timestamp));
  const commercialSignals = signals.filter((item) => item.layer === "business-opportunities").sort((a, b) => (Number(b.leadScore ?? b.opportunityScore ?? 0) - Number(a.leadScore ?? a.opportunityScore ?? 0)) || ((b.timestamp || 0) - (a.timestamp || 0)));
  const assets = itemsForCountry(country, REFERENCE_POINTS);
  const outages = signals.filter((item) => item.layer === "internet-outages");
  const displacementRecord = (state.feeds.displacement?.data?.items || []).find((item) => String(item.coo_iso || item.coo).toUpperCase() === country.iso);
  const diseaseSignals = signals.filter((item) => item.layer === "disease-outbreaks");
  const radiationSignals = signals.filter((item) => item.layer === "radiation");
  const liveAircraft = observations.filter((item) => item.layer === "live-aircraft");
  const liveVessels = observations.filter((item) => item.layer === "live-vessels");
  const liveTracks = [...liveAircraft, ...liveVessels];
  const sanctionsRecord = (state.feeds.sanctions?.data?.countries || []).find((item) => textMatchesCountry(item.country, country));
  const reports = signals.filter((item) => item.source === "GDELT" || item.source === "GDELT Global" || item.source?.startsWith("Official Wire ·")).slice(0, 8);
  const predictions = relatedPredictionMarkets(country);
  const critical = signals.filter((item) => item.severity >= 4).length;
  const high = signals.filter((item) => item.severity === 3).length;
  const stress = countryStress(signals);
  const weather = state.countryWeather?.current || {};
  const weatherUnits = state.countryWeather?.current_units || {};
  const travelAdvisory = state.countryTravelAdvisory;
  const travelAdvisoryUrl = safeExternalUrl(travelAdvisory?.sourceUrl);
  const travelAdvisoryUpdated = Date.parse(travelAdvisory?.updatedAt || "");
  const air = state.countryAirQuality?.current || {};
  const airUnits = state.countryAirQuality?.current_units || {};
  const airAqi = Number(air.us_aqi);
  const airBand = Number.isFinite(airAqi) ? airAqi <= 50 ? "Good" : airAqi <= 100 ? "Moderate" : airAqi <= 150 ? "Unhealthy for sensitive groups" : airAqi <= 200 ? "Unhealthy" : airAqi <= 300 ? "Very unhealthy" : "Hazardous" : "Unavailable";
  const rates = state.feeds.currencies?.data?.rates || {};
  const profile = state.countryProfile || {};
  const profileAttribution = [...new Set(String(profile.attribution || "World Bank Open Data / IMF World Economic Outlook").split(" / ").filter(Boolean))].join(" / ");
  const indicators = profile.indicators || {};
  const resilience = countryResilienceContext(indicators, signals);
  const outlook = countryOpportunityOutlook(commercialSignals, reports, indicators, predictions);
  const countryMetadata = profile.country || {};
  const currencyByCountry = { IN: "INR", GB: "GBP", JP: "JPY", CN: "CNY", AE: "AED" };
  const currency = currencyByCountry[country.iso2];
  const military = assets.filter((item) => item.layer === "military-bases");
  const infrastructure = assets.filter((item) => ["nuclear", "energy", "telecom", "water", "rail", "maritime", "aviation", "critical-minerals"].includes(item.layer));
  const exchanges = assets.filter((item) => item.layer === "stock-exchanges").map((exchange) => ({ exchange, clock: exchangeClock(exchange) }));
  const topSignal = signals[0];
  const brief = topSignal ? `${signals.length} current public signals are associated with ${country.shortName}. The highest-priority item is “${topSignal.title}”. ${critical || high ? `${critical} critical and ${high} high-severity items warrant review.` : "No high-severity public item is active in the retained window."}` : `No current public signal is geographically associated with ${country.shortName}. Reference assets and weather remain available.`;
  drawer.innerHTML = `<header><div><span>Country intelligence · ${escapeHtml(country.iso2 || country.iso)}</span><strong>${escapeHtml(country.name)}</strong><small>Live public feeds · internal EMS synthesis</small></div><button id="nxCloseCountry" type="button" aria-label="Close country details">×</button></header>
    <div class="nx-country-body">
      <section class="nx-country-metrics"><div><span>Operational stress</span><strong>${stress}</strong><small>/100 live screen</small></div><div><span>Signals</span><strong>${signals.length}</strong><small>${critical} critical · ${high} high</small></div><div><span>Live tracks</span><strong>${liveTracks.length}</strong><small>${liveAircraft.length} air · ${liveVessels.length} vessel</small></div><div><span>Assets</span><strong>${assets.length}</strong><small>public reference</small></div></section>
      <section class="nx-country-card"><h3>Intelligence brief</h3><p>${escapeHtml(brief)}</p></section>
      <section class="nx-country-card"><h3>Commercial opportunities</h3>${commercialSignals.length ? `<div class="nx-country-facts"><div><span>Current leads</span><strong>${commercialSignals.length}</strong></div><div><span>Top opportunity score</span><strong>${Number(commercialSignals[0]?.opportunityScore || 0)}/100</strong></div><div><span>High potential</span><strong>${commercialSignals.filter((item) => Number(item.opportunityScore || 0) >= 70).length}</strong></div><div><span>Industries</span><strong>${new Set(commercialSignals.flatMap((item) => item.industries || [])).size}</strong></div></div>${commercialSignals.slice(0, 8).map((item) => eventRow(item, true)).join("")}<small>News-derived discovery leads, refreshed throughout the day. Scores rank relevance and freshness; they are not investment advice, a tender award, or counterparty verification.</small>` : `<p>No headline-located commercial lead is currently retained for this country.</p><small>The connector refreshes throughout the day; absence does not mean there are no opportunities.</small>`}</section>
      <section class="nx-country-card"><h3>Predicted opportunity outlook</h3><div class="nx-outlook" data-band="${outlook.band.toLowerCase()}"><div class="nx-outlook-score"><strong>${outlook.score}</strong><span>/100</span></div><div class="nx-outlook-body"><b>${escapeHtml(outlook.band)} predicted outlook for an India-based firm</b><ul>${outlook.drivers.map((driver) => `<li>${escapeHtml(driver)}</li>`).join("")}</ul></div></div><small>Predicted — a transparent heuristic inferred from live signals (leads, India relevance, reforms, trade and growth indicators, prediction markets). It is not a verified forecast, guarantee, or investment advice.</small></section>
      <section class="nx-country-card"><h3>Official travel & security advice</h3>${state.countryTravelAdvisoryLoading ? `<p>Loading the latest FCDO destination publication…</p>` : state.countryTravelAdvisoryError ? `<p>${escapeHtml(state.countryTravelAdvisoryError)}</p>` : travelAdvisory?.available ? `<div class="nx-country-advisory" data-severity="${Number(travelAdvisory.severity || 1)}"><strong>${escapeHtml(travelAdvisory.level || "Official destination advice")}</strong><span>${Number.isFinite(travelAdvisoryUpdated) ? `Updated ${relativeTime(travelAdvisoryUpdated)}` : "Publication date unavailable"}</span>${travelAdvisory.latestChange ? `<p>${escapeHtml(travelAdvisory.latestChange)}</p>` : ""}${travelAdvisoryUrl ? `<a href="${escapeHtml(travelAdvisoryUrl)}" target="_blank" rel="noopener noreferrer">Open official advice</a>` : ""}</div><small>${escapeHtml(travelAdvisory.disclaimer || "Official UK guidance; verify applicability for your nationality and circumstances.")}</small>` : `<p>${escapeHtml(travelAdvisory?.reason || "No matching FCDO destination document is available.")}</p>`}</section>
      <section class="nx-country-card"><h3>Live weather</h3>${state.countryWeatherLoading ? `<p>Loading current conditions…</p>` : state.countryWeather ? `<div class="nx-country-weather"><strong>${weather.temperature_2m ?? "—"}${escapeHtml(weatherUnits.temperature_2m || "°C")}</strong><span>Feels ${weather.apparent_temperature ?? "—"}${escapeHtml(weatherUnits.apparent_temperature || "°C")} · humidity ${weather.relative_humidity_2m ?? "—"}% · wind ${weather.wind_speed_10m ?? "—"} ${escapeHtml(weatherUnits.wind_speed_10m || "km/h")}</span></div>` : `<p>Current weather is unavailable from the public connector.</p>`}</section>
      <section class="nx-country-card"><h3>Air quality & atmospheric exposure</h3>${state.countryAirQualityLoading ? `<p>Loading the current atmospheric model…</p>` : state.countryAirQuality ? `<div class="nx-country-air"><div><span>U.S. AQI</span><strong>${Number.isFinite(airAqi) ? airAqi > 500 ? "500+" : Math.round(airAqi) : "—"}</strong><small>${escapeHtml(airBand)}</small></div><div><span>PM2.5</span><strong>${Number.isFinite(Number(air.pm2_5)) ? Number(air.pm2_5).toFixed(1) : "—"}</strong><small>${escapeHtml(airUnits.pm2_5 || "µg/m³")}</small></div><div><span>PM10</span><strong>${Number.isFinite(Number(air.pm10)) ? Number(air.pm10).toFixed(1) : "—"}</strong><small>${escapeHtml(airUnits.pm10 || "µg/m³")}</small></div><div><span>Ozone</span><strong>${Number.isFinite(Number(air.ozone)) ? Number(air.ozone).toFixed(1) : "—"}</strong><small>${escapeHtml(airUnits.ozone || "µg/m³")}</small></div><div><span>NO₂</span><strong>${Number.isFinite(Number(air.nitrogen_dioxide)) ? Number(air.nitrogen_dioxide).toFixed(1) : "—"}</strong><small>${escapeHtml(airUnits.nitrogen_dioxide || "µg/m³")}</small></div><div><span>Dust</span><strong>${Number.isFinite(Number(air.dust)) ? Number(air.dust).toFixed(1) : "—"}</strong><small>${escapeHtml(airUnits.dust || "µg/m³")}</small></div></div><small>Open-Meteo / Copernicus CAMS model at the country label point. Approximate grid-cell conditions—not a national average, certified monitor reading, or health directive.</small>` : `<p>Current modelled air quality is unavailable from the public connector.</p>`}</section>
      <section class="nx-country-card"><h3>Live military aircraft</h3>${liveAircraft.length ? liveAircraft.slice(0, 12).map((item) => eventRow(item, true)).join("") : `<p>No current ADSB.lol military-registration position falls inside this country polygon.</p>`}<small>Community ADS-B coverage is incomplete and does not imply military intent, affiliation, readiness, or authorization to operate.</small></section>
      <section class="nx-country-card"><h3>Live vessel activity</h3>${liveVessels.length ? liveVessels.slice(0, 12).map((item) => eventRow(item, true)).join("") : `<p>No recent Digitraffic AIS position falls inside this country polygon.</p>`}<small>Coverage is limited to Finnish and adjacent Baltic waters and is not global satellite AIS.</small></section>
      <section class="nx-country-card"><h3>Internet connectivity</h3>${outages.length ? outages.map((item) => eventRow(item, true)).join("") : `<p>No IODA country-level outage detection in the last 48 hours.</p>`}<small>IODA detections are measurement anomalies, not proof of cause or total national disconnection.</small></section>
      <section class="nx-country-card"><h3>Forced displacement</h3>${displacementRecord ? `<div class="nx-country-facts"><div><span>Refugees abroad</span><strong>${Number(displacementRecord.refugees || 0).toLocaleString()}</strong></div><div><span>Asylum-seekers</span><strong>${Number(displacementRecord.asylum_seekers || 0).toLocaleString()}</strong></div><div><span>Internally displaced</span><strong>${Number(displacementRecord.idps || 0).toLocaleString()}</strong></div><div><span>Returned refugees</span><strong>${Number(displacementRecord.returned_refugees || 0).toLocaleString()}</strong></div></div><small>UNHCR end-${escapeHtml(displacementRecord.year || "year")} statistics by country of origin. Annual official statistics, not a real-time movement count.</small>` : `<p>No current UNHCR country-of-origin record is available.</p>`}</section>
      <section class="nx-country-card"><h3>Disease outbreak news</h3>${diseaseSignals.length ? diseaseSignals.slice(0, 6).map((item) => eventRow(item, true)).join("") : `<p>No current country-specific WHO Disease Outbreak News item in the retained window.</p>`}<small>WHO DONs cover selected confirmed or potential acute public-health events and are not an exhaustive global outbreak list.</small></section>
      <section class="nx-country-card"><h3>Radiation measurements</h3>${radiationSignals.length ? radiationSignals.slice(0, 8).map((item) => eventRow(item, true)).join("") : `<p>No recent sampled Safecast measurement is geographically associated with this country.</p>`}<small>Safecast readings are community sensor observations, not official incident declarations or health alerts. Verify anomalies with the relevant national authority.</small></section>
      <section class="nx-country-card"><h3>Country signals</h3>${signals.length ? signals.slice(0, 8).map((item) => eventRow(item, true)).join("") : `<p>No current verified public signals.</p>`}</section>
      <section class="nx-country-card"><h3>7-day timeline</h3>${renderCountryTimeline(signals)}</section>
      <section class="nx-country-card"><h3>Top reporting</h3>${reports.length ? reports.map((item) => eventRow(item, true)).join("") : `<p>No current country-specific public reporting retained.</p>`}<small>Official-wire locations require an explicit country mention. GDELT locations use headline geography when possible and otherwise show publisher geography.</small></section>
      <section class="nx-country-card"><h3>Military & infrastructure</h3><div class="nx-country-facts"><div><span>Military references</span><strong>${military.length}</strong></div><div><span>Strategic assets</span><strong>${infrastructure.length}</strong></div><div><span>Conflict signals</span><strong>${signals.filter((item) => item.layer === "conflicts").length}</strong></div></div>${assets.filter((item) => item.layer !== "stock-exchanges").slice(0, 7).map((item) => eventRow(item, true)).join("") || `<p>No public strategic assets configured for this country.</p>`}</section>
      <section class="nx-country-card"><h3>Sanctions-list context</h3>${sanctionsRecord ? `<div class="nx-country-facts"><div><span>Associated SDN records</span><strong>${Number(sanctionsRecord.records || 0).toLocaleString()}</strong></div><div><span>Individuals</span><strong>${Number(sanctionsRecord.individuals || 0).toLocaleString()}</strong></div><div><span>Entities</span><strong>${Number(sanctionsRecord.entities || 0).toLocaleString()}</strong></div><div><span>Vessels / aircraft</span><strong>${(Number(sanctionsRecord.vessels || 0) + Number(sanctionsRecord.aircraft || 0)).toLocaleString()}</strong></div></div><div class="nx-sanctions-programs">${(sanctionsRecord.programs || []).slice(0, 8).map((program) => `<span>${escapeHtml(program.program)} <strong>${Number(program.records || 0).toLocaleString()}</strong></span>`).join("")}</div>` : `<p>No country field associated with this territory was found in the current mapped OFAC SDN summary.</p>`}<small>Source: current U.S. Treasury OFAC SDN publication. Country association does not mean an entire country or every transaction is sanctioned. OFAC states that programs vary in scope and it does not maintain a single prohibited-country list. This operational context is not legal advice or a screening result.</small></section>
      <section class="nx-country-card"><h3>Financial-market infrastructure</h3>${exchanges.length ? `<div class="nx-exchange-list nx-exchange-country">${exchanges.map(({ exchange, clock }) => `<button type="button" data-event-id="${escapeHtml(exchange.id)}"><b>${escapeHtml(exchange.code)}</b><span><strong>${escapeHtml(exchange.title)}</strong><small>${clock.localTime} local · ${escapeHtml(exchange.open)}–${escapeHtml(exchange.close)}</small></span><em data-open="${clock.open}">${clock.open ? "Open" : "Closed"}</em></button>`).join("")}</div>` : `<p>No major exchange schedule is configured for this country.</p>`}<small>Indicative regular-session status only. Excludes holidays, auctions, lunch breaks and special sessions; no licensed price feed is implied.</small></section>
      <section class="nx-country-card"><h3>Economic indicators</h3>${state.countryProfileLoading ? `<p>Loading World Bank indicators…</p>` : state.countryProfile ? `<div class="nx-country-indicators">
        <div><span>GDP</span><strong>${formatCountryIndicator(indicators.gdp, { currency: true })}</strong><small>${escapeHtml(indicators.gdp?.year || "—")}</small></div>
        <div><span>GDP growth</span><strong>${formatCountryIndicator(indicators.gdpGrowth, { percent: true })}</strong><small>${escapeHtml(indicators.gdpGrowth?.year || "—")}</small></div>
        <div><span>Inflation</span><strong>${formatCountryIndicator(indicators.inflation, { percent: true })}</strong><small>${escapeHtml(indicators.inflation?.year || "—")}</small></div>
        <div><span>Unemployment</span><strong>${formatCountryIndicator(indicators.unemployment, { percent: true })}</strong><small>${escapeHtml(indicators.unemployment?.year || "—")}</small></div>
        <div><span>Population</span><strong>${formatCountryIndicator(indicators.population, { compact: true })}</strong><small>${escapeHtml(indicators.population?.year || "—")}</small></div>
        <div><span>Trade / GDP</span><strong>${formatCountryIndicator(indicators.tradeShare, { percent: true })}</strong><small>${escapeHtml(indicators.tradeShare?.year || "—")}</small></div>
        <div><span>Net energy imports</span><strong>${formatCountryIndicator(indicators.energyImports, { percent: true })}</strong><small>${escapeHtml(indicators.energyImports?.year || "—")}</small></div>
        <div><span>Public debt / GDP</span><strong>${formatCountryIndicator(indicators.publicDebt, { percent: true })}</strong><small>${escapeHtml(indicators.publicDebt?.year || "—")}</small></div>
        <div><span>Local reference FX</span><strong>${currency && rates[currency] ? `USD 1 = ${Number(rates[currency]).toFixed(3)} ${currency}` : "Not configured"}</strong><small>ECB reference</small></div>
      </div><small>Latest available observation per indicator; publication years differ and current-year IMF WEO values may be estimates. Source: ${escapeHtml(profileAttribution)}.</small>` : `<p>${escapeHtml(state.countryProfileError || "No verified public economic profile is available for this territory.")}</p>`}</section>
      <section class="nx-country-card"><h3>Trade & national capacity</h3>${state.countryProfileLoading ? `<p>Loading official indicators…</p>` : state.countryProfile ? `<div class="nx-country-indicators">
        <div><span>Goods & services imports</span><strong>${formatCountryIndicator(indicators.imports, { currency: true })}</strong><small>${escapeHtml(indicators.imports?.year || "—")}</small></div>
        <div><span>Goods & services exports</span><strong>${formatCountryIndicator(indicators.exports, { currency: true })}</strong><small>${escapeHtml(indicators.exports?.year || "—")}</small></div>
        <div><span>Applied tariff rate</span><strong>${formatCountryIndicator(indicators.tariffRate, { percent: true })}</strong><small>${escapeHtml(indicators.tariffRate?.year || "—")}</small></div>
        <div><span>Current account / GDP</span><strong>${formatCountryIndicator(indicators.currentAccount, { percent: true })}</strong><small>${escapeHtml(indicators.currentAccount?.year || "—")}</small></div>
        <div><span>Military expenditure / GDP</span><strong>${formatCountryIndicator(indicators.militarySpending, { percent: true })}</strong><small>${escapeHtml(indicators.militarySpending?.year || "—")}</small></div>
        <div><span>Internet use</span><strong>${formatCountryIndicator(indicators.internetUsage, { percent: true })}</strong><small>${escapeHtml(indicators.internetUsage?.year || "—")}</small></div>
        <div><span>Urban population</span><strong>${formatCountryIndicator(indicators.urbanPopulation, { percent: true })}</strong><small>${escapeHtml(indicators.urbanPopulation?.year || "—")}</small></div>
        <div><span>Renewable electricity</span><strong>${formatCountryIndicator(indicators.renewableElectricity, { percent: true })}</strong><small>${escapeHtml(indicators.renewableElectricity?.year || "—")}</small></div>
        <div><span>Life expectancy</span><strong>${formatCountryIndicator(indicators.lifeExpectancy)}</strong><small>${escapeHtml(indicators.lifeExpectancy?.year || "—")} · years</small></div>
      </div><small>Latest published World Bank observation for each series. Missing values remain unavailable and are never estimated locally.</small>` : `<p>${escapeHtml(state.countryProfileError || "Official capacity indicators are unavailable for this territory.")}</p>`}</section>
      <section class="nx-country-card"><h3>Debt, trade & tariff trends</h3>${state.countryProfileLoading ? `<p>Loading annual official series…</p>` : state.countryProfile ? countryTrendsPanel(indicators) : `<p>${escapeHtml(state.countryProfileError || "Comparable annual series are unavailable for this territory.")}</p>`}</section>
      <section class="nx-country-card"><h3>Operational resilience context</h3>${state.countryProfileLoading ? `<p>Waiting for official indicators…</p>` : resilience.score == null ? `<p>Insufficient verified inputs for a resilience context screen.</p>` : `<div class="nx-resilience-head"><strong>${resilience.score}</strong><span>/100 context</span><small>${resilience.coverage}/${resilience.total} components available</small></div><div class="nx-resilience-components">${resilience.components.map((item) => `<div title="${escapeHtml(item.basis)}"><span>${escapeHtml(item.label)}</span><i style="--resilience:${item.value}%"></i><strong>${item.value}</strong></div>`).join("")}</div>`}<small>This is a transparent EMS context screen, not World Monitor's proprietary CRI, an official national rating, a credit score, or a forecast. It averages only available disclosed components; coverage is shown explicitly.</small></section>
      <section class="nx-country-card"><h3>Country profile</h3><div class="nx-country-facts"><div><span>Formal name</span><strong>${escapeHtml(country.formalName || countryMetadata.name || country.name)}</strong></div><div><span>Capital</span><strong>${escapeHtml(countryMetadata.capitalCity || "No verified connector")}</strong></div><div><span>Region</span><strong>${escapeHtml(countryMetadata.region?.value || country.region || "Unavailable")}</strong></div><div><span>Subregion</span><strong>${escapeHtml(countryMetadata.subregion || country.subregion || "Unavailable")}</strong></div><div><span>Income group</span><strong>${escapeHtml(countryMetadata.incomeLevel?.value && countryMetadata.incomeLevel.value !== "Not classified by this source" ? countryMetadata.incomeLevel.value : country.incomeGroup || "Unavailable")}</strong></div><div><span>Economic classification</span><strong>${escapeHtml(country.economyGroup || "Unavailable")}</strong></div><div><span>Related market questions</span><strong>${predictions.length}</strong></div></div></section>
      <section class="nx-country-card"><h3>Related prediction markets</h3>${predictions.length ? predictions.map((market) => `<article class="nx-country-market"><strong>${escapeHtml(market.question)}</strong><span>Public market-implied estimate · ${escapeHtml(market.category || "strategic")}</span></article>`).join("") : `<p>No related strategic prediction market in the current public feed.</p>`}<small>Market probabilities are not verified forecasts. EMS is read-only and does not trade.</small></section>
      <p class="nx-country-method">Operational stress is a transparent recency-and-severity screen from currently retained public signals. It is not a sovereign risk, resilience, or credit rating. Validate critical items at their linked primary source.</p>
    </div>`;
  drawer.hidden = false;
  document.querySelector("#nxCloseCountry")?.addEventListener("click", closeCountryDetail);
}

async function selectCountry(country) {
  state.selected = null;
  document.querySelector("#nxDetail").hidden = true;
  state.selectedCountry = country;
  state.countryWeather = null;
  state.countryWeatherLoading = true;
  state.countryAirQuality = null;
  state.countryAirQualityLoading = true;
  state.countryProfile = null;
  state.countryProfileLoading = true;
  state.countryProfileError = "";
  state.countryTravelAdvisory = null;
  state.countryTravelAdvisoryLoading = true;
  state.countryTravelAdvisoryError = "";
  state.events = state.events.filter((event) => event.layer !== "travel-advisories");
  const baseFeeds = { ...state.feeds };
  const baseSourceState = { ...state.sourceState };
  delete baseFeeds.travelAdvisory;
  delete baseSourceState.travelAdvisory;
  state.feeds = baseFeeds;
  state.sourceState = baseSourceState;
  state.map?.draw();
  renderCountryDetail();
  const isCurrent = () => state.selectedCountry?.name === country.name;
  const weatherTask = loadLocationWeather(country.labelLatitude, country.labelLongitude)
    .then((value) => { if (isCurrent()) state.countryWeather = value; })
    .catch(() => { if (isCurrent()) state.countryWeather = null; })
    .finally(() => { if (isCurrent()) { state.countryWeatherLoading = false; renderCountryDetail(); } });
  const airQualityTask = loadLocationAirQuality(country.labelLatitude, country.labelLongitude)
    .then((value) => { if (isCurrent()) state.countryAirQuality = value; })
    .catch(() => { if (isCurrent()) state.countryAirQuality = null; })
    .finally(() => { if (isCurrent()) { state.countryAirQualityLoading = false; renderCountryDetail(); } });
  const profileTask = loadCountryProfile(country.iso)
    .then((value) => { if (isCurrent()) { state.countryProfile = value; state.countryProfileError = ""; } })
    .catch((error) => { if (isCurrent()) { state.countryProfile = null; state.countryProfileError = error?.message || "Country profile unavailable"; } })
    .finally(() => { if (isCurrent()) { state.countryProfileLoading = false; renderCountryDetail(); } });
  const advisoryTask = loadCountryTravelAdvisory(country)
    .then((value) => {
      if (!isCurrent()) return;
      state.countryTravelAdvisory = value;
      state.countryTravelAdvisoryError = "";
      const feed = { key: "travelAdvisory", data: value, savedAt: Date.now(), stale: false, cached: Boolean(value?.cached), proxied: true, attribution: value?.attribution || "UK FCDO" };
      state.feeds = { ...state.feeds, travelAdvisory: feed };
      state.sourceState = { ...state.sourceState, travelAdvisory: feed };
      state.worker?.postMessage({ type: "normalize", feeds: state.feeds, countryCoordinates: state.countryCoordinates, reason: "country-advisory" });
      renderSources();
      renderPanels();
    })
    .catch((error) => { if (isCurrent()) { state.countryTravelAdvisory = null; state.countryTravelAdvisoryError = error?.message || "Official travel advice unavailable"; } })
    .finally(() => { if (isCurrent()) { state.countryTravelAdvisoryLoading = false; renderCountryDetail(); renderPanels(); } });
  await Promise.allSettled([weatherTask, airQualityTask, profileTask, advisoryTask]);
}

function closeCountryDetail() {
  state.selectedCountry = null;
  state.countryTravelAdvisory = null;
  state.countryTravelAdvisoryLoading = false;
  state.countryTravelAdvisoryError = "";
  state.events = state.events.filter((event) => event.layer !== "travel-advisories");
  const remainingFeeds = { ...state.feeds };
  const remainingSourceState = { ...state.sourceState };
  delete remainingFeeds.travelAdvisory;
  delete remainingSourceState.travelAdvisory;
  state.feeds = remainingFeeds;
  state.sourceState = remainingSourceState;
  state.map?.draw();
  const drawer = document.querySelector("#nxCountryDetail");
  if (drawer) drawer.hidden = true;
  renderSources();
  renderPanels();
}

async function selectEvent(event) {
  closeCountryDetail();
  state.selected = event;
  state.map?.focus(event);
  state.map?.draw();
  const detail = document.querySelector("#nxDetail");
  const verifiedSourceUrl = safeExternalUrl(event.url);
  const sourceLink = verifiedSourceUrl ? `<a href="${escapeHtml(verifiedSourceUrl)}" target="_blank" rel="noopener noreferrer">Open primary source</a>` : "";
  const commercialDetail = event.commercialDirection ? `<dl class="nx-commercial-detail"><div><dt>Opportunity score</dt><dd>${Number(event.opportunityScore || 0)}/100</dd></div><div><dt>Risk score</dt><dd>${Number(event.riskScore || 0)}/100</dd></div><div><dt>Confidence</dt><dd>${Number(event.confidence || 0)}%</dd></div><div><dt>Commercial type</dt><dd>${escapeHtml(event.commercialType || "Discovery lead")}</dd></div><div><dt>Industries</dt><dd>${escapeHtml((event.industries || []).join(", ") || "Cross-industry")}</dd></div><div><dt>Evidence</dt><dd>${escapeHtml(event.evidenceLevel || "Linked public reporting")}</dd></div></dl><p class="nx-commercial-action"><strong>Suggested review:</strong> ${escapeHtml(event.recommendedAction || "Open and verify the linked publication before action.")}</p>` : "";
  detail.innerHTML = `<header><div><span>${escapeHtml(layerById(event.layer)?.label || "Intelligence")}</span><strong>${escapeHtml(event.title)}</strong></div><button type="button" id="nxCloseDetail" aria-label="Close">×</button></header>
    <div class="nx-detail-body">${severityBadge(event)}<p>${escapeHtml(event.detail || "No additional detail supplied by the source.")}</p><dl><div><dt>Source</dt><dd>${escapeHtml(event.source || layerById(event.layer)?.source || "Nexus")}</dd></div><div><dt>${event.structural ? "Type" : "Observed"}</dt><dd>${event.structural ? "Reference context · not a live alert" : relativeTime(event.timestamp)}</dd></div><div><dt>Position</dt><dd>${Number(event.latitude).toFixed(2)}, ${Number(event.longitude).toFixed(2)}</dd></div></dl>${commercialDetail}${sourceLink}<div class="nx-detail-actions"><button class="nx-button" id="nxWatchEvent" type="button">${state.watchlist.has(event.id) ? "Remove from watchlist" : "Add to watchlist"}</button><button class="nx-button" id="nxLoadWeather" type="button">Load local weather</button></div></div>`;
  detail.hidden = false;
  document.querySelector("#nxCloseDetail")?.addEventListener("click", closeDetail);
  document.querySelector("#nxWatchEvent")?.addEventListener("click", () => {
    if (state.watchlist.has(event.id)) state.watchlist.delete(event.id); else state.watchlist.add(event.id);
    savePreferences();
    document.querySelector("#nxWatchEvent").textContent = state.watchlist.has(event.id) ? "Remove from watchlist" : "Add to watchlist";
    updateViews();
  });
  document.querySelector("#nxLoadWeather")?.addEventListener("click", async () => {
    const button = document.querySelector("#nxLoadWeather");
    button.disabled = true; button.textContent = "Loading weather…";
    try {
      state.weather = await loadLocationWeather(event.latitude, event.longitude);
      state.weatherLocation = event;
      renderPanels();
      button.textContent = "Weather loaded";
      document.querySelector('[data-panel="weather"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      button.textContent = `Weather unavailable: ${error.message}`;
    }
  });
}

function closeDetail() {
  state.selected = null;
  state.map?.draw();
  document.querySelector("#nxDetail").hidden = true;
}

function bindEventRows(root = document) {
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-event-id]");
    if (!button) return;
    const id = button.dataset.eventId;
    const item = [...state.events, ...REFERENCE_POINTS].find((candidate) => candidate.id === id);
    if (item) void selectEvent(item);
  });
}

function updateViews() {
  const points = visibleEvents();
  state.map?.setPoints(points);
  renderStream();
  renderPanels();
  renderHealth();
  if (state.selectedCountry) renderCountryDetail();
}

function applyLens(lensId) {
  state.lens = INTELLIGENCE_LENSES[lensId] ? lensId : "full";
  state.enabledLayers = new Set(lensById(state.lens).layers);
  document.querySelector("#nxLens").value = state.lens;
  document.querySelector("#nxLensCaption").textContent = lensById(state.lens).description;
  renderLayers();
  savePreferences();
  syncUrlState();
  updateViews();
}

function initializeWorker() {
  const worker = new Worker("/new-ems/workers/intelligence-worker.js?v=commercial-intelligence-1");
  worker.addEventListener("message", ({ data }) => {
    if (data?.type !== "normalized") return;
    state.events = data.events || [];
    state.lastUpdated = data.generatedAt || Date.now();
    if (data.reason === "full") {
      state.refreshing = false;
      captureSnapshot();
    }
    updateViews();
  });
  worker.addEventListener("error", () => {
    state.refreshing = false;
    renderHealth();
  });
  state.worker = worker;
}

async function refreshFeeds(force = false) {
  if (state.refreshing) return;
  state.refreshing = true;
  renderHealth();
  const feeds = await loadIntelligenceFeeds({
    force,
    onSource: (source) => {
      state.sourceState[source.key] = source;
      renderHealth();
      renderSources();
    }
  });
  state.feeds = feeds;
  state.sourceState = feeds;
  state.worker.postMessage({ type: "normalize", feeds, countryCoordinates: state.countryCoordinates, reason: "full" });
  renderSources();
  renderPanels();
}

async function refreshMobility() {
  if (state.refreshing || state.mobilityRefreshing || document.visibilityState !== "visible") return;
  state.mobilityRefreshing = true;
  try {
    const feeds = await loadMobilityFeeds({
      onSource: (source) => {
        state.sourceState[source.key] = source;
      }
    });
    state.feeds = { ...state.feeds, ...feeds };
    state.sourceState = { ...state.sourceState, ...feeds };
    state.worker?.postMessage({ type: "normalize", feeds: state.feeds, countryCoordinates: state.countryCoordinates, reason: "mobility" });
    renderSources();
  } finally {
    state.mobilityRefreshing = false;
  }
}

function bindControls() {
  document.querySelector("#nxLens").addEventListener("change", (event) => applyLens(event.target.value));
  document.querySelector("#nxSearch").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    updateViews();
  });
  document.querySelector("#nxRefresh").addEventListener("click", () => void refreshFeeds(true));
  document.querySelector("#nxAllLayers").addEventListener("click", () => applyLens(state.lens));
  document.querySelector("#nxTimeRange").addEventListener("change", (event) => {
    state.timeRange = TIME_WINDOWS[event.target.value] != null ? event.target.value : "7d";
    savePreferences(); syncUrlState(); updateViews();
  });
  document.querySelector("#nxRegionPresets").addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-region]");
    if (!button || !REGION_PRESETS[button.dataset.region]) return;
    state.region = button.dataset.region;
    document.querySelectorAll("[data-region]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    state.map.focusRegion(REGION_PRESETS[state.region]);
    savePreferences(); syncUrlState();
  });
  document.querySelector("#nxMapMode").addEventListener("click", (event) => {
    state.mapMode = state.mapMode === "globe" ? "flat" : "globe";
    state.map.setMode(state.mapMode);
    state.map.focusRegion(REGION_PRESETS[state.region]);
    event.currentTarget.textContent = state.mapMode === "globe" ? "Flat map" : "3D globe";
    savePreferences(); syncUrlState();
  });
  document.querySelector("#nxShareView").addEventListener("click", async (event) => {
    syncUrlState();
    try { await navigator.clipboard.writeText(location.href); event.currentTarget.textContent = "View copied"; }
    catch { event.currentTarget.textContent = "URL updated"; }
    window.setTimeout(() => { event.currentTarget.textContent = "Copy view"; }, 1600);
  });
  document.querySelector("#nxLayerList").addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.checked) state.enabledLayers.add(event.target.value); else state.enabledLayers.delete(event.target.value);
    savePreferences(); syncUrlState(); updateViews();
  });
  document.querySelector("#nxLayerList").addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-layer-info]");
    if (button) showLayerInfo(button.dataset.layerInfo);
  });
  document.querySelector("#nxZoomIn").addEventListener("click", () => { state.map.zoom = clamp(state.map.zoom * 1.3, 1, 8); state.map.draw(); });
  document.querySelector("#nxZoomOut").addEventListener("click", () => { state.map.zoom = clamp(state.map.zoom / 1.3, 1, 8); state.map.constrainPan(); state.map.draw(); });
  document.querySelector("#nxResetMap").addEventListener("click", () => state.map.reset());
  document.querySelector("#nxSources").addEventListener("click", () => { renderSources(); document.querySelector("#nxSourceModal").hidden = false; });
  document.querySelector("#nxCloseSources").addEventListener("click", () => { document.querySelector("#nxSourceModal").hidden = true; });
  document.querySelector("#nxSourceModal").addEventListener("click", (event) => { if (event.target.id === "nxSourceModal") event.currentTarget.hidden = true; });
  document.querySelector("#nxPanelSettings").addEventListener("click", () => { renderPanelChoices(); document.querySelector("#nxPanelModal").hidden = false; });
  document.querySelector("#nxClosePanels").addEventListener("click", () => { document.querySelector("#nxPanelModal").hidden = true; });
  document.querySelector("#nxPanelModal").addEventListener("click", (event) => { if (event.target.id === "nxPanelModal") event.currentTarget.hidden = true; });
  document.querySelector("#nxCloseLayerInfo").addEventListener("click", () => { document.querySelector("#nxLayerModal").hidden = true; });
  document.querySelector("#nxLayerModal").addEventListener("click", (event) => { if (event.target.id === "nxLayerModal") event.currentTarget.hidden = true; });
  document.querySelector("#nxPanelChoices").addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.checked) state.hiddenPanels.delete(event.target.value); else state.hiddenPanels.add(event.target.value);
    savePreferences(); renderPanels();
  });
  document.querySelector("#nxMorePanels")?.addEventListener("click", () => {
    // Toggle between the minimised market-first workspace and the full module set.
    const minimized = [...minimizedPanelSet()].some((id) => state.hiddenPanels.has(id));
    state.hiddenPanels = minimized ? new Set() : minimizedPanelSet();
    const button = document.querySelector("#nxMorePanels");
    if (button) button.textContent = minimized ? "Market focus" : "More modules";
    savePreferences(); renderPanels(); renderPanelChoices();
  });
  document.querySelector("#nxPanels")?.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-capture-lead]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const lead = state.events.find((item) => item.id === button.getAttribute("data-capture-lead"));
    if (!lead || button.dataset.state === "sent") return;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      await captureLeadToEms({
        title: lead.title, country: lead.country, tradeCategory: lead.tradeCategory,
        commercialType: lead.commercialType, url: lead.url, leadScore: lead.leadScore,
        indiaRelevance: lead.indiaRelevance, opportunityScore: lead.opportunityScore, evidenceLevel: lead.evidenceLevel,
        payload: { industries: lead.industries || [], indiaReasons: lead.indiaReasons || [], source: lead.source || "" }
      });
      button.textContent = "✓ Sent to EMS";
      button.dataset.state = "sent";
    } catch (error) {
      button.textContent = "Retry";
      button.dataset.state = "error";
      button.title = error.message || "Lead capture failed";
      button.disabled = false;
    }
  });
  document.querySelector("#nxExportCsv").addEventListener("click", () => exportDashboard("csv"));
  document.querySelector("#nxExportJson").addEventListener("click", () => exportDashboard("json"));
  let draggedPanelId = "";
  document.querySelector("#nxPanels").addEventListener("dragstart", (event) => {
    const panel = event.target.closest?.("[data-panel]");
    if (!panel || event.target.tagName !== "HEADER") return;
    draggedPanelId = panel.dataset.panel; event.dataTransfer.effectAllowed = "move";
  });
  document.querySelector("#nxPanels").addEventListener("dragover", (event) => { if (event.target.closest?.("[data-panel]")) event.preventDefault(); });
  document.querySelector("#nxPanels").addEventListener("drop", (event) => {
    event.preventDefault(); const targetId = event.target.closest?.("[data-panel]")?.dataset.panel;
    if (!draggedPanelId || !targetId || draggedPanelId === targetId) return;
    const order = state.panelOrder.filter((id) => id !== draggedPanelId); order.splice(order.indexOf(targetId), 0, draggedPanelId); state.panelOrder = order;
    draggedPanelId = ""; savePreferences(); renderPanels();
  });
  document.querySelector("#nxPanels").addEventListener("submit", (event) => {
    if (event.target.id !== "nxMonitorForm") return;
    event.preventDefault(); const input = event.target.querySelector("#nxMonitorInput"); const term = input.value.trim();
    if (term && !state.monitors.some((item) => item.toLowerCase() === term.toLowerCase())) state.monitors.push(term);
    state.monitors = state.monitors.slice(0, 20); savePreferences(); updateViews();
  });
  document.querySelector("#nxPanels").addEventListener("click", (event) => {
    const officialSourceButton = event.target.closest?.("[data-official-source]");
    if (officialSourceButton) {
      state.officialSourceFilter = officialSourceButton.dataset.officialSource || "all";
      renderPanels();
      return;
    }
    const theaterButton = event.target.closest?.("[data-theater]");
    if (theaterButton) {
      const theater = STRATEGIC_THEATERS.find((item) => item.id === theaterButton.dataset.theater);
      if (theater) {
        closeDetail(); closeCountryDetail();
        state.map.focusRegion(theater);
        document.querySelectorAll("[data-region]").forEach((item) => item.setAttribute("aria-pressed", "false"));
        document.querySelector("#nxMap")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    const button = event.target.closest?.("[data-remove-monitor]");
    if (!button) return;
    state.monitors = state.monitors.filter((term) => term !== button.dataset.removeMonitor); savePreferences(); updateViews();
  });
  document.querySelector("#nxPanels").addEventListener("change", (event) => {
    if (event.target.id === "nxRouteOrigin") state.routeOrigin = event.target.value;
    else if (event.target.id === "nxRouteDestination") state.routeDestination = event.target.value;
    else if (event.target.id === "nxScenario") state.scenario = event.target.value;
    else return;
    savePreferences(); renderPanels();
  });
  document.querySelector("#nxCollapsePanels").addEventListener("click", (event) => {
    document.querySelector("#nxPanels").classList.toggle("compact");
    event.currentTarget.textContent = document.querySelector("#nxPanels").classList.contains("compact") ? "Expanded view" : "Compact view";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeDetail(); closeCountryDetail(); document.querySelector("#nxSourceModal").hidden = true; document.querySelector("#nxPanelModal").hidden = true; document.querySelector("#nxLayerModal").hidden = true; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector("#nxSearch").focus(); }
    if (event.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName || "")) { event.preventDefault(); document.querySelector("#nxSearch").focus(); }
  });
  bindEventRows();
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.WORLD_MONITOR,
    pageTitle: "Nexus Intelligence",
    pageDescription: "Native global situational awareness and decision intelligence",
    sidebarless: true,
    workspace: WORKSPACES.WORLD_MONITOR
  });
  if (!boot) return;
  readPreferences();
  readUrlState();
  renderShell();
  renderLayers();
  renderPanels();
  renderSources();
  state.map = new NexusMap(document.querySelector("#nxMap"), (event) => void selectEvent(event), (country) => void selectCountry(country));
  state.map.focusRegion(REGION_PRESETS[state.region]);
  try {
    const countries = await loadNaturalEarthBasemap();
    state.map?.setCountries(countries);
    state.countryCoordinates = Object.fromEntries(countries.filter((country) => Number.isFinite(country.labelLongitude) && Number.isFinite(country.labelLatitude)).flatMap((country) => [country.iso2, country.iso, country.name, country.shortName].filter((code) => code && code !== "-99").map((code) => [code, [country.labelLongitude, country.labelLatitude, country.name]])));
  } catch (error) { console.warn("Natural Earth country basemap unavailable; using embedded fallback", error); }
  loadEarthTexture().then((image) => state.map?.setEarthTexture(image)).catch((error) => console.warn("NASA Blue Marble texture unavailable; using shaded fallback", error));
  initializeWorker();
  bindControls();
  updateViews();
  await refreshFeeds(false);
  window.setInterval(() => void refreshFeeds(false), 5 * 60_000);
  window.setInterval(() => void refreshMobility(), 30_000);
  window.setInterval(() => {
    if (!state.refreshing && state.feeds.orbital?.data) state.worker?.postMessage({ type: "normalize", feeds: state.feeds, countryCoordinates: state.countryCoordinates, reason: "orbital" });
    state.map?.draw();
  }, 60_000);
}

init().catch((error) => {
  console.error("Nexus Intelligence failed to initialize", error);
  renderModuleContent(`<section class="card"><h3>Nexus Intelligence could not start</h3><p class="muted">${escapeHtml(error?.message || error)}</p></section>`);
});
