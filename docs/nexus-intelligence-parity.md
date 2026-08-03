# Nexus Intelligence parity audit

This audit compares the independent EMS module with the feature inventory in
the locally inspected World Monitor reference source. It is deliberately
stricter than a visual comparison: a feature is marked complete only when its
current implementation and live behavior were verified.

## Verified native capabilities

| Capability | EMS implementation | Evidence |
| --- | --- | --- |
| No hosted product dependency | First-party HTML, CSS, Canvas and JavaScript; no iframe or hosted runtime | Native guard plus live DOM: zero iframes and no account/subscription text |
| EMS security | Protected bootstrap and `world-monitor:view` permission | Module bootstrap, roles configuration and database migration |
| Flat and globe maps | Native flat projection and orthographic globe | Live toggle and rendered globe verified |
| Navigation | Pan, zoom, regional presets, 1h–7d/all time windows | Live selection changed URL and visible signal count |
| Marker density | Zoom-adaptive marker clusters with drill-in | Canvas cluster renderer and live globe clusters |
| Map layers | 44 selectable live/reference/derived layers | Live DOM count and catalog guard |
| Panels | 42 operational panels | Live DOM count and persistent panel catalog |
| Layout management | Hide/show, compact mode and drag reorder, saved locally | Live visibility toggle verified and restored |
| Source operations | Per-source health, TTL caching, stale fallback and authenticated proxy | Twenty-five-source source-health monitor, including on-demand country advice |
| Prediction intelligence | Read-only market-implied probabilities, 24h change, volume and liquidity | Twelve strategic markets rendered live through the EMS proxy; sports excluded; no wallet or trading path |
| Analysis | Priority ranking, transparent country stress screen, regional distribution and local brief | Live panels populated from normalized signals |
| Strategic posture | Nine transparent theater screens with click-to-focus map behavior | Local recency/severity synthesis over public signals and reference exposure; no intent inference |
| Country drilldown | Polygon hit-testing in flat/globe modes plus live drawer for weather, signals, connectivity, reporting, assets, macroeconomics, market context and predictions | Native Natural Earth hit-testing; World Bank/IMF on-demand profiles with annual debt, trade, tariff, growth and inflation trends; source-attributed country synthesis |
| Workflows | Route exposure and disruption scenario screening | Live route and scenario selections changed results |
| Personalization | Watchlist and keyword monitors | Add, highlight, remove and persistence paths verified |
| History | Compact seven-day local snapshots | Snapshot captured after successful refresh |
| Export | Current filtered state as CSV or JSON | Native export implementation; browser extension could not observe the scripted download event |
| Shareable views | Lens, layers, region, time and map mode encoded in URL | Live URL state verified |
| Exchange context | 29 major exchange locations plus locally calculated regular-session status | Catalog guard and live panel; explicitly excludes holidays, auctions, breaks and special sessions |
| Macro-risk context | Eight public FRED series with recent trends, dates, units, caching and source links | Authenticated Edge ingestion and native panel; latest published observations are distinguished from live quotes |
| Direct official reporting | Bounded RSS/Atom wire with per-publisher health, filters, short summaries, links and headline-based country association | Eight allowlisted official publishers; one failure cannot blank the wire |
| Platform service health | Provider summary, degraded components, active/recent incidents, provider-specific failure isolation and official links | Official GitHub, Cloudflare, OpenAI and Google Cloud status publications; no account or API key |
| Official travel advisories | On-demand country warning level, warning tags, latest change, update time, source link, panel and country-drawer context | UK FCDO Content API; six-hour per-country cache; explicitly scoped to British-national guidance rather than a universal order |
| Live military aircraft | Global current military-registration ADS-B positions, identity/altitude/speed details and 30-second visible-tab refresh | ADSB.lol public API, ODbL attribution, bounded Edge cache; routine tracks excluded from alert scores |
| Live vessels | Recent Class A AIS positions with name/type/destination/speed metadata in Finnish and adjacent Baltic waters | Fintraffic Digitraffic, CC BY 4.0 attribution and modification notice; explicitly not global satellite AIS |
| Air quality | Global representative metro grid cells plus on-demand country label-point AQI, particulate, ozone, NO₂, dust and UV context | Open-Meteo / Copernicus CAMS model output; explicitly not a certified ground monitor, national average, or health directive |
| Day/night context | Current solar terminator and smoothed twilight shading in flat and globe modes | Local UTC solar ephemeris; no external account, key, request, or quota |
| Sanctions context | Current OFAC SDN publication aggregated by associated country, designation type, and program tag | Official U.S. Treasury source; explicitly not a prohibited-country list, legal opinion, or entity-screening result |
| Layer transparency | Purpose, provider, freshness, confidence and limitations | All 44 layer cards available |

## Independent public feeds currently integrated

- USGS earthquakes
- NASA EONET natural events
- GDACS disaster alerts
- GDELT conflict-oriented open reporting
- GDELT broad economy, technology, climate, health and disaster reporting
- GDELT commercial discovery for tenders, procurement, investment, expansion, trade, infrastructure and supply-chain leads; linked publications require verification
- CISA Known Exploited Vulnerabilities
- NOAA space-weather alerts
- CoinGecko crypto prices
- Frankfurter / ECB reference exchange rates
- Federal Reserve Economic Data: policy rate, Treasury yield/spread, broad dollar index, WTI oil, CPI, unemployment and industrial production
- Official RSS/Atom wire: UN News, NASA, NOAA National Ocean Service, NOAA Storm Prediction Center, CISA, NHC Atlantic, NHC Eastern Pacific and European Central Bank
- UK FCDO Content API on-demand country travel and security advice
- ADSB.lol global military-registration ADS-B positions under ODbL 1.0
- Fintraffic Digitraffic open Baltic AIS positions and metadata under CC BY 4.0
- Open-Meteo local and airport conditions
- Open-Meteo / Copernicus CAMS global air-quality model
- U.S. Treasury OFAC current SDN publication, aggregated in the EMS Edge Function
- Open-Meteo marine conditions
- CelesTrak public orbital elements with minute-by-minute local approximate propagation
- Polymarket public Gamma market data for read-only prediction intelligence
- IODA / Georgia Tech country-level internet outage detections
- World Bank Open Data and IMF World Economic Outlook on-demand country profiles
- UNHCR Refugee Population Statistics annual displacement profiles
- WHO Disease Outbreak News reports
- Safecast CC0 community radiation measurements with bounded recent-track sampling

Every provider is isolated: failure of one feed does not block the map or other
panels. Device caching and the EMS Edge Function provide separate fallbacks.

## Remaining data parity: external constraint audit

These are not artificial UI locks. They depend on data rights, credentials,
infrastructure or compute that cannot truthfully be made globally unlimited by
client-side code.

| Reference capability | Dependency identified in reference docs | Honest no-cost path | Current status |
| --- | --- | --- | --- |
| Live global ADS-B aircraft | OpenSky plus Wingbits enrichment | ODbL community data or a user-owned receiver | Global military-registration positions complete through ADSB.lol; unrestricted global civilian coverage still requires a receiver-owned or separately licensed source |
| Live AIS vessels | AISStream API key and WebSocket relay; satellite AIS is commercial | CC BY government AIS where available or a user-owned receiver | Open Finnish/adjacent Baltic Class A positions complete through Digitraffic; unrestricted global satellite AIS remains unavailable without licensed infrastructure |
| Social unrest / conflict events | Authenticated ACLED plus GDELT/UCDP | GDELT and public UCDP releases; ACLED requires its own credentials/terms | GDELT signals complete; ACLED corroboration pending |
| Satellite tracking | Free CelesTrak GP elements plus orbital propagation | Direct CelesTrak ingestion and local propagation | Complete for the public military group; displayed positions are explicitly approximate rather than SGP4-grade |
| Internet outages | Cloudflare Radar | IODA public country-level measurement events with caching and attribution | Complete with IODA; detections are anomalies, not proof of cause |
| Satellite fire detections | NASA FIRMS | FIRMS map key under NASA terms | EONET wildfire events complete; VIIRS points pending key |
| Full finance radar | Finnhub/Yahoo, FRED and EIA | Public series with provider keys and rate limits; self-cache in EMS | Crypto, currencies, country macro context, 29-exchange regular-hours reference and eight-source-attributed FRED series complete; licensed live equities and broader commodity curves pending |
| 500+ RSS/news feeds | Dozens of publisher feeds, proxying and source-specific terms | Internal RSS proxy with fair-use caching and source controls | Conflict and broad GDELT streams plus an eight-publisher official RSS/Atom wire complete; expansion remains source-by-source rather than claiming unrestricted redistribution rights |
| Live news video | YouTube player and broadcaster availability | Optional lazy-loaded YouTube player; still a third-party media dependency | Not included in the fully first-party runtime |
| AI-generated briefs/chat | Local Ollama/LM Studio or paid Groq/OpenRouter | User-operated local OpenAI-compatible model server | Deterministic local brief complete; generative AI pending local model service |
| Country CII/CRI indices | Multiple official datasets, server pipelines and proprietary methodology state | Independent transparent EMS methodology with scheduled official data ingestion | Live stress plus a coverage-labelled seven-component resilience context screen complete; this is explicitly not the proprietary CRI |
| Forced displacement | UNHCR Refugee Population Statistics | Public country-of-origin API with annual reporting-year disclosure | Complete for refugees, asylum-seekers, IDPs and returns |
| Disease outbreaks | WHO Disease Outbreak News | Public official DON API with country geocoding and source links | Complete; DON is selective and not an exhaustive outbreak registry |
| Radiation monitoring | Government radiation networks | Safecast CC0 public community measurements with bounded normalization | Complete for recent community measurements; not an official government alert network or health-warning service |

## Deployment requirements

The native browser module works locally without the upstream application. For
hosted reliability, deploy the included `intelligence-feeds` Supabase Edge
Function and apply the world-monitor permission migration. The function is an
allowlisted, authenticated feed cache; it does not proxy arbitrary URLs.

The original repository remains a design/reference input only. It is not a
runtime, authentication, subscription, or build dependency of Nexus
Intelligence.
