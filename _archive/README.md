# _archive — reference & backups only

Nothing in the active tree references this folder. Delete the whole folder
when the final build is accepted.

| Path                        | What it is                                                        |
|-----------------------------|-------------------------------------------------------------------|
| `old-website/old-ems/`      | Legacy deployed website + old EMS (own git repo). Superseded by root pages and `new-ems/` |
| `public-site/`              | Old public website (was the logout-redirect target). Superseded by the root pages; kept for reference/restore |
| `superseded-site-drafts/`   | Interim website rebuilds. `website-beta/` = the old root `website/` copy (superseded by root pages); older draft + `images/` alongside |
| `dev-tools/cloudflared-tunnel/` | `cloudflared.exe` + tunnel logs — local dev tunneling utility, not used by the site or EMS |
| `reports/`                  | Working reports: local-auth summaries/plan, login methods, control-center redesign spec |
| `exports/`                  | Database cleanup / migration-normalization / audit exports        |
| `test-results/`             | UI test evidence & preview snapshots from earlier sprints         |
| `reference-pdfs/`           | Sample PDFs used as document-format references                    |
| `backups/`                  | (empty) legacy backup folder                                      |
| `tmp/`                      | Scratch files (generated PDFs, screenshots)                       |
| `local-data/`               | Stray local browser-data copies (`*.sqlite`) — not project data   |
| `unused-code/`              | Orphaned files verified unreferenced by any active code: superseded portal-login page scripts (unified login replaced them), `database-types-old-ems.ts`, legacy PowerShell repair scripts |
