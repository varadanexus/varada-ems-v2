import { getSupabaseClient } from "../../config/supabase.js";

const CACHE_PREFIX = "nexus_intelligence_feed_v2:";
const COUNTRY_PROFILE_PREFIX = "nexus_intelligence_country_profile_v6:";
const COUNTRY_ADVISORY_PREFIX = "nexus_intelligence_country_advisory_v1:";
const WORLD_BANK_INDICATORS = Object.freeze({
  gdp: "NY.GDP.MKTP.CD", gdpGrowth: "NY.GDP.MKTP.KD.ZG", inflation: "FP.CPI.TOTL.ZG",
  unemployment: "SL.UEM.TOTL.ZS", population: "SP.POP.TOTL", tradeShare: "NE.TRD.GNFS.ZS", energyImports: "EG.IMP.CONS.ZS",
  imports: "NE.IMP.GNFS.CD", exports: "NE.EXP.GNFS.CD", tariffRate: "TM.TAX.MRCH.WM.AR.ZS", currentAccount: "BN.CAB.XOKA.GD.ZS",
  militarySpending: "MS.MIL.XPND.GD.ZS", internetUsage: "IT.NET.USER.ZS", urbanPopulation: "SP.URB.TOTL.IN.ZS",
  renewableElectricity: "EG.ELC.RNEW.ZS", lifeExpectancy: "SP.DYN.LE00.IN"
});

const SOURCES = Object.freeze({
  earthquakes: {
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    ttl: 5 * 60_000,
    attribution: "USGS Earthquake Hazards Program"
  },
  naturalEvents: {
    url: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=150&days=30",
    ttl: 10 * 60_000,
    attribution: "NASA Earth Observatory Natural Event Tracker"
  },
  airQuality: {
    url: "https://air-quality-api.open-meteo.com/v1/air-quality",
    ttl: 30 * 60_000,
    timeout: 25_000,
    proxyOnly: true,
    attribution: "Open-Meteo / Copernicus Atmosphere Monitoring Service (CAMS)"
  },
  disasterAlerts: {
    url: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/events4app",
    ttl: 15 * 60_000,
    attribution: "Global Disaster Alert and Coordination System (GDACS)"
  },
  aviationWeather: {
    url: "https://api.open-meteo.com/v1/forecast?latitude=28.56,19.09,13.20,25.25,1.36,51.47,40.64,33.94,50.04,35.55&longitude=77.10,72.87,77.71,55.36,103.99,-0.45,-73.78,-118.41,8.56,139.78&current=temperature_2m,weather_code,visibility,wind_speed_10m,wind_gusts_10m&wind_speed_unit=kn",
    ttl: 15 * 60_000,
    attribution: "Open-Meteo airport conditions"
  },
  militaryAircraft: {
    url: "https://api.adsb.lol/v2/mil",
    ttl: 20_000,
    timeout: 20_000,
    proxyOnly: true,
    attribution: "ADSB.lol community network · ODbL 1.0"
  },
  maritimeConditions: {
    url: "https://marine-api.open-meteo.com/v1/marine?latitude=1.26,31.23,51.95,24.99,18.95&longitude=103.84,121.49,4.14,55.06,72.95&current=wave_height,wave_direction,wave_period,sea_surface_temperature&cell_selection=sea",
    ttl: 30 * 60_000,
    attribution: "Open-Meteo Marine API"
  },
  vesselTraffic: {
    url: "https://meri.digitraffic.fi/api/ais/v1/locations",
    ttl: 30_000,
    timeout: 25_000,
    proxyOnly: true,
    attribution: "Fintraffic / Digitraffic.fi · CC BY 4.0 · normalized by Varada"
  },
  orbital: {
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=json",
    ttl: 2 * 60 * 60_000,
    attribution: "CelesTrak public GP orbital elements"
  },
  security: {
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=(conflict%20OR%20military%20OR%20attack)&mode=artlist&format=json&maxrecords=75&timespan=24h&sort=datedesc",
    ttl: 15 * 60_000,
    attribution: "GDELT Project"
  },
  sanctions: {
    url: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
    ttl: 6 * 60 * 60_000,
    timeout: 40_000,
    proxyOnly: true,
    attribution: "U.S. Treasury Office of Foreign Assets Control (OFAC) SDN List"
  },
  globalReporting: {
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=(economy%20OR%20technology%20OR%20climate%20OR%20health%20OR%20disaster)%20-conflict%20-military%20-attack&mode=artlist&format=json&maxrecords=100&timespan=24h&sort=datedesc",
    ttl: 15 * 60_000,
    timeout: 30_000,
    proxyOnly: true,
    attribution: "GDELT global public reporting"
  },
  businessOpportunities: {
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=%28tender%20OR%20procurement%20OR%20investment%20OR%20factory%20OR%20expansion%20OR%20%22trade%20agreement%22%20OR%20%22export%20deal%22%20OR%20%22infrastructure%20project%22%20OR%20%22market%20entry%22%29&mode=artlist&format=json&maxrecords=150&timespan=48h&sort=datedesc",
    ttl: 15 * 60_000,
    timeout: 30_000,
    proxyOnly: true,
    attribution: "GDELT commercial discovery / linked public publishers"
  },
  officialWire: {
    url: "ems://official-public-wire",
    ttl: 15 * 60_000,
    timeout: 35_000,
    proxyOnly: true,
    attribution: "Official public RSS/Atom wire"
  },
  serviceStatus: {
    url: "ems://official-service-status",
    ttl: 5 * 60_000,
    timeout: 25_000,
    proxyOnly: true,
    attribution: "GitHub / Cloudflare / OpenAI / Google Cloud official status"
  },
  travelAdvisory: {
    url: "ems://official-country-travel-advisory",
    ttl: 6 * 60 * 60_000,
    timeout: 25_000,
    proxyOnly: true,
    onDemand: true,
    attribution: "UK Foreign, Commonwealth & Development Office (FCDO)"
  },
  cyber: {
    url: "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json",
    ttl: 60 * 60_000,
    attribution: "U.S. Cybersecurity and Infrastructure Security Agency"
  },
  spaceWeather: {
    url: "https://services.swpc.noaa.gov/products/alerts.json",
    ttl: 10 * 60_000,
    attribution: "NOAA Space Weather Prediction Center"
  },
  crypto: {
    url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true",
    ttl: 5 * 60_000,
    attribution: "CoinGecko"
  },
  currencies: {
    url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,EUR,GBP,JPY,CNY,AED",
    ttl: 30 * 60_000,
    attribution: "Frankfurter / European Central Bank reference rates"
  },
  macroRisk: {
    url: "https://fred.stlouisfed.org/graph/fredgraph.csv",
    ttl: 60 * 60_000,
    timeout: 35_000,
    proxyOnly: true,
    attribution: "Federal Reserve Economic Data (FRED) / public U.S. agencies"
  },
  predictions: {
    url: "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false",
    ttl: 5 * 60_000,
    timeout: 25_000,
    proxyOnly: true,
    attribution: "Polymarket public Gamma market data"
  },
  internetOutages: {
    url: "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events",
    dynamicWindow: "48h",
    ttl: 10 * 60_000,
    timeout: 20_000,
    attribution: "IODA / Georgia Tech Internet Intelligence Lab"
  },
  displacement: {
    url: "https://api.unhcr.org/population/v1/population/?limit=500&year=2025&coo_all=true&cf_type=ISO",
    ttl: 24 * 60 * 60_000,
    timeout: 20_000,
    attribution: "UNHCR Refugee Population Statistics Database"
  },
  diseaseOutbreaks: {
    url: "https://www.who.int/api/emergencies/diseaseoutbreaknews?%24top=50&%24orderby=PublicationDate%20desc&%24format=json",
    ttl: 2 * 60 * 60_000,
    timeout: 20_000,
    attribution: "World Health Organization Disease Outbreak News"
  },
  radiation: {
    url: "https://simplemap.safecast.org/api/tracks/months/current",
    ttl: 30 * 60_000,
    timeout: 35_000,
    proxyOnly: true,
    attribution: "Safecast CC0 community radiation measurements"
  }
});

function sourceUrl(source) {
  if (source.dynamicWindow !== "48h") return source.url;
  const until = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ from: String(until - 48 * 60 * 60), until: String(until), format: "ioda", entityType: "country", limit: "100" });
  return `${source.url}?${params}`;
}

function readCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${key}`) || "null");
    return cached && typeof cached.savedAt === "number" ? cached : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage may be unavailable or full. Live data still remains in memory.
  }
}

async function requestJson(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function requestThroughEms(sourceKey, payload = {}, { withMeta = false } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("intelligence-feeds", {
    body: { source: sourceKey, ...payload }
  });
  if (error) {
    let detail = "";
    try {
      const body = await error.context?.clone?.().json();
      detail = String(body?.error || "");
    } catch {
      // Preserve the SDK error when the response has no JSON body.
    }
    throw new Error(detail || error.message || "EMS feed proxy request failed");
  }
  if (!data?.ok || data.source !== sourceKey || data.data == null) {
    throw new Error(data?.error || "EMS feed proxy returned an invalid response");
  }
  // When the proxy serves a last-good payload because the upstream is failing, it flags
  // the response stale/degraded so the client can label it honestly instead of hiding it.
  if (withMeta) return { data: data.data, stale: Boolean(data.stale), degraded: data.degraded || "" };
  return data.data;
}

async function fetchSource(key, { force = false } = {}) {
  const source = SOURCES[key];
  if (!source) throw new Error(`Unknown intelligence source: ${key}`);
  const cached = readCache(key);
  if (!force && cached && Date.now() - cached.savedAt < source.ttl) {
    return { key, data: cached.data, savedAt: cached.savedAt, stale: false, cached: true, attribution: source.attribution };
  }
  try {
    let data, stale = false, degraded = "";
    if (source.proxyOnly) {
      const meta = await requestThroughEms(key, {}, { withMeta: true });
      data = meta.data; stale = meta.stale; degraded = meta.degraded;
    } else {
      data = await requestJson(sourceUrl(source), source.timeout || 12_000);
    }
    writeCache(key, data);
    return { key, data, savedAt: Date.now(), stale, cached: false, proxied: Boolean(source.proxyOnly), attribution: source.attribution, degraded };
  } catch (error) {
    if (!source.proxyOnly) {
      try {
        const meta = await requestThroughEms(key, {}, { withMeta: true });
        writeCache(key, meta.data);
        return { key, data: meta.data, savedAt: Date.now(), stale: meta.stale, cached: false, proxied: true, attribution: source.attribution, degraded: meta.degraded };
      } catch (proxyError) {
        error = new Error(`${error.message}; EMS proxy: ${proxyError.message}`);
      }
    }
    if (cached) {
      return { key, data: cached.data, savedAt: cached.savedAt, stale: true, cached: true, attribution: source.attribution, error: error.message };
    }
    return { key, data: null, savedAt: 0, stale: true, cached: false, attribution: source.attribution, error: error.message };
  }
}

export async function loadIntelligenceFeeds({ force = false, onSource } = {}) {
  const keys = Object.keys(SOURCES).filter((key) => !SOURCES[key].onDemand);
  const entries = await Promise.all(keys.map(async (key) => {
    const result = await fetchSource(key, { force });
    onSource?.(result);
    return [key, result];
  }));
  return Object.fromEntries(entries);
}

export async function loadCountryTravelAdvisory(country) {
  const code = String(country?.iso || "").toUpperCase();
  const name = String(country?.name || country?.shortName || "").trim();
  if (!name) throw new Error("Country travel advice is unavailable for this territory");
  const cacheKey = `${COUNTRY_ADVISORY_PREFIX}${code || name.toLowerCase()}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached?.savedAt && Date.now() - cached.savedAt < SOURCES.travelAdvisory.ttl && cached.data) return { ...cached.data, cached: true };
  } catch {
    // The advisory remains available when optional browser storage is unavailable.
  }
  const data = await requestThroughEms("travelAdvisory", {
    country: code,
    countryName: name,
    latitude: Number(country?.labelLatitude),
    longitude: Number(country?.labelLongitude)
  });
  try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* optional cache */ }
  return data;
}

export async function loadMobilityFeeds({ force = false, onSource } = {}) {
  const keys = ["militaryAircraft", "vesselTraffic"];
  const entries = await Promise.all(keys.map(async (key) => {
    const result = await fetchSource(key, { force });
    onSource?.(result);
    return [key, result];
  }));
  return Object.fromEntries(entries);
}

export async function loadLocationWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: Number(latitude).toFixed(3),
    longitude: Number(longitude).toFixed(3),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    forecast_days: "2",
    timezone: "auto"
  });
  const data = await requestJson(`https://api.open-meteo.com/v1/forecast?${params}`, 10_000);
  return { ...data, attribution: "Open-Meteo" };
}

export async function loadLocationAirQuality(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: Number(latitude).toFixed(3),
    longitude: Number(longitude).toFixed(3),
    current: "us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,dust,uv_index",
    timezone: "auto"
  });
  let data;
  try {
    data = await requestThroughEms("airQuality", { latitude: Number(latitude), longitude: Number(longitude) });
  } catch {
    data = await requestJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, 12_000);
  }
  return {
    ...data,
    attribution: "Open-Meteo / Copernicus Atmosphere Monitoring Service (CAMS)",
    disclaimer: "Modelled CAMS atmospheric composition at the nearest grid cell; not a certified ground-sensor reading or health directive."
  };
}

export async function loadCountryProfile(countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Country profile is unavailable for this territory");
  const key = `${COUNTRY_PROFILE_PREFIX}${code}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached?.savedAt && Date.now() - cached.savedAt < 6 * 60 * 60_000 && cached.data) return { ...cached.data, cached: true };
  } catch {
    // Country profiles still load when local storage is unavailable.
  }
  const directRequest = async (path) => requestJson(`https://api.worldbank.org/v2/${path}${path.includes("?") ? "&" : "?"}format=json`, 15_000);
  const buildProfile = async () => {
    const [countryResult, indicatorsResult] = await Promise.allSettled([
      directRequest(`country/${code}?per_page=5`),
      directRequest(`country/${code}/indicator/${Object.values(WORLD_BANK_INDICATORS).join(";")}?source=2&date=2010:${new Date().getUTCFullYear()}&per_page=1000`)
    ]);
    const countryResponse = countryResult.status === "fulfilled" ? countryResult.value : null;
    const country = Array.isArray(countryResponse?.[1]) ? countryResponse[1][0] || null : null;
    const indicatorsResponse = indicatorsResult.status === "fulfilled" ? indicatorsResult.value : null;
    const indicatorRows = Array.isArray(indicatorsResponse?.[1]) ? indicatorsResponse[1] : [];
    const indicators = Object.fromEntries(Object.entries(WORLD_BANK_INDICATORS).map(([name, indicatorCode]) => {
      const rows = indicatorRows.filter((row) => row?.indicator?.id === indicatorCode && Number.isFinite(Number(row?.value)));
      const history = rows.map((row) => ({ year: String(row.date), value: Number(row.value) })).sort((left, right) => Number(left.year) - Number(right.year)).slice(-16);
      const row = rows.sort((left, right) => Number(right.date) - Number(left.date))[0] || null;
      return [name, row ? { value: Number(row.value), year: row.date, label: row.indicator?.value || name, code: row.indicator?.id || WORLD_BANK_INDICATORS[name], history } : null];
    }));
    return { country, indicators, unavailable: [countryResult, indicatorsResult].filter((result) => result.status === "rejected").length, retrievedAt: Date.now(), attribution: "World Bank Open Data" };
  };
  const [directResult, proxyResult] = await Promise.allSettled([
    buildProfile(),
    requestThroughEms("countryProfile", { country: code })
  ]);
  const direct = directResult.status === "fulfilled" ? directResult.value : null;
  const proxied = proxyResult.status === "fulfilled" ? proxyResult.value : null;
  const indicatorNames = new Set([...Object.keys(direct?.indicators || {}), ...Object.keys(proxied?.indicators || {})]);
  const indicators = Object.fromEntries([...indicatorNames].map((name) => {
    const directIndicator = direct?.indicators?.[name];
    const proxiedIndicator = proxied?.indicators?.[name];
    if (!directIndicator) return [name, proxiedIndicator || null];
    if (!proxiedIndicator) return [name, directIndicator];
    return [name, { ...proxiedIndicator, ...directIndicator, history: directIndicator.history?.length ? directIndicator.history : proxiedIndicator.history || [] }];
  }));
  const attributions = [...new Set([direct?.attribution, proxied?.attribution].filter(Boolean).flatMap((value) => String(value).split(" / ")))];
  const data = {
    country: direct?.country || proxied?.country || null,
    indicators,
    unavailable: Math.min(Number(direct?.unavailable ?? Infinity), Number(proxied?.unavailable ?? Infinity)),
    retrievedAt: Date.now(),
    attribution: attributions.join(" / ") || "World Bank Open Data / IMF World Economic Outlook"
  };
  if (!data.country && !Object.values(indicators).some(Boolean)) {
    const proxyMessage = proxyResult.status === "rejected" ? proxyResult.reason?.message : proxied?.errors?.join("; ");
    throw new Error(`Public country profile is temporarily unavailable${proxyMessage ? ` · ${proxyMessage}` : ""}`);
  }
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* optional cache */ }
  return data;
}

export function sourceCatalog() {
  return Object.entries(SOURCES).map(([id, source]) => ({ id, ...source }));
}

export function cacheAgeLabel(savedAt) {
  if (!savedAt) return "unavailable";
  const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export async function captureLeadToEms(lead) {
  // Auth-gated handoff into the EMS workflow via the SECURITY DEFINER RPC. Requires the
  // nexus_leads migration to be applied; until then the RPC is absent and this rejects clearly.
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("capture_nexus_lead", { lead });
  if (error) {
    if (/could not find|does not exist|not found|schema cache/i.test(error.message || "")) {
      throw new Error("EMS lead store is not provisioned yet — apply the nexus_leads migration.");
    }
    throw new Error(error.message || "Lead capture failed");
  }
  return data;
}
