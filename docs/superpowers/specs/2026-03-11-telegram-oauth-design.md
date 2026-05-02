# Telegram OAuth 2.0 Authorization — Design Spec

## Overview

Add user authentication via Telegram OAuth 2.0 (OpenID Connect) to the Racing application. Users authenticate through a popup window, get saved to PostgreSQL, and receive a JWT for subsequent requests.

## Auth Flow

1. Frontend generates PKCE `code_verifier` + `code_challenge` (S256)
2. Frontend generates random `state` string for CSRF protection
3. Frontend opens a popup window to `https://oauth.telegram.org/auth?client_id=...&redirect_uri=...&response_type=code&scope=openid%20profile&state=...&code_challenge=...&code_challenge_method=S256`
4. User approves login in Telegram
5. Telegram redirects popup to `redirect_uri` with `code` and `state` params
6. Frontend validates `state` matches, extracts `code`, closes popup
7. Frontend sends `POST /auth/telegram` with `{ code, code_verifier, redirect_uri }`
8. Backend exchanges code for tokens at `https://oauth.telegram.org/token` using HTTP Basic Auth (`Authorization: Basic base64(client_id:client_secret)`) with form body `{ grant_type, code, redirect_uri, client_id, code_verifier }`
9. Backend validates `id_token` JWT signature via Telegram JWKS (`https://oauth.telegram.org/.well-known/jwks.json`), checks `iss`, `aud`, `exp`
10. Backend upserts user in DB (creates or updates name/username/photo)
11. Backend issues own JWT (7-day expiration) and returns `{ access_token, user }`
12. Frontend stores JWT in localStorage, user in Zustand store

**Error handling:**
- User denies authorization → popup closes, frontend shows nothing (no error)
- Code exchange fails (expired/invalid) → backend returns 401, frontend shows error toast
- JWKS validation fails → backend returns 401, frontend shows error toast
- No refresh token strategy — user re-authenticates after 7 days (acceptable for this tool)

## Backend

### Directory: `telegram-race-timer/src/domains/auth/`

### User Entity (`user.entity.ts`)

| Field       | Type    | Notes                              |
|-------------|---------|--------------------------------------|
| id          | UUID    | Primary, auto-generated              |
| telegramId  | string  | Unique, Telegram user ID             |
| firstName   | string  | Nullable                             |
| lastName    | string  | Nullable                             |
| username    | string  | Nullable                             |
| photo       | string  | Nullable, avatar URL                 |
| role        | string  | Default `'user'`, DB stores string   |
| createdAt   | Date    | Auto-generated                       |
| updatedAt   | Date    | Auto-updated                         |

Role enum in code:

```typescript
enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}
```

### Auth Module

**AuthController** (`auth.controller.ts`):
- `POST /auth/telegram` — accepts `{ code, code_verifier, redirect_uri }`, validates redirect_uri against whitelist, exchanges for id_token, upserts user, returns `{ access_token, user }`
- `GET /auth/me` — returns current user from JWT (protected by JwtAuthGuard)

**AuthService** (`auth.service.ts`):
- `exchangeCode(code, codeVerifier, redirectUri)` — exchanges authorization code for id_token at Telegram via HTTP Basic Auth
- `validateTelegramToken(idToken)` — validates JWT signature via JWKS, checks iss/aud/exp
- `upsertUser(telegramUserData)` — creates or updates user in DB
- `generateJwt(user)` — issues own JWT with user id and role

**Guards & Decorators** (prepared, not applied to existing endpoints):
- `JwtAuthGuard` — validates Bearer token from Authorization header
- `JwtStrategy` — passport strategy for JWT validation
- `@Auth()` decorator — shorthand for applying JwtAuthGuard
- `@CurrentUser()` decorator — extracts user from request object
- `@Roles()` decorator + `RolesGuard` — for future role-based access control

### Dependencies (backend)

- `@nestjs/jwt`
- `@nestjs/passport`
- `passport-jwt`
- `jwks-rsa` — for fetching and caching Telegram JWKS keys

### Configuration (`.env`)

- `TELEGRAM_CLIENT_ID` — from BotFather (Web Login settings)
- `TELEGRAM_CLIENT_SECRET` — from BotFather (Web Login settings)
- `JWT_SECRET` — secret for signing own JWTs
- `ALLOWED_REDIRECT_URIS` — comma-separated whitelist of allowed redirect URIs

These must also be added to `.env.example`.

## Frontend

### Popup Auth Flow (no JS SDK)

Telegram's OIDC flow does not have a JS SDK for popup. Instead:
1. Frontend constructs the authorization URL manually
2. Opens it in a popup window via `window.open()`
3. A callback page at `/auth/callback` receives the redirect with `code` and `state`
4. Callback page sends data to the opener window via `window.opener.postMessage()` and closes itself

Frontend needs a new route: `/auth/callback` — lightweight page that extracts query params and posts them back to the opener.

### Auth Store (`useAuthStore.ts` — Zustand)

State:
- `user` — `{ id, telegramId, firstName, lastName, username, photo, role } | null`
- `token` — JWT string | null
- `isAuthenticated` — boolean (derived)

Actions:
- `login()` — generates PKCE + state, opens popup, listens for postMessage, sends code to backend, stores JWT + user
- `logout()` — clears state and localStorage
- `checkAuth()` — on init, reads token from localStorage, calls `GET /auth/me` to verify

### UI

- Button "Войти через Telegram" in the header/navbar
- After login: avatar + name + "Выйти" button
- No separate login page

### Configuration (`.env.local`)

- `NEXT_PUBLIC_TELEGRAM_CLIENT_ID` — same client id as backend

## OAuth Scopes

- `openid` — required, basic identification
- `profile` — name, username, photo

No `phone` scope — deliberate choice, not needed for this application.

## Security

- **PKCE (S256)** protects against authorization code interception
- **`state` parameter** protects against CSRF attacks
- **JWKS validation** ensures id_token authenticity from Telegram (checks iss, aud, exp)
- **Redirect URI whitelist** on backend prevents redirect manipulation
- **HTTP Basic Auth** for token exchange per Telegram OIDC spec
- **JWT_SECRET** signs our own tokens
- **JWT expiration** — 7 days, no refresh tokens (re-auth required)
- **localStorage** for JWT storage — acceptable trade-off for simplicity; app has no sensitive user-generated content
- Auth guard + decorators ready but not applied to existing endpoints

## Roles

- All new users get role `user`
- Admins assigned manually in DB
- Role stored as string in DB, enum in TypeScript code

## Architecture Diagram

```
┌─────────────┐   popup window   ┌──────────────────┐
│   Frontend   │ ──────────────► │  Telegram OAuth   │
│  (Next.js)   │                 │  oauth.telegram.org│
│              │  redirect to    │                    │
│ /auth/       │ ◄────────────── │  /auth → code     │
│  callback    │  postMessage    └──────────────────┘
│              │
│  POST /auth/ │                 ┌──────────────────┐
│  telegram    │ ──────────────► │    Backend        │
│              │                 │   (NestJS)        │
│              │  JWT + user     │                   │
│              │ ◄────────────── │  code → id_token  │
└─────────────┘                 │  → upsert user   │
                                │  → issue JWT      │
                                │                   │
                                │   PostgreSQL      │
                                │   [users table]   │
                                └──────────────────┘
```

## OIDC Discovery

Telegram publishes endpoint configuration at:
`https://oauth.telegram.org/.well-known/openid-configuration`

This is the canonical source for authorization, token, and JWKS endpoints.
