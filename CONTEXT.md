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
| Auth | Google sign-in now; phone OTP deferred to a later phase (OTP schema retained) |
| UI language | Bangla + English, i18n structured so more languages can be added later |
| Ride lifecycle | None — no booking, no acceptance flow. Active drivers are just discoverable. |

## 3. Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native + Expo 58 (scaffolded in `../rickshaw-book-mobile-app`, default template, no navigation yet) |
| Backend | NestJS 11 + TypeScript (`this repo`) |
| Database | PostgreSQL on **Neon** (dev DB `rickshaw-ride-development`, URL in `.env`) |
| ORM | **Prisma 7** — new `prisma-client` generator, output `src/generated/prisma`, config in `prisma7.config.ts` (loads `.env` via dotenv); runtime connects via **`@prisma/adapter-pg`** driver adapter |
| Auth | **Google ID-token sign-in implemented.** JWT access (15m) + rotating JWT refresh (30d), refresh tokens stored only as SHA-256 hashes. `GOOGLE_CLIENT_IDS`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` required in env (see `.env.example`). OTP request/verify and SMS provider are deferred. |
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
    └── src/
        ├── auth/                 # Google login, token rotation, JWT guard/decorator
        ├── users/                # onboarding + GET/PATCH /me
        ├── common/               # global exception filter, transformers
        ├── prisma/               # global PrismaModule + PrismaService (pg adapter)
        ├── generated/prisma/     # Prisma 7 generated client (do not edit)
        └── app.*                  # root module + health endpoint
```

## 5. Database design (implemented — migrations `20261119154121_init` and `20261119164352_add_google_sub_to_user` applied to Neon)

- **users** — `role` (`PASSENGER`/`DRIVER`, nullable until onboarding), `name`, unique `phone`, unique `email`, unique nullable `google_sub` (stable Google identity; required for Google-created users), `auth_provider` (`GOOGLE`/`PHONE`), `avatar_url`
- **driver_profiles** — one per driver: `is_active`, `rickshaw_number`, `lat`, `lng`, `last_location_update_at`; cascade FK to users; indexes `(is_active, last_location_update_at)` and `(lat, lng)`
- **otp_codes** — standalone (linked by phone, not user — codes are sent before login): `code_hash`, `expires_at` (~5 min), `attempts`, `consumed_at`
- **refresh_tokens** — `token_hash` (unique), `expires_at`, `revoked_at`; cascade FK to users

### Key architecture decisions

1. **No PostGIS.** Tested: Prisma treats a hand-added GIST index as permanent drift — every `migrate dev` tried to drop it and eventually prompts for a DB reset. Replaced with **lat/lng + bounding-box prefilter + haversine distance in raw SQL**, fully index-backed by the `(lat, lng)` btree. Sufficient for 1 km search at this scale. If scale ever demands PostGIS, it can be added deliberately then.
2. **Driver staleness:** a driver counts as discoverable only if `is_active = true` AND `last_location_update_at` is newer than ~60 s.
3. **Column naming:** all columns mapped to snake_case (`@map`) — raw SQL queries stay readable.
4. **Role is nullable** because registration = first login (Google today; OTP deferred); role is chosen once during onboarding afterwards and is immutable. Driver profile row is created transactionally at onboarding when role = DRIVER.
5. **Google identity** is matched by unique `google_sub`, never by email alone. A legacy GOOGLE account with a verified email can be linked on first login; PHONE accounts are never silently linked.
6. **Refresh sessions** are JWTs with a `jti`; only `SHA-256(token)` is stored. Refresh conditionally revokes the old row and creates a replacement in one transaction; logout revokes only the presented session.

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
- [x] PrismaService module (`src/prisma/`) — global `PrismaModule`, `PrismaService extends PrismaClient` with `PrismaPg` adapter (`DATABASE_URL` via ConfigService), `$connect`/`$disconnect` lifecycle hooks. Verified: app boots, live count queries against Neon succeed. (Removed leftover `@prisma/adapter-better-sqlite3` — wrong engine; installed `@prisma/adapter-pg`.)
- [x] API setup (`src/main.ts`) — global prefix `api/v1`, ValidationPipe (whitelist + forbidNonWhitelisted + transform), CORS, shutdown hooks, global `AllExceptionsFilter` (`src/common/filters/`) with consistent error JSON + Prisma P2002→409 / P2025→404 mapping, Swagger UI at `/api/docs` (`@nestjs/swagger@11` — v12 needs Nest 12), `GET /api/v1/health` (pings DB). `PORT=3000` in `.env`. Verified live: health ok, docs 200, 404 shape consistent.
- [x] Google-only auth — `POST /auth/google` verifies mobile ID tokens with `google-auth-library`, requires verified email when present, finds/creates by `googleSub`, returns 15m access + 30d refresh JWTs. Access/refresh secrets are separate; role is not in access tokens.
- [x] Token lifecycle — `POST /auth/refresh` rotates the hashed refresh row atomically and `POST /auth/logout` revokes the presented session. Reused, revoked, expired, and access-as-refresh tokens return 401.
- [x] Reusable auth guard — `JwtAuthGuard` + `@CurrentUser()` enforce Bearer access tokens; Swagger bearer docs enabled on protected routes.
- [x] Onboarding — `POST /onboarding` sets role/name once (409 afterwards), requires phone for drivers, and creates DriverProfile transactionally with rollback on duplicate phone.
- [x] Users — `GET /me` and `PATCH /me`; PATCH only allows name/phone/avatar URL, so role/provider/email/Google subject cannot be changed. Duplicate phone/onboarding conflicts return 409.
- [x] Verified build, lint, Prisma validation, Swagger route registration, protected-route 401s, onboarding validation/conflicts, profile update, refresh rotation/reuse rejection, logout, and temporary test-data cleanup.

In progress / not started:
- [ ] OTP auth (deferred): `POST /auth/otp/request` + `/verify`, SMS provider, OTP UI — schema remains ready
- [ ] Drivers module: `POST /drivers/status`, `POST /drivers/location` (throttled), `GET /drivers/nearby`
- [ ] Seed script: ~20 fake active drivers around Dhaka (23.8103, 90.4125)
- [ ] Mobile app: Google auth flow, role-based homes (driver toggle + heartbeat; passenger map + call)
- [ ] i18n (Bangla + English)

## 7. Planned API surface

Implemented:
```
POST /auth/google          { idToken }                    → user + tokens
POST /auth/refresh         { refreshToken }               → user + rotated tokens
POST /auth/logout          { refreshToken }               → 204
POST /onboarding           { role, name, phone? }         → { user } (auth required)
GET  /me                                                  → { user }
PATCH /me                  { name?, phone?, avatarUrl? }   → { user }
```

Deferred / planned:
```
POST /auth/otp/request     { phone }                      → sends code (deferred)
POST /auth/otp/verify      { phone, code }                → tokens (deferred)
POST /drivers/status       { isActive }                   (driver only)
POST /drivers/location     { lat, lng }                   (driver only, ~1 req/10s)
GET  /drivers/nearby?lat=&lng=                            (passenger only)
```

## 8. Workflow rules (owner preference — always follow)

- **Never hand-edit migration SQL.** Change `prisma/schema.prisma`, then run `npx prisma migrate dev --name <change>`. Saved in taste.
- Dev DB is the Neon `rickshaw-ride-development` database — safe to reset while empty.
- **Env gotcha:** this machine has `NODE_ENV=production` + npm `omit=dev`, so plain `npm install` drops dev deps. Always use `npm install --include=dev`.
- **Auth env:** copy shapes from `.env.example`; set `GOOGLE_CLIENT_IDS` (comma-separated accepted mobile/web audiences) plus two different JWT secrets of at least 32 characters. Google ID-token login needs no client secret.
- **No test files** — do not create/maintain `*.spec.ts`; verify with `npm run build` + eslint instead. Saved in taste. (Scaffold `app.controller.spec.ts` deleted.)

## 9. Key commands (run inside `rickshaw-ride-backend/`)

```bash
set -a && . ./.env && set +a      # Prisma 7 CLI needs env loaded (config imports dotenv, but belt-and-suspenders)
npx prisma migrate dev --name <change>   # schema change → auto migration
npx prisma migrate reset --force         # wipe + replay (dev only)
npx prisma migrate status                # check sync
npx prisma studio                        # browse data
npm run start:dev                        # NestJS dev server
```
