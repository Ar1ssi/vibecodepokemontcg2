# Scarlet/Violet parity check (design 075)

Every move spec rendered in the 3D board next to its Poképédia animation (Scarlet/Violet where the
move exists there, else the newest game Poképédia has). Outputs go to `.agent/scratch/075/parity/`
(gitignored; override with `PARITY_DIR`); verdicts and fixes live in `.agent/designs/075-parity-ledger.md`.

1. `node .claude/skills/fx-preview/parity/fetch-sv.mjs`: French names (PokéAPI), then `<Nom>_EV.mp4`
   from Poképédia's hashed path into `sv/`; writes `moves.json`.
2. `node .claude/skills/fx-preview/parity/fetch-fallback.mjs`: scrapes the move page for moves with no
   EV video (or a truncated download: delete it from `sv/` and clear its row's `video` first).
3. With the dev server on :4100 (`PORT=4100 pnpm start`):
   `SHARD=0 SHARDS=2 CHROMIUM_PATH=/opt/pw-browsers/chromium node .claude/skills/fx-preview/parity/render-ours.mjs`
   (one per shard; `ONLY=a,b` for a subset; existing stills are skipped, so delete `ours/<id>-*.png` to
   re-render). Renders the in-game spec (withoutImpactBeats); `IMPACT=1` adds the TCG Live impact (slow).
4. `next.sh N` lists the next rendered moves not yet in the ledger; `batch.sh <name> <ids…>` stacks
   their comparisons (video on top, ours below) into `review/<name>.png` to read.
