const EONET_LAYER_MAP = Object.freeze({
  wildfires: "wildfires",
  volcanoes: "volcanoes",
  severeStorms: "storms",
  floods: "floods",
  drought: "drought",
  seaLakeIce: "ice",
  landslides: "landslides",
  tempExtremes: "extreme-temperature",
  dustHaze: "dust-haze",
  snow: "snow",
  manmade: "manmade",
  earthquakes: "earthquakes"
});

const COUNTRY_COORDINATES = Object.freeze({
  "United States": [-98, 39], "United Kingdom": [-2, 54], India: [79, 22], China: [104, 35], Russia: [90, 60],
  Ukraine: [31, 49], Israel: [35, 31.5], Palestine: [35.2, 31.9], Iran: [53, 32], Iraq: [44, 33], Syria: [38, 35],
  Lebanon: [35.8, 33.9], Jordan: [36, 31], Yemen: [48, 15.5], SaudiArabia: [45, 24], "Saudi Arabia": [45, 24],
  Pakistan: [69, 30], Afghanistan: [66, 34], Bangladesh: [90, 24], Myanmar: [96, 21], Thailand: [101, 15],
  Philippines: [122, 12], Indonesia: [118, -2], Japan: [138, 37], Korea: [127.8, 36], "North Korea": [127, 40], "South Korea": [128, 36], Taiwan: [121, 23.7],
  Australia: [134, -25], Germany: [10.5, 51], France: [2, 46], Italy: [12, 42], Poland: [19, 52], Spain: [-4, 40],
  Turkey: [35, 39], Egypt: [30, 27], Libya: [17, 27], Sudan: [30, 15], Ethiopia: [39, 9], Somalia: [46, 6],
  Kenya: [38, 0], Nigeria: [8, 9], Mali: [-4, 17], Niger: [9, 17], Congo: [23, -3], "Democratic Republic of the Congo": [23, -3], SouthAfrica: [24, -29],
  "South Africa": [24, -29], Canada: [-106, 56], Mexico: [-102, 23], Brazil: [-52, -10], Argentina: [-64, -34],
  Colombia: [-74, 4], Venezuela: [-66, 7]
});

const clean = (value, fallback = "") => String(value ?? fallback).replace(/\s+/g, " ").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const COUNTRY_MENTIONS = Object.freeze([
  ["United States", ["united states", "u.s.", "usa", "american"]], ["United Kingdom", ["united kingdom", "britain", "british"]],
  ["North Korea", ["north korea", "north korean"]], ["South Korea", ["south korea", "south korean"]], ["Saudi Arabia", ["saudi arabia", "saudi"]],
  ["Democratic Republic of the Congo", ["democratic republic of the congo", "dr congo", "drc"]], ["Russia", ["russia", "russian"]],
  ["Ukraine", ["ukraine", "ukrainian"]], ["Iran", ["iran", "iranian"]], ["Israel", ["israel", "israeli"]],
  ["Palestine", ["palestine", "palestinian", "gaza"]], ["Sudan", ["sudan", "sudanese"]], ["Yemen", ["yemen", "yemeni"]],
  ["Syria", ["syria", "syrian"]], ["Afghanistan", ["afghanistan", "afghan"]], ["Myanmar", ["myanmar", "burma", "burmese"]],
  ["Venezuela", ["venezuela", "venezuelan"]], ["Pakistan", ["pakistan", "pakistani"]], ["India", ["india", "indian"]],
  ["China", ["china", "chinese"]], ["Taiwan", ["taiwan", "taiwanese"]], ["Turkey", ["turkey", "turkish", "türkiye"]],
  ["Iraq", ["iraq", "iraqi"]], ["Lebanon", ["lebanon", "lebanese"]], ["Libya", ["libya", "libyan"]],
  ["Ethiopia", ["ethiopia", "ethiopian"]], ["Somalia", ["somalia", "somali"]], ["Nigeria", ["nigeria", "nigerian"]],
  ["Mali", ["mali", "malian"]], ["Niger", ["niger", "nigerien"]], ["Mexico", ["mexico", "mexican"]],
  ["Brazil", ["brazil", "brazilian"]], ["Colombia", ["colombia", "colombian"]], ["Philippines", ["philippines", "philippine"]],
  ["Indonesia", ["indonesia", "indonesian"]], ["Japan", ["japan", "japanese"]]
]);

function inferCountryFromText(value) {
  const text = ` ${clean(value).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ")} `;
  return COUNTRY_MENTIONS.find(([, terms]) => terms.some((term) => text.includes(` ${term} `)))?.[0] || "";
}

function normalizeEarthquakes(raw) {
  return (raw?.features || []).slice(0, 400).map((feature) => {
    const [longitude, latitude, depth] = feature.geometry?.coordinates || [];
    const magnitude = number(feature.properties?.mag);
    return {
      id: `usgs-${feature.id}`,
      layer: "earthquakes",
      title: clean(feature.properties?.title, "Earthquake"),
      detail: `Magnitude ${magnitude.toFixed(1)} · depth ${Math.round(number(depth))} km`,
      latitude: number(latitude),
      longitude: number(longitude),
      severity: magnitude >= 6 ? 4 : magnitude >= 5 ? 3 : magnitude >= 4 ? 2 : 1,
      timestamp: number(feature.properties?.time),
      url: feature.properties?.url || "",
      source: "USGS",
      magnitude
    };
  }).filter((event) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude));
}

function normalizeEonet(raw) {
  return (raw?.events || []).flatMap((event) => {
    const category = event.categories?.[0]?.id || "";
    const layer = EONET_LAYER_MAP[category];
    if (!layer) return [];
    const geometry = [...(event.geometry || [])].reverse().find((item) => item.type === "Point" && Array.isArray(item.coordinates));
    if (!geometry) return [];
    const [longitude, latitude] = geometry.coordinates;
    return [{
      id: `eonet-${event.id}`,
      layer,
      title: clean(event.title, "Natural event"),
      detail: clean(event.description, `${event.categories?.[0]?.title || "Natural event"} · active`),
      latitude: number(latitude),
      longitude: number(longitude),
      severity: layer === "volcanoes" || layer === "storms" ? 3 : 2,
      timestamp: Date.parse(geometry.date || event.geometry?.[0]?.date || "") || Date.now(),
      url: event.sources?.[0]?.url || "",
      source: "NASA EONET"
    }];
  });
}

function normalizeGdacs(raw) {
  const features = raw?.features || raw?.data?.features || [];
  return features.slice(0, 100).flatMap((feature, index) => {
    if (feature.geometry?.type !== "Point") return [];
    const [longitude, latitude] = feature.geometry.coordinates || [];
    const properties = feature.properties || {};
    const type = clean(properties.eventtype || properties.eventType).toUpperCase();
    const layer = type === "EQ" ? "earthquakes" : type === "TC" ? "storms" : type === "FL" ? "floods" : type === "VO" ? "volcanoes" : type === "WF" ? "wildfires" : "disaster-alerts";
    const alert = clean(properties.alertlevel || properties.alertLevel || "green").toLowerCase();
    return [{
      id: `gdacs-${properties.eventid || properties.eventId || index}-${type}`,
      layer,
      title: clean(properties.name || properties.eventname || properties.title, "GDACS disaster alert"),
      detail: `${type || "Disaster"} · ${alert.toUpperCase()} alert · ${clean(properties.country || properties.countryname || "Global")}`,
      latitude: number(latitude), longitude: number(longitude),
      severity: alert === "red" ? 4 : alert === "orange" ? 3 : 2,
      timestamp: Date.parse(properties.fromdate || properties.todate || properties.datetime || "") || Date.now(),
      url: properties.url?.report || properties.url || "https://www.gdacs.org/",
      source: "GDACS"
    }];
  });
}

const AVIATION_HUBS = ["VIDP Delhi", "VABB Mumbai", "VOBL Bengaluru", "OMDB Dubai", "WSSS Singapore", "EGLL London", "KJFK New York", "KLAX Los Angeles", "EDDF Frankfurt", "RJTT Tokyo"];

function normalizeAviationWeather(raw) {
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, AVIATION_HUBS.length).flatMap((item, index) => {
    const latitude = number(item.latitude, NaN);
    const longitude = number(item.longitude, NaN);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !item.current) return [];
    const visibilityKm = number(item.current.visibility) / 1000;
    const wind = number(item.current.wind_speed_10m);
    const severity = visibilityKm < 1 || wind >= 40 ? 4 : visibilityKm < 3 || wind >= 30 ? 3 : visibilityKm < 8 || wind >= 20 ? 2 : 1;
    return [{
      id: `airport-weather-${index}-${item.current.time || "current"}`,
      layer: "aviation-weather",
      title: `${AVIATION_HUBS[index]} conditions`,
      detail: `Visibility ${visibilityKm.toFixed(1)} km · wind ${wind.toFixed(0)} kt · gusts ${number(item.current.wind_gusts_10m).toFixed(0)} kt · ${number(item.current.temperature_2m).toFixed(0)}°C`,
      latitude, longitude,
      severity,
      timestamp: Date.parse(item.current.time || "") || Date.now(),
      url: "https://open-meteo.com/en/docs",
      source: "Open-Meteo Aviation"
    }];
  });
}

function normalizeAirQuality(raw) {
  return (raw?.observations || []).slice(0, 100).flatMap((item, index) => {
    const latitude = number(item.latitude, NaN);
    const longitude = number(item.longitude, NaN);
    const usAqi = number(item.usAqi, NaN);
    const europeanAqi = number(item.europeanAqi, NaN);
    const pm25 = number(item.pm25, NaN);
    if (![latitude, longitude].every(Number.isFinite) || ![usAqi, europeanAqi, pm25].some(Number.isFinite)) return [];
    const aqi = Number.isFinite(usAqi) ? usAqi : europeanAqi;
    const band = Number.isFinite(usAqi)
      ? usAqi <= 50 ? "Good" : usAqi <= 100 ? "Moderate" : usAqi <= 150 ? "Sensitive groups" : usAqi <= 200 ? "Unhealthy" : usAqi <= 300 ? "Very unhealthy" : "Hazardous"
      : europeanAqi <= 20 ? "Good" : europeanAqi <= 40 ? "Fair" : europeanAqi <= 60 ? "Moderate" : europeanAqi <= 80 ? "Poor" : europeanAqi <= 100 ? "Very poor" : "Extremely poor";
    return [{
      id: `openmeteo-air-${clean(item.id, index)}-${Math.round(number(item.observedAt, Date.now()) / 1_800_000)}`,
      layer: "air-quality",
      title: `${clean(item.label, "Air-quality grid cell")} · ${band}`,
      detail: `${Number.isFinite(usAqi) ? `U.S. AQI ${usAqi > 500 ? "500+" : Math.round(usAqi)}` : `European AQI ${Math.round(europeanAqi)}`}${Number.isFinite(pm25) ? ` · PM2.5 ${pm25.toFixed(1)} µg/m³` : ""}${Number.isFinite(Number(item.pm10)) ? ` · PM10 ${Number(item.pm10).toFixed(1)} µg/m³` : ""}`,
      latitude, longitude,
      severity: 1,
      timestamp: number(item.observedAt, Date.now()),
      url: raw?.sourceUrl || "https://open-meteo.com/en/docs/air-quality-api",
      source: "Open-Meteo / CAMS",
      country: clean(item.country),
      observation: true,
      usAqi: Number.isFinite(usAqi) ? usAqi : null,
      europeanAqi: Number.isFinite(europeanAqi) ? europeanAqi : null,
      pm25: Number.isFinite(pm25) ? pm25 : null,
      pm10: Number.isFinite(Number(item.pm10)) ? Number(item.pm10) : null,
      nitrogenDioxide: Number.isFinite(Number(item.nitrogenDioxide)) ? Number(item.nitrogenDioxide) : null,
      ozone: Number.isFinite(Number(item.ozone)) ? Number(item.ozone) : null,
      dust: Number.isFinite(Number(item.dust)) ? Number(item.dust) : null,
      uvIndex: Number.isFinite(Number(item.uvIndex)) ? Number(item.uvIndex) : null,
      airQualityBand: band
    }];
  });
}

function normalizeMilitaryAircraft(raw) {
  return (raw?.aircraft || []).slice(0, 600).map((item, index) => {
    const identity = clean(item.callsign) || clean(item.registration) || clean(item.hex, `Military aircraft ${index + 1}`).toUpperCase();
    const altitude = item.altitude === "ground" ? "ground" : Number.isFinite(Number(item.altitude)) ? `${Math.round(Number(item.altitude)).toLocaleString()} ft` : "altitude unavailable";
    const speed = Number.isFinite(Number(item.groundSpeed)) ? `${Math.round(Number(item.groundSpeed))} kt` : "speed unavailable";
    return {
      id: `adsblol-military-${clean(item.hex, index)}-${Math.round(number(item.observedAt, Date.now()) / 15_000)}`,
      layer: "live-aircraft",
      title: identity,
      detail: `${clean(item.aircraftType, "Type unavailable")} · ${clean(item.registration, clean(item.hex).toUpperCase())} · ${altitude} · ${speed}`,
      latitude: number(item.latitude), longitude: number(item.longitude), severity: 1,
      timestamp: number(item.observedAt, Date.now()), url: raw?.sourceUrl || "https://www.adsb.lol/docs/open-data/api/",
      source: "ADSB.lol · ODbL 1.0",
      observation: true,
      icaoHex: clean(item.hex), callsign: clean(item.callsign), registration: clean(item.registration), aircraftType: clean(item.aircraftType),
      altitude: item.altitude, groundSpeed: item.groundSpeed, track: item.track, verticalRate: item.verticalRate, squawk: clean(item.squawk), seenSeconds: number(item.seenSeconds, 0), militaryClassification: true
    };
  });
}

const MARITIME_NAMES = ["Singapore approaches", "Shanghai approaches", "Rotterdam approaches", "Jebel Ali approaches", "Mumbai approaches"];

function normalizeMaritimeConditions(raw) {
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, MARITIME_NAMES.length).flatMap((item, index) => {
    const latitude = number(item.latitude, NaN);
    const longitude = number(item.longitude, NaN);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !item.current) return [];
    const waveHeight = number(item.current.wave_height);
    return [{
      id: `marine-${index}-${item.current.time || "current"}`,
      layer: "maritime-conditions",
      title: `${MARITIME_NAMES[index]} marine conditions`,
      detail: `Wave ${waveHeight.toFixed(1)} m · period ${number(item.current.wave_period).toFixed(1)} s · direction ${Math.round(number(item.current.wave_direction))}°`,
      latitude, longitude,
      severity: waveHeight >= 6 ? 4 : waveHeight >= 4 ? 3 : waveHeight >= 2.5 ? 2 : 1,
      timestamp: Date.parse(item.current.time || "") || Date.now(),
      url: "https://open-meteo.com/en/docs/marine-weather-api",
      source: "Open-Meteo Marine"
    }];
  });
}

function normalizeVesselTraffic(raw) {
  const typeLabel = (value) => {
    const type = Number(value);
    if (type >= 80 && type <= 89) return "Tanker";
    if (type >= 70 && type <= 79) return "Cargo";
    if (type >= 60 && type <= 69) return "Passenger";
    if (type === 35) return "Military";
    if (type === 52 || type === 31 || type === 32) return "Tug";
    if (type === 51) return "Search and rescue";
    if (type === 50) return "Pilot vessel";
    return type ? `AIS type ${type}` : "Type unavailable";
  };
  return (raw?.vessels || []).slice(0, 600).map((item) => ({
    id: `digitraffic-ais-${clean(item.mmsi)}-${Math.round(number(item.observedAt, Date.now()) / 30_000)}`,
    layer: "live-vessels",
    title: clean(item.name) || `MMSI ${clean(item.mmsi)}`,
    detail: `${typeLabel(item.shipType)} · ${Number.isFinite(Number(item.speedOverGround)) ? `${Number(item.speedOverGround).toFixed(1)} kt` : "speed unavailable"}${item.destination ? ` · destination ${clean(item.destination)}` : ""}`,
    latitude: number(item.latitude), longitude: number(item.longitude), severity: 1,
    timestamp: number(item.observedAt, Date.now()), url: raw?.sourceUrl || "https://www.digitraffic.fi/en/marine-traffic/",
    source: "Fintraffic Digitraffic · CC BY 4.0",
    observation: true,
    mmsi: clean(item.mmsi), callSign: clean(item.callSign), imo: item.imo, destination: clean(item.destination), shipType: item.shipType,
    vesselType: typeLabel(item.shipType), speedOverGround: item.speedOverGround, courseOverGround: item.courseOverGround, heading: item.heading, navigationStatus: item.navigationStatus, positionAccurate: item.positionAccurate === true
  }));
}

function normalizeLongitude(value) {
  return ((value + 540) % 360) - 180;
}

function greenwichSiderealDegrees(timestamp) {
  const julian = timestamp / 86_400_000 + 2_440_587.5;
  const centuries = (julian - 2_451_545) / 36_525;
  return normalizeLongitude(280.46061837 + 360.98564736629 * (julian - 2_451_545) + 0.000387933 * centuries ** 2 - centuries ** 3 / 38_710_000);
}

function normalizeOrbital(raw) {
  const now = Date.now();
  const radians = Math.PI / 180;
  const earthMu = 398600.4418;
  const earthRadius = 6371;
  return (Array.isArray(raw) ? raw : []).slice(0, 120).flatMap((item, index) => {
    const meanMotion = number(item.MEAN_MOTION, NaN);
    const epoch = Date.parse(item.EPOCH || "");
    if (!Number.isFinite(meanMotion) || !Number.isFinite(epoch)) return [];
    const eccentricity = clampNumber(number(item.ECCENTRICITY), 0, .99);
    const inclination = number(item.INCLINATION) * radians;
    const ascendingNode = number(item.RA_OF_ASC_NODE) * radians;
    const argumentPerigee = number(item.ARG_OF_PERICENTER) * radians;
    const meanMotionRadians = meanMotion * Math.PI * 2 / 86_400;
    const meanAnomaly = number(item.MEAN_ANOMALY) * radians + meanMotionRadians * ((now - epoch) / 1000);
    let eccentricAnomaly = meanAnomaly;
    for (let iteration = 0; iteration < 8; iteration += 1) eccentricAnomaly -= (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) / (1 - eccentricity * Math.cos(eccentricAnomaly));
    const trueAnomaly = 2 * Math.atan2(Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomaly / 2), Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomaly / 2));
    const argumentLatitude = argumentPerigee + trueAnomaly;
    const semiMajor = Math.cbrt(earthMu / meanMotionRadians ** 2);
    const radius = semiMajor * (1 - eccentricity * Math.cos(eccentricAnomaly));
    const x = radius * (Math.cos(ascendingNode) * Math.cos(argumentLatitude) - Math.sin(ascendingNode) * Math.sin(argumentLatitude) * Math.cos(inclination));
    const y = radius * (Math.sin(ascendingNode) * Math.cos(argumentLatitude) + Math.cos(ascendingNode) * Math.sin(argumentLatitude) * Math.cos(inclination));
    const z = radius * Math.sin(argumentLatitude) * Math.sin(inclination);
    const latitude = Math.atan2(z, Math.hypot(x, y)) / radians;
    const longitude = normalizeLongitude(Math.atan2(y, x) / radians - greenwichSiderealDegrees(now));
    const altitude = Math.max(0, radius - earthRadius);
    return [{
      id: `celestrak-${item.NORAD_CAT_ID || index}`,
      layer: "satellites",
      title: clean(item.OBJECT_NAME, `Orbital object ${item.NORAD_CAT_ID || index}`),
      detail: `Approximate propagated position · altitude ${Math.round(altitude).toLocaleString()} km · inclination ${number(item.INCLINATION).toFixed(1)}° · NORAD ${item.NORAD_CAT_ID || "—"}`,
      latitude, longitude,
      severity: 1,
      timestamp: now,
      url: `https://celestrak.org/satcat/table-satcat.php?CATNR=${encodeURIComponent(item.NORAD_CAT_ID || "")}`,
      source: "CelesTrak",
      orbitalEpoch: epoch
    }];
  });
}

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseGdeltDate(value) {
  const raw = String(value || "");
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (compact) return Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`);
  return Date.parse(raw) || Date.now();
}

function normalizeSecurity(raw) {
  if (Array.isArray(raw?.articles)) {
    return raw.articles.slice(0, 100).map((article, index) => {
      const publisherCountry = clean(article.sourcecountry || article.sourceCountry || "Global");
      const inferredCountry = inferCountryFromText(`${article.title || ""} ${article.domain || ""}`);
      const country = inferredCountry || publisherCountry;
      const [longitude, latitude] = COUNTRY_COORDINATES[country] || [((index * 47) % 300) - 150, ((index * 29) % 110) - 55];
      return {
        id: `gdelt-article-${article.seendate || index}-${index}`,
        layer: "conflicts",
        title: clean(article.title, "Security report"),
        detail: `${clean(article.domain || "Open source")} · ${country}${inferredCountry ? " headline geography" : " publisher geography"}`,
        latitude,
        longitude,
        severity: 3,
        timestamp: parseGdeltDate(article.seendate),
        url: article.url || "",
        source: "GDELT",
        country,
        geoBasis: inferredCountry ? "headline" : "publisher"
      };
    });
  }
  return (raw?.features || []).slice(0, 250).flatMap((feature, index) => {
    if (feature.geometry?.type !== "Point") return [];
    const [longitude, latitude] = feature.geometry.coordinates || [];
    return [{
      id: `gdelt-${feature.properties?.urlpubtimedate || index}-${longitude}-${latitude}`,
      layer: "conflicts",
      title: clean(feature.properties?.name || feature.properties?.html || "Security signal").replace(/<[^>]+>/g, ""),
      detail: clean(feature.properties?.tooltip || "Open-source reporting cluster").replace(/<[^>]+>/g, ""),
      latitude: number(latitude),
      longitude: number(longitude),
      severity: 3,
      timestamp: Date.now(),
      url: feature.properties?.url || "",
      source: "GDELT"
    }];
  });
}

function normalizeSanctions(raw, countryCoordinates = {}) {
  const timestamp = Date.parse(raw?.publishDate || "") || number(raw?.retrievedAt, Date.now());
  return (raw?.countries || []).slice(0, 250).flatMap((item, index) => {
    const country = clean(item.country);
    const coordinate = countryCoordinates[country] || COUNTRY_COORDINATES[country];
    if (!coordinate || !Number.isFinite(Number(coordinate[0])) || !Number.isFinite(Number(coordinate[1]))) return [];
    const programs = (item.programs || []).slice(0, 3).map((program) => clean(program.program)).filter(Boolean);
    return [{
      id: `ofac-sdn-country-${country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.round(timestamp / 86_400_000)}`,
      layer: "sanctions",
      title: `${country} · ${number(item.records).toLocaleString()} SDN associations`,
      detail: `${number(item.individuals).toLocaleString()} individuals · ${number(item.entities).toLocaleString()} entities · ${number(item.vessels).toLocaleString()} vessels · ${number(item.aircraft).toLocaleString()} aircraft${programs.length ? ` · ${programs.join(", ")}` : ""}`,
      latitude: number(coordinate[1]), longitude: number(coordinate[0]), severity: 1,
      timestamp,
      url: raw?.programUrl || raw?.sourceUrl || "https://ofac.treasury.gov/sanctions-list-service",
      source: "U.S. Treasury OFAC SDN",
      country,
      observation: true,
      sanctionsRecords: number(item.records), individuals: number(item.individuals), entities: number(item.entities),
      vessels: number(item.vessels), aircraft: number(item.aircraft), other: number(item.other), programs: item.programs || [],
      publishDate: clean(raw?.publishDate), declaredRecords: number(raw?.declaredRecords), complianceContext: true
    }];
  });
}

function normalizeGlobalReporting(raw, countryCoordinates = {}) {
  const topicFor = (text) => {
    if (/earthquake|flood|storm|wildfire|volcano|disaster|cyclone|hurricane/i.test(text)) return "Hazards";
    if (/health|disease|outbreak|hospital|vaccine|virus/i.test(text)) return "Health";
    if (/technology|cyber|software|semiconductor|artificial intelligence|\bai\b/i.test(text)) return "Technology";
    if (/climate|emission|temperature|drought|environment/i.test(text)) return "Climate";
    return "Economy";
  };
  return (raw?.articles || []).slice(0, 100).map((article, index) => {
    const title = clean(article.title, "Global public report");
    const publisherCountry = clean(article.sourcecountry || article.sourceCountry || "Global");
    const inferredCountry = inferCountryFromText(`${title} ${article.domain || ""}`);
    const country = inferredCountry || publisherCountry;
    const coordinates = countryCoordinates[country] || COUNTRY_COORDINATES[country] || [((index * 47) % 300) - 150, ((index * 29) % 110) - 55, country];
    const [longitude, latitude, countryName] = coordinates;
    const topic = topicFor(title);
    return {
      id: `gdelt-report-${article.seendate || index}-${index}`,
      layer: "reporting",
      title,
      detail: `${clean(article.domain || "Open source")} · ${topic} · ${countryName || country}${inferredCountry ? " headline geography" : " publisher geography"}`,
      latitude: number(latitude), longitude: number(longitude),
      severity: /emergency|collapse|evacuat|catastroph|record high|record low/i.test(title) ? 2 : 1,
      timestamp: parseGdeltDate(article.seendate),
      url: article.url || "",
      source: "GDELT Global",
      country: countryName || country,
      topic,
      geoBasis: inferredCountry ? "headline" : "publisher"
    };
  });
}

// Varada Nexus is an India-based minerals / mining / logistics / infrastructure / trading /
// transport firm sourcing genuine opportunities worldwide. This heuristic curates every
// commercial signal for that profile — no AI, fully explainable, never presented as verified.
const VARADA_SECTORS = Object.freeze(["Mining & minerals", "Transport & logistics", "Construction", "Energy", "Manufacturing", "Agriculture & food"]);
const INDIA_TRADE_PARTNERS = new Set(["United States", "China", "United Arab Emirates", "Saudi Arabia", "Iraq", "Russia", "Singapore", "Indonesia", "South Korea", "Australia", "Germany", "Netherlands", "Qatar", "South Africa", "Nigeria", "Brazil", "Japan", "United Kingdom", "Bangladesh", "Vietnam", "Malaysia", "Kuwait", "Angola", "Mozambique", "Kazakhstan", "Chile", "Peru", "Oman", "Sri Lanka", "Nepal"]);
const PURSUABLE_TYPES = new Set(["Tender / procurement", "Awarded contract", "Infrastructure project", "Trade development"]);

function tradeCategory(type, text) {
  const value = (text || "").toLowerCase();
  if (/\b(export|import|customs|shipment|cargo|consignment)\b/.test(value)) return "Import / export";
  if (/\b(ore|coal|mineral|commodity|metal|bauxite|manganese|alumina|steel|lithium|copper|iron)\b/.test(value)) return "Commodity";
  if (type === "Tender / procurement" || type === "Awarded contract") return "Tender / buyer";
  if (type === "Infrastructure project") return "Infrastructure";
  return "Trade opportunity";
}

// Returns an explicit 0–100 India-relevance score plus the reasons behind it, so the lead is
// ranked by how genuinely pursuable it is for an Indian firm — and can be audited, not trusted blindly.
function indiaTradeRelevance(classification, text, country) {
  const value = (text || "").toLowerCase();
  const reasons = [];
  let score = 38;
  const isIndia = /\bindia\b|\bindian\b|bharat/.test(value) || country === "India";
  if (isIndia) { score += 22; reasons.push("India-domestic opportunity"); }
  const sectorHit = (classification.industries || []).filter((industry) => VARADA_SECTORS.includes(industry));
  if (sectorHit.length) { score += 20; reasons.push(`Core Varada sector: ${sectorHit.join(", ")}`); }
  if (PURSUABLE_TYPES.has(classification.type)) { score += 12; reasons.push("Directly pursuable opportunity type"); }
  if (/\b(export|import|customs|shipment|cargo|commodity|ore|coal|mineral|logistics|freight|port|shipping)\b/.test(value)) { score += 10; reasons.push("Trade / commodity / logistics signal"); }
  if (!isIndia && country && INDIA_TRADE_PARTNERS.has(country)) { score += 8; reasons.push(`Key India trade partner: ${country}`); }
  if (/\b(international|global|open to foreign|icb|world bank|\badb\b|united nations|\bun\b)\b/.test(value)) { score += 6; reasons.push("Open to international bidders"); }
  return { score: Math.min(100, score), reasons: reasons.slice(0, 4), category: tradeCategory(classification.type, text) };
}

function classifyCommercialSignal(text) {
  const value = clean(text).toLowerCase();
  const types = [
    ["Awarded contract", /contract awarded|awarded .* contract|wins? .* contract|selected .* supplier/],
    ["Tender / procurement", /\btender\b|procurement|request for proposal|\brfp\b|invitation to bid/],
    ["Investment", /investment|funding|capital expenditure|\bcapex\b|foreign direct investment|\bfdi\b/],
    ["Business expansion", /expansion|market entry|new office|new facility|new plant|new factory|production capacity/],
    ["Trade development", /trade agreement|export deal|import demand|export opportunity|trade corridor|market access/],
    ["Infrastructure project", /infrastructure project|rail project|port project|airport project|power project|data cent(?:er|re)/],
    ["Regulatory change", /regulation|tariff|tax reform|licen[cs]ing|customs rule|trade restriction|subsidy|incentive/],
    ["Supply-chain change", /supply chain|logistics hub|distribution cent(?:er|re)|warehouse|shipping route|manufacturing shift/]
  ];
  const industries = [
    ["Energy", /energy|power|electricity|solar|wind|oil|gas|hydrogen|battery/],
    ["Mining & minerals", /mining|mine|mineral|lithium|copper|cobalt|nickel|rare earth|steel/],
    ["Construction", /construction|infrastructure|rail|road|bridge|port|airport|housing/],
    ["Manufacturing", /manufactur|factory|plant|production|industrial/],
    ["Technology", /technology|software|semiconductor|chip|artificial intelligence|\bai\b|cloud|data cent(?:er|re)|telecom/],
    ["Transport & logistics", /logistics|shipping|freight|warehouse|transport|airline|rail|port/],
    ["Agriculture & food", /agricultur|food|grain|wheat|rice|fertilizer|dairy|farm/],
    ["Healthcare", /health|hospital|pharma|medicine|medical|biotech/],
    ["Finance", /bank|finance|fintech|insurance|investment fund|capital market/],
    ["Retail & consumer", /retail|consumer|e-commerce|store|shopping|hospitality|tourism/]
  ].filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  const matched = types.find(([, pattern]) => pattern.test(value));
  if (!matched) return null;
  return { type: matched[0], industries: industries.length ? industries.slice(0, 4) : ["Cross-industry"] };
}

function normalizeBusinessOpportunities(raw, countryCoordinates = {}) {
  const seen = new Set();
  return (raw?.articles || []).slice(0, 150).flatMap((article, index) => {
    const title = clean(article.title, "Commercial development");
    const classification = classifyCommercialSignal(title);
    if (!classification) return [];
    const country = inferCountryFromText(`${title} ${article.domain || ""}`);
    const coordinates = countryCoordinates[country] || COUNTRY_COORDINATES[country];
    if (!country || !coordinates) return [];
    const fingerprint = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 140);
    if (seen.has(fingerprint)) return [];
    seen.add(fingerprint);
    const timestamp = parseGdeltDate(article.seendate);
    const ageHours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
    const freshness = ageHours <= 3 ? 100 : ageHours <= 12 ? 88 : ageHours <= 24 ? 72 : 58;
    const base = classification.type === "Awarded contract" ? 86
      : classification.type === "Tender / procurement" ? 82
        : classification.type === "Investment" ? 76
          : classification.type === "Infrastructure project" ? 74
            : classification.type === "Business expansion" ? 72
              : classification.type === "Trade development" ? 70 : 58;
    const opportunityScore = Math.round(Math.min(96, base * .78 + freshness * .22));
    const confidence = Math.round(Math.min(85, 58 + (country ? 12 : 0) + (article.domain ? 5 : 0)));
    const [longitude, latitude, countryName] = coordinates;
    const action = classification.type === "Tender / procurement"
      ? "Open the linked publication, identify the contracting authority, deadline, eligibility and original tender document."
      : classification.type === "Awarded contract"
        ? "Verify the award, buyer, supplier, value and downstream subcontracting or supply requirements."
        : "Verify the announcement, responsible organization, investment value, schedule and local-partner requirements.";
    const india = indiaTradeRelevance(classification, `${title} ${article.domain || ""}`, countryName || country);
    const leadScore = Math.round(opportunityScore * 0.5 + india.score * 0.5);
    return [{
      id: `commercial-${article.seendate || index}-${fingerprint.slice(0, 48).replaceAll(" ", "-")}`,
      layer: "business-opportunities",
      title,
      detail: `${india.category} · ${classification.type} · India fit ${india.score}/100 · opportunity ${opportunityScore}/100 · discovery lead; verify the linked publication`,
      latitude: number(latitude), longitude: number(longitude),
      severity: leadScore >= 82 ? 4 : leadScore >= 68 ? 3 : 2,
      timestamp,
      url: article.url || "",
      source: `Commercial discovery · ${clean(article.domain, "public publisher")}`,
      country: countryName || country,
      geoBasis: "headline",
      commercialDirection: "opportunity",
      commercialType: classification.type,
      industries: classification.industries,
      opportunityScore,
      riskScore: classification.type === "Regulatory change" || classification.type === "Supply-chain change" ? 45 : 18,
      confidence,
      freshness,
      recommendedAction: action,
      tradeCategory: india.category,
      indiaRelevance: india.score,
      indiaReasons: india.reasons,
      leadScore,
      evidenceLevel: "Discovery signal — verify the linked publisher and primary document"
    }];
  });
}

function normalizeOfficialWire(raw, countryCoordinates = {}) {
  const countryNames = Object.keys(countryCoordinates).sort((left, right) => right.length - left.length);
  const inferConfiguredCountry = (value) => {
    const text = ` ${clean(value).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ")} `;
    return inferCountryFromText(text) || countryNames.find((name) => text.includes(` ${name.toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim()} `)) || "";
  };
  return (raw?.items || []).slice(0, 100).flatMap((item, index) => {
    const country = inferConfiguredCountry(`${item.title || ""} ${item.summary || ""}`);
    if (!country) return [];
    const coordinates = countryCoordinates[country] || COUNTRY_COORDINATES[country];
    if (!coordinates) return [];
    const [longitude, latitude, countryName] = coordinates;
    const text = `${item.title || ""} ${item.summary || ""}`;
    const severity = /emergency|evacuat|warning|attack|outbreak|earthquake|hurricane|cyclone|flood|wildfire/i.test(text) ? 3 : /crisis|risk|sanction|conflict|disaster|alert/i.test(text) ? 2 : 1;
    return [{
      id: `official-wire-${item.sourceId || "source"}-${item.timestamp || index}-${index}`,
      layer: "reporting",
      title: clean(item.title, "Official public update"),
      detail: `${clean(item.summary, "Official headline update").slice(0, 420)} · headline geography`,
      latitude: number(latitude), longitude: number(longitude), severity,
      timestamp: number(item.timestamp, 0), url: item.url || "",
      source: `Official Wire · ${clean(item.source, "Public source")}`,
      country: countryName || country,
      topic: "Official reporting",
      geoBasis: "headline"
    }];
  });
}

function normalizeCyber(raw) {
  return (raw?.vulnerabilities || []).slice(0, 60).map((item) => ({
    id: `cisa-${item.cveID}`,
    layer: "cyber",
    title: `${clean(item.cveID)} · ${clean(item.vendorProject)} ${clean(item.product)}`,
    detail: clean(item.shortDescription),
    severity: item.knownRansomwareCampaignUse === "Known" ? 4 : 3,
    timestamp: Date.parse(item.dateAdded || "") || Date.now(),
    source: "CISA",
    country: "Global",
    url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
  }));
}

function normalizeSpaceWeather(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 40).map((item, index) => ({
    id: `swpc-${item.product_id || index}-${item.issue_datetime || ""}`,
    layer: "space-weather",
    title: clean(item.product_id || item.message?.split("\n")?.[0] || "Space weather alert"),
    detail: clean(item.message || "NOAA space weather notice").slice(0, 500),
    severity: /warning/i.test(item.message || "") ? 4 : /watch/i.test(item.message || "") ? 3 : 2,
    timestamp: Date.parse(item.issue_datetime || "") || Date.now(),
    source: "NOAA SWPC",
    country: "Global",
    url: "https://www.swpc.noaa.gov/products/alerts-watches-and-warnings"
  }));
}

function normalizeInternetOutages(raw, countryCoordinates = {}) {
  const rows = (raw?.data || []).filter((item) => item?.entity?.type === "country" && countryCoordinates[item.entity.code]);
  const scores = rows.map((item) => number(item.score)).sort((a, b) => a - b);
  const high = scores[Math.max(0, Math.floor(scores.length * .75))] || 0;
  const critical = scores[Math.max(0, Math.floor(scores.length * .9))] || high;
  return rows.map((item, index) => {
    const [longitude, latitude, countryName] = countryCoordinates[item.entity.code];
    const from = number(item.from) * 1000;
    const until = number(item.until, Date.now() / 1000) * 1000;
    const durationMinutes = Math.max(0, Math.round((until - from) / 60_000));
    const score = number(item.score);
    return {
      id: `ioda-${item.entity.code}-${clean(item.datasource, "signal")}-${item.from || index}`,
      layer: "internet-outages",
      title: `${clean(item.entity.name, countryName)} internet outage detection`,
      detail: `${clean(item.datasource, "IODA").toUpperCase()} anomaly · ${durationMinutes >= 60 ? `${(durationMinutes / 60).toFixed(1)}h` : `${durationMinutes}m`} observed · score ${score.toFixed(2)}`,
      latitude: number(latitude), longitude: number(longitude),
      severity: score >= critical ? 4 : score >= high ? 3 : 2,
      timestamp: from || Date.now(),
      url: `https://ioda.inetintel.cc.gatech.edu/country/${encodeURIComponent(item.entity.code)}`,
      source: "IODA / Georgia Tech",
      country: countryName || clean(item.entity.name),
      iso2: item.entity.code
    };
  });
}

function normalizeDisplacement(raw, countryCoordinates = {}) {
  return (raw?.items || []).flatMap((item, index) => {
    const code = clean(item.coo_iso || item.coo).toUpperCase();
    const coordinates = countryCoordinates[code];
    if (!coordinates) return [];
    const [longitude, latitude, countryName] = coordinates;
    const refugees = number(item.refugees);
    const asylumSeekers = number(item.asylum_seekers);
    const idps = number(item.idps);
    const total = refugees + asylumSeekers + idps;
    if (total < 1_000) return [];
    return [{
      id: `unhcr-displacement-${code}-${item.year || index}`,
      layer: "displacement",
      title: `${clean(item.coo_name, countryName)} forced displacement profile`,
      detail: `Refugees ${Math.round(refugees).toLocaleString()} · asylum-seekers ${Math.round(asylumSeekers).toLocaleString()} · internally displaced ${Math.round(idps).toLocaleString()} · end-${item.year || "year"}`,
      latitude: number(latitude), longitude: number(longitude),
      severity: total >= 2_000_000 ? 4 : total >= 250_000 ? 3 : total >= 50_000 ? 2 : 1,
      timestamp: Date.UTC(number(item.year, new Date().getUTCFullYear()), 11, 31),
      url: "https://www.unhcr.org/refugee-statistics/",
      source: "UNHCR Refugee Statistics",
      country: countryName || clean(item.coo_name),
      iso3: code,
      structural: true,
      retainedReference: true,
      refugees, asylumSeekers, idps, displacedTotal: total, reportingYear: number(item.year)
    }];
  });
}

function normalizeDiseaseOutbreaks(raw, countryCoordinates = {}) {
  const namedCoordinates = Object.entries(countryCoordinates).filter(([key]) => key.length > 3 && !/^[A-Z]{2,3}$/.test(key)).sort((left, right) => right[0].length - left[0].length);
  return (raw?.value || []).flatMap((item, index) => {
    const title = clean(item.UseOverrideTitle ? item.OverrideTitle : item.Title, "WHO disease outbreak update");
    const normalizedTitle = ` ${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
    const match = namedCoordinates.find(([name]) => normalizedTitle.includes(` ${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `));
    if (!match) return [];
    const [, [longitude, latitude, countryName]] = match;
    const summary = clean(item.Summary || item.Overview || item.Assessment || "Authoritative WHO Disease Outbreak News update").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 520);
    const text = `${title} ${summary}`;
    return [{
      id: `who-don-${item.DonId || item.UrlName || item.Id || index}`,
      layer: "disease-outbreaks",
      title,
      detail: summary || "Authoritative WHO Disease Outbreak News update",
      latitude: number(latitude), longitude: number(longitude),
      severity: /public health emergency of international concern|pheic/i.test(text) ? 4 : 3,
      timestamp: Date.parse(item.PublicationDate || item.PublicationDateAndTime || item.DateCreated || "") || Date.now(),
      url: `https://www.who.int/emergencies/disease-outbreak-news/item/${encodeURIComponent(item.UrlName || "")}`,
      source: "WHO Disease Outbreak News",
      country: countryName
    }];
  });
}

function normalizeRadiation(raw) {
  return (raw?.markers || []).flatMap((item, index) => {
    const latitude = number(item.lat ?? item.latitude, NaN);
    const longitude = number(item.lon ?? item.longitude, NaN);
    const dose = number(item.doseRateMicroSvH, NaN);
    if (![latitude, longitude, dose].every(Number.isFinite)) return [];
    const timestamp = Date.parse(item.timeUTC || "") || number(item.timeUnix) * 1000 || Date.now();
    const detector = clean(item.detectorName || item.detectorType, "community sensor");
    const countRate = Number.isFinite(number(item.countRateCPS, NaN)) ? ` · ${number(item.countRateCPS).toFixed(1)} CPS` : "";
    return [{
      id: `safecast-radiation-${item.id || item.trackID || index}-${Math.round(timestamp / 1000)}`,
      layer: "radiation",
      title: `Radiation ${dose.toFixed(3)} µSv/h`,
      detail: `${detector}${countRate} · Community measurement; verify anomalous readings with national authorities.`,
      latitude, longitude,
      severity: dose >= 10 ? 4 : dose >= 1 ? 3 : dose >= 0.5 ? 2 : 1,
      timestamp,
      url: "https://simplemap.safecast.org/",
      source: "Safecast CC0",
      doseRateMicroSvH: dose,
      countRateCPS: number(item.countRateCPS, 0),
      detectorName: detector
    }];
  });
}

function normalizeServiceStatus(raw) {
  const impactSeverity = { critical: 4, major: 4, high: 4, minor: 3, medium: 3, low: 2, none: 1 };
  const incidents = (raw?.incidents || []).flatMap((incident, index) => {
    if (!incident?.active) return [];
    const severity = impactSeverity[String(incident.impact || "minor").toLowerCase()] || 3;
    return [{
      id: `service-status-${incident.id || index}`,
      layer: "service-status",
      title: `${clean(incident.provider, "Provider")} · ${clean(incident.title, "Service incident")}`,
      detail: `${clean(incident.status, "active")} · ${clean(incident.detail, "Official provider incident")}`,
      severity,
      timestamp: Date.parse(incident.updatedAt || incident.startedAt || "") || Date.now(),
      url: incident.url || "",
      source: `${clean(incident.provider, "Provider")} official status`,
      providerId: clean(incident.providerId),
      provider: clean(incident.provider),
      impact: clean(incident.impact),
      incidentStatus: clean(incident.status),
      components: Array.isArray(incident.components) ? incident.components.map((item) => clean(item)).filter(Boolean) : []
    }];
  });
  const knownIncidentProviders = new Set(incidents.map((incident) => incident.providerId));
  const degradedComponents = (raw?.providers || []).flatMap((provider) => {
    if (!provider?.available || knownIncidentProviders.has(provider.id)) return [];
    return (provider.components || []).filter((component) => component?.status && component.status !== "operational").slice(0, 8).flatMap((component, index) => {
      const status = String(component.status).toLowerCase();
      return [{
        id: `service-component-${provider.id}-${component.id || index}`,
        layer: "service-status",
        title: `${clean(provider.label)} · ${clean(component.name, "Degraded component")}`,
        detail: `Provider-reported component status: ${clean(component.status).replace(/_/g, " ")}`,
        severity: /major|partial_outage/.test(status) ? 4 : 3,
        timestamp: Date.parse(component.updatedAt || provider.updatedAt || "") || Date.now(),
        url: provider.url || "",
        source: `${clean(provider.label)} official status`,
        providerId: clean(provider.id),
        provider: clean(provider.label),
        impact: clean(component.status),
        incidentStatus: clean(component.status),
        components: [clean(component.name)]
      }];
    });
  });
  return [...incidents, ...degradedComponents];
}

function normalizeTravelAdvisory(raw) {
  if (!raw?.available || !Number.isFinite(Number(raw.latitude)) || !Number.isFinite(Number(raw.longitude))) return [];
  const severity = clampNumber(number(raw.severity, 1), 1, 4);
  return [{
    id: `travel-advisory-${clean(raw.countryCode || raw.slug || raw.country).toLowerCase()}`,
    layer: "travel-advisories",
    title: `${clean(raw.country, "Country")} · ${clean(raw.level, "Official travel advice")}`,
    detail: clean(raw.latestChange || raw.warning || raw.description, "Current official destination advice"),
    latitude: number(raw.latitude),
    longitude: number(raw.longitude),
    severity,
    timestamp: Date.parse(raw.updatedAt || "") || Number(raw.retrievedAt) || Date.now(),
    url: raw.sourceUrl || "",
    source: "UK FCDO",
    advisoryAlerts: Array.isArray(raw.alerts) ? raw.alerts.map((item) => clean(item)).filter(Boolean) : [],
    advisoryLevel: clean(raw.level),
    country: clean(raw.country),
    countryCode: clean(raw.countryCode)
  }];
}

self.onmessage = ({ data }) => {
  if (data?.type !== "normalize") return;
  const feeds = data.feeds || {};
  const events = [
    ...normalizeEarthquakes(feeds.earthquakes?.data),
    ...normalizeEonet(feeds.naturalEvents?.data),
    ...normalizeGdacs(feeds.disasterAlerts?.data),
    ...normalizeAviationWeather(feeds.aviationWeather?.data),
    ...normalizeAirQuality(feeds.airQuality?.data),
    ...normalizeMilitaryAircraft(feeds.militaryAircraft?.data),
    ...normalizeMaritimeConditions(feeds.maritimeConditions?.data),
    ...normalizeVesselTraffic(feeds.vesselTraffic?.data),
    ...normalizeOrbital(feeds.orbital?.data),
    ...normalizeSecurity(feeds.security?.data),
    ...normalizeSanctions(feeds.sanctions?.data, data.countryCoordinates || {}),
    ...normalizeGlobalReporting(feeds.globalReporting?.data, data.countryCoordinates || {}),
    ...normalizeBusinessOpportunities(feeds.businessOpportunities?.data, data.countryCoordinates || {}),
    ...normalizeOfficialWire(feeds.officialWire?.data, data.countryCoordinates || {}),
    ...normalizeServiceStatus(feeds.serviceStatus?.data),
    ...normalizeTravelAdvisory(feeds.travelAdvisory?.data),
    ...normalizeCyber(feeds.cyber?.data),
    ...normalizeSpaceWeather(feeds.spaceWeather?.data),
    ...normalizeInternetOutages(feeds.internetOutages?.data, data.countryCoordinates || {}),
    ...normalizeDisplacement(feeds.displacement?.data, data.countryCoordinates || {}),
    ...normalizeDiseaseOutbreaks(feeds.diseaseOutbreaks?.data, data.countryCoordinates || {}),
    ...normalizeRadiation(feeds.radiation?.data)
  ].sort((a, b) => (b.severity - a.severity) || (b.timestamp - a.timestamp));
  self.postMessage({ type: "normalized", events, generatedAt: Date.now(), reason: data.reason || "full" });
};
