
# Offline-first + Installable PWA

Full offline for a Supabase app of this size (invoices, stock, batches, payments, triggers) is a large, multi-step build. I'll do it in phases so each phase is shippable and testable. This plan covers Phase 1 end-to-end and scaffolds Phases 2–3.

## Phase 1 — Installable PWA + offline shell + read cache (this round)

What you get immediately:
- App is installable on Android / iOS / desktop ("Add to Home Screen").
- App opens and renders fully offline (UI shell + last-seen data).
- All previously loaded lists (items, parties, invoices, payments, expenses, reports data) remain viewable offline.
- Clear "Offline" indicator in the top bar; actions that require server (login, sync) are disabled with a tooltip.
- When connection returns, data auto-refreshes.

Technical:
- Add `vite-plugin-pwa` with `registerType: autoUpdate`, `devOptions.enabled: false`, and an iframe/preview guard (won't activate inside the Lovable editor preview — only on the published domain).
- `manifest.webmanifest`: name, short_name, theme/bg colors from design tokens, `display: standalone`, icons (192, 512, maskable).
- Workbox runtime caching:
  - HTML → `NetworkFirst` (3s timeout)
  - JS/CSS/fonts/images → `StaleWhileRevalidate`
  - Supabase REST `GET` (`/rest/v1/*`) → `NetworkFirst` with IndexedDB-backed cache, fallback to cache when offline
  - Supabase auth, storage, functions → `NetworkOnly` (never cached)
  - `navigateFallbackDenylist`: `/~oauth`, `/auth/callback`
- New `useOnlineStatus` hook + `<OfflineBadge />` in `AppTopbar`.
- Generate PWA icons (use existing logo/brand color).

## Phase 2 — Offline writes via outbox (next round)

- Local IndexedDB store (`idb` lib) mirroring: `items`, `parties`, `invoices`, `invoice_items`, `payments`, `expenses`, `stock_movements`.
- Wrap Supabase mutations in a `mutate(table, op, payload)` helper that:
  - Online → writes directly to Supabase, also updates local mirror.
  - Offline → writes to local mirror with a temp `client_id` (uuid v4) and appends to an `outbox` queue.
- On reconnect, drain `outbox` in order, replaying inserts/updates/deletes; map temp ids → real ids (rewrite FKs in pending items locally).
- Conflict policy: last-write-wins per row, with a toast listing conflicts; failed ops stay in outbox with retry + manual "discard" action in Settings → Sync.
- New page: `Settings → Sync` showing pending ops, last sync time, retry/clear buttons.

## Phase 3 — Robustness (later)

- Background Sync API (Android/Chrome) so the queue drains even if the tab is closed.
- Selective initial bulk download on first login (so a brand-new device works offline immediately).
- Server-side guard: a `client_id` column on key tables to make replays idempotent (one small migration).
- Optional: end-to-end tests for offline create → reconnect → server state.

## Important caveats (please read)

- Database triggers (stock movements, batch quantities, payment-to-invoice apply) run only when ops actually reach Supabase. Offline edits will reflect in the local mirror immediately, but server-side derived fields (e.g. `current_stock`, `paid_amount`) are recomputed on sync. UI will show "syncing…" pills on affected rows.
- Auth must happen at least once online; offline sessions reuse the cached Supabase session until it expires.
- The Lovable in-editor preview runs in an iframe — the service worker is intentionally disabled there. To test PWA/offline behavior, use the published `.lovable.app` URL or your custom domain.
- iOS limits PWAs (~50 MB cache, no Background Sync). It will still work; the queue just drains when the app is opened.

## What I'll change in Phase 1

- `package.json` — add `vite-plugin-pwa`, `workbox-window`, `idb`.
- `vite.config.ts` — register VitePWA plugin with the config above.
- `index.html` — theme-color, apple-touch-icon, manifest link.
- `src/main.tsx` — guarded SW registration (skip in iframe / preview hosts).
- `src/hooks/useOnlineStatus.ts` — new.
- `src/components/OfflineBadge.tsx` — new, mounted in `AppTopbar`.
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` — generated.
- No DB changes in Phase 1.

After Phase 1 is verified live, say "do phase 2" and I'll wire offline writes + outbox.
