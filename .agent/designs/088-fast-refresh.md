# 088: Fast refresh — browser caching, a bundled client, a smaller card back, keep-awake
Status: shipped (approved by the user: "Fix everything", after the four fixes and the D4 conflict were laid out)
Date: 2026-11-13

## Problem
Every refresh re-downloaded the whole app: 827 requests, 13.5 MB (720 JS modules, 54 stylesheets),
because the server sent `Cache-Control: no-store` and nothing was bundled or compressed. On a
simulated home connection (40 ms, 20 Mbit) a refresh took 11.4 s to the load event. The live site
also took 61 s to answer after idling (Render free plan cold start).

## Constraints
- Visitors must always get the current build (the reason `no-store` was there: tunnel demos).
- Development stays as it is: native ES modules, no build step, edit and refresh (PROJECT.md, D4).
- A failed or missing bundle must not take the site down.
- No behavior change in the game: same modules, same evaluation order.
- The e2e scripts import source modules in the page (`import('/src/…')`); they need the source build.

## Current state (before)
- `server/server.js` — one middleware set `Cache-Control` from `server/sfx-cache.mjs`: `no-store`
  for everything but hashed SFX. No compression. `express.static` for `client/` and `shared/`.
- `client/index.ejs` — `<link href="src/css/index.css">` (36 `@import`s, 54 sheets in all) and
  `<script type="module" src="src/front-end.js">` (720 modules reached at boot).
- Imports: relative, `/shared/…` root-absolute (106 sites), bare `three` through an import map.
  Two `import.meta.url` uses (catalog-loader.mjs, tt-textures.js). Two computed `import()`s
  (box-data.mjs data modules; native-deck-builder-unboxing.js pack stage).
- `client/src/assets/cardback.png` — 1.5 MB, already optimally packed as PNG.

## Options
1. **Cache policy for unhashed files** — A `no-cache` (keep, revalidate every use; 304 when
   unchanged) · B `max-age=N` (fewer requests, stale for up to N). Pick A: always fresh is a hard
   constraint, and the bundle removes most of the requests anyway.
2. **Bundler** — A esbuild (one binary, 0.7 s build, handles JS and CSS) · B Rollup/Vite (more
   plugins, slower, a dev server we do not want) · C hand-rolled concatenation (no dependency, but
   ESM scoping makes it a bundler rewrite). Pick A.
3. **One file or code-split** — A single script (4.5 MB min, 1.2 MB Brotli; exact module
   evaluation order) · B esbuild `splitting` (88 files, 40 at boot; shared chunks are evaluated
   before the code that imports them, which can reorder side effects across 700 modules).
   Measured: the page reaches 720 of ~870 modules at boot either way, so B saves little. Pick A.
4. **When the bundle is served** — A whenever `client/dist` exists (a stale folder silently hides
   source edits on a dev machine) · B by environment: `CLIENT_BUNDLE=1|0`, else on a deploy host
   (`RENDER` or `NODE_ENV=production`). Pick B.
5. **When the bundle is built** — A `buildCommand` in render.yaml (explicit, but only applies if the
   service follows the blueprint) · B root `postinstall` that builds only on a deploy host (works
   with whatever build command the dashboard holds) · C at server start (adds seconds to every
   cold start). Pick B; `pnpm build` runs it by hand.
6. **Card back** — A palette PNG at the same URL (188 KB, visible banding on the gradients) ·
   B WebP q90 at a new URL (142 KB, no visible difference), PNG kept for stored references ·
   C content negotiation on the PNG URL (hidden server trick). Pick B.
7. **Cold start** — A paid plan (owner's money) · B self-ping every 10 min, off by default (an
   always-on service uses ~730 of the 750 free hours a workspace gets) · C nothing. Pick B, opt-in.
8. **Compression at the origin** — `compression` middleware (Brotli/gzip). Render's edge already
   compresses, a local server or tunnel did not. Added.

## Design
- `server/cache-policy.mjs` (was sfx-cache.mjs) `cacheControlFor(path)`: hashed SFX → 1 day;
  `/dist/*-<HASH8>.(js|css)[.map]` → `public, max-age=31536000, immutable`; `/api/` → `no-store`;
  everything else → `no-cache`.
- `scripts/build-client.mjs` `buildClient({rootDir, outDir, minify})` → `client/dist/app-<hash>.js`,
  `app-<hash>.css`, source maps, `manifest.json` `{script, style}`. esbuild, `format: 'esm'`, no
  splitting, `keepNames`; CSS bundled with whitespace-only minify. Plugin `served-paths`:
  `/shared/…` and `/src/…` imports → the mounted folders; `three` → the vendored build;
  `import.meta.url` → the module's unbundled URL; CSS `url()` → root-absolute, asset not copied;
  `node:*` external. Returns esbuild's warnings.
- `server/client-bundle.mjs` `loadClientBundle({clientDir, env, warn})` → manifest or null
  (not wanted, unreadable, malformed, file missing → warn once, serve source).
  `app.locals.clientBundle` feeds `client/index.ejs`, which picks bundle or source URLs.
- Source changes so the bundle can follow every import: box-data.mjs resolves its data modules
  against `import.meta.url` (they stay unbundled, import nothing); the pack stage import is a literal.
- `client/src/assets/cardback.webp`; `DEFAULT_CARD_BACK_PATH` names it, and the four hard-coded
  local paths import that constant. `cardback.png` stays (`RETIRED_DEFAULT_CARD_BACK_PATH`).
- `server/keep-awake.mjs` `planKeepAwake(env)` / `startKeepAwake(plan, deps)`; `GET /healthz`.
- Dependencies: `esbuild` (root `dependencies`, so a production install has it), `compression`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No `client/dist` on a deploy host | warn, serve source files | [x] client-bundle.test "no bundle, a broken manifest…" |
| 2 | Manifest not JSON / wrong shape / points outside `/dist/` | warn, serve source | [x] same test + "a manifest must name…" |
| 3 | Manifest names a deleted file | warn, serve source | [x] same test (stylesheet deleted) |
| 4 | Bundle exists on a dev machine | ignored unless `CLIENT_BUNDLE=1` | [x] "a development machine serves the source…" |
| 5 | Source file changes | new file name; unchanged sheet keeps its name; old file removed | [x] build-client.test "a changed source file…" |
| 6 | Hash format and cache regex drift apart | built names must get the immutable policy | [x] build-client.test "the bundle is one hashed script…" |
| 7 | A new computed `import(x)` or unparsable CSS rule (works unbundled, breaks deployed) | real-client build test fails | [x] "the real client bundles clean…" |
| 8 | CSS `url()` outside the served folders, or a missing import | build fails with the location | [x] "a url() outside the served folders…" |
| 9 | Build fails on deploy | `postinstall` exits 1, the deploy fails, the previous deploy keeps serving | reasoning: Render keeps the live deploy when a build fails |
| 10 | Unhashed `/dist/manifest.json`, `/src/*`, pages | `no-cache`, never immutable | [x] cache-policy.test |
| 11 | `KEEP_AWAKE` on without a URL / with a non-http URL | reported once at boot, no ping | [x] keep-awake.test |
| 12 | Ping fails repeatedly | one warning per outage | [x] keep-awake.test "reported once per outage" |
| 13 | A saved deck or the other tab still names `cardback.png` | file still served; resleeve matches it | reasoning: file kept; native-deck-builder.js known-backs set |
| 14 | Concurrent builds | struck: the build runs once per install, never from the server |

## Test plan
Unit: cache-policy, client-bundle (incl. the EJS template in both modes), keep-awake, build-client
(fixture builds + the real client). Browser, source vs bundle on one machine: same console output on
`/`, `/deck-builder`, `/build-and-battle`; 0 computed-style mismatches over 18,352 elements and
pixel-identical screenshots; a Build & Battle run starts and loads its box data in both;
`pnpm test:solo` gives the same 13 passes in both.

## Migration / rollout
No data migration. Revert path: set `CLIENT_BUNDLE=0` on the service (source files are served
again at once), or revert the commit. Old card-back references keep working because the PNG stays.

## Work plan
One slice, built inline in the session that designed it.

## Deviations
- The e2e scripts that `import('/src/…')` inside the page work only against the source build
  (their spawned servers are dev servers, so nothing changes for them).
- Found and fixed in passing: `index.css` had `[data-action->'rename']` (dark-mode rename-chip hover
  rule never applied).
