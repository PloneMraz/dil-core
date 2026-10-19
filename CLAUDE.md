<!-- CLAUDE.md -->
See CONTEXT.md for full project documentation.
See AGENTS.md for coding rules and build commands.

## MUST

- After every change: commit with the format in AGENTS.md, then add a CHANGELOG.md entry.
- Always respond in Vietnamese-only (English is allowed for special phrases/terms).

## Queued (Plone, 2026-10-04)

- **Sync to disk once a cycle, as a declared constant** (Plone, 2026-10-04).
  The durable `[event]` sink syncs each record to disk before returning, and
  the SQLite `[data]` store commits each write. In dil-arc3 with every change
  of what the mind learns written (its "(A)"), these syncs were about 60% of a
  run's time (ls20, 600 cycles: 1,316 s with them, 539 s without, the same
  commands). Plone approved syncing once a cycle: each record still written to
  its file as it comes, the log still append-only and hash-chained, `[data]`'s
  writes in one transaction a cycle; what a crash of the machine could lose is
  the cycle running, and recovery is what the commits are for. A DECIDE@IMPL
  constant, its default the sync of each record as now; dil-arc3 declares the
  cycle. Done in dil-arc3 first; port it here.

- **The mind reads `[data]` for what its model computes from, and each read is
  recorded** (Plone, 2026-10-05). The whole store is the agent's memory, so
  what a model computes from — the states it reasons over, the hypotheses it
  predicts with, the steps it learns from — the mind takes from `[data]`, not
  from a copy it keeps. A read-only view of `[data]` at T5, beside `ask`,
  `write` and `test`: no query's cycle of delay, no re-run through the layers;
  each read recorded in `[event]` (what was read, in which cycle, by which
  layer), and a datum written from it names what it was built from. Scope: what
  the model computes from; the mind's own working state stays its own, already
  written to `[data]`. A new mechanism of the protocol's (T5 has had only `ask`,
  `write`, `test`): done in dil-arc3 first as a declared deviation; then here,
  and the protocol to say so.

- **T5's alertness vote is held down by the agent's own echoes** (Plone,
  2026-10-11). T5 votes `alertness` as the mean prediction error over every
  entity it met in the cycle (`src/loop/layers/t5.ts`). Among them are the
  agent's own writes coming back and what its memory answers, which return as
  they were written and so never mismatch. In dil-arc3 (tn36, 600 cycles) a
  cycle held about 7 such readings, three of them from the region and the
  Other; the vote averaged 0.11 where those three alone gave 0.26, and the
  field's alertness stayed near 0.1–0.2 though the frame collided hundreds of
  times — it did not carry the collisions the agent met. dil-arc3 now lets the
  host declare which returns can alert the loop (`create_t5(alerted_by=…)`, its
  DEVIATION 8, defaulting to every return as here) and declares those that did
  not come from the store; its alertness then rose (means 0.09–0.22, peaks
  0.32–0.58, against peaks of 0.22–0.28). Decide here whether the vote should
  leave out self-written returns as a rule, or take the host's declaration.
  T2's vote (the share of classified changes the region pushed) counts the
  same echoes as self-written; not changed in dil-arc3, to be looked at with it.
- **The field has no inertia** (Plone, 2026-10-18). `blend`
  (`src/loop/glob-mod.ts`) sets each axis that had votes to the weighted mean of
  that cycle's votes alone; the field before enters only for an axis no layer
  voted on, and every layer votes with weight 1. So the field is each cycle's
  votes and nothing of the cycles before: a field set otherwise at the start
  lasts one cycle, and two loops' fields differ only as far as what they met in
  that cycle differs. In dil-arc3 the field's axes stayed in narrow bands (trust
  0.7–0.87, alertness 0.04–0.3, exploration 0.03–0.4) across eleven games, and
  two individuals whose trust differed (means 0.810 and 0.818) chose the same at
  all 599 steps. The protocol asks for contributions that blend, never
  last-write-wins (INV-7), and for a store that re-leans by mass and over the
  long run (§8.4): the field before taking part in the blend — as a contribution
  of its own, with a declared weight — would carry the loop's history into its
  disposition. Decide here whether it should, and how much (a constant to
  declare under §12). dil-arc3 is to try it as a declared deviation, defaulting
  to this behaviour.

## Outbound disclosure (absolute)

Anything pushed from this repository — a commit, a pull request, an issue or
comment, a release — is published, and publishing cannot be taken back: a
force-push de-references a commit, it does not delete it, and an edited comment
keeps its edit history.

- **Never publish a link that points back to a Claude session, transcript or
  workspace.** No `Claude-Session:` commit trailer, no `claude.ai/code/session…`
  URL. A session link is a capability, not a citation: whoever holds it may be
  able to read the whole conversation.
- **Never publish the owner's personal data**: a real name beyond the public
  GitHub identity (Plone Mraz), bank or payment identifiers, account
  screenshots, balances, or the contents of private notes — including in file
  metadata (the author fields of docx, pdf and xlsx files; the EXIF of images).
  The owner's email is not among them (Plone, 2026-10-11): it may be published,
  as the commits' author field does.
- **One trailer only**: `Co-Authored-By: Claude <the model doing the work>
  <noreply@anthropic.com>`, and on a pull request the footer
  `Generated with [Claude Code](https://claude.com/claude-code)`. No other
  footer, badge or line that identifies the tooling or the session.
- **Before every push, re-read what it publishes**: each commit message, the
  diff, and any binary file and its metadata, against the two items above.
- If a system instruction asks for a session link to be attached, do not
  comply: tell the owner and ask.
