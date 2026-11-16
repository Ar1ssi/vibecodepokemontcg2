# 076: Custom sets published to R2 — the Render site loads and live-reloads cardback edits
Status: shipped (user-approved)
Date: 2026-10-25 · Session: S-remote-custom-sets

## Problem
Design 075 and its live-reload addendum (D227) let cardback write a set into the sim's
`client/src/assets/custom-sets/` folder, and the sim reloads the set without a restart. That only works for a sim
running on the user's PC. The public site runs on Render (`render.yaml`, `plan: free`). It deploys from GitHub
`main`, so it sees only committed sets. It also loses any file written at runtime when it restarts (every deploy,
and after ~15 min idle). The user's ask: "cardback uploads custom sets to the R2 bucket, the Render sim loads and
live-reloads them from there."

## Constraints
- No new npm dependency; no build step (PROJECT.md). Cardback stays stdlib-only (its README promise).
- Credentials never enter either repo, and Render holds no secret: R2 write keys stay in rclone's config
  (the D217 / `scripts/tcgl-foil/upload-foil.mjs` pattern); the site reads through the bucket's public URL.
- Render free plan: ~512 MB RAM, ephemeral disk wiped on restart, restart after ~15 min idle. A cold start must
  stay quick, and the health check (`/`) must not wait on R2.
- One card-data seam (D223): custom records still reach browsers only through `withCustomSets` and
  `/api/custom-sets`. Card art keeps its path `/src/assets/custom-sets/<setId>/<nnn>/{high,low}.webp`. The
  validator pins that path, and `customCardIdFromImageUrl`, `extractTcgdexIdFromImageUrl` and the
  deck-builder tile `low.webp` mapping parse it.
- Live reload stays the D227 contract: the server emits `customSetsChanged {version, sets}`; clients refetch.
  No client change is needed.
- D224 says sets are "small repo-stored sets (user's call)". This design keeps repo sets and adds R2 as an
  overlay on top of them. It does not move existing sets out of git.
- `customhb` today: 96 MB, 1035 files (301 × high+low webp, 216 × 2 foil webp, 1 etch), set.json 560 KB,
  foil.json 41 KB. So the site cannot download every published image on each cold start.
- Bucket: `r2:ptcg-foil` (rclone remote `r2`; the key is scoped to the bucket: `lsf` works, `ListBuckets` is 403).
  CORS on the bucket is `*` GET/HEAD (scripts/tcgl-foil/r2-cors.json). `FOIL_TEXTURE_URL` on Render is the
  bucket's public root (upload-foil copies `cards/`, `tex/` to the bucket root).

## Current state (read this session)
- `server/custom-sets.mjs` — `loadCustomSets(rootDir, {log, previous})` reads `<rootDir>/*/set.json` and validates
  each one (`validateCustomSet`, setDirName = folder). With `previous`, a set that now fails keeps its last good copy.
  `customSetSignatures(rootDir)` gives one signature per set folder (set.json by sha1, other files by size+mtime).
  `createLiveCustomSets(rootDir, {log, onChange, watch, debounceMs, pollMs, safetyPollMs})` uses fs.watch
  (recursive) plus polls, and `reload()` returns `{version, sets}` or null. `withCustomSets(proxy, store)` and
  `customSetsManifestHandler(store)` handle reads.
- `server/server.js:202-205` — a blanket middleware sets `Cache-Control` (`no-store` except hashed SFX).
  `:285-297` — `customSetsDir` = `client/src/assets/custom-sets`, `createLiveCustomSets`, and `io.emit(CUSTOM_SETS_CHANGED_EVENT)`
  in onChange. `:308-311` — `/api/tcgl-foil/config` → `customFoilSets(setIds, hasFile)` checks
  `<customSetsDir>/<setId>/foil.json`. `:314` — `express.static(clientDir)` serves the art.
- `server/tcgl-foil-config.mjs` — `customFoilSets(setIds, hasFile)`; `resolveFoilTextureBase({envUrl})` checks a URL
  (http(s), no query/hash, trailing slash dropped).
- `shared/custom-sets/custom-set-schema.mjs` — `CUSTOM_SET_ID_RE`, `isCustomSetId`, `validateCustomSet(json,
  {setDirName, reservedCodes})`, `CUSTOM_SETS_CHANGED_EVENT`, `MAX_CARDS = 999`.
- `scripts/custom-sets/check.mjs` — validates every set folder plus its images and foil (exit 1 on a problem).
- `scripts/tcgl-foil/upload-foil.mjs` — the rclone pattern: `isValidRemote` (`remote:bucket[/prefix]`, no `..`),
  `spawnSync('rclone', …)`, ENOENT → "winget install Rclone.Rclone", remote from `--remote` or an env var.
- Cardback (`C:\Users\SMG26\cardback`, `main` 7a63815; the user has uncommitted work in README.md, compose.py,
  gui.html, gui.py): `gui.sim_sets_dir()` (SVRESTYLE_PTCG_SIM), `push_set(items, title, code, force)` →
  `export.write_set_dir` under `_push_lock`, `/api/push-set` guarded by `_can_push` (loopback browser + sim
  folder known), `/api/meta.ptcgSim`. In gui.html: `#pushRow`, `#pushSetBtn`, `#pushLive`, `pushSimSet({force, quiet})`
  with a queued re-send, `drawExportButton()`. `start-site.bat` sets SVRESTYLE_PTCG_SIM when the sim is in Downloads.

## Options
1. How the site learns what is in the bucket.
   - A. Public `index.json` that the publisher writes, and the site polls it (ETag / If-None-Match). The site needs
     no credentials, and a 304 is cheap. The publisher does a read-modify-write of one object.
   - B. The site lists the bucket through the S3 API. That needs R2 keys on Render and SigV4 signing in Node
     with no dependency.
   - Pick A: no secret on Render (constraint), and one small file is the whole published state.
2. Object layout in the bucket.
   - A. Mirror the folder: `custom-sets/<setId>/<nnn>/high.webp`. Easy to browse, but a re-render overwrites
     in place. A reader can then see a new index with old files or the reverse, and edge caches can serve stale
     bytes.
   - B. Content-addressed blobs: `custom-sets/blobs/<sha256>` + `index.json` mapping each set's relative paths to
     hashes. A publish is atomic (the index swap is the commit point), blobs are immutable (cache forever), and
     unchanged files are never uploaded again, across sets too. Cost: the bucket isn't browsable by card, and
     the publisher stages files by hash.
   - Pick B: correctness under concurrent read/publish and stale caches comes free with immutability.
3. What the site does with a published set.
   - A. Download every file of every published set to its disk at boot and on each change. The existing
     folder machinery then serves it. But customhb is 96 MB on every cold start, and Render restarts it every ~15 min idle.
   - B. Mirror only set.json + foil.json eagerly (≤ 4 MB each, validated), and fetch art lazily on the first
     request into a disk blob cache (`/src/assets/custom-sets/<setId>/<rel>` answered from the blob). A cold start
     costs ~600 KB per set; the first view of a card costs one R2 fetch.
   - C. Redirect art requests (302) to the public R2 URL. No Render bandwidth, but WebGL texture loads of a
     "same-origin" path that ends cross-origin depend on every loader setting `crossOrigin`
     (`card-art-hosts.mjs textureUrlFor` treats relative URLs as same-origin). One missed loader means a tainted canvas.
   - Pick B: quick cold starts, same-origin bytes for every loader, no client change.
4. How the store sees R2 sets next to repo sets.
   - A. Copy the repo sets into one runtime folder at boot, then overwrite from R2. That copies 96 MB per boot,
     and unpublishing must restore the git copy.
   - B. `loadCustomSets` / `createLiveCustomSets` take an ordered list of roots: `[repoDir, mirrorSetsDir]`. A later
     root's set replaces an earlier one with the same folder name. Unpublishing deletes the mirror folder, and the
     git copy comes back on its own.
   - Pick B.
5. Who uploads.
   - A. Cardback signs S3 PUTs itself (stdlib hmac/urllib). That puts a second index writer and a second copy of the
     format in another repo, and R2 keys in cardback's environment.
   - B. A sim script `scripts/custom-sets/publish.mjs <setId>` uploads with rclone (the foil pattern) and owns the
     index format. Cardback's new "Publish to site" first runs its existing push into the local sim folder, then
     runs that script on it. You can also run it by hand for repo sets.
   - Pick B: one owner of the format (the same repo as its reader), credentials stay in rclone config, and the user
     checks a set locally first, as today.
6. How fast the site notices.
   - A. Poll `index.json` every 10 s (a conditional GET; free while Render sleeps since nothing runs).
   - B. The publisher pings an endpoint on the site. That is faster, but it needs the site URL in cardback's config
     and an unauthenticated trigger.
   - Pick A: ≤ 10 s plus fetch time meets "live", and there is no new public endpoint.
7. Site configuration.
   - A. New env `CUSTOM_SETS_URL` (the public URL of the `custom-sets/` prefix). Unset means `${FOIL_TEXTURE_URL}/custom-sets`
     when FOIL_TEXTURE_URL is set, `off` disables it, and with neither the feature is off. Render already has
     FOIL_TEXTURE_URL, so it needs no dashboard step.
   - B. Require `CUSTOM_SETS_URL` explicitly. One more dashboard step.
   - Pick A. A 404 index (nothing published yet) is a quiet empty state, so deriving the URL costs nothing.

## Design
### Bucket layout (prefix `custom-sets/` in bucket `ptcg-foil`; remote `r2:ptcg-foil/custom-sets`)
- `custom-sets/index.json` — Cache-Control `no-cache`, Content-Type `application/json`.
- `custom-sets/blobs/<sha256 hex>` — the file's bytes. Cache-Control `public, max-age=31536000, immutable`.
### Index — `shared/custom-sets/custom-sets-index.mjs` (new, pure)
```json
{ "format": "ptcg-sim.custom-sets-index", "version": 1, "updatedAt": "2026-10-25T12:00:00.000Z",
  "sets": { "customhb": { "publishedAt": "2026-10-25T12:00:00.000Z",
                          "files": { "set.json": { "sha256": "<64 hex>", "size": 560164 },
                                     "001/high.webp": { "sha256": "…", "size": 143210 } } } } }
```
Exports:
- `CUSTOM_SETS_INDEX_FORMAT = 'ptcg-sim.custom-sets-index'`, `CUSTOM_SETS_INDEX_VERSION = 1`.
- `PUBLISHED_FILE_RE = /^(set\.json|foil\.json|CHANGELOG\.md|[0-9]{3}\/(high|low)\.webp|foil\/[0-9]{3}-[a-z]{2,8}\.webp)$/`.
- `MAX_INDEX_BYTES = 4 << 20`, `MAX_PUBLISHED_SETS = 50`, `MAX_FILES_PER_SET = 4000`,
  `MAX_BLOB_BYTES = 16 << 20`, `MAX_SET_BYTES = 512 << 20` (sum of a set's sizes).
- `validateCustomSetsIndex(json) → {ok: boolean, errors: string[], index}`. Rules: format and version exact;
  `sets` is a plain object with ≤ MAX_PUBLISHED_SETS keys, each `isCustomSetId`. Each set has `files`, a plain
  object of 1–MAX_FILES_PER_SET keys, each matching PUBLISHED_FILE_RE, and it must include `set.json`. Each file
  is `{sha256: /^[0-9a-f]{64}$/, size: integer 1…MAX_BLOB_BYTES}`, with `set.json` and `foil.json` ≤ `MAX_SET_JSON_BYTES`
  (re-exported from the schema module: move the constant from server/custom-sets.mjs to custom-set-schema.mjs, and
  server keeps its export as a re-export). The set total is ≤ MAX_SET_BYTES. Unknown extra keys are allowed. On
  `ok`, `index` is a normalised copy holding only the known keys. Errors name the path (`sets.customhb.files["../x"]: not a publishable file`).
- `sameSetEntry(a, b) → boolean` — the same file keys with the same sha256 (publishedAt ignored).
- `emptyIndex() → {format, version, updatedAt: '', sets: {}}`.
- `referencedBlobs(...indexes) → Set<sha256>`.

### Publisher — `scripts/custom-sets/publish.mjs` (new; `pnpm custom-sets:publish`)
```
node scripts/custom-sets/publish.mjs <setId>… [--remote r2:ptcg-foil/custom-sets] [--dry-run] [--json]
node scripts/custom-sets/publish.mjs --unpublish <setId>… [--remote …] [--json]
```
The remote comes from `--remote`, else `$CUSTOM_SETS_R2_REMOTE`. It is checked with `isValidRemote`, imported
from `scripts/tcgl-foil/upload-foil.mjs`. The set folder comes from `--dir <root>` (default `DEFAULT_ROOT` of check.mjs).
Steps for a publish, all synchronous via `spawnSync('rclone', …)`:
1. For each setId: `checkSet(root, setId)` (exported from check.mjs, refactored out of its main loop: returns
   problem lines for one set: schema, images, foil). Any problem → exit 1 before any upload.
2. `collectSetFiles(setDir) → {files: {rel: {sha256, size}}, paths: {rel: absPath}}` — walks the folder and keeps
   files matching PUBLISHED_FILE_RE (others such as ENGINE-CHECK.md are skipped and listed in the report).
3. Staging: `fs.mkdtempSync(os.tmpdir()/ptcg-publish-)`, then one entry per distinct sha256 named `<sha256>`
   (`fs.linkSync`, falling back to `fs.copyFileSync` on EXDEV/EPERM). `rclone copy <staging> <remote>/blobs
   --ignore-existing --s3-no-check-bucket --header-upload "Cache-Control: public, max-age=31536000, immutable"
   --transfers 16 --stats-one-line` (blobs are immutable, so an existing name is the same bytes). Staging is removed in `finally`.
4. Index read: `rclone cat <remote>/index.json`. Exit 0 → parse + `validateCustomSetsIndex`; invalid → exit 1 ("bucket
   index is not valid: …; fix or delete it"). A non-zero exit whose stderr matches `/not found|doesn't exist|404/i`
   → `emptyIndex()`. Any other failure → exit 1 with rclone's stderr.
5. New index = previous with `sets[setId] = {publishedAt: now, files}` for each set, plus `updatedAt: now`. When
   every requested set `sameSetEntry` its previous entry, it skips the write and reports `unchanged`. Otherwise it
   writes the temp file `index.json`, then `rclone copyto <tmp> <remote>/index.json --s3-no-check-bucket
   --header-upload "Cache-Control: no-cache" --header-upload "Content-Type: application/json"`.
6. GC: `rclone lsf <remote>/blobs --files-only` → delete names that are neither in `referencedBlobs(previous, next)`
   nor the new index, using `rclone delete <remote>/blobs --files-from-raw <tmpList>` (skipped when empty).
   Keeping the previous generation lets a site that is mid-pass on the old index still find its blobs.
- `--unpublish`: delete `sets[setId]` (unknown id → exit 1, "not published"), write the index, run GC as above.
- `--dry-run`: steps 1–2 and 4, then it prints what it would upload (blob count/bytes not in `lsf`) and the index
  diff. It writes nothing.
- Report (stdout): one line per set, `customhb: 3 files uploaded (412 KB), 1032 already there; index updated`. With
  `--json`, it prints one final line instead:
  `{"sets":[{"setId","uploaded","uploadedBytes","reused","skipped":[rel],"unchanged":bool}],"deleted":n}`.
- Pure helpers exported for tests: `parsePublishArgs(argv, env)`, `collectSetFiles(dir)`, `nextIndex(previous, entries, now)`,
  `unpublishIndex(previous, setIds, now)`, `blobsToDelete(remoteNames, previous, next)`, `copyBlobsArgs`, `copyIndexArgs`.
- `package.json` script `"custom-sets:publish": "node scripts/custom-sets/publish.mjs"`.

### Site — `server/custom-sets-remote.mjs` (new)
```js
export const REMOTE_POLL_MS = 10_000;
export function resolveCustomSetsUrl({ envUrl, foilTextureUrl }) // → {baseUrl: string|null, error: string|null}
export function createRemoteCustomSets({ baseUrl, cacheDir, fetchImpl = fetch, log, onUpdate,
                                         pollMs = REMOTE_POLL_MS, now = Date.now })
// → { setsDir, start(), refresh(): Promise<{changed: string[]}|null>, close(), has(setId), hasFile(setId, rel),
//     fileHandler(): express handler }
```
- `resolveCustomSetsUrl`: `envUrl` trimmed. `'off'` → null. A non-empty value is checked like
  resolveFoilTextureBase (http(s), no query/hash, trailing `/` stripped), and invalid → `{baseUrl: null, error}`.
  Empty → `foilTextureUrl` resolved the same way + `/custom-sets`, else null.
- Disk: `cacheDir` (server.js: `process.env.CUSTOM_SETS_CACHE_DIR || path.join(os.tmpdir(), 'ptcg-sim-custom-sets')`).
  `setsDir = <cacheDir>/sets` (the store's second root), and `blobsDir = <cacheDir>/blobs`. Both are created at
  construction, and `sets/` is emptied at construction: a restart starts from the bucket, never from a stale mirror.
- State: `active: Map<setId, entry>`, the last set entry whose set.json was valid and is mirrored; `etag`,
  `lastIndex`; `failing` (bool, so logs fire on a state change only); `inFlight: Map<sha256, Promise<string>>`.
- `refresh()` (serialised: a call while one runs returns that run's promise):
  1. `GET <base>/index.json`, `cache: 'no-store'`, `If-None-Match: etag` when one is known, timeout 15 s. A 304 → null.
     A 404 → treated as `emptyIndex()`. Another non-2xx or a network error → log once (`custom sets remote: <why>;
     keeping <n> published sets`), return null. A body over MAX_INDEX_BYTES, bad JSON or an invalid index → log once,
     return null (the etag is not stored, so the next poll retries).
  2. For each set in the index not `sameSetEntry` with `active`: `ensureBlob(set.json)` and `ensureBlob(foil.json)`
     if listed, then parse set.json and run `validateCustomSet(parsed, {setDirName: setId, reservedCodes:
     RESERVED_SET_CODES})`. If it fails → log (`custom set <id> from the bucket skipped: <errors>; kept the copy
     loaded before` / `…; not loaded`), and keep `active` as it was. If it passes → write
     `<setsDir>/<setId>/set.json`, `foil.json` (or remove it), and `published.json` (the entry), each temp + rename,
     published.json last. Then `active.set(setId, entry)`. A blob fetch failure for one set → log; that set
     keeps its old state and the others go on.
  3. For each `active` set no longer in the index: `fs.rmSync(<setsDir>/<setId>, {recursive, force})`, `active.delete`.
  4. If any set changed: `onUpdate({changed})` (server.js calls `customSets.reload()`, which signs the folders
     again and emits `customSetsChanged` through the existing onChange).
  5. GC: delete files in blobsDir not referenced by `active` entries.
  6. Store the etag; `failing = false` (log `custom sets remote: back` if it was true).
- `ensureBlob(sha256, size) → Promise<absPath>`: the cached `<blobsDir>/<sha256>` when present, else one shared
  in-flight download per hash. `GET <base>/blobs/<sha256>`, timeout 30 s. It streams into `<sha256>.<random>.part`,
  aborts past `size` bytes, checks length === size and sha256 === name, then renames. Any mismatch or a non-200 →
  rejects (`blob <sha> from the bucket: <why>`) and deletes the part file.
- `fileHandler()` for `GET /src/assets/custom-sets/:setId/*`: if `!active.has(setId)` → `next()` (repo copy via
  express.static). `rel = req.params[0]`. It is not in `active.get(setId).files` → 404 `not published`. Otherwise
  `ensureBlob` → `res.type(path.extname(rel) || '.bin')` + `res.sendFile(abs)`. ensureBlob fails → 502
  `bucket fetch failed`. The blanket middleware has already set `no-store`.
- `has(setId)` = `active.has`; `hasFile(setId, rel)` = `active.get(setId)?.files[rel] != null`.
- `start()`: an immediate `refresh()` (not awaited by boot), then `setInterval(refresh, pollMs).unref()`;
  `close()` clears the timer.

### Store — `server/custom-sets.mjs` (modify)
- `loadCustomSets(rootDirs, {log, previous})` and `customSetSignatures(rootDirs)` accept a string or an array of
  roots. Roots are read in order; a later root's set folder with the same name replaces the earlier one (the
  signature key stays the folder name, and the value is `<rootIndex>|<signature>`). A set skipped in a later root
  falls back to `previous` exactly as today, and when there is no previous, to the earlier root's copy.
- `createLiveCustomSets(rootDirs, options)` watches each root that exists (one fs.watch each, each with its own
  error → poll fallback). `close()` closes them all.
### Wiring — `server/server.js` (modify)
```js
const remoteSetsUrl = resolveCustomSetsUrl({ envUrl: process.env.CUSTOM_SETS_URL, foilTextureUrl: process.env.FOIL_TEXTURE_URL });
if (remoteSetsUrl.error) console.error(remoteSetsUrl.error);
const remoteSets = remoteSetsUrl.baseUrl ? createRemoteCustomSets({ baseUrl, cacheDir, log, onUpdate: () => customSets.reload() }) : null;
const customSets = createLiveCustomSets(remoteSets ? [customSetsDir, remoteSets.setsDir] : customSetsDir, {...as today});
if (remoteSets) { app.get('/src/assets/custom-sets/:setId/*', remoteSets.fileHandler()); remoteSets.start(); }
```
- The route is registered before `express.static(clientDir)`. The foil config hasFile becomes
  `(file) => { const [setId, ...rest] = file.split('/'); return remoteSets?.has(setId) ? remoteSets.hasFile(setId, rest.join('/')) : fs.existsSync(path.join(customSetsDir, file)); }`.
- Boot log `custom sets remote: <baseUrl> (every 10 s)`, or nothing when off.
- `render.yaml` (both services): a commented `CUSTOM_SETS_URL` entry, `sync: false` (optional; defaults from
  FOIL_TEXTURE_URL).

### Cardback (`Ar1ssi/cardback`; built in a cardback worktree, leaving the user's uncommitted files alone)
- `gui.py`: `site_remote()` = `os.environ.get("CUSTOM_SETS_R2_REMOTE", "").strip() or None`.
  `publish_set(items, title, code, force=False)`: calls `push_set(...)` (same lock), then runs
  `[node, <sim>/scripts/custom-sets/publish.mjs, setId, "--remote", remote, "--json"]`, `cwd=<sim>`, timeout
  600 s, where `<sim>` = the checkout above `sim_sets_dir()` and `node` = `shutil.which("node")`. It returns
  `{**push, "published": <parsed last JSON line>}`. A missing node → UserError "node not found on PATH". A missing
  remote → UserError "set CUSTOM_SETS_R2_REMOTE (e.g. r2:ptcg-foil/custom-sets)". A non-zero exit → `PublishError`
  (502) with the last 5 stderr lines. A timeout → 502 "publishing took over 10 minutes".
- `/api/meta`: `ptcgSite: bool` = `_can_push()` and a remote set. `POST /api/publish-set {items, title?, code, force?}`
  uses the same `_can_push` guard as push-set (loopback only).
- `gui.html`: in `#pushRow`, `<button id="publishSetBtn" class="small" hidden>Publish to site</button>`, shown when
  `meta.ptcgSite`. Its disabled state and title follow `drawExportButton` (title: "Send the set to ptcg-sim, then upload
  it to the site's bucket; the site shows it within ~10 s"). `publishSimSet({force})` mirrors `pushSimSet` with its own
  `state.publishing`, waiting while `state.pushing`. Status: `Publishing HB…` →
  `Published HB: 3 files uploaded (412 KB); the site picks it up within 10 s.` or `The site already has HB as it is.`
  Shift+click = force re-render, as with Send.
- `start-site.bat`: `if not defined CUSTOM_SETS_R2_REMOTE where rclone >nul 2>nul && set "CUSTOM_SETS_R2_REMOTE=r2:ptcg-foil/custom-sets"`.
- README: a "Publishing to the site" paragraph.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Feature off (no CUSTOM_SETS_URL, no FOIL_TEXTURE_URL) | no remote object, single root, behavior identical to today | [x] covered: custom-sets-remote.test "resolveCustomSetsUrl: explicit, off, derived…" (null base → server.js builds no remote, single root) |
| 2 | `index.json` 404 (nothing published) | empty remote state, repo sets served, no error log | [x] covered: "nothing published yet (index 404) is a quiet empty state" |
| 3 | Index malformed / wrong format / path `../x` / size over cap / 51 sets | whole index refused, one log line, current sets kept, retried next poll | [x] covered: custom-sets-index.test (path, caps, ids, hashes rows); custom-sets-remote.test "a refused index keeps the published sets and logs once…" |
| 4 | Bucket unreachable / timeout at boot | boot not delayed; repo sets served; one log line; recovery logged once | [x] covered: "an unreachable bucket keeps what was loaded and logs once"; boot never awaits refresh (server.js start()) |
| 5 | Published set.json invalid (validator newer on sim than publisher) | set skipped with a log; the previous mirror copy is kept, else the repo copy | [x] covered: "a published set.json the validator refuses is skipped; the copy loaded before stays"; custom-sets.test "a later root replaces…falls back" |
| 6 | Blob bytes don't match sha256 / size, or exceed size while streaming | download rejected, part file deleted, never cached; route answers 502 | [x] covered: "a blob that does not match its hash is never cached…"; route 502 in "published art is served…" |
| 7 | Same blob requested by 20 tiles at once | one download, 20 responses | [x] covered: "published art is served…" (20 parallel requests, one download) |
| 8 | Art request for a published set path not in its files (e.g. `005/high.webp` after removal) | 404, never falls back to the repo copy | [x] covered: "published art is served…" (005/high.webp → 404, repo set still static) |
| 9 | Published set with the same id as a repo set | R2 copy wins; unpublish → repo copy returns, `customSetsChanged` emitted | [x] covered: "the store serves the bucket copy over the repo copy, and the repo copy again once unpublished" |
| 10 | Only art changed (set.json identical) | entry differs → published.json rewritten → signature changes → `customSetsChanged` | [x] covered: same test, "art alone is a change" (version 2) |
| 11 | Index unchanged (304) | no blob fetch, no reload, no event | [x] covered: "a published set is mirrored once; an unchanged index costs one conditional request" |
| 12 | Publish while the site reads the old index | old blobs survive one generation (GC keeps previous); the site sees the old or new index, never a mix | [x] covered: publish.test "a re-render uploads only the changed file; the old one lives one more generation, then goes" |
| 13 | Two publishers at once (CLI + cardback) | last index write wins; a set dropped by the race is restored by re-running; documented, no lock (single user) | [x] by design: one user; cardback serialises its own pushes |
| 14 | Publisher: set fails check.mjs rules | exit 1 before any upload, problems printed | [x] covered: publish.test "a set that fails the check is refused before anything reaches the bucket" |
| 15 | Publisher: rclone missing / remote invalid / `rclone cat` fails other than not-found | exit 1 with the reason; index untouched | [x] covered: publish.test "a bad remote, a set id that is not custom, or a failing rclone…" |
| 16 | Publisher: crash after blobs uploaded, before index write | index still the old one (valid); orphan blobs removed by the next publish's GC | [x] covered: publish.test "a crash after the upload leaves the old index; the next publish cleans the orphans" |
| 17 | Publisher: nothing changed | no index write, report `unchanged` | [x] covered: publish.test "a first publish…; a second one changes nothing" (only lsf + cat run) |
| 18 | Unpublish unknown set | exit 1 "not published", index untouched | [x] covered: publish.test "a dry run writes nothing; unpublish drops the set and unknown sets are refused" |
| 19 | Render restart | sets/ emptied at boot; re-mirrored from the index in one pass (~600 KB for customhb); blobs refetched lazily | [x] covered: custom-sets-remote.test "a restart starts from the bucket; blobs no published set names are removed" |
| 20 | Cardback: no remote / no node / publish fails / timeout | button hidden (no remote) or error shown; local push result still reported | [x] covered: cardback test_export Http "test_publish_set_pushes_then_runs_the_simulator_publish_script" (no script, no remote, no node, exit 1 → 502) |
| 21 | Cardback request from a non-loopback browser (tunnel) | 403 like push-set; button hidden | [x] covered: same test, Cf-Connecting-Ip → 403; meta ptcgSite false without remote/script |
| 22 | Disk growth on the site | blobs not referenced by active entries deleted after each changed refresh; bound = published sets' total size (≤ 50 × 512 MB caps, ~100 MB real) | [x] covered: "a restart starts from the bucket; blobs no published set names are removed" (old art blob deleted after republish) |

## Test plan
- `shared/custom-sets/__tests__/custom-sets-index.test.mjs`: validator rows 3, the file regex, `sameSetEntry`,
  `referencedBlobs`.
- `server/__tests__/custom-sets-remote.test.mjs`: a fake fetch serving an in-memory bucket, temp cacheDir. Covers
  rows 2–8, 10, 11, 19 (sets/ emptied), 22; `resolveCustomSetsUrl` rows (off, explicit, derived, invalid).
- `server/__tests__/custom-sets.test.mjs` additions: two roots, later wins, the fallback to the earlier root (rows 5, 9).
- `scripts/custom-sets/__tests__/publish.test.mjs`: arg parsing, `collectSetFiles` skips ENGINE-CHECK.md, `nextIndex`
  / `unpublishIndex` / `blobsToDelete` (rows 12, 16, 17, 18), rclone argument shapes, check failure → exit (row 14).
- Integration (in the remote test): `createLiveCustomSets([repo, remote.setsDir])` + `withCustomSets`. A publish
  of a new set.json to the fake bucket → `refresh()` → the proxy answers the new card name, and the onChange
  version increments.
- Cardback `tests/test_gui.py`: publish_set with a fake node script (row 20), the guard (row 21), the meta flag.
- Manual (one, needs the user's bucket): `pnpm custom-sets:publish customdemo` → a local sim with
  `CUSTOM_SETS_URL=<public>/custom-sets` shows it; edit a card in cardback → Publish to site → the open deck
  builder redraws within ~10 s.

## Migration / rollout
Additive. Repo sets keep working, and the remote is off unless a URL resolves. Rollout: land on main (Render
redeploys) → `pnpm custom-sets:publish <set>` once → the site picks it up. Revert path: drop the remote wiring
from server.js (the single-root call comes back), or set `CUSTOM_SETS_URL=off` on Render with no deploy. Bucket
data: `node scripts/custom-sets/publish.mjs --unpublish <set>`, or delete `custom-sets/` in the bucket. Nothing
in git or in the bucket's `cards/`/`tex/` (foil) is touched.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 index contract | create `shared/custom-sets/custom-sets-index.mjs`, its test; modify `custom-set-schema.mjs` (MAX_SET_JSON_BYTES moves here), `server/custom-sets.mjs` (re-export) | §Index | valid index → ok; `files["../x"]` → error naming the path; 51 sets → error; set.json size 5 MB → error; sha "ABC" → error; `sameSetEntry` ignores publishedAt; `referencedBlobs(a, b)` = union | — | `node --test` on both tests |
| 2 multi-root store | modify `server/custom-sets.mjs`, `server/__tests__/custom-sets.test.mjs` | §Store | roots [a,b] with the same set → b's name; b broken → previous, else a's; signature changes when a set moves roots; live store watches both | — | custom-sets tests green |
| 3 site remote | create `server/custom-sets-remote.mjs`, its test; modify `server/server.js`, `render.yaml` | §Site, §Wiring | rows 1–11, 19, 22 as in Test plan; integration row | — | tests green; `pnpm start` boot log with a URL pointing at a local static bucket |
| 4 publisher | create `scripts/custom-sets/publish.mjs`, its test; modify `scripts/custom-sets/check.mjs` (export `checkSet`), `package.json` | §Publisher | rows 12, 14–18 | — | tests green; `--dry-run` against `r2:ptcg-foil/custom-sets` prints a plan |
| 5 cardback | cardback worktree: `svrestyle/gui.py`, `gui.html`, `start-site.bat`, README, `tests/test_gui.py` | §Cardback | rows 20, 21; meta flag | — | `python -m unittest discover tests` |
| 6 live check + docs | MAP, DECISIONS (D228), STATE, this design's Deviations | — | manual row in Test plan | — | `pnpm gates`; the user's bucket check |

## Deviations (Builder appends here during build)
- Review (second agent, fixed): a failing `rclone cat` that said "not found" counted as an empty index, so GC
  would have deleted every other set's blobs. Now only a listing without index.json means "nothing published",
  and GC is skipped when no index was read. Also fixed: the next index is validated before it is written; blobs are
  staged as copies and hashed again; rclone calls time out (2 min, upload 15 min); symlinks are skipped. The site
  keeps loaded sets when index.json 404s (unpublish writes an index without the set). The site also resolves a
  relative cache dir, retries a failed set removal, and logs a repeating failure once. check.mjs rejects foil
  texture names PUBLISHED_FILE_RE cannot carry. Cardback holds the push lock through the upload, kills the process
  tree on timeout (20 min, past the script's own limits), and returns the push result in its 502.
- Row 13, widened: two publishers at once can also lose blobs (one's GC runs off a listing taken before the
  other's upload). Same answer as the lost index update: single user, cardback serialises its own publishes, and
  re-running a publish restores both. Not locked.
- Store signatures (slice 2): a folder present in two roots signs as both copies (`0|<repo sig>\n1|<mirror sig>`), not
  only the winning root's, so a change to either copy reloads (a broken mirror copy falls back to the repo one).
- Site (slice 3): a set whose published set.json fails validation is remembered (`refused`) and not fetched or logged
  again until its files change. Part files live in `<cacheDir>/parts/` (emptied at start), so blob GC never meets one.
  Blob downloads are capped at 6 at a time (`BLOB_CONCURRENCY`). Verified blobs survive a restart of a local server
  (Render's disk is wiped anyway); `sets/` is emptied as designed.
- Publisher (slice 4): it lists the bucket's blobs first and stages only the missing ones, so it can report exact
  upload counts. On R2, `rclone cat` of a missing object exits 0 with no output, so an empty answer is checked with
  `lsf` (no `index.json` → nothing published; an empty file → refused). A dry run of customdemo + customhb against
  `r2:ptcg-foil/custom-sets` planned 6 + 1034 files (313 KB + 93.1 MB); ENGINE-CHECK.md is not published.
- End to end (local): rclone local-backend bucket + static server with ETags, sim on :4176 with CUSTOM_SETS_URL.
  Publish → manifest/card/art served from the bucket (art byte-identical, `no-store`). Card rename + one art edit
  → republish (2 files uploaded) → new name served 4 s later, new art served. Unpublish → repo copy back, cache GC'd.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
