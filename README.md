# Varada EMS 2.0 — Repository Map

Active, deployable code lives at the root. Everything kept only for reference
or recovery lives in `_archive/` and can be deleted once the final build ships.

## Active

| Path            | Purpose                                                              |
|-----------------|----------------------------------------------------------------------|
| `new-ems/`      | EMS 2.0 application (modules, shared JS, assets, edge functions, **canonical Supabase migrations** in `new-ems/supabase/migrations`) |
| `*.html` (root) | Public company website pages (dark-luxe redesign). Clean URLs on deploy: `/founder`, `/services`, `/hospital`, … |
| `assets/`       | Public website design system (`site.css`, `site.js`)                 |
| `images/`       | Public website images (logo, team photos, section imagery)           |
| `portals/`      | Meeting entry redirect (`/portals/meeting/meeting-login.html` → EMS meetings-guest) |
| `website/`      | Legacy-URL redirect stubs (`/website/founder.html` → `/founder`) for old indexed links |
| `docs/`         | Architecture documentation. `docs/archive/migrations` is historical evidence — never apply |
| `scripts/`      | Repo tooling (`check-supabase-migrations.cjs` migration guard)       |
| `supabase/`     | Inactive root kept intentionally empty of SQL — the guard fails the build if migrations appear here |
| `tools/`        | Local utilities (cloudflared tunnel)                                 |
| `public-site/`  | **Superseded** old public website — reference only; move to `_archive/` when convenient |
| `CNAME`         | Custom-domain binding for deployment                                 |
| `CLAUDE.md`     | Assistant / contributor working rules (migration workflow)           |

## Local development

```bash
npm run check:migrations   # migration guard (canonical dir, unique timestamps)
npm run db:dry-run         # guard + supabase db push --dry-run (linked)
npm run db:push            # deploy migrations (only when explicitly approved)
npm run site:serve         # serve repo root at http://localhost:5501 with clean URLs (/founder, /services)
```

The EMS is served by any static server with the repo as web root
(e.g. Live Server → `http://127.0.0.1:5500/new-ems/login.html`).
The public website lives at the repo root and uses root-absolute paths
(`/images/…`, `/assets/…`) with extensionless links (`/founder`), so preview it
via `npm run site:serve` (uses `serve`, which resolves clean URLs like GitHub Pages does).

## `_archive/` — delete after final build

Reference material only; nothing at the root imports from it.
See `_archive/README.md` for the inventory.
