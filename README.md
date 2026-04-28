# TeaVault

Mobile-first household tea inventory and recommendation app. Catalog the family's tea collection by snapping photos of labels (single or batch) — Gemini vision auto-extracts the type, brand, caffeine level, and flavor profile. Filter and search the resulting library, track how many of each you have on hand, and ask "Iori" — a butler-themed AI assistant — to pick teas from your actual stock for any time of day.

Designed as a single-deployment household app: shared vault across all signed-in users, Google SSO with an admin allow-list, installable as a PWA on phones and desktops.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + TanStack Query |
| Backend | Express + TypeScript (npm workspaces monorepo) |
| Database | SQLite via Drizzle ORM |
| AI | Google Gemini (`gemini-3.1-flash-lite-preview` by default) |
| Auth | Google OAuth 2.0 + express-session (SQLite-backed) |
| Deploy | `node-windows` service behind Caddy reverse proxy |

## Features

- **Photo-based add** — snap a tea label, Gemini fills in name, brand, type, form, caffeine, flavor tags, and notes. Manual fallback for everything.
- **Batch scan** — lay 10–20 boxes flat, take one photo, accept/reject each detection in a review grid. Server-side `sharp` crops each bbox into a thumbnail.
- **Quantity tracking** — `×N` badge per tea, dim-out at 0. Stepper in edit dialog.
- **Filter/search** — type, form, caffeine multi-select chips; in-stock-only toggle; full-text search across name/brand/notes/flavor tags.
- **Grid + list view** — toggle in header, persists to localStorage.
- **AI assistant Iori** — Swallowtail-style Japanese butler. Recommends from actual in-stock teas, avoids repeating across threads, supports saved prompts and pinned responses.
- **Brand-aware vision** — explicit visual fingerprint for Old Barrel Tea Co (Albuquerque local) baked into the prompts so it identifies them reliably even when the logo is partially obscured.
- **PWA installable** — manifest + procedurally-generated leaf icons; runs full-screen on iOS / Android / desktop Chrome.
- **Two-tier Gemini key fallback** — set a primary (free-tier) and an optional fallback (paid). On 429, the server transparently retries on the fallback and skips primary for a 60s cooldown.

## Quick start (dev)

```bash
git clone https://github.com/quinci-games/teavault.git
cd teavault
npm install

cp server/.env.example server/.env
# Fill in GEMINI_API_KEY, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, SESSION_SECRET

npm run db:migrate
npm run dev
```

Vite dev server at http://localhost:5175/tea/, Express at :3004. Note: Google OAuth in dev is fragile because the OAuth callback returns to a different port than the dev client — easiest to just deploy to prod for real testing. See `CLAUDE.md` for the full reasoning.

### First-login allow-list

The first time you sign in, you'll get a "not on access list" error — by design. Flip your row to allowed/admin via a one-shot Node script (see `CLAUDE.md` for the snippet) or directly in the SQLite DB:

```sql
UPDATE users SET is_allowed = 1, role = 'admin' WHERE email = 'you@example.com';
```

## Production deploy

Windows Service + Caddy reverse proxy. From the project root, in an admin shell:

```bash
npm run build
npm run service:install   # registers "TeaVault" service, auto-starts
```

Add to `C:\Caddy\Caddyfile` inside your existing site block:

```caddy
handle_path /tea/* {
    reverse_proxy localhost:3004
}
```

Reload Caddy (`sc stop Caddy && sc start Caddy`). Visit `https://your.domain/tea/`.

### Updating after code changes

```bash
rebuild.bat   # admin shell — builds, stops service, clears port, restarts, health-checks
```

## Environment variables

See `server/.env.example` for the full list. Key ones:

- `GEMINI_API_KEY` — primary (use a free-tier project for cheap day-to-day)
- `GEMINI_API_KEY_FALLBACK` — optional paid-tier overflow
- `GEMINI_PRIMARY_COOLDOWN_SECONDS` — how long to skip primary after a 429 (default 60)
- `GEMINI_VISION_MODEL` / `GEMINI_CHAT_MODEL` — both default to `gemini-3.1-flash-lite-preview`
- `GOOGLE_OAUTH_REDIRECT_URI` — must match what's registered in Google Cloud Console exactly

## Project layout

```
TeaVault/
├── server/src/
│   ├── db/                  Drizzle schema + migrations + libsql client
│   ├── routes/              auth, teas, aiAnalyze, chat, usersAdmin
│   ├── auth/                middleware + SQLite session store
│   └── lib/                 imageCompression, chatContext, geminiKeys
├── client/src/
│   ├── pages/               Login, Vault, Assistant
│   ├── components/          TeaCard, TeaRow, AddTeaDialog, BatchScanDialog,
│   │                        FilterSheet, AddTeaDialog
│   └── lib/                 api.ts, AuthContext.tsx
├── client/public/           manifest.json, PWA icons, favicon
├── scripts/                 install-service, rebuild helpers, icon generator
└── rebuild.bat              one-click rebuild + service restart
```

## License

Personal project — no license. Not intended for redistribution.
