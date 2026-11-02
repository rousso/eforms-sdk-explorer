# Implementation plans

Each file in this folder is a plan written in a planning session and executed, increment by increment, in separate implementation sessions. The plan is the hand-over: an implementation session has no memory of the planning discussion, so everything it needs is in the plan file.

Current plans:

- `sdk2-support.md` — support for eForms SDK 2 (validation rules, forward-compatible field metadata, version selection). Done.
- `bug-fixes.md` — the bug-fix pass that precedes the TED design-system restyle.

## How an implementation session works

1. The session is started on the plan's working branch (named in the plan; one `feature/…` branch per plan, merged into `develop` when the plan is done) with the opening prompt below, naming one increment.
2. It reads the plan and the code the increment touches, implements the increment as described, verifies it with `npm run smoke`, commits and pushes.
3. It appends a dated entry to the plan's "Progress" section: what was done, any deviation from the plan and why, and what the next increment must know.
4. Anything unclear in the plan is asked, not guessed.

## Opening prompt

Copy, replace `<plan>` with the plan file and `<N>` with the increment (or item) number, and paste as the first message of a new session on the working branch:

```
Read docs/plans/README.md and docs/plans/<plan>.md in full before doing anything else.

Implement Increment <N> of docs/plans/<plan>.md, exactly as described there. Before writing code, read the current source of every file the increment touches and the components it reuses (src/js/diff.js, src/js/tabs/tab-controller.js, the web components in src/js/components/).

Rules: follow the coding style already in the repository (ES modules, one TabController subclass per tab, web components, jQuery and Bootstrap 5); object-oriented, clean code; no helper grab-bags, no shortcuts. If the plan and the code disagree, or something is unclear, stop and ask instead of improvising. Do not touch anything outside the increment's scope.

Verify with `npm run smoke` (install devDependencies first) and the checks listed under "Verification" that apply to this increment. Commit per increment with a clear message, as the configured git user and without any Co-Authored-By or session trailer, push to the working branch, and do not create a pull request.

When done, append an entry to the "Progress" section of docs/plans/<plan>.md: what was done, any deviation and why, and what the next increment must know. Commit and push that too.
```
