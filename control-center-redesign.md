# Varada EMS 2.0 — Control Center Redesign Spec
**Target file:** `new-ems/shared/page-dashboard.js` (data + markup + CSS all live here)
**Date:** 2026-07-02 · Design-only spec. Section 9 is the Cline-ready implementation prompt.

---

## 1. Improved Information Architecture

Current problem: 6 stacked sections + a bloated hero = ~4 screens of scroll, with every item rendered as the same 164px-tall tile regardless of importance.

New hierarchy (by importance, not alphabet):

```
CONTROL CENTER
├── Command Bar (hero, slim)          → identity + KPIs + quick actions in ONE row
├── ZONE A: Business Modules          → the reason the page exists; biggest cards
│     ├── Active (3): Transportation, Interiors, Accounts-launcher → Finance
│     └── Coming Soon (8): one compact strip, not tiles
├── ZONE B: Administration            → 6 items, medium cards, one row
├── ZONE C: 3-column band
│     ├── Finance (Central Accounts, Reports)
│     ├── System Configuration (Tax Codes, Units, Document Types)
│     └── Developer / System (Jobs & Queues, Integrations, API/Logs)
```

Rules:
- Only 3 visual tiers exist: **Large** (active business modules), **Medium** (admin), **Compact** (everything else).
- Business entities (Clients, Transporters, Agents, Commodities, Routes) never appear at global level — they live inside their owning modules. System Configuration keeps only true global references.
- One item = one card. No duplicates (currently Background Jobs and Queues are two cards → same route).

## 2. Section Layout Plan

| # | Section | Grid | Row height | Fold |
|---|---------|------|-----------|------|
| 1 | Command Bar | 1 full-width band, 3 zones (brand / KPIs / quick actions) | ~96px | Above |
| 2 | Business Modules — Active | 3 large cards per row (12-col: 4+4+4) | ~150px | Above |
| 3 | Business Modules — Coming Soon | compact strip, 4 per row, inside same section | ~64px per row (2 rows) | Above/edge |
| 4 | Administration | 6 medium cards, one row of 6 (2 cols each) | ~110px | Edge of fold |
| 5 | Finance · System Config · Developer | 3 side-by-side section panels (4+4+4), compact rows inside | ~200px total | Below (one short scroll) |

Total page height target: ≤ 1.4 viewport heights at 1080p. Currently ~3.5+.

## 3. Desktop Wireframe (≥1440px, container max 1880px, fluid)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [◆logo] VARADA NEXUS · EMS CONTROL CENTER   │ Active 3 │ Pending 6 │ Health ●  │
│ "Unified command surface for all divisions" │  KPI      KPI         KPI        │
│                                             │ [⚡Users][⚡Roles][⚡Divisions]   │
│                                             │ [⚡Portal][⚡Accounts][⚡More ▾]  │
└────────────────────────────────────────────────────────────────────────────────┘
  BUSINESS MODULES                                                    3 active
┌──────────────────────────┬──────────────────────────┬──────────────────────────┐
│ TM  Transportation &     │ IN  Interiors            │ AC  Accounts             │
│     Minerals Logistics   │     Design & spec        │     Finance cockpit      │
│     Dispatch, trips,     │     control              │     Journals, AR/AP,     │
│     challans, settlements│                    ●     │     treasury       ●     │
│     Open workspace →   ● │     Open workspace →     │     Open workspace →     │
└──────────────────────────┴──────────────────────────┴──────────────────────────┘
  Coming soon
┌───────────────┬───────────────┬───────────────┬───────────────┐
│ ◌ Construction│ ◌ Hospital Prj│ ◌ Hospital Cns│ ◌ Imports/Exp │   ← 40–56px pills
├───────────────┼───────────────┼───────────────┼───────────────┤
│ ◌ Trading     │ ◌ HR & PR     │ ◌ Arbitrage   │ ◌ E-Commerce  │
└───────────────┴───────────────┴───────────────┴───────────────┘
  ADMINISTRATION
┌───────────┬───────────┬───────────┬───────────┬───────────┬───────────┐
│ Users     │ Roles     │ Divisions │ Settings  │ Audit Logs│ Portal    │
│ 1-line desc│ …        │ …         │ …         │ …         │ Access    │
│ Open →    │ Open →    │ Open →    │ Open →    │ Open →    │ Open →    │
└───────────┴───────────┴───────────┴───────────┴───────────┴───────────┘
┌─ FINANCE ────────────┬─ SYSTEM CONFIGURATION ─┬─ DEVELOPER / SYSTEM ──────────┐
│ ▸ Central Accounts   │ ▸ Tax Codes     setup  │ ▸ Jobs & Queues        active │
│ ▸ Reports            │ ▸ Units         setup  │ ▸ Integrations         setup  │
│                      │ ▸ Document Types setup │ ▸ API / Logs           active │
└──────────────────────┴────────────────────────┴───────────────────────────────┘
```

Key: no right-side dead space — every band spans full container width. The hero's old right column (Welcome card + Quick Actions card) is dissolved into the command bar.

## 4. Mobile Wireframe (≤760px)

```
┌──────────────────────────┐
│ ◆ Varada Nexus           │
│ EMS Control Center       │
│ [Active 3][Pending 6][●] │  ← KPI chips, horizontal scroll if needed
│ Quick: [Users][Roles][▾] │  ← 2 pills + overflow menu
├──────────────────────────┤
│ BUSINESS MODULES         │
│ ┌──────────────────────┐ │
│ │ TM Transportation  ● │ │  ← full-width, ~110px
│ │ Dispatch, trips…   → │ │
│ └──────────────────────┘ │
│ ┌ IN Interiors ────── ● ┐│
│ └ AC Accounts ─────── ● ┘│
│ Coming soon:             │
│ [Construction][Hosp Prj] │  ← 2-col pill grid, 40px
│ [Hosp Cns][Imports]…     │
├──────────────────────────┤
│ ADMINISTRATION           │
│ [Users →][Roles →]       │  ← 2-col compact grid
│ [Divisions →][Settings →]│
│ [Audit →][Portal →]      │
├──────────────────────────┤
│ FINANCE (list rows)      │
│ SYSTEM CONFIG (list rows)│
│ DEVELOPER (list rows)    │
└──────────────────────────┘
```

Breakpoints: ≥1440 full layout · 1024–1439 active modules 3-up, admin 3-up×2 rows, bottom band 3→1×3 stacked at <1200 · ≤760 as above.

## 5. Card Sizing Rules

| Tier | Used for | Size | Content |
|------|----------|------|---------|
| **Large** | Active business modules | min-height 140px, max-height 170px, full tier width /3 | icon badge 44px, title, 1-line subtitle, status dot, "Open workspace →" |
| **Medium** | Administration | min-height 96px, width /6 (desktop) | small badge 32px, title, single-line description (`text-overflow: ellipsis`), arrow |
| **Compact row** | Finance / Config / Developer items | height 52–60px list rows inside a panel | icon, title, status chip right-aligned |
| **Pill** | Coming-soon modules, quick actions | height 40–48px | label + muted dot; no description, no CTA |

Hard rules: **no card taller than 170px anywhere**; no forced `min-height` on `<h4>`/`<p>` (delete the current `min-height:2.64rem`/`3.8rem` hacks); descriptions max 1 line on medium, 2 lines on large (`-webkit-line-clamp`); status = one chip OR one dot per card, absolutely never overlapping the badge (chip is right-aligned in its own flex slot with `gap`, `flex-wrap: nowrap`, `white-space: nowrap`).

## 6. What to Remove

- **"Welcome / System Overview" side card** — restates the KPIs and page description. Delete entirely.
- **Duplicate Developer card** — "Background Jobs" and "Queues" both link to `CENTRAL_ACCOUNTS_POSTING_QUEUE`. Merge into one "Jobs & Queues".
- **KPI chip row duplication** — KPIs currently appear twice (KPI grid + status chips in Welcome card). Keep one KPI strip.
- **"Master Data" launcher card** from `CONTROL_CENTER_MODULES` rendering (already filtered, keep it filtered — no business entities at global level).
- **"Future Modules" KPI** — count is visible in the coming-soon strip; replace with a more useful KPI or drop to 3 KPIs.
- **164px min-height uniform tile** and the h4/p min-height padding hacks.
- **"Open Workspace →" on disabled cards** ("Planned" text row) — pills need no CTA text.
- Long paragraph in hero (`Operate Varada Nexus from a cleaner command surface…`) → one short tagline.

## 7. What to Combine

- **Hero + Quick Actions + KPIs** → single slim command bar (3 zones).
- **Background Jobs + Queues** → "Jobs & Queues".
- **Finance, System Configuration, Developer/System** → one 3-column band of compact panels (they're low-frequency destinations; they don't deserve tile grids).
- **Active + Coming Soon** stay in one "Business Modules" section, but as two visual tiers (cards vs pills) — not two equal card grids.

## 8. Above the Fold (1080p desktop)

1. Command bar: branding, 3 KPIs, quick action pills.
2. All 3 active business module cards — the hero content of the page.
3. Coming-soon pill strip (at least first row).
4. Administration row (at least its header + card tops).

Finance / Config / Developer band is the only content requiring scroll — one short scroll, page ends there.

---

## 9. Cline-Ready Implementation Prompt

Copy everything below into Cline:

---

**Task: Redesign the EMS Control Center layout in `new-ems/shared/page-dashboard.js` (Varada EMS 2.0).** Do not change routing, RBAC filtering, `bootstrapProtectedPage`, or `config/constants.js` module/route definitions — this is a pure layout/markup/CSS restructure inside `page-dashboard.js`. Keep the existing `allowedModules` filtering logic for every section.

**Overall structure (replace the current `renderModuleContent` template):**

1. **Command Bar (replaces the hero).** One full-width band, max height ~110px desktop, CSS grid `auto 1fr auto`:
   - Left: `vn-logo.png` (40px) + "Varada Nexus" small gold uppercase label + "EMS Control Center" title (1.4rem) + one-line tagline "Unified command surface for administration, operations, and finance." Delete the current long paragraph.
   - Center: 3 KPI stats inline (Active Modules, Pending Actions, System Health) as horizontal stat items (label above value), not boxed cards. Drop the "Future Modules" KPI.
   - Right: Quick Actions as a wrap of small pills (height 40px, existing `QUICK_ACTIONS` filtered list). Remove the "Welcome / System Overview" side card and its duplicate status-chip row entirely.

2. **Business Modules section (first content section, most prominent).**
   - Active modules (`href` present): large cards in `repeat(3, 1fr)`, min-height 140px, max-height 170px. Card: 44px initials badge top-left, green status dot top-right (dot + sr-only text, not a chip — prevents badge/chip collisions), title (1.05rem), subtitle clamped to 2 lines (`-webkit-line-clamp:2`), footer "Open workspace →".
   - Coming-soon modules (`href` null): render as compact pills, `repeat(4, 1fr)`, height 44–48px: muted dot + module title + tiny "Soon" text right-aligned. No description, no badge, no CTA, no min-heights. `opacity:.65`, non-interactive.

3. **Administration section.** The 6 `ADMIN_ITEMS` as medium cards, `repeat(6, 1fr)` on ≥1440px (`repeat(3, 1fr)` at 1024–1439), min-height 96px: 32px badge, title, description forced to ONE line with `overflow:hidden;text-overflow:ellipsis;white-space:nowrap`, small "Open →" footer. No status chips here — everything in Administration is active.

4. **Bottom band: three panels side by side** — `grid-template-columns:repeat(3, 1fr)` (stack to 1 column below 1200px): **Finance** (Central Accounts, Reports), **System Configuration** (Tax Codes, Units, Document Types — keep the note that business entities are managed inside owning modules as the panel's one-line description), **Developer / System**. In `DEVELOPER_ITEMS`, merge "Background Jobs" and "Queues" into a single item `{ title: "Jobs & Queues", href: ROUTES.CENTRAL_ACCOUNTS_POSTING_QUEUE, description: "Queue-driven processing health and backlogs" }`. Panel items are **list rows**, not tiles: 52–56px height, flex row with icon/initials (24px), title, status chip right-aligned (`margin-left:auto; white-space:nowrap`). Rows are `<a>` links with hover background change.

**CSS rules (rewrite the `<style>` block):**
- Container already allows `min(1880px, calc(100vw - 24px))` — keep it; every section must span full container width. No two-up wrapper with dead columns; delete `.cc-two-up`/`.cc-stack`.
- Delete `min-height:164px` on tiles and the `min-height:2.64rem`/`3.8rem` on `h4`/`p`.
- Tier heights: large cards 140–170px, medium 96–120px, list rows 52–56px, pills 44–48px. Nothing on the page may exceed 170px card height.
- Badges/chips: chip and badge live in one flex row with `justify-content:space-between; gap:.75rem; flex-wrap:nowrap`; chips `white-space:nowrap`. No absolute positioning for chips anywhere.
- Keep the premium dark palette exactly: backgrounds `linear-gradient(180deg,#13233b,#0f1b2f)` cards on `#0f1a2d`-family sections, borders `rgba(148,163,184,.14)`, gold accent `#d4b26a` for badges/labels/hover borders, text `#f8fbff`/`#9fb0c7`. Keep hover `translateY(-2px)` + gold border on interactive cards only.
- Section headers: compact single row — gold uppercase kicker (.72rem, letter-spacing .1em) + title, with meta text (e.g. "3 active") right-aligned. Reduce section padding to ~1rem and vertical gap between sections to .9rem.
- Breakpoints: `@media (max-width:1439px)` admin → 3 cols; `(max-width:1200px)` bottom band → 1 col, coming-soon → 3 cols; `(max-width:760px)` everything → described mobile layout: active modules 1 col (min-height 100px), coming-soon and admin 2-col grids, KPIs as horizontal chip row, quick actions wrap with the band zones stacking vertically.

**Acceptance criteria:** at 1920×1080 the command bar, all active business module cards, the coming-soon strip, and the Administration row are visible without scrolling; total page ≤ ~1.5 viewports; no card taller than 170px; no chip overlaps a badge at any width; no duplicate Jobs/Queues cards; no empty right-hand column anywhere; all RBAC filtering and hrefs behave exactly as before; empty-state messages preserved per section.

---
