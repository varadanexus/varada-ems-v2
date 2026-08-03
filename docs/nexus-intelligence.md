# Nexus Intelligence architecture

Nexus Intelligence is a clean-room, first-party Varada EMS module for global
situational awareness. It does not embed, authenticate against, clone, build,
or run the World Monitor application. Its UI, map engine, event normalization,
feed orchestration, caching, analysis panels, and preferences are Varada-owned
code running inside the existing authenticated EMS shell.

The commercial-opportunity layer runs continuously every day through the authenticated EMS feed proxy. It discovers recent tenders, procurement, investments, expansion, trade developments, infrastructure projects and supply-chain changes in linked public reporting, then assigns transparent opportunity, risk, freshness and confidence fields locally. These are discovery leads—not verified awards, investment advice, or counterparty screening—and the linked original publication must be checked before action.

## Native runtime

```text
EMS authentication and role permissions
                 |
                 v
Nexus native browser module
  |              |               |
  v              v               v
canvas map   normalization    local cache
engine       web worker       and preferences
                 |
                 v
independent public data APIs
```

The map is rendered with the Canvas 2D API and contains no hosted map iframe.
Country borders and labels come from a bundled Natural Earth 1:110m
public-domain GeoJSON asset. The tactical map derives country risk fills from
the visible live signal set. The globe surface uses a bundled NASA Blue Marble
Next Generation image projected locally in Canvas, so neither mode depends on a
tile server or runtime basemap request.

Bundled map assets:

- Natural Earth `ne_110m_admin_0_countries`, public domain:
  `https://github.com/nvkelso/natural-earth-vector`
- NASA Blue Marble Next Generation, December 2004 topography and bathymetry:
  `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg`

Both map modes include a solar day/night layer. The module calculates the
subsolar point locally from UTC, refreshes the terminator once per minute, and
applies a smoothed twilight band to the flat map and the Blue Marble globe. It
requires no network request, account, API key, or usage quota. The display is
operational time context rather than a precision observatory or terrain-shadow
product.

Feed normalization runs in a Web Worker so parsing and ranking large live
responses does not block the EMS interface. Short-lived source responses are
cached on the device and used as a clearly marked stale fallback during an
outage.

Sources that reject browser cross-origin requests can use the authenticated
`intelligence-feeds` EMS Edge Function. It checks the caller's
`world-monitor:view` permission, accepts only a fixed source allowlist, and
coalesces upstream calls in a short-lived server cache.

## Capability families

- Six operational lenses: global, security, climate, logistics, markets, and technology.
- Independently selectable natural-hazard, weather, security, cyber, space,
  aviation, maritime, and critical-infrastructure layers.
- Flat and orthographic-globe map modes, pan, zoom, regional presets, adaptive
  marker clustering, time filtering, marker selection, priority ranking, source
  inspection, shareable URL state, location-specific weather, and country-polygon
  selection with a live internal country intelligence drawer.
- Forty-one operational panels covering priorities, hazards, disaster alerts, health, air quality, radiation, sanctions, official travel advisories, security, strategic posture, global and official reporting, platform service health, live mobility, cyber,
  space weather, markets, weather, logistics, aviation, maritime, infrastructure,
  energy, watchlists, distribution, regional activity, source health, and a
  local intelligence brief.
- Forty-three selectable live, reference, and locally derived layers in the clean-room catalog,
  including publicly documented strategic bases and critical mineral sites;
  every layer has an explanation card covering purpose, provider, freshness,
  confidence and limitations.
- Persistent panel visibility and drag ordering, device-local keyword monitors,
  seven-day compact snapshots, and unrestricted JSON/CSV dashboard export.
- Transparent relative country-stress screening plus local route-exposure and
  disruption-scenario workflows that run without a premium API.
- A nine-theater strategic-posture screen for the Baltic, Black Sea, Eastern
  Mediterranean, Red Sea, Persian Gulf, South China Sea, Taiwan Strait, Korean
  Peninsula, and Sahel. Its disclosed local score combines recency-weighted
  public signals with reference exposure; it does not infer military intent.
- Responsive desktop, tablet, and mobile layouts with keyboard and touch controls.

## Independent public sources

The initial native release uses USGS earthquake data, NASA EONET natural-event
data, GDELT open-source reporting clusters, CISA's known-exploited-vulnerability
catalog, NOAA space-weather alerts, CoinGecko public market data, Frankfurter
currency reference rates, GDACS disaster alerts, and Open-Meteo weather,
multi-airport conditions, marine conditions, and CelesTrak public orbital
elements with local approximate Kepler propagation. Open-Meteo's air-quality
API adds representative metropolitan CAMS model cells and on-demand country
label-point AQI, PM2.5, PM10, ozone, nitrogen-dioxide, dust, and UV context.
These values are labelled as atmospheric-model output rather than certified
ground monitors, national averages, or health directives. Public Polymarket Gamma
data supplies read-only market-implied probabilities, volume, and liquidity;
IODA country-level detections supply public internet-connectivity anomaly context
with Georgia Tech attribution. The EMS module never places orders, holds funds,
or requests a wallet. Static strategic ports,
airports, and chokepoints are maintained by Varada as reference context.

These providers are independent data sources, not application dependencies.
Every feed fails separately and the module remains usable if one source is
unavailable. Provider licenses, attribution, availability, and fair-use limits
must still be respected; the module does not bypass external quotas or licensed
datasets.

The platform-service-health connector polls the official status publications
for GitHub, Cloudflare, OpenAI, and Google Cloud through the authenticated EMS
Edge Function. It normalizes provider state, degraded components, active
incidents, and a bounded seven-day resolution context. Each provider fails
independently, and direct official status links remain available. No provider
account or API key is required. Provider-reported operational status is not
treated as proof that every tenant, region, dependency, or internal EMS workflow
is healthy; operators must compare it with local telemetry.

Country selection also performs a bounded, on-demand lookup against the UK
Foreign, Commonwealth & Development Office Content API. The selected
destination's current warning tags, latest change note, update time, and
official destination link appear in both the country drawer and the dedicated
travel-advisory panel; a matching marker is added only for the active country
selection. Results are cached for six hours and are never bulk-scraped at page
load. FCDO advice is written for British nationals, so the UI identifies it as
an official risk reference rather than a universal EMS order or a substitute
for the authority relevant to an operator's nationality and circumstances.

The U.S. Treasury OFAC Sanctions List Service supplies the current SDN XML
publication through the authenticated EMS cache. The Edge Function returns only
aggregated country, type, and program-tag counts rather than redistributing the
full designation file to every browser. The panel and country drawer explicitly
state that these associations are not an OFAC country list, prohibition score,
legal advice, or substitute for current name and ownership screening.

UNHCR Refugee Population Statistics add an annual country-of-origin displacement
layer and dedicated panel. Country drawers show refugees abroad, asylum-seekers,
internally displaced people, and returned refugees with the reporting year.
These are clearly identified as annual official statistics rather than live
movement detections, and they remain visible independently of the incident time
window without inflating the live operational-stress score.

WHO Disease Outbreak News adds a source-linked health layer and operational
panel. Reports are country-geocoded locally from their official titles and are
shown in the matching country drawer. WHO DONs describe selected confirmed or
potential acute public-health events; they are authoritative reports but not an
exhaustive global outbreak registry, and the interface states that limitation.

A second, independently cached GDELT query supplies broader economy,
technology, climate, health, and disaster reporting without mixing those items
into the conflict-only stream. Reports are deduplicated by their source record,
classified locally, and country-associated from headline text when possible.
When only the publisher country is available, that weaker geographic basis is
shown explicitly rather than presented as the event location.

Safecast CC0 adds recent community radiation measurements as an independent
environment layer, operational panel, and country-drawer section. The
authenticated Edge Function fetches only a bounded set of recent tracks,
samples each track, deduplicates nearby readings, and returns at most 250 points,
keeping the raw multi-megabyte sensor traces off the browser's main path. These
readings are community observations, not government incident declarations or
health alerts; the interface instructs operators to verify anomalies with the
relevant national authority.

The country drawer combines only data available to the internal module: current
weather, modelled air quality, country-associated signals, IODA outage detections, sampled radiation measurements, a seven-day signal
timeline, GDELT reporting, public strategic-asset references, exchange-rate
context, related read-only prediction markets, and on-demand macroeconomic
profiles. The profile merges the latest available World Bank Open Data
observations with IMF World Economic Outlook estimates, caches the result for
six hours, and labels every value with its observation year. The drawer also
shows official imports, exports, applied tariff rate, current-account balance,
military expenditure, internet use, urbanization, renewable-electricity share,
and life expectancy when those World Bank series are available. A separate
annual-trends section plots up to sixteen observations for public debt, imports,
exports, applied tariffs, trade share, current account, growth, and inflation.
It states the exact retained years and treats direction as a factual change,
not a risk judgment. Natural Earth
metadata supplies the country classification fallback. Its operational-stress value
is a disclosed recency/severity screen, not a sovereign resilience, credit, or
proprietary risk rating. IODA anomalies do not by themselves establish the cause
or full scope of an outage.

The drawer also provides an independent operational-resilience context screen.
It averages only the available disclosed components: macro stability, fiscal
capacity, digital access, human capacity, energy exposure, economic capacity,
and current operating stability. Component coverage is displayed next to the
score. It is not the reference application's proprietary CRI, an official
national rating, a credit score, or a forecast.

World Bank and IMF profiles are requested only when an operator opens a country,
so global refresh latency is unaffected. The official World Bank Indicators API
does not require an API key. IMF WEO current-year values can be estimates or
forecasts and are labeled accordingly; unavailable indicators remain visibly
unavailable rather than being synthesized.

## Security and operating rules

- The module always boots through `bootstrapProtectedPage` and requires the
  `world-monitor:view` EMS permission.
- No external account, subscription, Clerk session, or hosted product token is used.
- External source links open separately with `noopener noreferrer`.
- Source responses are treated as untrusted and escaped before rendering.
- Operational decisions must verify high-impact signals against their linked
  primary source.

## Market-first workspace, resilience, and India-curated leads

Nexus Intelligence defaults to a market/business-opportunity workspace for an India-based
trading, minerals, logistics and infrastructure firm. On load, the map shows the
business-relevant layers and the operational panels are the market set — Live leads,
Priority, Commercial opportunities, Exchange hours, Predictions, Macro risk, Global
reporting and Official wire. Every other module remains fully built but minimised behind
the "More modules" toggle in the panel toolbar.

Leads engine. The Live leads panel combines two genuinely-live, deterministic signals:
market session windows (a major exchange opening or closing within 45 minutes, computed
locally from each exchange time zone — no external feed, no AI) and India-curated
opportunity leads. Every commercial signal is scored by a transparent India-relevance
heuristic (`indiaTradeRelevance`) that boosts sector match to Varada's lines, pursuable
opportunity types, trade/commodity/logistics keywords, India trade-partner geography and
international-bidder eligibility, then ranked by a combined lead score. Leads are labelled
as unverified discovery signals; the linked publication must be verified before acting.

Rate-limit resilience. Every upstream request in the feed proxy is routed through
`resilientFetch`, which adds full-jitter exponential backoff, a per-provider token-bucket
rate limit, and a circuit breaker. When an upstream fails, the proxy serves the last good
cached payload flagged stale/degraded rather than blanking a panel. GDELT remains
discovery-only and is now paced to avoid the previous HTTP 429 rate-limit failures.
