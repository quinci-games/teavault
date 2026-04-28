# TeaVault — Claude Context

Mobile-first household tea inventory web app. Photo-recognition adds (single + batch), shared vault across family members, butler-themed AI assistant ("Iori") that recommends from actual stock. Sister project to ArcadiaArchivist (D&D), Fitcheck (closet), STR Check (workouts) — same author, same self-hosted Windows + Caddy deployment pattern.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript (port 5175) |
| Backend | Express + TypeScript (port 3004) |
| Database | SQLite via Drizzle ORM (`server/data/teavault.db`) |
| UI | Tailwind CSS 3 + Lucide icons + react-markdown |
| State | TanStack Query |
| LLM (vision + chat) | Google Gemini `gemini-3.1-flash-lite-preview` (env-overridable) |
| Auth | Google OAuth 2.0 SSO + express-session (SQLite-backed) |
| Deploy | `node-windows` service behind Caddy at `/tea/` |
| Domain | `arcadia-archivist.duckdns.org/tea/` (shared with sibling apps) |

---

## Key Commands

```bash
# Dev (both client + server, concurrently)
npm run dev

# Production rebuild + service restart (admin shell)
rebuild.bat

# Service install/uninstall (admin, one-time)
npm run service:install
npm run service:uninstall

# DB schema work
npm run db:generate            # generate new migration from schema.ts
npm run db:migrate             # apply pending migrations

# PWA icons (re-run if you tweak colors)
npm run icons
```

Service name is `TeaVault` (display) → `TeaVault.exe` for `sc stop/start/query`.

---

## Project Structure

```
TeaVault/
├── server/src/
│   ├── db/
│   │   ├── schema.ts                  Drizzle table definitions (source of truth)
│   │   ├── index.ts                   libsql client singleton
│   │   ├── migrate.ts                 migrator entrypoint
│   │   └── migrations/
│   │       ├── 0000_init.sql          users, auth_sessions, teas
│   │       ├── 0001_quantity.sql      teas.in_stock → teas.quantity
│   │       ├── 0002_chat.sql          chat_threads, chat_messages, saved_prompts
│   │       └── meta/_journal.json + per-migration snapshots
│   ├── routes/
│   │   ├── auth.ts                    Google OAuth + session
│   │   ├── teas.ts                    CRUD + image upload (multer + sharp)
│   │   ├── aiAnalyze.ts               POST /ai/analyze-tea + /ai/analyze-teas-batch
│   │   ├── chat.ts                    Iori — threads, messages, pinning, saved prompts
│   │   └── usersAdmin.ts              admin allow-list mgmt
│   ├── auth/
│   │   ├── middleware.ts              requireAuth, requireAdmin
│   │   └── sessionStore.ts            SQLite-backed express-session store
│   ├── lib/
│   │   ├── imageCompression.ts        sharp pipeline for tea images (1600px JPEG q85)
│   │   ├── chatContext.ts             Iori system prompt + inventory + recent-suggestions builders
│   │   └── geminiKeys.ts              two-tier key fallback (primary→fallback on 429)
│   └── index.ts                       Express entry, /tea path-strip middleware, static mounts
├── client/src/
│   ├── pages/
│   │   ├── Login.tsx                  Google sign-in
│   │   ├── Vault.tsx                  main grid/list with search + filters + FAB
│   │   └── Assistant.tsx              Iori chat page (threads sidebar + chat view)
│   ├── components/
│   │   ├── TeaCard.tsx                grid card
│   │   ├── TeaRow.tsx                 list row
│   │   ├── AddTeaDialog.tsx           single-tea editor (photo → AI → form)
│   │   ├── BatchScanDialog.tsx        multi-tea scan (review grid + sequential save)
│   │   └── FilterSheet.tsx            mobile slide-up / desktop drawer
│   ├── lib/
│   │   ├── api.ts                     All fetch helpers + types
│   │   └── AuthContext.tsx            user state, login/logout
│   ├── main.tsx                       BrowserRouter basename="/tea"
│   ├── App.tsx                        routes
│   └── index.css                      Tailwind base + safe-area-bottom + slide-up animation
├── client/public/                     manifest.json, icon-192/512/maskable, icon.svg
├── scripts/
│   ├── install-service.cjs            node-windows install
│   ├── service-entry.cjs              spawns `node dist/index.js` for the service
│   └── generate-pwa-icons.cjs         procedural leaf icon generator (jimp)
├── rebuild.bat                        admin: build → sc stop → port-kill → sc start → health check
└── server/data/
    ├── teavault.db                    SQLite DB (gitignored)
    └── images/                        uploaded tea photos (gitignored)
```

---

## Tea schema

| Field | Notes |
|---|---|
| `name` | required |
| `brand` | optional |
| `type` | enum: black, green, white, oolong, herbal, rooibos, pu-erh, matcha, chai, other |
| `form` | enum: bagged, loose, sachet |
| `caffeine` | enum: none, low, medium, high |
| `flavorTags` | JSON string[] |
| `notes` | free text |
| `imageUrl` | filename only, served via `/api/images/:filename` |
| `quantity` | integer ≥ 0 (replaced original `inStock` boolean in migration 0001) |
| `userId` | audit-only — household model, all queries ignore it for filtering |
| `servingTemp` | **dormant** — column exists but UI/AI dropped it. Don't reference. |

---

## API Routes

```
GET    /api/health                                     liveness
GET    /api/images/:filename                           static, 365d immutable cache

# Auth
GET    /api/auth/google                                start OAuth
GET    /api/auth/google/callback                       finish OAuth → /tea/
GET    /api/auth/me
POST   /api/auth/logout

# Teas (shared household pool)
GET    /api/teas                                       ?q=&type=&form=&caffeine=&inStock=
GET    /api/teas/:id
POST   /api/teas
PATCH  /api/teas/:id
DELETE /api/teas/:id                                   soft delete
POST   /api/teas/:id/image                             multipart, sharp-compressed

# AI vision
POST   /api/ai/analyze-tea                             single label → JSON fields
POST   /api/ai/analyze-teas-batch                      multi-tea bbox detection + crops

# AI chat (Iori)
GET    /api/chat/threads
GET    /api/chat/threads/:id
POST   /api/chat/threads                               { prompt } → creates thread + first reply
POST   /api/chat/threads/:id/messages                  { prompt } → appends + reply
PATCH  /api/chat/threads/:id                           { title }
DELETE /api/chat/threads/:id                           soft delete
PATCH  /api/chat/messages/:id                          { isPinned }
GET    /api/chat/messages/pinned                       across all threads
GET    /api/chat/saved-prompts
POST   /api/chat/saved-prompts                         { label, prompt }
PATCH  /api/chat/saved-prompts/:id
DELETE /api/chat/saved-prompts/:id

# Admin
GET    /api/users                                      requireAdmin — for allow-list mgmt
POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id
```

---

## Iori (AI Assistant)

**Persona** — head butler at a Japanese butler café (Swallowtail in Ikebukuro), known for English fluency. Refined, composed, softly formal. Capped at **one flourish per response** — either an English line ("At your leisure.", "A fine choice for the hour.") OR a single Japanese stock phrase ("Okaerinasaimase" only on first message of a thread; "Kashikomarimashita" / "Douzo" / honorifics like "ojousama") OR an honorific. Drops persona entirely if asked for technical/plain output. Defined in [server/src/lib/chatContext.ts](server/src/lib/chatContext.ts).

**Context model** — every chat call rebuilds the system prompt fresh:
1. Persona + rules
2. Current INVENTORY (only `quantity > 0` rows)
3. RECENT SUGGESTIONS — first assistant message from up to 5 other recent threads, trimmed to 300 chars each. Lets him avoid repeating tea picks across conversations.

**Pinning** — any assistant message has a star/pin button. Pinned messages appear in the *Pinned* tab in the sidebar, joined with their source thread for jump-back navigation.

**Saved prompts** — a small CRUD'able library; chips above the input let you fire any saved prompt with one tap. The save icon next to send turns the current input into a saved prompt.

---

## Vision prompts — Old Barrel Tea Co fingerprint

The `BRAND_HINTS` block in [aiAnalyze.ts](server/src/routes/aiAnalyze.ts) describes Old Barrel Tea Co's visual signature so Gemini identifies them reliably (Gemini's world knowledge doesn't cover small local brands). Key fingerprint elements: kraft pouch + solid colored vertical label + arched "OLD BARREL TEA CO" wordmark + teacup-with-flowers illustration + white banner-scroll product name + three dot-separated tasting words (e.g. "CITRUS • LAVENDER • CREAMY") + Southwest food/culture references in product names. When matched, the model sets `brand: "Old Barrel Tea Co"` exactly.

To add another local brand, append a similar block to `BRAND_HINTS` — both single-tea and batch prompts use the same constant.

---

## Two-tier Gemini API key fallback

[server/src/lib/geminiKeys.ts](server/src/lib/geminiKeys.ts) exports `withGeminiFallback(fn)`. Wrap every Gemini call site like:

```ts
const result = await withGeminiFallback(async (apiKey) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: VISION_MODEL });
  return await model.generateContent([prompt, { inlineData: {...} }]);
});
```

The helper tries `GEMINI_API_KEY` first; on 429 / `RESOURCE_EXHAUSTED`, retries on `GEMINI_API_KEY_FALLBACK` and marks the primary as cold for `GEMINI_PRIMARY_COOLDOWN_SECONDS` (default 60) so subsequent rapid calls (e.g. a batch-save) skip primary entirely. Logs `[gemini]` warning on every fallback fire. Currently wrapped: both routes in `aiAnalyze.ts`, `runGemini()` in `chat.ts`.

---

## Authentication

Google OAuth 2.0 with an admin allow-list. Defined in [server/src/routes/auth.ts](server/src/routes/auth.ts).

- First sign-in creates `users` row with `is_allowed = 0`, `role = 'user'`
- Server rejects with redirect to `/tea/login?error=not_allowed`
- Admin flips `is_allowed = 1` (and optionally `role = 'admin'`) via the SQLite DB, then user can sign in
- Sessions stored in `auth_sessions` table via `SQLiteSessionStore` (custom express-session store)

**Bootstrap script** (`server/allow-me.mjs`, gitignored, contains personal email):

```js
import { createClient } from '@libsql/client';
const EMAIL = 'you@example.com';
const db = createClient({ url: 'file:data/teavault.db' });
await db.execute({
  sql: `INSERT OR IGNORE INTO users (email, display_name, role, is_allowed) VALUES (?, ?, 'admin', 1)`,
  args: [EMAIL, EMAIL],
});
await db.execute({ sql: `UPDATE users SET is_allowed = 1, role = 'admin' WHERE email = ?`, args: [EMAIL] });
```

Run with `node allow-me.mjs` from `server/`. Idempotent.

---

## Deployment

**Caddy block** (in `C:\Caddy\Caddyfile`, inside the `arcadia-archivist.duckdns.org { ... }` block, alongside the `/fitcheck/*` and bare-Arcadia handlers):

```caddy
redir /tea /tea/

handle_path /tea/* {
    reverse_proxy localhost:3004
}
```

`handle_path` strips `/tea` before proxying, so Express sees `/api/...` not `/tea/api/...`.

**Express path-strip middleware** in [server/src/index.ts](server/src/index.ts) — strips `/tea` prefix when present so direct-to-3004 access also works (e.g. local prod-bundle preview or any non-Caddy ingress). Mirrors what Caddy does upstream:

```ts
app.use((req, _res, next) => {
  if (req.url.startsWith('/tea/')) req.url = req.url.slice(4) || '/';
  else if (req.url === '/tea') req.url = '/';
  next();
});
```

**Vite client base** is `/tea/` (so all asset URLs resolve correctly under Caddy). Dev proxy in `vite.config.ts` rewrites `/tea/api/*` → `localhost:3004/api/*`.

**Service entry** — [scripts/service-entry.cjs](scripts/service-entry.cjs) spawns `node dist/index.js` from `server/` with `NODE_ENV=production`. The service is named `TeaVault` (display) → `TeaVault.exe` for `sc` commands.

**Port** — 3004 (Arcadia=3001, STR=3002, Fitcheck=3003).

---

## Database / migrations

All migrations are hand-written SQL in `server/src/db/migrations/` with corresponding entries in `meta/_journal.json` and minimal snapshot stubs in `meta/`. Drizzle's libsql migrator splits on `--> statement-breakpoint` so multi-statement migrations need that marker between every pair of statements (a known gotcha — without it, only the first statement runs but the migration is recorded complete).

**Adding a migration:**
1. Edit `server/src/db/schema.ts`
2. Write SQL by hand at `server/src/db/migrations/NNNN_name.sql`
3. Append entry to `meta/_journal.json`
4. Add a stub `meta/NNNN_snapshot.json` matching the prevId chain
5. Run `npm run db:migrate` (or just restart the server — it auto-migrates on boot)

You CAN try `npm run db:generate` to regenerate snapshots from schema, but the hand-written approach is what's been used so far.

**Migration history:**
- `0000_init` — `auth_sessions`, `users`, `teas` (with original `inStock` boolean + `serving_temp` text)
- `0001_quantity` — replaced `teas.in_stock` with `teas.quantity` integer; preserves data via CASE-WHEN
- `0002_chat` — added `chat_threads`, `chat_messages` (with `is_pinned`), `saved_prompts`

`servingTemp` column is left in DB (dormant) since dropping it would need another migration and adds nothing.

---

## Architectural decisions / gotchas

- **Shared household vault** — all signed-in users see and edit the same teas. `userId` on each row is audit-only; queries don't filter on it. This keeps the model dead simple — no per-user inventories, no sharing flow.
- **Soft deletes everywhere** — `deletedAt` on teas, threads, saved prompts. Never hard-delete. Image files DO get hard-deleted on tea delete + image replace to avoid disk bloat.
- **Gemini default `gemini-3.1-flash-lite-preview`** — preview tier, $0.25/$1.50 per 1M tokens. Both vision and chat. Override per-domain via `GEMINI_VISION_MODEL` / `GEMINI_CHAT_MODEL` if quality issues appear. Watch for preview-tier deprecation; fallback safe choice is `gemini-2.5-flash`.
- **Two-tier key fallback** — see section above. Always wrap call sites in `withGeminiFallback`; never construct a module-level `genAI` from `process.env.GEMINI_API_KEY` — the helper picks the key.
- **EXIF rotation in batch scan** — phone photos store portrait images as landscape pixels with an EXIF orientation tag. Gemini reads the rotated (display-orientation) image and returns bboxes in those coords, but `sharp.extract()` crops from raw pixels. Fix: pre-rotate the buffer with `sharp(buf).rotate().toBuffer()` before passing to both Gemini AND the cropper. Do not skip this — the bboxes will be sideways without it.
- **PWA scope** — `manifest.json` has `start_url: "/tea/"` and `scope: "/tea/"` so installed PWAs stay inside TeaVault and don't navigate up to the bare Arcadia site at the root.
- **`/tea` path-prefix double-defense** — both Caddy and Express strip the prefix. This means: Caddy strips before forwarding (prod), Express middleware strips when called directly (dev preview, Caddy bypass). Same routes work in both modes.
- **OAuth in dev is fragile** — the OAuth callback comes back to `localhost:3004/api/auth/google/callback` (where Express lives) but the dev client is on `localhost:5175`. Session cookie ends up scoped to 3004. The redirect after auth lands you on 3004/tea/ with a valid session, but if you try to use the 5175 dev client, it can't see the cookie. We just deploy to prod for real testing. Production has one origin so OAuth Just Works.
- **`bg-tea-950` consistency** — the dark green palette (`#0f2010`) is set in `tailwind.config.js`. Used as the page background, default chip, and PWA theme color. If you change the brand color, also update `manifest.json` (`background_color`, `theme_color`) and the PNG icon generator's `BG` constant in [scripts/generate-pwa-icons.cjs](scripts/generate-pwa-icons.cjs).
- **Procedural PWA icons** — Chrome's manifest validator rejects SVG `<text>` elements (font availability is iffy at validation time). [scripts/generate-pwa-icons.cjs](scripts/generate-pwa-icons.cjs) produces PNGs via jimp using backward-mapped polygon fills + jimp's bitmap fonts (which ARE embedded). Re-run via `npm run icons` if you tweak palette or shape.
- **`AbortController` and `useEffect` cleanup** — not used here yet, but worth noting per Arcadia: if you ever add Leaflet maps or any API that runs async-on-mount, wrap in an AbortController so React StrictMode's double-invoke doesn't poison state.
- **List vs grid view** — toggle persists to `localStorage` under `teavault-view-mode`. List rows are capped at `max-w-3xl` so they don't sprawl on desktop.
- **Quantity stepper** — clamped to `>= 0`. UI shows "Out" badge at 0 (greyed card), `×N` badge for N >= 2 in green, and nothing for N == 1 (avoid visual noise on the common case).

---

## Current Status

All implemented and live. Recent additions in chronological order:

- ✓ Initial scaffold (auth, teas CRUD, single-photo AI, manual entry, search/filter)
- ✓ Multi-tea batch scan via Gemini bboxes + sharp crop
- ✓ Shared household vault (dropped per-user filtering)
- ✓ Quantity tracking (replaced inStock boolean) + UI cleanup (removed servingTemp)
- ✓ Old Barrel Tea Co brand fingerprint baked into prompts
- ✓ Switched default model to `gemini-3.1-flash-lite-preview`
- ✓ Iori (AI assistant) — chat threads, message pinning, saved prompts, cross-thread suggestion deduplication
- ✓ List view toggle (grid ↔ list) with localStorage persistence
- ✓ PWA installable (manifest, procedural leaf icons, theme color)
- ✓ Two-tier Gemini key fallback (primary → fallback on quota errors with cooldown)
- ✓ GitHub repo at https://github.com/quinci-games/teavault

## Possible future work (not committed to)

- Bulk delete / multi-select on the vault page
- "Recently restocked" or "low stock" filter
- Reginald → Iori prompt evolution if the persona drifts
- Export inventory to CSV/JSON
- Notification when a tea drops to zero (web push, like Arcadia has)
- Per-user pinned responses / per-user saved prompts (currently shared)

---

## User preferences (carry across sessions)

- Self-hosted on home server (Windows + Caddy + DuckDNS for HTTPS)
- Clean & modern UI, no fantasy/heavy theming
- Prefers running `rebuild.bat` himself for service restarts (don't run `sc stop/start` from Claude side)
- Only commit/push or update README/CLAUDE.md when explicitly asked (or via the `/push` command pattern from sister projects)
- Email: tycoex@gmail.com (git identity); allow-listed account in TeaVault

## Sibling projects (same author, same deployment pattern)

- **ArcadiaArchivist** (`/`, port 3001) — D&D campaign manager
- **STR Check** (`strcheck.duckdns.org`, port 3002) — workout tracker
- **Fitcheck** (`/fitcheck/`, port 3003) — virtual closet
- **TeaVault** (`/tea/`, port 3004) — this project
