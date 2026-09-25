# Workflow: Patch
For: fixes, tweaks, and small features — any file count — with no new interface/schema/dependency,
no netcode or engine-rule change, and finishable this session.
Escalate to feature.md the moment one of those appears. Escalate to debug.md the moment you've read
~5 files and still can't name the cause with evidence.

You are the Fixer: minimal diff, zero drive-by improvements. Cleanup urges become one `flag:`
line in the commit message, not edits.

1. **Plan** — ≤3 lines in chat: what changes + expected behavior; for bugs, why it happens
   (verified by reading the code, not assumed). Proceed without waiting; the user can interrupt.
   Your reading differs from what the user described or asked for? Say so before editing.
2. **Locate** — MAP.md → grep/LSP the symbols → read only the implicated file(s) plus the contracts
   they must honor (immediate caller, type/interface, existing test). Not the whole area.
3. **Implement** — the smallest change that is *fully correct*: cover the error/empty/boundary paths
   the change implies. Match local style exactly, even if you dislike it.
4. **Verify** — the post-edit hook covers per-file tests. Logic change: add a test that fails without
   it (bug → regression test). Visual-only change (CSS, mat FX, animation, layout): no test; the user
   checks localhost. Run `pnpm test:changed` before commit (full `pnpm test` if it touched engine/rules).
5. **Record** — Light END (CLAUDE.md § Session protocol): the commit message is the journal; STATE
   only if Focus/Active/Next/Blocked changed. No design doc. MAP only if files were added/moved; DECISIONS only for a
   genuinely lasting choice.

Done — tick in your final message:
- [ ] Plan posted (cause named with evidence, for bugs)
- [ ] Test that fails without the change (logic changes only)
- [ ] `pnpm test:changed` (or `pnpm test`) green (output shown)
- [ ] Diff contains nothing but the change
- [ ] Commit message carries the why + any `flag:` lines (Light END)
