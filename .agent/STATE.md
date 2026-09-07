# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 1
Focus: server-authoritative netcode — kill multiplayer desyncs at the architecture level
Active: none (design drafted, not started building)
Next: USER APPROVAL GATE on `.agent/designs/001-server-authoritative-netcode.md`.
      On approval → feature.md phase 3, slice 1 (create `shared/`, move pure engine modules).
Blocked: design 001 needs user approval before any build work starts (feature.md § 2 GATE).

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Harness never bootstrapped: PROJECT.md and MAP.md are mostly empty. Design 001's constraints
  were derived by reading code this session, not from PROJECT.md. Bootstrap is still owed.
- No bundler anywhere. Browser loads native ESM (`client/index.ejs:20`); Render runs
  `node server/server.js` after `pnpm install` only. Shared code must resolve under both the
  browser and Node loaders with relative/absolute paths — never bare specifiers.
- Card identity is a DOM node: `Card.image` (HTMLImageElement) carries the attachment graph
  (`image.relative`, `image.attached`) and counter overlays. Any pure-state work must replace it.
- Test baseline is green: `pnpm test` → 797 pass / 0 fail (41 `.mjs` files, plain `node --test`,
  no jsdom). Slice 1 must keep this passing unchanged.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S1: drafted design 001 (server-authoritative netcode) — 8 slices, shadow-mode rollout; draft only.
