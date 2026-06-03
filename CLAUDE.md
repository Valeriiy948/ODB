@AGENTS.md

# ODB Platform — OSINT Database for War Crimes Documentation

## Project Overview
- **Stack:** Next.js 16 + Turbopack + Supabase + Python VPS services
- **DB:** Supabase PostgreSQL, ~398k persons
- **Local dev:** localhost:3000
- **VPS:** 161.35.86.145 (ssh alias: `vps`, key: `~/.ssh/id_odb`)
- **Repo:** github.com/Valeriiy948/ODB (branch: master)

## Architecture
```
[Browser] → [Next.js localhost:3000] → [Supabase Cloud DB]
                                     → [VPS 161.35.86.145]
                                        ├── :8001 telegram_search.py (legacy bots)
                                        ├── :8005 social_search.py
                                        ├── :8006 registries.py
                                        ├── :8008 telethon_service.py (MTProto)
                                        └── enricher.py (24/7 agent)
```

## Critical Rules
- **NEVER** commit .env.local (contains all API keys)
- **NEVER** push directly to master — always use feature branches + PR
- **NEVER** write unverified data to persons table (DOB must match)
- **NEVER** add source tags like "ДОТЗ НПУ", "WhatsApp" to records
- `/api/debug-env` exposes all keys — MUST be removed before deploy

## Git Workflow
```bash
git checkout -b fix/description    # new branch per task
# ... work ...
git add specific-files.ts          # never git add -A blindly
git commit -m "fix: description"   # conventional commits
gh pr create --draft               # PR for review
```

## Database
- **Supabase URL:** zvvtldyxmjuzpyozneoo.supabase.co
- **Indexes:** pg_trgm on name/name_rus, GIN on phones[], btree on created_at
- **Key tables:** persons, connections, incidents, evidence
- **persons.phones** is `text[]` array — use `cs` operator, NOT `ilike`

## API Keys Status
- Supabase: active
- Anthropic: active
- OsintKit: active (filters[names]= format)
- LeakOsint: active (25 days left, token-based)
- Serper: active
- Tavily: active
- DeHashed: active
- HIBP: active
- VK: NOT SET
- Google CSE: NOT SET

## Performance Notes
- `count: 'estimated'` for large tables (not 'exact')
- Single-column ilike with trigram index (not OR across 6 columns)
- phones search: `phones.cs.{"number"}` (array contains)
- Base list with created_at DESC index: ~1.4s for 398k rows

## Enricher Agent
- Runs locally (VPS blocked by Cloudflare for LeakOsint/OsintKit)
- Verification: data written to DB ONLY if DOB matches
- Unverified data → staging file for manual review
- Sources: OsintKit (731 RU DBs) + LeakOsint (800+ DBs) + Sanctions

## Known Issues
- ~22k duplicate records (zona.media double import) — dedup pending
- Telethon auth: rate limited until tomorrow
- EyeOfGod (8007), Sanctions (8010) services not running on VPS
- Person page.tsx is 4900+ lines — needs component extraction
