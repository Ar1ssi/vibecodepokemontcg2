# 016: Wire the legacy mat picker into server-authoritative netcode
Status: shipped
Date: 2026-09-19 · Session: S191

## Problem
Legacy rules mode resolves every trainer/ability choice whose candidates are in-play Pokémon by
clicking the real card on the mat (`openMatPick`, D19). Under `SERVER_AUTHORITATIVE` those effects
run on the server instead and raise a `PendingChoice`; `apply-view.js` only routes choices to the
prize fan, the card-picker carousel, or the flat grid modal — never the mat picker. So Rare Candy's
"choose the Basic", Grand Tree's/Salvatore's "choose the host Pokémon", Boss's Orders switch targets
and every other in-play-Pokémon target regress to a modal carousel in multiplayer, contradicting D19.

## Constraints
- Engine stays pure/DOM-free (Invariant 8); no server change is needed — the target info is already
  on the choice options (instanceId) and the renderer's `cardRegistry` knows each card's zone/side.
- The server owns the move; the picker must only report picks (`pickOnly`, same as `CHOICE_PICKER`).
- Legacy flag-off behavior must not change (D19 path stays authoritative there).
- No new dependency, no build step.
- Extraction must not regress the 11 legacy `openMatPick` call sites (mat-pick unit tests +
  `e2e-api.js`'s `.mat-pick-banner`/`ffd23f` outline contract).

## Current state
- `client/src/setup/rules/trainer-execution.js:213` — `openMatPick({title,candidates,onPick,onCancel})`
  module-private: builds `buildMatPickEntry` per candidate, outlines the mat DOM nodes (`.mat-holo`
  aware), installs capture-phase click/keydown listeners on every relevant document (top + both
  playmat iframes), resolves on click, cancels on Escape/button. Imports `imageAnchor`
  (`deck-constructor/hydrate-holo.js`), `buildMatPickEntry`/`findMatPickHit` (`rules/mat-pick.mjs`),
  and `selfContainer`/`oppContainer`/`*Document` (`state.js`).
- `client/src/setup/rules/mat-pick.mjs` — pure, tested helper: entry build + hit test.
- `client/src/setup/netcode/apply-view.js:1575/1612` — `openChoiceInCardPicker` /
  `openChoiceInPrizePicker`, invoked in `reconcilePendingChoice` (line 1447); context fields
  `choicePicker`/`prizePicker` (line 56-61), reset in `resetRenderState` (line 195).
- `client/src/setup/netcode/choice-picker-adapter.js` + `choice-picker-request.mjs` — the pattern
  to mirror.
- `client/src/initialization/socket-event-listeners/socket-event-listeners.js:257` —
  `seedNetcodeContext()` registers the adapters.
- `cardRegistry` records (`apply-view.js:450`) carry `{instanceId, element, side, zone, holoCard}`;
  `zone ∈ active|bench` identifies an in-play-Pokémon candidate.

## Options
1. How to reuse the mat UI
   - A: export `openMatPick` from `trainer-execution.js` and import it in the adapter. Tradeoff:
     couples netcode boot to the 1785-line DOM/rules monolith's eager imports; no clean cancel hook.
   - B: extract the UI into `client/src/setup/rules/mat-picker.js`, import it from both
     `trainer-execution.js` and the new adapter. Tradeoff: one refactor of a working legacy path.
   - Pick B — single implementation, no new coupling, and the extraction is a pure move plus an
     internal `closeMatPick()` handle (needed so a cleared choice tears the outline/listeners down).
2. How to decide a choice is a mat choice
   - A: add an engine marker (`resumeToken.targetZone`, or a new `ask({display})`). Tradeoff: touches
     every `ctx.ask` site and the serialized resume token for a purely presentational concern.
   - B: client-side: every option resolves to a registry record whose `zone` is `active`/`bench`
     and whose `element` exists. Tradeoff: relies on the rendered board, which is exactly the D19
     precondition ("the candidate IS an in-play Pokémon").
   - Pick B — no protocol change; the board is the source of truth for "is this on the mat".
3. Which choices use it
   - A: only Rare Candy + Grand Tree. Tradeoff: two special cases, drifts as cards are added.
   - B: every single-pick choice whose options are all in-play Pokémon (D19's explicit scope).
   - Pick B — matches D19 and needs no card-name list.
   - Multi-pick (`max > 1`) and mixed/off-mat option sets fall through to the card picker/modal.

## Design
New `client/src/setup/rules/mat-picker.js` (browser module; same imports `openMatPick` has today):
- `openMatPick({ title, candidates, onPick, onCancel, cancellable = true })` — the moved body.
  `cancellable:false` hides the Cancel button and ignores Escape (a required server choice cannot be
  declined). Entry first dismisses any pick already open. Stores `activeMatPick = { cancel, dismiss }`,
  cleared by `finish`/`cancel`/`dismiss`.
- `dismissMatPick()` — silent teardown (cleanup only), for choice-cleared / passed-to-opponent /
  superseded. Never reports a decline; a real user decline flows through the in-place
  `cancel` (Cancel button / Escape) → `onCancel`.
`trainer-execution.js` imports `openMatPick` and drops its local copy + now-unused imports
(`imageAnchor`, `buildMatPickEntry`, `findMatPickHit`, the four `state.js` container symbols).

New `client/src/setup/netcode/mat-pick-request.mjs` (pure, DOM-free, unit-tested):
- `buildMatPickerRequest(choice, registry)` where `registry` is a `Map<instanceId, record>`:
  returns `null` unless `choice.options.length > 0`, clamped `max === 1`, and every option maps to an
  in-play Pokémon root record (`card.attachedTo == null`, `zone ∈ {active, bench}`, `.element`). Else
  `{ title: choice.prompt || 'Choose a Pokémon', candidates }`,
  `candidates = records.map(r => ({ instanceId: r.instanceId, name: r.card?.name || '', image: r.element, wrapper: r.holoCard?.wrapper }))`,
  `cancellable: choice.min === 0` (only an optional choice can be declined).

New `client/src/setup/netcode/mat-picker-adapter.js` (browser; mirrors prize/choice adapters):
- `MAT_PICKER.open({ choice, candidates, cancellable, onResolve, onCancel })` → `openMatPick({ title,
  candidates, cancellable, onPick: (card) => onResolve([card.instanceId]), onCancel })`.
- `MAT_PICKER.close()` → `dismissMatPick()` (silent; a real decline flows through `onCancel`).

`apply-view.js`:
- context field `matPicker: null` (default + `setDefaultNetcodeContext` + `resetRenderState`);
  module guard `openMatChoiceId = null` (reset too).
- `openChoiceInMatPicker(pendingChoice, options)` after the prize picker and before the card picker:
  gate on `picker.open`, `buildMatPickerRequest(pendingChoice, cardRegistry)`, dedupe via
  `openMatChoiceId`; `onResolve` clears the guard then `submitChoiceSelection`; `onCancel` clears the
  guard and, only for a cancellable choice, submits an empty selection (a required choice hides
  Cancel and ignores Escape, so it cannot be declined).
- `closeMatPicker(options)` wired into the `!pendingChoice` / opponent-owned / prize-owned /
  fallback-cleanup branches beside `closeChoicePicker`; the mat branch also closes a stale card
  picker.

`socket-event-listeners.js` `seedNetcodeContext()` registers `matPicker: MAT_PICKER`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | choice with no options / empty registry | `buildMatPickerRequest` → null; falls through to card picker/modal | [x] covered: no options / no registry entry |
| 2 | mixed options (some hand/deck cards) | not all in-play → null; card picker keeps current behavior (Rare Candy stage-2-in-hand step) | [x] covered: a hand option keeps the card picker |
| 3 | `max > 1` multi-pick of in-play Pokémon | mat picker is single-click → null; card picker/modal handles it | [x] covered: multi-pick choices never use the single-click mat picker |
| 3b | attached Energy/Tool in a play zone offered as an option | not a Pokémon root (`attachedTo != null`) → null; falls back | [x] covered: attached cards in a play zone are not mat targets |
| 4 | same choice re-applied in a later view | `openMatChoiceId` guard: no reopen/reset of the outline | [x] covered: in-play options open the mat picker once |
| 5 | choice cleared or passed to opponent | `closeMatPicker` → silent dismiss (no resolve emitted); waiting banner shown | [x] covered: closes when the choice passes to the opponent |
| 6 | card element not yet rendered (registry record missing `element`) | request → null; falls back to card picker/modal rather than a dead outline | [x] covered: no options / no registry entry / missing element |
| 7 | required choice (min ≥ 1): Escape / no Cancel | no cancel affordance; pick cannot be dismissed without choosing | [x] covered: a required choice is not cancellable |
| 8 | adapter missing / throws | `openChoiceInMatPicker` returns false and logs; modal fallback still mounts | [x] covered: adapter failure falls back to the modal |
| 9 | legacy `openMatPick` call sites (flag off) | unchanged signature, default `cancellable:true`, same banner class/outline | [x] covered: existing mat-pick tests + live probe |
| 10 | choice for opponent-owned Pokémon (Boss's Orders) | registry records exist on the opp board; mat picker already listens on opp iframe documents | [x] reasoning: apply-view registers opp records in the same cardRegistry; mat-picker.js listens on opp iframe documents (unchanged from legacy) |

## Test plan
- Unit: new `client/src/setup/netcode/__tests__/mat-pick-request.test.mjs` (rows 1–3, 3b, 6);
  add rows 4,5,7,8 to `apply-view.test.mjs` with a `fakeChoicePicker` and a seeded `getCardRegistry()`.
- Existing `client/src/setup/rules/__tests__/mat-pick.test.mjs` stays green (row 9).
- `pnpm test` green; new file added to the explicit list in `package.json`.
- Manual: live 2P under `SERVER_AUTHORITATIVE=1` — done via `.agent/scratch/mat-picker-probe.mjs`
  (real apply-view + real click): banner opened, both options outlined, click resolved with the
  clicked instanceId. Row 10 verified by reasoning (shared registry + unchanged opp-doc listeners).

## Migration / rollout
n/a — no persisted state, no protocol change. Revert path: revert the commit; legacy path untouched.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Extract `mat-picker.js` (+`closeMatPick`, `cancellable`); point `trainer-execution.js` at it | `pnpm test` green (mat-pick tests + suite) |
| 2 | `mat-pick-request.mjs` + unit test; add to `package.json` test list | narrow test green |
| 3 | `mat-picker-adapter.js`, `apply-view.js` wiring + tests, `socket-event-listeners.js` registration | `pnpm test` green |
| 4 | Manual 2P verification under the flag | mat click resolves the choice; footer/PR |

## Deviations (Builder appends here during build)
- Extraction adds a silent `dismissMatPick()` beyond the planned `closeMatPick()`: teardown on a
  cleared/passed/superseded choice must not invoke `onCancel` (which, for a cancellable choice,
  submits an empty selection). `MAT_PICKER.close()` uses `dismissMatPick()`; only the user
  button/Escape path calls `onCancel`. (Review finding #1.)
- `buildMatPickerRequest` additionally rejects attached cards (`card.attachedTo != null`), not just
  off-zone ones: attached Energy/Tools share the active/bench zone array and the hit-test would
  resolve an attachment click to its host. (Review finding #3.)
- e2e-api.js detects the mat pick via a `data-mat-pick` marker (set/restored by mat-picker.js), since
  the browser normalizes the `#ffd23f` inline outline to `rgb(255, 210, 63)` — the legacy
  outline-string check never matched a real browser. (Review finding #10.)

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"
