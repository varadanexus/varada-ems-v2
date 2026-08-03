export const INTELLIGENCE_LENSES = Object.freeze({
  full: {
    label: "Global",
    description: "All-domain situational awareness",
    layers: ["day-night", "business-opportunities", "earthquakes", "wildfires", "volcanoes", "storms", "floods", "landslides", "disaster-alerts", "air-quality", "disease-outbreaks", "radiation", "conflicts", "travel-advisories", "sanctions", "reporting", "service-status", "displacement", "internet-outages", "stock-exchanges", "military-bases", "critical-minerals", "aviation", "live-aircraft", "aviation-weather", "maritime", "live-vessels", "maritime-conditions", "satellites", "infrastructure", "nuclear", "energy", "telecom", "space-weather"]
  },
  security: {
    label: "Security",
    description: "Conflict, instability and strategic infrastructure",
    layers: ["conflicts", "travel-advisories", "sanctions", "reporting", "displacement", "cyber", "earthquakes", "radiation", "military-bases", "critical-minerals", "satellites", "infrastructure", "nuclear", "telecom", "aviation", "live-aircraft", "maritime", "live-vessels"]
  },
  climate: {
    label: "Climate",
    description: "Natural hazards, weather and environmental pressure",
    layers: ["day-night", "wildfires", "volcanoes", "storms", "floods", "earthquakes", "drought", "ice", "landslides", "extreme-temperature", "dust-haze", "snow", "disaster-alerts", "air-quality", "disease-outbreaks", "radiation"]
  },
  logistics: {
    label: "Logistics",
    description: "Ports, routes, aviation and supply-chain disruption",
    layers: ["business-opportunities", "aviation", "live-aircraft", "aviation-weather", "maritime", "live-vessels", "maritime-conditions", "military-bases", "critical-minerals", "infrastructure", "energy", "telecom", "rail", "water", "storms", "floods", "conflicts", "disaster-alerts"]
  },
  markets: {
    label: "Markets",
    description: "Macro, commodities, currencies and disruption signals",
    layers: ["business-opportunities", "conflicts", "sanctions", "reporting", "storms", "stock-exchanges", "infrastructure", "energy", "maritime", "earthquakes"]
  },
  technology: {
    label: "Technology",
    description: "Cyber, space weather and digital infrastructure",
    layers: ["cyber", "reporting", "service-status", "internet-outages", "space-weather", "satellites", "telecom", "spaceports", "infrastructure", "conflicts"]
  }
});

export const INTELLIGENCE_LAYERS = Object.freeze([
  { id: "day-night", label: "Solar day / night", group: "Weather and climate", icon: "☼", color: "#8bbcff", live: true, derived: true, source: "Nexus UTC solar ephemeris" },
  { id: "business-opportunities", label: "Business opportunities", group: "Economy", icon: "OP", color: "#4fe0a3", live: true, source: "GDELT commercial discovery / linked publishers" },
  { id: "earthquakes", label: "Earthquakes", group: "Natural hazards", icon: "EQ", color: "#ff6b57", live: true, source: "USGS" },
  { id: "wildfires", label: "Wildfires", group: "Natural hazards", icon: "WF", color: "#ff9e42", live: true, source: "NASA EONET" },
  { id: "volcanoes", label: "Volcanoes", group: "Natural hazards", icon: "VO", color: "#e05d44", live: true, source: "NASA EONET" },
  { id: "storms", label: "Severe storms", group: "Weather and climate", icon: "ST", color: "#63b3ff", live: true, source: "NASA EONET" },
  { id: "floods", label: "Floods", group: "Weather and climate", icon: "FL", color: "#36c5f0", live: true, source: "NASA EONET" },
  { id: "drought", label: "Drought", group: "Weather and climate", icon: "DR", color: "#d9a441", live: true, source: "NASA EONET" },
  { id: "ice", label: "Sea and lake ice", group: "Weather and climate", icon: "IC", color: "#b8e3ff", live: true, source: "NASA EONET" },
  { id: "landslides", label: "Landslides", group: "Natural hazards", icon: "LS", color: "#c7925b", live: true, source: "NASA EONET" },
  { id: "extreme-temperature", label: "Temperature extremes", group: "Weather and climate", icon: "TX", color: "#ff7b63", live: true, source: "NASA EONET" },
  { id: "dust-haze", label: "Dust and haze", group: "Weather and climate", icon: "DH", color: "#d8b779", live: true, source: "NASA EONET" },
  { id: "snow", label: "Snow events", group: "Weather and climate", icon: "SN", color: "#d8f1ff", live: true, source: "NASA EONET" },
  { id: "manmade", label: "Human-caused incidents", group: "Security", icon: "HM", color: "#ff805e", live: true, source: "NASA EONET" },
  { id: "disaster-alerts", label: "Global disaster alerts", group: "Natural hazards", icon: "DA", color: "#ffca5f", live: true, source: "GDACS" },
  { id: "conflicts", label: "Conflict signals", group: "Security", icon: "CF", color: "#ff4d6d", live: true, source: "GDELT" },
  { id: "travel-advisories", label: "Official travel advisories", group: "Security", icon: "TA", color: "#ffbf5b", live: true, onDemand: true, source: "UK FCDO" },
  { id: "sanctions", label: "Sanctions associations", group: "Security", icon: "SC", color: "#f0a34a", live: true, source: "U.S. Treasury OFAC SDN" },
  { id: "reporting", label: "Global public reporting", group: "Reporting", icon: "NW", color: "#78a8ff", live: true, source: "GDELT Global" },
  { id: "service-status", label: "Platform status incidents", group: "Infrastructure", icon: "UP", color: "#63d8a7", live: true, source: "Official provider status" },
  { id: "cyber", label: "Cyber advisories", group: "Security", icon: "CY", color: "#b47cff", live: true, source: "CISA" },
  { id: "space-weather", label: "Space weather", group: "Security", icon: "SW", color: "#f2d15f", live: true, source: "NOAA SWPC" },
  { id: "internet-outages", label: "Internet outage detections", group: "Infrastructure", icon: "IO", color: "#ff72c7", live: true, source: "IODA / Georgia Tech" },
  { id: "displacement", label: "Forced displacement", group: "Humanitarian", icon: "DP", color: "#a88cff", live: true, source: "UNHCR" },
  { id: "disease-outbreaks", label: "Disease outbreak news", group: "Humanitarian", icon: "DO", color: "#55d99f", live: true, source: "WHO" },
  { id: "radiation", label: "Radiation measurements", group: "Environment", icon: "RD", color: "#c8ff5a", live: true, source: "Safecast CC0" },
  { id: "air-quality", label: "Air quality model", group: "Environment", icon: "AQ", color: "#b6e66b", live: true, source: "Open-Meteo / CAMS" },
  { id: "aviation", label: "Aviation hubs", group: "Mobility", icon: "AV", color: "#7fe7c4", live: false, source: "Varada reference" },
  { id: "live-aircraft", label: "Live military ADS-B", group: "Mobility", icon: "✈", color: "#64b5ff", live: true, source: "ADSB.lol · ODbL" },
  { id: "aviation-weather", label: "Aviation weather", group: "Mobility", icon: "WX", color: "#55d9b3", live: true, source: "Open-Meteo" },
  { id: "maritime", label: "Strategic ports", group: "Mobility", icon: "PT", color: "#4fc3f7", live: false, source: "Varada reference" },
  { id: "live-vessels", label: "Live Baltic AIS", group: "Mobility", icon: "◆", color: "#49d8e8", live: true, source: "Fintraffic Digitraffic · CC BY 4.0" },
  { id: "maritime-conditions", label: "Marine conditions", group: "Mobility", icon: "MC", color: "#48d4e8", live: true, source: "Open-Meteo Marine" },
  { id: "infrastructure", label: "Critical infrastructure", group: "Infrastructure", icon: "IN", color: "#d9c27c", live: false, source: "Varada reference" }
  ,{ id: "nuclear", label: "Nuclear facilities", group: "Infrastructure", icon: "NU", color: "#d6ef6c", live: false, source: "Varada reference" }
  ,{ id: "spaceports", label: "Spaceports", group: "Infrastructure", icon: "SP", color: "#c7a6ff", live: false, source: "Varada reference" }
  ,{ id: "energy", label: "Energy hubs", group: "Infrastructure", icon: "EN", color: "#ffc45f", live: false, source: "Varada reference" }
  ,{ id: "telecom", label: "Cable landing hubs", group: "Infrastructure", icon: "TC", color: "#7cd7ff", live: false, source: "Varada reference" }
  ,{ id: "water", label: "Strategic water assets", group: "Infrastructure", icon: "WA", color: "#5ebff1", live: false, source: "Varada reference" }
  ,{ id: "rail", label: "Rail freight hubs", group: "Mobility", icon: "RA", color: "#9dd5ad", live: false, source: "Varada reference" }
  ,{ id: "military-bases", label: "Strategic military bases", group: "Security", icon: "MB", color: "#ff8d6b", live: false, source: "Varada public reference" }
  ,{ id: "critical-minerals", label: "Critical mineral sites", group: "Infrastructure", icon: "CM", color: "#d2a8ff", live: false, source: "Varada public reference" }
  ,{ id: "satellites", label: "Orbital surveillance", group: "Security", icon: "OR", color: "#8fd7ff", live: true, source: "CelesTrak" }
  ,{ id: "stock-exchanges", label: "Global stock exchanges", group: "Economy", icon: "EX", color: "#76e6a8", live: false, source: "Exchange schedule reference" }
]);

export const REFERENCE_POINTS = Object.freeze([
  { id: "port-singapore", layer: "maritime", title: "Port of Singapore", latitude: 1.26, longitude: 103.84, severity: 1, country: "Singapore", detail: "Strategic container and energy transshipment hub" },
  { id: "port-shanghai", layer: "maritime", title: "Port of Shanghai", latitude: 31.23, longitude: 121.49, severity: 1, country: "China", detail: "High-volume global container gateway" },
  { id: "port-rotterdam", layer: "maritime", title: "Port of Rotterdam", latitude: 51.95, longitude: 4.14, severity: 1, country: "Netherlands", detail: "Primary European energy and container gateway" },
  { id: "port-jebel-ali", layer: "maritime", title: "Jebel Ali Port", latitude: 24.99, longitude: 55.06, severity: 1, country: "United Arab Emirates", detail: "Middle East logistics and transshipment hub" },
  { id: "port-mumbai", layer: "maritime", title: "JNPA / Mumbai", latitude: 18.95, longitude: 72.95, severity: 1, country: "India", detail: "Western India container gateway" },
  { id: "chokepoint-suez", layer: "infrastructure", title: "Suez Canal", latitude: 30.45, longitude: 32.35, severity: 2, country: "Egypt", detail: "Europe-Asia maritime chokepoint" },
  { id: "chokepoint-panama", layer: "infrastructure", title: "Panama Canal", latitude: 9.08, longitude: -79.68, severity: 2, country: "Panama", detail: "Atlantic-Pacific maritime chokepoint" },
  { id: "chokepoint-hormuz", layer: "infrastructure", title: "Strait of Hormuz", latitude: 26.57, longitude: 56.25, severity: 3, country: "Oman / Iran", detail: "Critical global energy shipping route" },
  { id: "chokepoint-malacca", layer: "infrastructure", title: "Strait of Malacca", latitude: 2.5, longitude: 101.0, severity: 2, country: "Malaysia / Indonesia", detail: "High-density Asia-Europe shipping route" },
  { id: "airport-del", layer: "aviation", title: "Delhi Indira Gandhi", latitude: 28.56, longitude: 77.1, severity: 1, country: "India", detail: "South Asian aviation hub" },
  { id: "airport-dxb", layer: "aviation", title: "Dubai International", latitude: 25.25, longitude: 55.36, severity: 1, country: "United Arab Emirates", detail: "Intercontinental passenger and cargo hub" },
  { id: "airport-sin", layer: "aviation", title: "Singapore Changi", latitude: 1.36, longitude: 103.99, severity: 1, country: "Singapore", detail: "Southeast Asian aviation hub" },
  { id: "airport-lhr", layer: "aviation", title: "London Heathrow", latitude: 51.47, longitude: -0.45, severity: 1, country: "United Kingdom", detail: "European intercontinental hub" },
  { id: "airport-jfk", layer: "aviation", title: "New York JFK", latitude: 40.64, longitude: -73.78, severity: 1, country: "United States", detail: "North Atlantic aviation hub" }
  ,{ id: "nuclear-tarapur", layer: "nuclear", title: "Tarapur Atomic Power Station", latitude: 19.83, longitude: 72.66, severity: 1, country: "India", detail: "Publicly documented nuclear generating site" }
  ,{ id: "nuclear-kudankulam", layer: "nuclear", title: "Kudankulam Nuclear Power Plant", latitude: 8.17, longitude: 77.71, severity: 1, country: "India", detail: "Publicly documented nuclear generating site" }
  ,{ id: "nuclear-zaporizhzhia", layer: "nuclear", title: "Zaporizhzhia Nuclear Power Plant", latitude: 47.51, longitude: 34.59, severity: 3, country: "Ukraine", detail: "Publicly documented nuclear generating site in a conflict-exposed region" }
  ,{ id: "nuclear-fukushima", layer: "nuclear", title: "Fukushima Daiichi", latitude: 37.42, longitude: 141.03, severity: 2, country: "Japan", detail: "Decommissioning and environmental monitoring site" }
  ,{ id: "spaceport-sdsc", layer: "spaceports", title: "Satish Dhawan Space Centre", latitude: 13.72, longitude: 80.23, severity: 1, country: "India", detail: "Orbital launch complex" }
  ,{ id: "spaceport-cape", layer: "spaceports", title: "Cape Canaveral", latitude: 28.49, longitude: -80.58, severity: 1, country: "United States", detail: "Orbital launch complex" }
  ,{ id: "spaceport-baikonur", layer: "spaceports", title: "Baikonur Cosmodrome", latitude: 45.96, longitude: 63.31, severity: 1, country: "Kazakhstan", detail: "Orbital launch complex" }
  ,{ id: "spaceport-kourou", layer: "spaceports", title: "Guiana Space Centre", latitude: 5.24, longitude: -52.77, severity: 1, country: "French Guiana", detail: "Orbital launch complex" }
  ,{ id: "energy-jamnagar", layer: "energy", title: "Jamnagar refining hub", latitude: 22.35, longitude: 69.85, severity: 1, country: "India", detail: "Major refining and petrochemical cluster" }
  ,{ id: "energy-ras-tanura", layer: "energy", title: "Ras Tanura energy terminal", latitude: 26.64, longitude: 50.16, severity: 2, country: "Saudi Arabia", detail: "Strategic crude export and refining hub" }
  ,{ id: "energy-houston", layer: "energy", title: "Houston Ship Channel energy cluster", latitude: 29.73, longitude: -95.19, severity: 1, country: "United States", detail: "Major refining and petrochemical cluster" }
  ,{ id: "telecom-mumbai", layer: "telecom", title: "Mumbai cable landing hub", latitude: 19.02, longitude: 72.82, severity: 1, country: "India", detail: "International subsea cable landing region" }
  ,{ id: "telecom-singapore", layer: "telecom", title: "Singapore cable landing hub", latitude: 1.3, longitude: 103.8, severity: 1, country: "Singapore", detail: "International subsea cable landing region" }
  ,{ id: "telecom-marseille", layer: "telecom", title: "Marseille cable landing hub", latitude: 43.3, longitude: 5.37, severity: 1, country: "France", detail: "Europe-Asia-Africa subsea cable gateway" }
  ,{ id: "water-three-gorges", layer: "water", title: "Three Gorges Dam", latitude: 30.82, longitude: 111.0, severity: 1, country: "China", detail: "Major hydroelectric and river-control asset" }
  ,{ id: "water-aswan", layer: "water", title: "Aswan High Dam", latitude: 23.97, longitude: 32.88, severity: 1, country: "Egypt", detail: "Strategic water and power infrastructure" }
  ,{ id: "water-itaipu", layer: "water", title: "Itaipu Dam", latitude: -25.41, longitude: -54.59, severity: 1, country: "Brazil / Paraguay", detail: "Major binational hydroelectric asset" }
  ,{ id: "rail-duisburg", layer: "rail", title: "Duisburg freight hub", latitude: 51.43, longitude: 6.76, severity: 1, country: "Germany", detail: "European intermodal rail and inland-port hub" }
  ,{ id: "rail-khorgos", layer: "rail", title: "Khorgos dry port", latitude: 44.22, longitude: 80.42, severity: 1, country: "Kazakhstan", detail: "China-Europe transcontinental rail gateway" }
  ,{ id: "base-ramstein", layer: "military-bases", title: "Ramstein Air Base", latitude: 49.44, longitude: 7.6, severity: 2, country: "Germany", detail: "Publicly documented NATO air mobility and command hub" }
  ,{ id: "base-diego-garcia", layer: "military-bases", title: "Diego Garcia", latitude: -7.32, longitude: 72.42, severity: 2, country: "British Indian Ocean Territory", detail: "Publicly documented Indian Ocean support facility" }
  ,{ id: "base-guam-andersen", layer: "military-bases", title: "Andersen Air Force Base", latitude: 13.58, longitude: 144.93, severity: 2, country: "Guam", detail: "Publicly documented western Pacific air hub" }
  ,{ id: "base-al-udeid", layer: "military-bases", title: "Al Udeid Air Base", latitude: 25.12, longitude: 51.31, severity: 2, country: "Qatar", detail: "Publicly documented regional air and command hub" }
  ,{ id: "base-bahrain", layer: "military-bases", title: "Naval Support Activity Bahrain", latitude: 26.2, longitude: 50.61, severity: 2, country: "Bahrain", detail: "Publicly documented Gulf naval support hub" }
  ,{ id: "base-yokosuka", layer: "military-bases", title: "Yokosuka Naval Base", latitude: 35.29, longitude: 139.67, severity: 2, country: "Japan", detail: "Publicly documented western Pacific naval hub" }
  ,{ id: "base-djibouti", layer: "military-bases", title: "Camp Lemonnier", latitude: 11.55, longitude: 43.15, severity: 2, country: "Djibouti", detail: "Publicly documented Horn of Africa support hub" }
  ,{ id: "base-incirlik", layer: "military-bases", title: "Incirlik Air Base", latitude: 37.0, longitude: 35.43, severity: 2, country: "Türkiye", detail: "Publicly documented NATO air facility" }
  ,{ id: "mineral-greenbushes", layer: "critical-minerals", title: "Greenbushes lithium mine", latitude: -33.85, longitude: 116.06, severity: 1, country: "Australia", detail: "Major publicly documented hard-rock lithium operation" }
  ,{ id: "mineral-atacama", layer: "critical-minerals", title: "Salar de Atacama lithium basin", latitude: -23.5, longitude: -68.25, severity: 2, country: "Chile", detail: "Strategic lithium brine production region" }
  ,{ id: "mineral-mutanda", layer: "critical-minerals", title: "Mutanda cobalt mine", latitude: -10.78, longitude: 25.81, severity: 2, country: "Democratic Republic of the Congo", detail: "Major publicly documented cobalt operation" }
  ,{ id: "mineral-bayan-obo", layer: "critical-minerals", title: "Bayan Obo rare-earth district", latitude: 41.77, longitude: 109.97, severity: 2, country: "China", detail: "Strategic rare-earth mining and processing district" }
  ,{ id: "mineral-mountain-pass", layer: "critical-minerals", title: "Mountain Pass rare-earth mine", latitude: 35.47, longitude: -115.53, severity: 1, country: "United States", detail: "Major publicly documented rare-earth operation" }
  ,{ id: "exchange-nyse", layer: "stock-exchanges", title: "New York Stock Exchange", code: "NYSE", latitude: 40.7069, longitude: -74.0113, country: "United States", timezone: "America/New_York", open: "09:30", close: "16:00", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-nasdaq", layer: "stock-exchanges", title: "Nasdaq", code: "NASDAQ", latitude: 40.7579, longitude: -73.9855, country: "United States", timezone: "America/New_York", open: "09:30", close: "16:00", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-tsx", layer: "stock-exchanges", title: "Toronto Stock Exchange", code: "TSX", latitude: 43.6481, longitude: -79.3836, country: "Canada", timezone: "America/Toronto", open: "09:30", close: "16:00", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-bmv", layer: "stock-exchanges", title: "Mexican Stock Exchange", code: "BMV", latitude: 19.4293, longitude: -99.1659, country: "Mexico", timezone: "America/Mexico_City", open: "08:30", close: "15:00", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-b3", layer: "stock-exchanges", title: "B3 São Paulo", code: "B3", latitude: -23.5455, longitude: -46.6333, country: "Brazil", timezone: "America/Sao_Paulo", open: "10:00", close: "17:00", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-lse", layer: "stock-exchanges", title: "London Stock Exchange", code: "LSE", latitude: 51.515, longitude: -0.099, country: "United Kingdom", timezone: "Europe/London", open: "08:00", close: "16:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-paris", layer: "stock-exchanges", title: "Euronext Paris", code: "XPAR", latitude: 48.8718, longitude: 2.341, country: "France", timezone: "Europe/Paris", open: "09:00", close: "17:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-xetra", layer: "stock-exchanges", title: "Frankfurt Xetra", code: "XETR", latitude: 50.1106, longitude: 8.6778, country: "Germany", timezone: "Europe/Berlin", open: "09:00", close: "17:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-six", layer: "stock-exchanges", title: "SIX Swiss Exchange", code: "SIX", latitude: 47.3686, longitude: 8.537, country: "Switzerland", timezone: "Europe/Zurich", open: "09:00", close: "17:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-amsterdam", layer: "stock-exchanges", title: "Euronext Amsterdam", code: "XAMS", latitude: 52.3697, longitude: 4.9014, country: "Netherlands", timezone: "Europe/Amsterdam", open: "09:00", close: "17:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-madrid", layer: "stock-exchanges", title: "Madrid Stock Exchange", code: "BME", latitude: 40.4168, longitude: -3.6922, country: "Spain", timezone: "Europe/Madrid", open: "09:00", close: "17:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-milan", layer: "stock-exchanges", title: "Borsa Italiana", code: "BIT", latitude: 45.4647, longitude: 9.1835, country: "Italy", timezone: "Europe/Rome", open: "09:00", close: "17:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-stockholm", layer: "stock-exchanges", title: "Nasdaq Stockholm", code: "XSTO", latitude: 59.3326, longitude: 18.0649, country: "Sweden", timezone: "Europe/Stockholm", open: "09:00", close: "17:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-jse", layer: "stock-exchanges", title: "Johannesburg Stock Exchange", code: "JSE", latitude: -26.1074, longitude: 28.0567, country: "South Africa", timezone: "Africa/Johannesburg", open: "09:00", close: "17:00", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-tadawul", layer: "stock-exchanges", title: "Saudi Exchange", code: "TADAWUL", latitude: 24.688, longitude: 46.685, country: "Saudi Arabia", timezone: "Asia/Riyadh", open: "10:00", close: "15:00", weekdays: [0, 1, 2, 3, 4], severity: 1, detail: "Regular Sunday–Thursday cash-equity session reference" }
  ,{ id: "exchange-tase", layer: "stock-exchanges", title: "Tel Aviv Stock Exchange", code: "TASE", latitude: 32.064, longitude: 34.7748, country: "Israel", timezone: "Asia/Jerusalem", open: "09:59", close: "17:25", weekdays: [0, 1, 2, 3, 4], severity: 1, detail: "Indicative Sunday–Thursday regular-session reference" }
  ,{ id: "exchange-bse", layer: "stock-exchanges", title: "BSE India", code: "BSE", latitude: 18.9299, longitude: 72.8336, country: "India", timezone: "Asia/Kolkata", open: "09:15", close: "15:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-nse", layer: "stock-exchanges", title: "National Stock Exchange of India", code: "NSE", latitude: 19.0607, longitude: 72.859, country: "India", timezone: "Asia/Kolkata", open: "09:15", close: "15:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-psx", layer: "stock-exchanges", title: "Pakistan Stock Exchange", code: "PSX", latitude: 24.85, longitude: 67.003, country: "Pakistan", timezone: "Asia/Karachi", open: "09:32", close: "15:30", severity: 1, detail: "Indicative regular cash-equity session reference" }
  ,{ id: "exchange-sse", layer: "stock-exchanges", title: "Shanghai Stock Exchange", code: "SSE", latitude: 31.2365, longitude: 121.508, country: "China", timezone: "Asia/Shanghai", open: "09:30", close: "15:00", severity: 1, detail: "Regular-session span; midday recess excluded from this estimate" }
  ,{ id: "exchange-szse", layer: "stock-exchanges", title: "Shenzhen Stock Exchange", code: "SZSE", latitude: 22.541, longitude: 114.054, country: "China", timezone: "Asia/Shanghai", open: "09:30", close: "15:00", severity: 1, detail: "Regular-session span; midday recess excluded from this estimate" }
  ,{ id: "exchange-hkex", layer: "stock-exchanges", title: "Hong Kong Exchanges", code: "HKEX", latitude: 22.284, longitude: 114.158, country: "Hong Kong", timezone: "Asia/Hong_Kong", open: "09:30", close: "16:00", severity: 1, detail: "Regular-session span; midday recess excluded from this estimate" }
  ,{ id: "exchange-twse", layer: "stock-exchanges", title: "Taiwan Stock Exchange", code: "TWSE", latitude: 25.033, longitude: 121.5654, country: "Taiwan", timezone: "Asia/Taipei", open: "09:00", close: "13:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-jpx", layer: "stock-exchanges", title: "Japan Exchange Group", code: "JPX", latitude: 35.682, longitude: 139.778, country: "Japan", timezone: "Asia/Tokyo", open: "09:00", close: "15:30", severity: 1, detail: "Regular-session span; midday recess excluded from this estimate" }
  ,{ id: "exchange-krx", layer: "stock-exchanges", title: "Korea Exchange", code: "KRX", latitude: 37.522, longitude: 126.924, country: "South Korea", timezone: "Asia/Seoul", open: "09:00", close: "15:30", severity: 1, detail: "Regular cash-equity session reference" }
  ,{ id: "exchange-sgx", layer: "stock-exchanges", title: "Singapore Exchange", code: "SGX", latitude: 1.2794, longitude: 103.8507, country: "Singapore", timezone: "Asia/Singapore", open: "09:00", close: "17:00", severity: 1, detail: "Regular-session span; midday recess excluded from this estimate" }
  ,{ id: "exchange-bursa", layer: "stock-exchanges", title: "Bursa Malaysia", code: "BURSA", latitude: 3.148, longitude: 101.696, country: "Malaysia", timezone: "Asia/Kuala_Lumpur", open: "09:00", close: "17:00", severity: 1, detail: "Regular-session span; midday recess excluded from this estimate" }
  ,{ id: "exchange-idx", layer: "stock-exchanges", title: "Indonesia Stock Exchange", code: "IDX", latitude: -6.224, longitude: 106.808, country: "Indonesia", timezone: "Asia/Jakarta", open: "09:00", close: "16:00", severity: 1, detail: "Indicative regular-session span; midday recess excluded" }
  ,{ id: "exchange-asx", layer: "stock-exchanges", title: "Australian Securities Exchange", code: "ASX", latitude: -33.865, longitude: 151.209, country: "Australia", timezone: "Australia/Sydney", open: "10:00", close: "16:00", severity: 1, detail: "Regular cash-equity session reference" }
].map((point) => Object.freeze({ ...point, structural: true, retainedReference: true, source: point.source || "Varada reference" })));

export const PANEL_CATALOG = Object.freeze([
  { id: "priority", title: "Priority signals", group: "Operations", source: "Combined live feeds" },
  { id: "leads", title: "Live leads & signals", group: "Economy", source: "Nexus lead engine · market sessions + India-curated opportunities" },
  { id: "commercial-opportunities", title: "Commercial opportunities", group: "Economy", source: "Nexus commercial scoring / linked publishers" },
  { id: "earthquakes", title: "Seismic activity", group: "Hazards", source: "USGS" },
  { id: "natural-events", title: "Natural events", group: "Hazards", source: "NASA EONET" },
  { id: "disaster-alerts", title: "Global disaster alerts", group: "Hazards", source: "GDACS" },
  { id: "security", title: "Security watch", group: "Security", source: "GDELT" },
  { id: "travel-advisories", title: "Official travel advisories", group: "Security", source: "UK FCDO Content API" },
  { id: "sanctions", title: "Sanctions context", group: "Security", source: "U.S. Treasury OFAC SDN List" },
  { id: "global-reporting", title: "Global reporting", group: "Reporting", source: "GDELT public news index" },
  { id: "official-wire", title: "Official public wire", group: "Reporting", source: "Official RSS/Atom sources" },
  { id: "cyber", title: "Cyber advisories", group: "Security", source: "CISA" },
  { id: "space-weather", title: "Space weather", group: "Environment", source: "NOAA SWPC" },
  { id: "orbital", title: "Orbital surveillance", group: "Space", source: "CelesTrak / Nexus propagation" },
  { id: "markets", title: "Markets pulse", group: "Economy", source: "CoinGecko / Frankfurter" },
  { id: "exchange-hours", title: "Global exchange hours", group: "Economy", source: "Local time-zone schedule model" },
  { id: "macro-risk", title: "Macro risk radar", group: "Economy", source: "FRED / public U.S. agencies" },
  { id: "predictions", title: "Prediction intelligence", group: "Analysis", source: "Polymarket public data" },
  { id: "internet-outages", title: "Internet outage monitor", group: "Technology", source: "IODA / Georgia Tech" },
  { id: "service-status", title: "Platform service health", group: "Technology", source: "Official provider status endpoints" },
  { id: "displacement", title: "Forced displacement", group: "Humanitarian", source: "UNHCR Refugee Statistics" },
  { id: "disease-outbreaks", title: "Disease outbreak news", group: "Health", source: "World Health Organization" },
  { id: "radiation", title: "Radiation monitor", group: "Environment", source: "Safecast CC0 community sensors" },
  { id: "air-quality", title: "Global air quality", group: "Environment", source: "Open-Meteo / Copernicus CAMS" },
  { id: "weather", title: "Location weather", group: "Environment", source: "Open-Meteo" },
  { id: "logistics", title: "Logistics chokepoints", group: "Mobility", source: "Varada reference" },
  { id: "brief", title: "Intelligence brief", group: "Analysis", source: "Nexus local synthesis" }
  ,{ id: "watchlist", title: "Watchlist", group: "Operations", source: "Device-local selections" }
  ,{ id: "aviation", title: "Aviation operations", group: "Mobility", source: "Open-Meteo / Varada reference" }
  ,{ id: "live-aircraft", title: "Live military aircraft", group: "Mobility", source: "ADSB.lol community network · ODbL" }
  ,{ id: "maritime", title: "Maritime conditions", group: "Mobility", source: "Open-Meteo Marine / Varada reference" }
  ,{ id: "live-vessels", title: "Live Baltic vessels", group: "Mobility", source: "Fintraffic Digitraffic · CC BY 4.0" }
  ,{ id: "infrastructure", title: "Infrastructure exposure", group: "Infrastructure", source: "Varada reference" }
  ,{ id: "energy", title: "Energy network", group: "Infrastructure", source: "Varada reference" }
  ,{ id: "timeline", title: "Signal distribution", group: "Analysis", source: "Nexus live aggregation" }
  ,{ id: "regions", title: "Regional watch", group: "Analysis", source: "Nexus live aggregation" }
  ,{ id: "strategic-posture", title: "Strategic posture", group: "Security", source: "Nexus transparent theater synthesis" }
  ,{ id: "country-risk", title: "Country stress screen", group: "Analysis", source: "Nexus transparent local score" }
  ,{ id: "route-exposure", title: "Route exposure", group: "Logistics", source: "Nexus local corridor model" }
  ,{ id: "scenario", title: "Scenario engine", group: "Analysis", source: "Nexus local impact model" }
  ,{ id: "monitors", title: "Custom monitors", group: "Operations", source: "Device-local keyword alerts" }
  ,{ id: "history", title: "Historical snapshots", group: "Analysis", source: "Device-local 7-day retention" }
  ,{ id: "source-health", title: "Source health", group: "Operations", source: "Nexus feed monitor" }
]);

export const LAND_POLYGONS = Object.freeze([
  [[-168,72],[-140,70],[-125,57],[-112,51],[-98,50],[-82,45],[-65,48],[-52,55],[-60,68],[-95,82],[-135,76]],
  [[-82,13],[-74,10],[-68,-3],[-63,-16],[-58,-33],[-68,-55],[-76,-40],[-80,-10]],
  [[-11,36],[0,44],[18,46],[35,58],[60,68],[90,75],[125,70],[160,62],[180,52],[160,40],[140,35],[122,22],[108,8],[92,22],[75,9],[60,25],[42,30],[30,40],[15,38]],
  [[-17,35],[5,37],[20,30],[34,15],[43,-12],[32,-34],[18,-35],[5,-28],[-5,-5]],
  [[112,-11],[130,-12],[153,-28],[146,-43],[118,-35]],
  [[-52,60],[-38,72],[-25,80],[-45,83],[-62,75]],
  [[47,-13],[51,-16],[49,-25],[44,-20]],
  [[-180,-70],[-120,-74],[-60,-72],[0,-76],[60,-72],[120,-75],[180,-70],[180,-90],[-180,-90]]
]);

export function layerById(id) {
  return INTELLIGENCE_LAYERS.find((layer) => layer.id === id) || null;
}

export function lensById(id) {
  return INTELLIGENCE_LENSES[id] || INTELLIGENCE_LENSES.full;
}
