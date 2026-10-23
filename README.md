# Bill Look

GST billing, payments and inventory for Indian businesses. React 18, Vite 6,
TypeScript, Tailwind 4 and Supabase power the shopkeeper, platform-admin and
support portals. See [CLAUDE.md](CLAUDE.md) for architecture and domain rules.

## Development

Use Node 22 LTS and npm (`package-lock.json` is authoritative):

```sh
npm ci --no-audit
npm run dev
```

The client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from
the intended build environment. Only a public publishable/anon key belongs in
these variables. Server credentials must remain in Supabase function secrets.
The repository's existing `.env` targets the current Supabase project; override
it deliberately for isolated staging. Never use a service-role key in Vite.

## Verification

```powershell
$env:BILLLOOK_TEST_POSTGRES='postgresql://postgres@127.0.0.1:15440/postgres'
npm run audit:all
npm run check
```

That URL is for the disposable `billlook-release-pg17` test container, not the
hosted database. The suite creates and removes isolated databases. Without the
variable it uses PGlite and skips real concurrent-connection coverage. CI uses
PostgreSQL 17 and Chromium. Install Playwright Chromium on Linux before browser
tests; Windows tests use installed Chrome.

`npm run check` includes zero-warning lint, unit/PDF/offline tests, native
database transactions/concurrency, all edge-function type checks and handler
tests, a production build, and mobile/desktop browser checks. The normal browser
suite intercepts external requests. The separate opt-in
`node scripts/staging-smoke.mjs` uses real local Auth/REST services and a restored
backup; see [staging evidence](audit/STAGING_RESULTS.md) for prerequisites.

## Release

The application, database migration and edge functions must roll out together.
The release migration revokes unsafe raw financial writes used by older clients.
Do not run `supabase db push --include-all` or reset the hosted database: historical
remote/local migration timestamps require reconciliation.

Follow [the release checklist](audit/RELEASE_CHECKLIST.md). Build with
`npm run build`; static hosting receives only the contents of `dist/`, including
the SPA `.htaccess`, with `index.html` at the archive root. Never include
`audit/private/`, database backups or source-side secrets in a deployment archive.

The original findings, verification limits and live test-stock reconciliation
are recorded in [audit/FIX_STATUS.md](audit/FIX_STATUS.md) and
[audit/verification-results.json](audit/verification-results.json). Passing tests
does not certify an undeployed build or external payment/email delivery.
