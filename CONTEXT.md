# Rickshaw Ride — Backend Context & Progress

> Read this file first to understand the app and continue work. Update it whenever something meaningful changes.

## 1. What this app is

A ride-**matching** app (NO ride booking): rickshaw pullers register as **drivers**, go "active", and share their location. Passengers search for active rickshaws within **1 km**, see them on a map, pick one, and **call them directly by phone**. The driver's app must stay open while active (foreground-only in v1).

Original requirements doc: `../rickshaw-search-doc.md`

## 2. Product decisions (confirmed by owner)

| Topic | Decision |
|---|---|
| Contact model | Passenger taps driver → phone dialer opens (`tel:` link). No in-app request/chat. |
| Nearby results | Map with driver markers (1 km radius), auto-refreshing |
| Auth | Google sign-in AND phone OTP — both supported |
| UI language | Bangla + English, i18n structured so more languages can be added later |
| Ride lifecycle | None — no booking, no acceptance flow. Active drivers are just discoverable. |

## 3. Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native + Expo 58 (scaffolded in `../rickshaw-book-mobile-app`, default template, no navigation yet) |
| Backend | NestJS 11 + TypeScript (`this repo`) |
| Database | PostgreSQL on **Neon** (dev DB `rickshaw-ride-development`, URL in `.env`) |
| ORM | **Prisma 7** — new `prisma-client` generator, output `src/generated/prisma`, config in `prisma7.config.ts` (loads `.env` via dotenv) |
| Auth (planned) | JWT access (15m) + refresh (30d), Google idToken verification (`google-auth-library`), hashed OTP codes, SMS provider interface (Twilio or BD gateway; dev mode logs codes) |
| Realtime (planned) | None in v1 — drivers POST location heartbeat every ~10 s, passengers poll `GET /drivers/nearby` every ~10 s |

## 4. Repo layout

```
rickshaw-ride-app/
├── rickshaw-search-doc.md        # original requirements
├── rickshaw-book-mobile-app/     # Expo app (bare scaffold, untouched)
└── rickshaw-ride-backend/        # NestJS + Prisma (this folder)
    ├── prisma7.config.ts         # Prisma 7 config (schema path, migrations path, DATABASE_URL)
    ├── prisma/schema.prisma      # database design (source of truth)
    ├── prisma/migrations/        # auto-generated only — NEVER hand-edit
    └── src/                      # still default Nest scaffold (app.controller/service/module)
```

## 5. Database design (implemented — migration `20261119154121_init` applied to Neon)

- **users** — `role` (`PASSENGER`/`DRIVER`, nullable until onboarding), `name`, unique `phone`, unique `email`, `auth_provider` (`GOOGLE`/`PHONE`), `avatar_url`
- **driver_profiles** — one per driver: `is_active`, `rickshaw_number`, `lat`, `lng`, `last_location_update_at`; cascade FK to users; indexes `(is_active, last_location_update_at)` and `(lat, lng)`
- **otp_codes** — standalone (linked by phone, not user — codes are sent before login): `code_hash`, `expires_at` (~5 min), `attempts`, `consumed_at`
- **refresh_tokens** — `token_hash` (unique), `expires_at`, `revoked_at`; cascade FK to users

### Key architecture decisions

1. **No PostGIS.** Tested: Prisma treats a hand-added GIST index as permanent drift — every `migrate dev` tried to drop it and eventually prompts for a DB reset. Replaced with **lat/lng + bounding-box prefilter + haversine distance in raw SQL**, fully index-backed by the `(lat, lng)` btree. Sufficient for 1 km search at this scale. If scale ever demands PostGIS, it can be added deliberately then.
2. **Driver staleness:** a driver counts as discoverable only if `is_active = true` AND `last_location_update_at` is newer than ~60 s.
3. **Column naming:** all columns mapped to snake_case (`@map`) — raw SQL queries stay readable.
4. **Role is nullable** because registration = first login (Google/OTP); role is chosen during onboarding afterwards. Driver profile row is created at onboarding when role = DRIVER.

### Nearby-drivers query (to implement in DriversService)

```sql
SELECT d.*, u.name, u.phone,
  6371000 * 2 * asin(sqrt(
    power(sin(radians(:lat - d.lat) / 2), 2) +
    cos(radians(:lat)) * cos(radians(d.lat)) *
    power(sin(radians(:lng - d.lng) / 2), 2)
  )) AS distance_m
FROM driver_profiles d
JOIN users u ON u.id = d.user_id
WHERE d.is_active
  AND d.last_location_update_at > now() - interval '60 seconds'
  AND d.lat BETWEEN :lat - 0.009 AND :lat + 0.009          -- ~1 km N/S box
  AND d.lng BETWEEN :lng - :dlng AND :lng + :dlng          -- ~1 km E/W box (scaled by cos(lat))
  AND distance_m <= 1000
ORDER BY distance_m;
```

## 6. Progress

Done:
- [x] NestJS 11 scaffolded, Prisma 7 set up (`prisma7.config.ts` + Neon dev DB)
- [x] Full database schema in `prisma/schema.prisma` (see section 5)
- [x] Init migration auto-generated and applied; schema ↔ DB verified in sync

In progress / not started:
- [ ] PrismaService module (`src/prisma/`) — PrismaClient with driver adapter, global module
- [ ] Auth module: `POST /auth/google` (idToken verify), `POST /auth/otp/request` + `/verify`, `POST /auth/refresh`, JWT guard
- [ ] Onboarding: `POST /onboarding` (role + name; creates DriverProfile for drivers — phone required for drivers since passengers call them)
- [ ] Users: `GET /me`, `PATCH /me`
- [ ] Drivers module: `POST /drivers/status`, `POST /drivers/location` (throttled), `GET /drivers/nearby`
- [ ] Seed script: ~20 fake active drivers around Dhaka (23.8103, 90.4125)
- [ ] Mobile app: auth flow, role-based homes (driver toggle + heartbeat; passenger map + call)
- [ ] i18n (Bangla + English)

## 7. Planned API surface

```
POST /auth/google          { idToken }                    → tokens
POST /auth/otp/request     { phone }                      → sends code
POST /auth/otp/verify      { phone, code }                → tokens
POST /auth/refresh         { refreshToken }               → new tokens
POST /onboarding           { role, name, phone? }         (auth required)
GET  /me · PATCH /me
POST /drivers/status       { isActive }                   (driver only)
POST /drivers/location     { lat, lng }                   (driver only, ~1 req/10s)
GET  /drivers/nearby?lat=&lng=                            (passenger only)
```

## 8. Workflow rules (owner preference — always follow)

- **Never hand-edit migration SQL.** Change `prisma/schema.prisma`, then run `npx prisma migrate dev --name <change>`. Saved in taste.
- Dev DB is the Neon `rickshaw-ride-development` database — safe to reset while empty.

## 9. Key commands (run inside `rickshaw-ride-backend/`)

```bash
set -a && . ./.env && set +a      # Prisma 7 CLI needs env loaded (config imports dotenv, but belt-and-suspenders)
npx prisma migrate dev --name <change>   # schema change → auto migration
npx prisma migrate reset --force         # wipe + replay (dev only)
npx prisma migrate status                # check sync
npx prisma studio                        # browse data
npm run start:dev                        # NestJS dev server
```
