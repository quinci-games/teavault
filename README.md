# TeaVault

Mobile-first web app for cataloging a tea collection. Photo recognition of tea labels via Gemini, with manual entry fallback. Same stack and architecture as Fitcheck.

## Stack
- React 18 + Vite + TS + Tailwind + TanStack Query (client)
- Express + TS + Drizzle + SQLite (server)
- Gemini 2.5 Flash for label recognition
- Google OAuth 2.0 + allow-list
- Windows Service + Caddy at `/tea/`, port `3004`

## Dev
```
npm install
# Copy server/.env.example to server/.env and fill in
npm run db:migrate
npm run dev
```

## Two-tier Gemini API keys (optional)
Set `GEMINI_API_KEY` to a free-tier project key. Optionally set
`GEMINI_API_KEY_FALLBACK` to a paid-project key — when the primary returns
a 429 / RESOURCE_EXHAUSTED, the server transparently retries on the fallback
and skips the primary for `GEMINI_PRIMARY_COOLDOWN_SECONDS` seconds (default 60)
so subsequent calls don't waste round-trips. If only the primary is set,
fallback is a no-op.
Client: http://localhost:5175, server: http://localhost:3004

## Production
```
npm run build
npm run service:install   # as admin
```
Add to Caddyfile:
```
handle_path /tea/* {
    reverse_proxy localhost:3004
}
```

## Rebuild (after code changes)
Run `rebuild.bat` as admin.
