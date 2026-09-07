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
      Both open questions are now answered (S1): crash-loss accepted, no optimistic animation in v1.
Blocked: design 001 needs user approval before any build work starts (feature.md § 2 GATE).

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Harness never bootstrapped: PROJECT.md and MAP.md are only partly filled (S1 added the scale
  constraints and the netcode map). Bootstrap is still owed for the remaining subtrees.
- Scale is small and private — see PROJECT.md. Prefer the simple mechanism; durable persistence,
  clustering, auth, and anti-cheat are explicit non-goals.
- No bundler anywhere. Browser loads native ESM (`client/index.ejs:20`); Render runs
  `node server/server.js` after `pnpm install` only. Shared code must resolve under both the
  browser and Node loaders with relative/absolute paths — never bare specifiers.
- Card identity is a DOM node: `Card.image` (HTMLImageElement) carries the attachment graph
  (`image.relative`, `image.attached`) and counter overlays. Any pure-state work must replace it.
- Test baseline is green: `pnpm test` → 797 pass / 0 fail (41 `.mjs` files, plain `node --test`,
  no jsdom). Slice 1 must keep this passing unchanged.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S1: drafted design 001 (server-authoritative netcode) — 8 slices, shadow-mode rollout; draft only.
