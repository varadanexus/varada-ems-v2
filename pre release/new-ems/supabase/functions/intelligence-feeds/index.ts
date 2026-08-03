// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://varadanexus.com",
  "https://www.varadanexus.com",
  "http://localhost:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501",
]);

const SOURCES = Object.freeze({
  earthquakes: { url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", ttl: 5 * 60_000 },
  naturalEvents: { url: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=150&days=30", ttl: 10 * 60_000 },
  airQuality: { ttl: 30 * 60_000, timeout: 25_000, dynamicAirQuality: true },
  disasterAlerts: { url: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/events4app", ttl: 15 * 60_000 },
  aviationWeather: { url: "https://api.open-meteo.com/v1/forecast?latitude=28.56,19.09,13.20,25.25,1.36,51.47,40.64,33.94,50.04,35.55&longitude=77.10,72.87,77.71,55.36,103.99,-0.45,-73.78,-118.41,8.56,139.78&current=temperature_2m,weather_code,visibility,wind_speed_10m,wind_gusts_10m&wind_speed_unit=kn", ttl: 15 * 60_000 },
  militaryAircraft: { ttl: 20_000, timeout: 20_000, dynamicMilitaryAircraft: true },
  maritimeConditions: { url: "https://marine-api.open-meteo.com/v1/marine?latitude=1.26,31.23,51.95,24.99,18.95&longitude=103.84,121.49,4.14,55.06,72.95&current=wave_height,wave_direction,wave_period,sea_surface_temperature&cell_selection=sea", ttl: 30 * 60_000 },
  vesselTraffic: { ttl: 30_000, timeout: 25_000, dynamicVesselTraffic: true },
  orbital: { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=json", ttl: 2 * 60 * 60_000 },
  security: { url: "https://api.gdeltproject.org/api/v2/doc/doc?query=(conflict%20OR%20military%20OR%20attack)&mode=artlist&format=json&maxrecords=75&timespan=24h&sort=datedesc", ttl: 15 * 60_000 },
  sanctions: { ttl: 6 * 60 * 60_000, timeout: 40_000, dynamicSanctions: true },
  globalReporting: { url: "https://api.gdeltproject.org/api/v2/doc/doc?query=(economy%20OR%20technology%20OR%20climate%20OR%20health%20OR%20disaster)%20-conflict%20-military%20-attack&mode=artlist&format=json&maxrecords=100&timespan=24h&sort=datedesc", ttl: 15 * 60_000, timeout: 30_000 },
  businessOpportunities: { url: "https://api.gdeltproject.org/api/v2/doc/doc?query=%28tender%20OR%20procurement%20OR%20investment%20OR%20factory%20OR%20expansion%20OR%20%22trade%20agreement%22%20OR%20%22export%20deal%22%20OR%20%22infrastructure%20project%22%20OR%20%22market%20entry%22%29&mode=artlist&format=json&maxrecords=150&timespan=48h&sort=datedesc", ttl: 15 * 60_000, timeout: 30_000 },
  officialWire: { ttl: 15 * 60_000, timeout: 35_000, dynamicOfficialWire: true },
  serviceStatus: { ttl: 5 * 60_000, timeout: 25_000, dynamicServiceStatus: true },
  travelAdvisory: { ttl: 6 * 60 * 60_000, timeout: 25_000, dynamicCountry: true, dynamicTravelAdvisory: true },
  cyber: { url: "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json", ttl: 60 * 60_000 },
  spaceWeather: { url: "https://services.swpc.noaa.gov/products/alerts.json", ttl: 10 * 60_000 },
  crypto: { url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true", ttl: 5 * 60_000 },
  currencies: { url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,EUR,GBP,JPY,CNY,AED", ttl: 30 * 60_000 },
  macroRisk: { ttl: 60 * 60_000, timeout: 35_000, dynamicFred: true },
  predictions: { url: "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false", ttl: 5 * 60_000, timeout: 30_000 },
  internetOutages: { url: "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events", ttl: 10 * 60_000, timeout: 20_000, dynamicWindow: "48h" },
  displacement: { url: "https://api.unhcr.org/population/v1/population/?limit=500&year=2025&coo_all=true&cf_type=ISO", ttl: 24 * 60 * 60_000, timeout: 20_000 },
  diseaseOutbreaks: { url: "https://www.who.int/api/emergencies/diseaseoutbreaknews?%24top=50&%24orderby=PublicationDate%20desc&%24format=json", ttl: 2 * 60 * 60_000, timeout: 20_000 },
  radiation: { url: "https://simplemap.safecast.org/api/tracks/months/current", ttl: 30 * 60_000, timeout: 35_000, dynamicRadiation: true },
  countryProfile: { ttl: 6 * 60 * 60_000, timeout: 25_000, dynamicCountry: true },
});

const WORLD_BANK_INDICATORS = Object.freeze({
  gdp: "NY.GDP.MKTP.CD",
  gdpGrowth: "NY.GDP.MKTP.KD.ZG",
  inflation: "FP.CPI.TOTL.ZG",
  unemployment: "SL.UEM.TOTL.ZS",
  population: "SP.POP.TOTL",
  tradeShare: "NE.TRD.GNFS.ZS",
  energyImports: "EG.IMP.CONS.ZS",
  imports: "NE.IMP.GNFS.CD",
  exports: "NE.EXP.GNFS.CD",
  tariffRate: "TM.TAX.MRCH.WM.AR.ZS",
  currentAccount: "BN.CAB.XOKA.GD.ZS",
  militarySpending: "MS.MIL.XPND.GD.ZS",
  internetUsage: "IT.NET.USER.ZS",
  urbanPopulation: "SP.URB.TOTL.IN.ZS",
  renewableElectricity: "EG.ELC.RNEW.ZS",
  lifeExpectancy: "SP.DYN.LE00.IN",
});

function sourceUrl(definition: Record<string, unknown>) {
  if (definition.dynamicWindow !== "48h") return String(definition.url);
  const until = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ from: String(until - 48 * 60 * 60), until: String(until), format: "ioda", entityType: "country", limit: "100" });
  return `${definition.url}?${params}`;
}

const memoryCache = new Map<string, { savedAt: number; data: unknown }>();

// --- Rate-limit resilience: exponential backoff + jitter, per-provider token bucket,
//     and a circuit breaker. Applied to every upstream request via resilientFetch(). ---
type ProviderState = { failures: number; openUntil: number; nextAllowedAt: number };
const providerState = new Map<string, ProviderState>();
const PROVIDER_LIMITS: Record<string, { minIntervalMs: number; maxRetries: number; breakerThreshold: number; breakerCooldownMs: number }> = {
  gdelt:     { minIntervalMs: 5_000, maxRetries: 4, breakerThreshold: 3, breakerCooldownMs: 5 * 60_000 },
  worldbank: { minIntervalMs: 1_000, maxRetries: 2, breakerThreshold: 4, breakerCooldownMs: 2 * 60_000 },
  imf:       { minIntervalMs: 1_000, maxRetries: 2, breakerThreshold: 4, breakerCooldownMs: 2 * 60_000 },
  fred:      { minIntervalMs: 1_000, maxRetries: 3, breakerThreshold: 3, breakerCooldownMs: 3 * 60_000 },
  ofac:      { minIntervalMs: 2_000, maxRetries: 2, breakerThreshold: 3, breakerCooldownMs: 5 * 60_000 },
  rss:       { minIntervalMs: 800,   maxRetries: 2, breakerThreshold: 4, breakerCooldownMs: 2 * 60_000 },
  status:    { minIntervalMs: 800,   maxRetries: 2, breakerThreshold: 4, breakerCooldownMs: 2 * 60_000 },
  default:   { minIntervalMs: 1_000, maxRetries: 2, breakerThreshold: 4, breakerCooldownMs: 2 * 60_000 },
};
const limitsFor = (provider: string) => PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.default;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// full-jitter exponential backoff, capped
const backoffDelay = (attempt: number, base = 500, cap = 20_000) => Math.round(Math.min(cap, base * 2 ** attempt) * (0.5 + Math.random() * 0.5));

function providerFor(url: string) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("gdeltproject")) return "gdelt";
    if (host.includes("worldbank")) return "worldbank";
    if (host.includes("imf.org")) return "imf";
    if (host.includes("stlouisfed")) return "fred";
    if (host.includes("ofac.treas") || host.includes("sanctionslistservice")) return "ofac";
    if (host.includes("githubstatus") || host.includes("cloudflarestatus") || host.includes("status.openai") || host.includes("status.cloud.google")) return "status";
    if (host.endsWith("gov.uk") || host.includes("nasa.gov") || host.includes("noaa.gov") || host.includes("un.org") || host.includes("cisa.gov") || host.includes("ecb.europa")) return "rss";
    return "default";
  } catch { return "default"; }
}

// Mirrors fetch(url, init) so call sites only change the function name. Adds a
// circuit-breaker gate, a token-bucket floor, and 429/503 + network-error retry.
async function resilientFetch(url: string, init: RequestInit = {}, providerKey?: string): Promise<Response> {
  const provider = providerKey || providerFor(url);
  const signal = init.signal as AbortSignal | undefined;
  const state = providerState.get(provider) || { failures: 0, openUntil: 0, nextAllowedAt: 0 };
  if (Date.now() < state.openUntil) throw new Error(`${provider} circuit open; upstream cooling down until ${new Date(state.openUntil).toISOString()}`);
  const limits = limitsFor(provider);
  let attempt = 0;
  for (;;) {
    const wait = state.nextAllowedAt - Date.now();
    if (wait > 0) await sleep(wait);
    state.nextAllowedAt = Date.now() + limits.minIntervalMs;
    providerState.set(provider, state);
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || response.status === 503) {
        if (attempt >= limits.maxRetries) {
          state.failures += 1;
          if (state.failures >= limits.breakerThreshold) state.openUntil = Date.now() + limits.breakerCooldownMs;
          providerState.set(provider, state);
          throw new Error(`${provider} HTTP ${response.status} (rate limited after ${attempt + 1} attempts)`);
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : backoffDelay(attempt));
        attempt += 1;
        continue;
      }
      state.failures = 0;
      state.openUntil = 0;
      providerState.set(provider, state);
      return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (attempt >= limits.maxRetries) {
        state.failures += 1;
        if (state.failures >= limits.breakerThreshold) state.openUntil = Date.now() + limits.breakerCooldownMs;
        providerState.set(provider, state);
        throw error;
      }
      await sleep(backoffDelay(attempt));
      attempt += 1;
    }
  }
}
const STRATEGIC_PREDICTION = /\b(war|conflict|ceasefire|invasion|military|missile|nuclear|sanction|tariff|trade|shipping|strait|election|president|prime minister|congress|government|fed|interest rate|inflation|gdp|recession|oil|gas|gold|bitcoin|ethereum|crypto|climate|temperature|hurricane|earthquake|artificial intelligence|openai|china|russia|ukraine|iran|israel|palestine|india|pakistan|united states|u\.s\.|european union|nato)\b/i;
const SPORTS_PREDICTION = /\b(atp|wta|lol|dota|esports|bo[135]|game [0-9]|vs\.?|tournament|cup qualifier)\b/i;
const OFFICIAL_WIRE_FEEDS = Object.freeze([
  { id: "un-news", label: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml" },
  { id: "nasa", label: "NASA", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss" },
  { id: "nos", label: "NOAA National Ocean Service", url: "https://oceanservice.noaa.gov/newsroom/nosmedia.xml" },
  { id: "spc", label: "NOAA Storm Prediction Center", url: "https://www.spc.noaa.gov/products/spcrss.xml" },
  { id: "cisa", label: "CISA", url: "https://www.cisa.gov/news.xml" },
  { id: "nhc", label: "NHC Atlantic", url: "https://www.nhc.noaa.gov/index-at.xml" },
  { id: "nhc-pacific", label: "NHC Eastern Pacific", url: "https://www.nhc.noaa.gov/index-ep.xml" },
  { id: "ecb", label: "European Central Bank", url: "https://www.ecb.europa.eu/rss/press.html" },
]);

const SERVICE_STATUS_PROVIDERS = Object.freeze([
  { id: "github", label: "GitHub", kind: "statuspage", url: "https://www.githubstatus.com/api/v2/summary.json", statusUrl: "https://www.githubstatus.com/" },
  { id: "cloudflare", label: "Cloudflare", kind: "statuspage", url: "https://www.cloudflarestatus.com/api/v2/summary.json", statusUrl: "https://www.cloudflarestatus.com/" },
  { id: "openai", label: "OpenAI", kind: "statuspage", url: "https://status.openai.com/api/v2/summary.json", statusUrl: "https://status.openai.com/" },
  { id: "google-cloud", label: "Google Cloud", kind: "google", url: "https://status.cloud.google.com/incidents.json", statusUrl: "https://status.cloud.google.com/" },
]);

const AIR_QUALITY_SITES = Object.freeze([
  { id: "delhi", label: "Delhi", country: "India", latitude: 28.61, longitude: 77.21 },
  { id: "mumbai", label: "Mumbai", country: "India", latitude: 19.08, longitude: 72.88 },
  { id: "beijing", label: "Beijing", country: "China", latitude: 39.90, longitude: 116.41 },
  { id: "shanghai", label: "Shanghai", country: "China", latitude: 31.23, longitude: 121.47 },
  { id: "tokyo", label: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69 },
  { id: "seoul", label: "Seoul", country: "South Korea", latitude: 37.57, longitude: 126.98 },
  { id: "singapore", label: "Singapore", country: "Singapore", latitude: 1.35, longitude: 103.82 },
  { id: "jakarta", label: "Jakarta", country: "Indonesia", latitude: -6.21, longitude: 106.85 },
  { id: "sydney", label: "Sydney", country: "Australia", latitude: -33.87, longitude: 151.21 },
  { id: "dubai", label: "Dubai", country: "United Arab Emirates", latitude: 25.20, longitude: 55.27 },
  { id: "riyadh", label: "Riyadh", country: "Saudi Arabia", latitude: 24.71, longitude: 46.68 },
  { id: "cairo", label: "Cairo", country: "Egypt", latitude: 30.04, longitude: 31.24 },
  { id: "nairobi", label: "Nairobi", country: "Kenya", latitude: -1.29, longitude: 36.82 },
  { id: "johannesburg", label: "Johannesburg", country: "South Africa", latitude: -26.20, longitude: 28.05 },
  { id: "lagos", label: "Lagos", country: "Nigeria", latitude: 6.52, longitude: 3.38 },
  { id: "london", label: "London", country: "United Kingdom", latitude: 51.51, longitude: -0.13 },
  { id: "paris", label: "Paris", country: "France", latitude: 48.86, longitude: 2.35 },
  { id: "berlin", label: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.41 },
  { id: "moscow", label: "Moscow", country: "Russia", latitude: 55.76, longitude: 37.62 },
  { id: "istanbul", label: "Istanbul", country: "Türkiye", latitude: 41.01, longitude: 28.98 },
  { id: "new-york", label: "New York", country: "United States", latitude: 40.71, longitude: -74.01 },
  { id: "los-angeles", label: "Los Angeles", country: "United States", latitude: 34.05, longitude: -118.24 },
  { id: "mexico-city", label: "Mexico City", country: "Mexico", latitude: 19.43, longitude: -99.13 },
  { id: "toronto", label: "Toronto", country: "Canada", latitude: 43.65, longitude: -79.38 },
  { id: "sao-paulo", label: "São Paulo", country: "Brazil", latitude: -23.55, longitude: -46.63 },
  { id: "buenos-aires", label: "Buenos Aires", country: "Argentina", latitude: -34.60, longitude: -58.38 },
  { id: "santiago", label: "Santiago", country: "Chile", latitude: -33.45, longitude: -70.67 },
  { id: "lima", label: "Lima", country: "Peru", latitude: -12.05, longitude: -77.04 }
]);

function strategicPredictions(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.filter((market) => {
    const item = market as Record<string, unknown>;
    const text = `${item.question || ""} ${item.category || ""} ${JSON.stringify(item.tags || [])}`;
    return STRATEGIC_PREDICTION.test(text) && !SPORTS_PREDICTION.test(text);
  }).sort((left, right) => Number((right as Record<string, unknown>).volume24hr || 0) - Number((left as Record<string, unknown>).volume24hr || 0)).slice(0, 12);
}

async function searchStrategicPredictions(signal: AbortSignal) {
  const queries = ["war", "election", "economy", "trade", "oil", "climate", "artificial intelligence", "crypto"];
  const results = await Promise.all(queries.map(async (query) => {
    const params = new URLSearchParams({ q: query, events_status: "active", limit_per_type: "12", search_profiles: "false", search_tags: "false" });
    const response = await resilientFetch(`https://gamma-api.polymarket.com/public-search?${params}`, {
      signal,
      headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" },
    });
    if (!response.ok) throw new Error(`Prediction search HTTP ${response.status}`);
    return await response.json();
  }));
  const markets = results.flatMap((result) => (result?.events || []).flatMap((event: Record<string, unknown>) => Array.isArray(event.markets) ? event.markets : []));
  return [...new Map(markets.map((market: Record<string, unknown>) => [String(market.id || market.conditionId || market.slug), market])).values()];
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function corsHeaders(req: Request) {
  const requested = req.headers.get("origin") || "";
  const origin = ALLOWED_ORIGINS.has(requested) ? requested : "https://www.varadanexus.com";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Authentication required");
  const jwt = authHeader.slice(7).trim();
  const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: appUserId, error: identityError } = await caller.rpc("current_app_user_id");
  if (identityError || !appUserId) throw new Error("Authentication required");
  const { data: permitted, error: permissionError } = await caller.rpc("has_permission", {
    module_code: "world-monitor",
    action_code: "view",
  });
  if (permissionError || permitted !== true) throw new Error("Nexus Intelligence view permission is required");
}

async function fetchWorldBankProfile(country: string, signal: AbortSignal) {
  if (!/^[A-Z]{3}$/.test(country)) throw new Error("A valid ISO alpha-3 country code is required");
  const request = async (path: string) => {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await resilientFetch(`https://api.worldbank.org/v2/${path}${path.includes("?") ? "&" : "?"}format=json`, {
        signal,
        headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" },
      });
      lastStatus = response.status;
      if (response.ok) return await response.json();
    }
    throw new Error(`World Bank HTTP ${lastStatus}`);
  };
  const externalRequest = async (url: string) => {
    const response = await resilientFetch(url, { signal, headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" } });
    if (!response.ok) throw new Error(`Public profile HTTP ${response.status}`);
    return await response.json();
  };
  const results = await Promise.allSettled([
    request(`country/${country}?per_page=5`),
    request(`country/${country}/indicator/${Object.values(WORLD_BANK_INDICATORS).join(";")}?source=2&date=2010:${new Date().getUTCFullYear()}&per_page=1000`),
    externalRequest(`https://www.imf.org/external/datamapper/api/v1/NGDPD/NGDP_RPCH/PCPIPCH/LUR/LP/GGXWDG_NGDP/${country}`),
  ]);
  const [countryResult, indicatorsResult, imfResult] = results;
  const countryResponse = countryResult.status === "fulfilled" ? countryResult.value : null;
  let metadata = Array.isArray(countryResponse?.[1]) ? countryResponse[1][0] || null : null;
  const indicatorsResponse = indicatorsResult.status === "fulfilled" ? indicatorsResult.value : null;
  const indicatorRows = Array.isArray(indicatorsResponse?.[1]) ? indicatorsResponse[1] : [];
  const indicators = Object.fromEntries(Object.entries(WORLD_BANK_INDICATORS).map(([key, indicatorCode]) => {
    const rows = indicatorRows.filter((row) => row?.indicator?.id === indicatorCode && Number.isFinite(Number(row?.value)));
    const history = rows.map((row) => ({ year: String(row.date), value: Number(row.value) })).sort((left, right) => Number(left.year) - Number(right.year)).slice(-16);
    const row = rows.sort((left, right) => Number(right.date) - Number(left.date))[0] || null;
    return [key, row ? { value: Number(row.value), year: row.date, label: row.indicator?.value || key, code: row.indicator?.id || WORLD_BANK_INDICATORS[key], history } : null];
  }));
  const imf = imfResult?.status === "fulfilled" ? imfResult.value : null;
  const latestImf = (indicator: string, multiplier = 1) => {
    const series = imf?.values?.[indicator]?.[country] || {};
    const maximumYear = new Date().getUTCFullYear();
    const history = Object.keys(series).filter((value) => Number(value) >= 2010 && Number(value) <= maximumYear && Number.isFinite(Number(series[value]))).sort((a, b) => Number(a) - Number(b)).map((year) => ({ year, value: Number(series[year]) * multiplier })).slice(-16);
    const latest = history.at(-1);
    return latest ? { value: latest.value, year: latest.year, label: `IMF ${indicator}`, code: indicator, estimate: true, history } : null;
  };
  indicators.gdp ||= latestImf("NGDPD", 1_000_000_000);
  indicators.gdpGrowth ||= latestImf("NGDP_RPCH");
  indicators.inflation ||= latestImf("PCPIPCH");
  indicators.unemployment ||= latestImf("LUR");
  indicators.population ||= latestImf("LP", 1_000_000);
  indicators.publicDebt = latestImf("GGXWDG_NGDP");
  const unavailable = results.filter((result) => result.status === "rejected").length;
  const errors = [...new Set(results.filter((result) => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)))].slice(0, 3);
  return { country: metadata, indicators, unavailable, errors, retrievedAt: Date.now(), attribution: "World Bank Open Data / IMF World Economic Outlook" };
}

async function fetchSafecastRadiation(signal: AbortSignal) {
  const request = async (url: string) => {
    const response = await resilientFetch(url, {
      signal,
      headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" },
    });
    if (!response.ok) throw new Error(`Safecast HTTP ${response.status}`);
    return await response.json();
  };
  const now = new Date();
  const months = [0, 1].map((offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  });
  const indexes = await Promise.allSettled(months.map(({ year, month }) => request(`https://simplemap.safecast.org/api/tracks/months/${year}/${month}`)));
  const trackMap = new Map();
  indexes.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const rows = Array.isArray(result.value) ? result.value : Array.isArray(result.value?.tracks) ? result.value.tracks : [];
    rows.forEach((track, index) => {
      const id = String(track.trackID || track.trackId || track.id || "").trim();
      if (id) trackMap.set(id, { ...track, id, index: Number(track.index ?? index) });
    });
  });
  const tracks = [...trackMap.values()].sort((left, right) => right.index - left.index).slice(0, 6);
  if (!tracks.length) throw new Error("Safecast returned no recent tracks");
  const trackResults = await Promise.allSettled(tracks.map((track) => request(`https://simplemap.safecast.org/api/track/${encodeURIComponent(track.id)}.json`)));
  const sampled = [];
  trackResults.forEach((result, trackIndex) => {
    if (result.status !== "fulfilled") return;
    const rows = Array.isArray(result.value?.markers) ? result.value.markers : Array.isArray(result.value) ? result.value : [];
    const valid = rows.filter((marker) => Number.isFinite(Number(marker.lat ?? marker.latitude)) && Number.isFinite(Number(marker.lon ?? marker.longitude)) && Number.isFinite(Number(marker.doseRateMicroSvH)));
    const stride = Math.max(1, Math.ceil(valid.length / 40));
    const selected = valid.filter((_, index) => index % stride === 0);
    const maximum = valid.reduce((best, marker) => Number(marker.doseRateMicroSvH) > Number(best?.doseRateMicroSvH ?? -1) ? marker : best, null);
    if (maximum && !selected.includes(maximum)) selected.push(maximum);
    selected.forEach((marker) => sampled.push({ ...marker, trackID: tracks[trackIndex]?.id }));
  });
  const cells = new Map();
  sampled.forEach((marker) => {
    const latitude = Number(marker.lat ?? marker.latitude);
    const longitude = Number(marker.lon ?? marker.longitude);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) return;
    const key = `${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    const previous = cells.get(key);
    const markerTime = Number(marker.timeUnix || 0);
    if (!previous || markerTime > Number(previous.timeUnix || 0) || Number(marker.doseRateMicroSvH) > Number(previous.doseRateMicroSvH)) cells.set(key, marker);
  });
  const markers = [...cells.values()].sort((left, right) => Number(right.timeUnix || 0) - Number(left.timeUnix || 0)).slice(0, 250);
  if (!markers.length) throw new Error("Safecast recent tracks contained no usable measurements");
  return {
    markers,
    trackCount: trackResults.filter((result) => result.status === "fulfilled").length,
    retrievedAt: Date.now(),
    attribution: "Safecast CC0 community radiation measurements",
    disclaimer: "Community sensor readings are not official incident declarations or health alerts.",
  };
}

function statusPlainText(value: unknown) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/[#*_`>]+/g, " ").replace(/\s+/g, " ").trim();
}

const FCDO_SLUG_OVERRIDES = Object.freeze({
  USA: "usa", GBR: "", CZE: "czechia", TUR: "turkey", CPV: "cape-verde", CIV: "ivory-coast",
  COD: "democratic-republic-of-the-congo", COG: "republic-of-the-congo", TLS: "timor-leste", SWZ: "eswatini",
  KOR: "south-korea", PRK: "north-korea", LAO: "laos", VNM: "vietnam", RUS: "russia", IRN: "iran",
  SYR: "syria", PSE: "the-occupied-palestinian-territories", BRN: "brunei", TZA: "tanzania"
});

function travelCountrySlug(countryName: string, countryCode: string) {
  if (Object.prototype.hasOwnProperty.call(FCDO_SLUG_OVERRIDES, countryCode)) return FCDO_SLUG_OVERRIDES[countryCode as keyof typeof FCDO_SLUG_OVERRIDES];
  return String(countryName || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function advisorySeverity(alerts: string[]) {
  const values = new Set(alerts.map((item) => String(item).toLowerCase()));
  if (values.has("avoid_all_travel_to_whole_country")) return { severity: 4, level: "Advise against all travel" };
  if (values.has("avoid_all_travel_to_parts") || values.has("avoid_all_but_essential_travel_to_whole_country")) return { severity: 3, level: "Major travel warning" };
  if (values.has("avoid_all_but_essential_travel_to_parts")) return { severity: 2, level: "Regional / essential-only warning" };
  return { severity: 1, level: "No current whole/part-country warning tag" };
}

async function fetchTravelAdvisory(countryName: string, countryCode: string, latitude: number, longitude: number, signal: AbortSignal) {
  const slug = travelCountrySlug(countryName, countryCode);
  if (!slug) {
    return { available: false, country: countryName, countryCode, reason: "FCDO publishes foreign travel advice; no destination document is expected for this territory.", retrievedAt: Date.now(), attribution: "UK Foreign, Commonwealth & Development Office (FCDO)", sourceUrl: "https://www.gov.uk/foreign-travel-advice" };
  }
  const endpoint = `https://www.gov.uk/api/content/foreign-travel-advice/${encodeURIComponent(slug)}`;
  const response = await resilientFetch(endpoint, { signal, headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" } });
  if (response.status === 404) {
    return { available: false, country: countryName, countryCode, slug, reason: "No matching FCDO destination document was found.", retrievedAt: Date.now(), attribution: "UK Foreign, Commonwealth & Development Office (FCDO)", sourceUrl: "https://www.gov.uk/foreign-travel-advice" };
  }
  if (!response.ok) throw new Error(`FCDO Content API HTTP ${response.status}`);
  const data = await response.json();
  const alerts = Array.isArray(data?.details?.alert_status) ? data.details.alert_status.map(String) : [];
  const warningPart = (data?.details?.parts || []).find((part: Record<string, unknown>) => part?.slug === "warnings-and-insurance");
  const warningText = statusPlainText(warningPart?.body || "").slice(0, 900);
  const change = statusPlainText(data?.details?.change_description || "").slice(0, 500);
  const rating = advisorySeverity(alerts);
  return {
    available: true,
    country: data?.details?.country?.name || countryName,
    countryCode,
    slug,
    title: data?.title || `${countryName} travel advice`,
    description: statusPlainText(data?.description || ""),
    alerts,
    ...rating,
    warning: warningText,
    latestChange: change,
    updatedAt: data?.public_updated_at || data?.details?.updated_at || "",
    reviewedAt: data?.details?.reviewed_at || "",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    retrievedAt: Date.now(),
    attribution: "UK Foreign, Commonwealth & Development Office (FCDO)",
    sourceUrl: `https://www.gov.uk/foreign-travel-advice/${slug}`,
    disclaimer: "FCDO advice is written for British nationals. It is an official risk reference, not an EMS order, universal travel rule, or substitute for the relevant authority for your nationality."
  };
}

async function fetchServiceStatus(signal: AbortSignal) {
  const results = await Promise.allSettled(SERVICE_STATUS_PROVIDERS.map(async (provider) => {
    const response = await resilientFetch(provider.url, {
      signal,
      headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (provider.kind === "statuspage") {
      const components = (Array.isArray(payload?.components) ? payload.components : []).filter((component) => component?.status && component.status !== "operational").slice(0, 30).map((component) => ({ id: String(component.id || ""), name: statusPlainText(component.name).slice(0, 160), status: String(component.status), updatedAt: component.updated_at || "" }));
      const incidents = (Array.isArray(payload?.incidents) ? payload.incidents : []).slice(0, 20).map((incident) => {
        const latest = Array.isArray(incident.incident_updates) ? incident.incident_updates[0] : null;
        return {
          id: `${provider.id}-${incident.id}`,
          providerId: provider.id,
          provider: provider.label,
          title: statusPlainText(incident.name || "Service incident").slice(0, 220),
          detail: statusPlainText(latest?.body || incident.status || "Official provider incident").slice(0, 520),
          impact: String(incident.impact || "minor"),
          status: String(incident.status || "investigating"),
          active: !["resolved", "completed", "postmortem"].includes(String(incident.status || "").toLowerCase()),
          startedAt: incident.started_at || incident.created_at || "",
          updatedAt: incident.updated_at || latest?.updated_at || "",
          resolvedAt: incident.resolved_at || "",
          components: Array.isArray(incident.components) ? incident.components.map((component) => statusPlainText(component.name)).filter(Boolean).slice(0, 10) : [],
          url: `${provider.statusUrl}incidents/${encodeURIComponent(String(incident.id || ""))}`,
        };
      });
      return {
        id: provider.id,
        label: provider.label,
        url: provider.statusUrl,
        available: true,
        indicator: String(payload?.status?.indicator || (components.length ? "minor" : "none")),
        description: statusPlainText(payload?.status?.description || (components.length ? "Degraded components" : "Operational")),
        updatedAt: payload?.page?.updated_at || "",
        components,
        incidents,
      };
    }
    const cutoff = Date.now() - 7 * 24 * 60 * 60_000;
    const allIncidents = Array.isArray(payload) ? payload : [];
    const recent = allIncidents.filter((incident) => !incident?.end || Date.parse(incident.modified || incident.end || incident.begin || "") >= cutoff).slice(0, 20);
    const incidents = recent.map((incident) => ({
      id: `${provider.id}-${incident.id}`,
      providerId: provider.id,
      provider: provider.label,
      title: statusPlainText(incident.external_desc || "Google Cloud service incident").slice(0, 220),
      detail: statusPlainText(incident.updates?.[0]?.text || incident.external_desc || "Official provider incident").slice(0, 520),
      impact: String(incident.severity || "minor").toLowerCase(),
      status: incident.end ? "resolved" : "active",
      active: !incident.end,
      startedAt: incident.begin || incident.created || "",
      updatedAt: incident.modified || incident.updates?.[0]?.when || "",
      resolvedAt: incident.end || "",
      components: (Array.isArray(incident.affected_products) ? incident.affected_products : []).map((component) => statusPlainText(component.title || component.name || component)).filter(Boolean).slice(0, 10),
      url: `${provider.statusUrl}incidents/${encodeURIComponent(String(incident.id || ""))}`,
    }));
    const active = incidents.filter((incident) => incident.active);
    return {
      id: provider.id,
      label: provider.label,
      url: provider.statusUrl,
      available: true,
      indicator: active.some((incident) => ["high", "critical", "major"].includes(incident.impact)) ? "major" : active.length ? "minor" : "none",
      description: active.length ? `${active.length} active incident${active.length === 1 ? "" : "s"}` : "No active incidents",
      updatedAt: recent[0]?.modified || recent[0]?.begin || "",
      components: [],
      incidents,
    };
  }));
  const providers = SERVICE_STATUS_PROVIDERS.map((provider, index) => {
    const result = results[index];
    return result.status === "fulfilled" ? result.value : { id: provider.id, label: provider.label, url: provider.statusUrl, available: false, indicator: "unknown", description: "Official endpoint unavailable", updatedAt: "", components: [], incidents: [], error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  });
  if (!providers.some((provider) => provider.available)) throw new Error(`Official service status unavailable: ${providers.map((provider) => `${provider.label} ${provider.error || "failed"}`).join("; ")}`);
  const incidents = providers.flatMap((provider) => provider.incidents).sort((left, right) => Number(right.active) - Number(left.active) || Date.parse(right.updatedAt || right.startedAt || "") - Date.parse(left.updatedAt || left.startedAt || "")).slice(0, 50);
  return {
    providers,
    incidents,
    retrievedAt: Date.now(),
    attribution: "Official GitHub, Cloudflare, OpenAI, and Google Cloud status publications",
    disclaimer: "Provider-reported platform status. An operational status does not prove every region, tenant, dependency, or EMS workflow is unaffected; confirm business impact with local telemetry.",
  };
}

const FRED_MACRO_SERIES = Object.freeze([
  { id: "DFF", label: "Effective federal funds rate", unit: "%", decimals: 2, source: "Federal Reserve Bank of New York" },
  { id: "DGS10", label: "10-year Treasury yield", unit: "%", decimals: 2, source: "U.S. Treasury" },
  { id: "T10Y2Y", label: "10Y–2Y Treasury spread", unit: "pp", decimals: 2, source: "Federal Reserve Bank of St. Louis" },
  { id: "DTWEXBGS", label: "Broad U.S. dollar index", unit: "index", decimals: 2, source: "Federal Reserve Board" },
  { id: "DCOILWTICO", label: "WTI crude oil", unit: "USD/bbl", decimals: 2, source: "U.S. Energy Information Administration" },
  { id: "CPIAUCSL", label: "Consumer price index", unit: "index", decimals: 3, source: "U.S. Bureau of Labor Statistics" },
  { id: "UNRATE", label: "Unemployment rate", unit: "%", decimals: 1, source: "U.S. Bureau of Labor Statistics" },
  { id: "INDPRO", label: "Industrial production", unit: "index", decimals: 3, source: "Federal Reserve Board" },
]);

async function fetchFredMacro(signal: AbortSignal) {
  const start = new Date(Date.now() - 3 * 365 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const results = await Promise.allSettled(FRED_MACRO_SERIES.map(async (definition) => {
    const params = new URLSearchParams({ id: definition.id, cosd: start });
    const response = await resilientFetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?${params}`, {
      signal,
      headers: { Accept: "text/csv", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" },
    });
    if (!response.ok) throw new Error(`${definition.id} HTTP ${response.status}`);
    const text = await response.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const headers = String(lines.shift() || "").replace(/^\uFEFF/, "").split(",").map((value) => value.replace(/^"|"$/g, "").trim());
    if (!headers.length || !/date/i.test(headers[0]) || headers[1] !== definition.id) throw new Error(`${definition.id} returned an invalid CSV header`);
    const history = lines.flatMap((line) => {
      const cells = line.split(",").map((value) => value.replace(/^"|"$/g, "").trim());
      const value = Number(cells[1]);
      return Number.isFinite(value) ? [{ date: cells[0], value }] : [];
    }).slice(-24);
    const latest = history.at(-1);
    const previous = history.at(-2);
    return { ...definition, value: latest?.value ?? null, date: latest?.date || "", previous: previous?.value ?? null, previousDate: previous?.date || "", change: latest && previous ? latest.value - previous.value : null, history, url: `https://fred.stlouisfed.org/series/${definition.id}` };
  }));
  const series = results.flatMap((result) => result.status === "fulfilled" && Number.isFinite(result.value.value) ? [result.value] : []);
  if (!series.length) throw new Error(`FRED series unavailable: ${[...new Set(results.filter((result) => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)))].slice(0, 3).join("; ")}`);
  return { series, unavailable: results.length - series.length, retrievedAt: Date.now(), attribution: "Federal Reserve Economic Data (FRED) / public U.S. agencies", disclaimer: "Latest published observations; frequencies and release dates differ. Values are not live market quotes." };
}

function decodeXml(value: unknown) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function xmlField(block: string, names: string[]) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function feedItems(xml: string, source: Record<string, string>) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]).slice(0, 16);
  return blocks.flatMap((block, index) => {
    const title = xmlField(block, ["title"]);
    const summary = xmlField(block, ["description", "summary", "content", "content:encoded"]).slice(0, 480);
    const atomLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] || "";
    const rssLink = xmlField(block, ["link", "guid"]);
    const candidate = decodeXml(atomLink || rssLink);
    let url = "";
    try { const parsed = new URL(candidate, source.url); if (parsed.protocol === "https:") url = parsed.href; } catch { /* Invalid item links remain unavailable. */ }
    const dateText = xmlField(block, ["pubDate", "published", "updated", "dc:date"]);
    const timestamp = Date.parse(dateText);
    if (!title || !url) return [];
    return [{ id: `${source.id}-${timestamp || 0}-${index}-${title.slice(0, 36)}`, sourceId: source.id, source: source.label, title: title.slice(0, 240), summary, url, timestamp: Number.isFinite(timestamp) ? timestamp : 0 }];
  });
}

async function fetchOfficialWire(signal: AbortSignal) {
  const results = await Promise.allSettled(OFFICIAL_WIRE_FEEDS.map(async (source) => {
    const response = await resilientFetch(source.url, { signal, redirect: "follow", headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const items = feedItems(xml, source);
    if (!items.length) throw new Error("No usable RSS/Atom items");
    return { ...source, items };
  }));
  const sources = OFFICIAL_WIRE_FEEDS.map((source, index) => {
    const result = results[index];
    return result.status === "fulfilled" ? { id: source.id, label: source.label, url: source.url, ok: true, count: result.value.items.length } : { id: source.id, label: source.label, url: source.url, ok: false, count: 0, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  });
  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value.items : []).sort((left, right) => right.timestamp - left.timestamp).slice(0, 100);
  if (!items.length) throw new Error(`Official feeds unavailable: ${sources.filter((source) => !source.ok).slice(0, 3).map((source) => `${source.label} ${source.error}`).join("; ")}`);
  return { items, sources, retrievedAt: Date.now(), attribution: "Official public RSS/Atom feeds", disclaimer: "Headlines and short summaries are cached for situational awareness. Open the linked official source for the authoritative record." };
}

async function fetchMilitaryAircraft(signal: AbortSignal) {
  const response = await resilientFetch("https://api.adsb.lol/v2/mil", { signal, headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" } });
  if (!response.ok) throw new Error(`ADSB.lol HTTP ${response.status}`);
  const payload = await response.json();
  const observedAt = Number(payload?.now) || Date.now();
  const aircraft = (Array.isArray(payload?.ac) ? payload.ac : []).flatMap((item: Record<string, unknown>) => {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    const seenPosition = Number(item.seen_pos ?? item.seen);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !Number.isFinite(seenPosition) || seenPosition > 120) return [];
    return [{
      hex: String(item.hex || "").replace(/^~/, "").slice(0, 8),
      callsign: String(item.flight || "").trim().slice(0, 16),
      registration: String(item.r || "").trim().slice(0, 16),
      aircraftType: String(item.t || item.desc || "").trim().slice(0, 28),
      latitude, longitude,
      altitude: item.alt_baro === "ground" ? "ground" : Number.isFinite(Number(item.alt_baro)) ? Number(item.alt_baro) : null,
      groundSpeed: Number.isFinite(Number(item.gs)) ? Number(item.gs) : null,
      track: Number.isFinite(Number(item.track)) ? Number(item.track) : null,
      verticalRate: Number.isFinite(Number(item.baro_rate)) ? Number(item.baro_rate) : null,
      squawk: String(item.squawk || "").slice(0, 8),
      category: String(item.category || "").slice(0, 8),
      seenSeconds: seenPosition,
      observedAt: observedAt - seenPosition * 1000,
    }];
  }).sort((left, right) => right.observedAt - left.observedAt).slice(0, 600);
  if (!aircraft.length) throw new Error("ADSB.lol returned no current military positions");
  return { aircraft, total: Number(payload?.total) || aircraft.length, observedAt, retrievedAt: Date.now(), attribution: "ADSB.lol community network · ODbL 1.0", licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/", sourceUrl: "https://www.adsb.lol/docs/open-data/api/", disclaimer: "Community-received ADS-B observations. Military registration classification, identity, position and availability may be incomplete or inaccurate; presence does not imply intent." };
}

async function fetchVesselTraffic(signal: AbortSignal) {
  const headers = { Accept: "application/json", "Digitraffic-User": "Varada-Nexus-Intelligence/1.0", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" };
  const [locationResponse, metadataResponse] = await Promise.all([
    resilientFetch("https://meri.digitraffic.fi/api/ais/v1/locations", { signal, headers }),
    resilientFetch("https://meri.digitraffic.fi/api/ais/v1/vessels", { signal, headers }),
  ]);
  if (!locationResponse.ok) throw new Error(`Digitraffic locations HTTP ${locationResponse.status}`);
  if (!metadataResponse.ok) throw new Error(`Digitraffic metadata HTTP ${metadataResponse.status}`);
  const [locations, metadata] = await Promise.all([locationResponse.json(), metadataResponse.json()]);
  const metadataByMmsi = new Map((Array.isArray(metadata) ? metadata : []).map((item: Record<string, unknown>) => [String(item.mmsi), item]));
  const cutoff = Date.now() - 20 * 60_000;
  const vessels = (Array.isArray(locations?.features) ? locations.features : []).flatMap((feature: Record<string, unknown>) => {
    const geometry = feature.geometry as Record<string, unknown> || {};
    const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const properties = feature.properties as Record<string, unknown> || {};
    const mmsi = String(properties.mmsi || feature.mmsi || "");
    const vessel = metadataByMmsi.get(mmsi) as Record<string, unknown> || {};
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    const observedAt = Number(properties.timestampExternal);
    if (!/^\d{9}$/.test(mmsi) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(observedAt) || observedAt < cutoff) return [];
    return [{
      mmsi, latitude, longitude, observedAt,
      name: String(vessel.name || "").trim().slice(0, 60),
      callSign: String(vessel.callSign || "").trim().slice(0, 20),
      imo: Number.isFinite(Number(vessel.imo)) ? Number(vessel.imo) : null,
      destination: String(vessel.destination || "").trim().slice(0, 80),
      shipType: Number.isFinite(Number(vessel.shipType)) ? Number(vessel.shipType) : null,
      speedOverGround: Number.isFinite(Number(properties.sog)) ? Number(properties.sog) : null,
      courseOverGround: Number.isFinite(Number(properties.cog)) ? Number(properties.cog) : null,
      heading: Number.isFinite(Number(properties.heading)) && Number(properties.heading) <= 359 ? Number(properties.heading) : null,
      navigationStatus: Number.isFinite(Number(properties.navStat)) ? Number(properties.navStat) : null,
      positionAccurate: properties.posAcc === true,
    }];
  }).sort((left, right) => right.observedAt - left.observedAt).slice(0, 600);
  if (!vessels.length) throw new Error("Digitraffic returned no recent AIS positions");
  return { vessels, total: Array.isArray(locations?.features) ? locations.features.length : vessels.length, retrievedAt: Date.now(), attribution: "Source: Fintraffic / Digitraffic.fi, license CC BY 4.0; normalized and capped by Varada Nexus", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl: "https://www.digitraffic.fi/en/marine-traffic/", coverage: "Finnish and adjacent Baltic waterways; Class A AIS with documented filtering", disclaimer: "Terrestrial AIS observations can be delayed, incomplete, filtered or spoofed. Fishing vessels are filtered by the provider. This is not global satellite AIS." };
}

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(value.trim()); value = "";
    } else value += character;
  }
  fields.push(value.trim());
  return fields.map((field) => field === "-0-" ? "" : field);
}

const OFAC_COUNTRY_ALIASES = Object.freeze({
  "Russian Federation": "Russia", "Korea, North": "North Korea", "Korea, South": "South Korea",
  "Burma": "Myanmar", "Congo, Dem. Rep. of the": "Democratic Republic of the Congo", "Congo, Republic of the": "Republic of the Congo",
  "Cote d Ivoire": "Côte d'Ivoire", "Cote d'Ivoire": "Côte d'Ivoire", "Syrian Arab Republic": "Syria",
  "Viet Nam": "Vietnam", "Lao People's Democratic Republic": "Laos", "Bolivia, Plurinational State of": "Bolivia",
  "Iran, Islamic Republic of": "Iran", "Venezuela, Bolivarian Republic of": "Venezuela", "Tanzania, United Republic of": "Tanzania",
  "Moldova, Republic of": "Moldova", "United States": "United States of America", "United Kingdom": "United Kingdom",
  "West Bank": "Palestine", "Gaza Strip": "Palestine"
});

async function fetchSanctions(signal: AbortSignal) {
  const baseUrl = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports";
  const headers = { Accept: "text/csv", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" };
  const [sdnResponse, addressResponse] = await Promise.all([
    resilientFetch(`${baseUrl}/SDN.CSV`, { signal, headers }),
    resilientFetch(`${baseUrl}/ADD.CSV`, { signal, headers }),
  ]);
  if (!sdnResponse.ok) throw new Error(`OFAC SDN CSV HTTP ${sdnResponse.status}`);
  if (!addressResponse.ok) throw new Error(`OFAC address CSV HTTP ${addressResponse.status}`);
  const [sdnCsv, addressCsv] = await Promise.all([sdnResponse.text(), addressResponse.text()]);
  const entries = new Map<string, { type: string; programs: string[] }>();
  for (const line of sdnCsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const id = fields[0];
    if (!/^\d+$/.test(id)) continue;
    const programField = String(fields[3] || "").replace(/^\[/, "").replace(/\]$/, "");
    entries.set(id, { type: String(fields[2] || "entity").toLowerCase(), programs: programField.split(/\]\s*\[|[;|]/).map((program) => program.trim()).filter(Boolean) });
  }
  if (!entries.size) throw new Error("OFAC returned an invalid SDN CSV publication");
  const recordCountries = new Map<string, Set<string>>();
  for (const line of addressCsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const id = fields[0];
    const rawCountry = String(fields[4] || "").trim();
    if (!entries.has(id) || !rawCountry) continue;
    const country = OFAC_COUNTRY_ALIASES[rawCountry] || rawCountry;
    const values = recordCountries.get(id) || new Set<string>();
    values.add(country);
    recordCountries.set(id, values);
  }
  const countries = new Map<string, { country: string; records: number; individuals: number; entities: number; vessels: number; aircraft: number; other: number; programs: Map<string, number> }>();
  const programs = new Map<string, number>();
  entries.forEach((entry) => entry.programs.forEach((program) => programs.set(program, (programs.get(program) || 0) + 1)));
  recordCountries.forEach((entryCountries, id) => {
    const entry = entries.get(id) || { type: "other", programs: [] };
    const rawType = entry.type;
    const type = rawType.includes("individual") ? "individuals" : rawType.includes("entity") ? "entities" : rawType.includes("vessel") ? "vessels" : rawType.includes("aircraft") ? "aircraft" : "other";
    entryCountries.forEach((country) => {
      const record = countries.get(country) || { country, records: 0, individuals: 0, entities: 0, vessels: 0, aircraft: 0, other: 0, programs: new Map<string, number>() };
      record.records += 1;
      record[type] += 1;
      entry.programs.forEach((program) => record.programs.set(program, (record.programs.get(program) || 0) + 1));
      countries.set(country, record);
    });
  });
  const publishHeader = sdnResponse.headers.get("last-modified") || "";
  const publishDate = Number.isFinite(Date.parse(publishHeader)) ? new Date(publishHeader).toISOString().slice(0, 10) : "";
  const parsedRecords = entries.size;
  const locatedRecords = recordCountries.size;
  const countryRows = [...countries.values()].map((record) => ({
    ...record,
    programs: [...record.programs].sort((left, right) => right[1] - left[1]).slice(0, 8).map(([program, records]) => ({ program, records })),
  })).sort((left, right) => right.records - left.records).slice(0, 250);
  return {
    publishDate,
    declaredRecords: parsedRecords,
    parsedRecords,
    locatedRecords,
    unlocatedRecords: Math.max(0, parsedRecords - locatedRecords),
    countries: countryRows,
    programs: [...programs].sort((left, right) => right[1] - left[1]).slice(0, 100).map(([program, records]) => ({ program, records })),
    retrievedAt: Date.now(),
    attribution: "U.S. Treasury Office of Foreign Assets Control (OFAC) · Specially Designated Nationals and Blocked Persons List",
    sourceUrl: `${baseUrl}/SDN.CSV`,
    programUrl: "https://ofac.treasury.gov/sanctions-programs-and-country-information",
    disclaimer: "Country counts are EMS aggregations of country fields associated with current SDN records. They are not an OFAC country list, a prohibition score, legal advice, or proof that every transaction involving that country is restricted. Programs vary in scope; screen names and ownership separately against the current official lists and applicable law.",
  };
}

async function fetchAirQuality(signal: AbortSignal) {
  const latitude = AIR_QUALITY_SITES.map((site) => site.latitude).join(",");
  const longitude = AIR_QUALITY_SITES.map((site) => site.longitude).join(",");
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: "us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,dust,uv_index",
    timezone: "GMT",
  });
  const response = await resilientFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" },
  });
  if (!response.ok) throw new Error(`Open-Meteo air quality HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [payload];
  const observations = AIR_QUALITY_SITES.flatMap((site, index) => {
    const row = rows[index] || {};
    const current = row.current || {};
    const usAqi = Number(current.us_aqi);
    const europeanAqi = Number(current.european_aqi);
    const pm25 = Number(current.pm2_5);
    if (![usAqi, europeanAqi, pm25].some(Number.isFinite)) return [];
    return [{
      ...site,
      observedAt: Number.isFinite(Date.parse(current.time)) ? Date.parse(current.time) : Date.now(),
      usAqi: Number.isFinite(usAqi) ? usAqi : null,
      europeanAqi: Number.isFinite(europeanAqi) ? europeanAqi : null,
      pm25: Number.isFinite(pm25) ? pm25 : null,
      pm10: Number.isFinite(Number(current.pm10)) ? Number(current.pm10) : null,
      nitrogenDioxide: Number.isFinite(Number(current.nitrogen_dioxide)) ? Number(current.nitrogen_dioxide) : null,
      ozone: Number.isFinite(Number(current.ozone)) ? Number(current.ozone) : null,
      dust: Number.isFinite(Number(current.dust)) ? Number(current.dust) : null,
      uvIndex: Number.isFinite(Number(current.uv_index)) ? Number(current.uv_index) : null,
    }];
  });
  if (!observations.length) throw new Error("Open-Meteo returned no current air-quality observations");
  return {
    observations,
    retrievedAt: Date.now(),
    attribution: "Open-Meteo / Copernicus Atmosphere Monitoring Service (CAMS)",
    sourceUrl: "https://open-meteo.com/en/docs/air-quality-api",
    coverage: `${observations.length} representative metropolitan grid cells across six inhabited regions`,
    disclaimer: "Modelled CAMS atmospheric composition at the nearest grid cell; not a certified ground-sensor reading or health directive. Global CAMS resolution is approximately 45 km and updates twice daily.",
  };
}

async function fetchLocationAirQuality(latitude: number, longitude: number, signal: AbortSignal) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Valid air-quality coordinates are required");
  const params = new URLSearchParams({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: "us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,dust,uv_index",
    timezone: "auto",
  });
  const response = await resilientFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)" },
  });
  if (!response.ok) throw new Error(`Open-Meteo air quality HTTP ${response.status}`);
  const data = await response.json();
  return {
    ...data,
    attribution: "Open-Meteo / Copernicus Atmosphere Monitoring Service (CAMS)",
    sourceUrl: "https://open-meteo.com/en/docs/air-quality-api",
    disclaimer: "Modelled CAMS atmospheric composition at the nearest grid cell; not a certified ground-sensor reading, national average, or health directive.",
  };
}

async function upstreamJson(source: keyof typeof SOURCES, options: { country?: string; countryName?: string; latitude?: number; longitude?: number } = {}) {
  const definition = SOURCES[source];
  const country = String(options.country || "").toUpperCase();
  const hasCoordinates = source === "airQuality" && Number.isFinite(options.latitude) && Number.isFinite(options.longitude);
  const coordinateKey = hasCoordinates ? `${Number(options.latitude).toFixed(2)},${Number(options.longitude).toFixed(2)}` : "";
  const countryKey = source === "travelAdvisory" ? `${country}:${travelCountrySlug(String(options.countryName || ""), country)}` : country;
  const cacheKey = definition.dynamicCountry ? `${source}:${countryKey}` : hasCoordinates ? `${source}:${coordinateKey}` : source;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < definition.ttl) return { ...cached, cached: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), definition.timeout || 12_000);
  try {
    let rawData;
    if (source === "countryProfile") {
      rawData = await fetchWorldBankProfile(country, controller.signal);
    } else if (source === "macroRisk") {
      rawData = await fetchFredMacro(controller.signal);
    } else if (source === "officialWire") {
      rawData = await fetchOfficialWire(controller.signal);
    } else if (source === "serviceStatus") {
      rawData = await fetchServiceStatus(controller.signal);
    } else if (source === "travelAdvisory") {
      rawData = await fetchTravelAdvisory(String(options.countryName || ""), country, Number(options.latitude), Number(options.longitude), controller.signal);
    } else if (source === "militaryAircraft") {
      rawData = await fetchMilitaryAircraft(controller.signal);
    } else if (source === "vesselTraffic") {
      rawData = await fetchVesselTraffic(controller.signal);
    } else if (source === "airQuality") {
      rawData = hasCoordinates ? await fetchLocationAirQuality(Number(options.latitude), Number(options.longitude), controller.signal) : await fetchAirQuality(controller.signal);
    } else if (source === "sanctions") {
      rawData = await fetchSanctions(controller.signal);
    } else if (source === "radiation") {
      rawData = await fetchSafecastRadiation(controller.signal);
    } else if (source === "predictions") {
      rawData = await searchStrategicPredictions(controller.signal);
    } else {
      const response = await resilientFetch(sourceUrl(definition), {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Varada-Nexus-Intelligence/1.0 (+https://www.varadanexus.com)",
        },
      });
      if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
      rawData = await response.json();
    }
    const data = source === "predictions" ? strategicPredictions(rawData) : rawData;
    const entry = { savedAt: Date.now(), data };
    memoryCache.set(cacheKey, entry);
    return { ...entry, cached: false };
  } catch (error) {
    const staleEntry = memoryCache.get(cacheKey);
    if (staleEntry) return { ...staleEntry, cached: true, stale: true, degraded: error instanceof Error ? error.message : String(error) };
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Method not allowed" }, 405);
  try {
    await authenticate(req);
    const body = await req.json();
    const source = String(body?.source || "");
    if (!(source in SOURCES)) return json(req, { ok: false, error: "Unknown source" }, 400);
    const country = String(body?.country || "").toUpperCase();
    const countryName = String(body?.countryName || "").slice(0, 120);
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const result = await upstreamJson(source as keyof typeof SOURCES, { country, countryName, latitude, longitude });
    return json(req, { ok: true, source, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /permission/i.test(message) ? 403 : /Authentication/i.test(message) ? 401 : 502;
    return json(req, { ok: false, error: message }, status);
  }
});
