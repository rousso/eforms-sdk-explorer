# Plan: upgrade Bootstrap 4.6.2 to 5.3.8

## Context

The explorer uses Bootstrap 4.6.2 (unsupported since January 2023) from a CDN, with jQuery 3.6 and jsTree. The TED design-system restyle (`ted-design.md`) is a theme layer written against Bootstrap's CSS variables, which Bootstrap 4 does not have; restyling on 4 and upgrading later would mean redoing every override for renamed classes. So the upgrade comes first, as a behaviour-preserving change of its own, verified by the smoke script, with no visual intent beyond Bootstrap's own differences.

Target: Bootstrap **5.3.8** (the current `latest` on npm; 6.0.0-alpha.1 exists but is an alpha). jQuery stays, because jsTree needs it; Bootstrap 5 keeps its jQuery plugin interface (`$(el).tab('show')`, `.popover()`, `.toast()`) when jQuery is loaded before it, so the JavaScript keeps its calls and only the data attributes and class names change.

Working method: one implementation session on the design branch, one commit per item below, `npm run smoke` passing (67 checks, or more if a check is added) before each push, commits as the configured git user without trailers, a Progress entry at the end. Questions to the planning session.

## What Bootstrap 5 changed that the explorer uses

Found by inventory of `index.html` (page and the four `<template>`s), `src/js`, `src/assets/style.css`, `scripts/smoke.mjs`:

| Bootstrap 4 | Bootstrap 5 | Where |
|---|---|---|
| `data-toggle`, `data-target`, `data-dismiss`, `data-placement`, `data-trigger`, `data-html`, `data-content`, `data-autohide` | `data-bs-*` | `index.html` (19 `data-toggle`, 10 `data-target`, 7 popovers, the toast), `script.js` (`[data-toggle="popover"]` selector), `tree-detail-split-view` template (`#tree-search` popover attributes) |
| `.custom-select` | `.form-select` | `index.html:57,62` (version dropdowns), `style.css:79` |
| `<select class="form-control">` | `.form-select` | `#tree-filter` (template, `index.html:695`), `#status-filter` (card-group template, `:828`) |
| `.custom-control.custom-switch` + `.custom-control-input` / `-label` | `.form-check.form-switch` + `.form-check-input` / `.form-check-label` | the compact-view switches in the tree-detail (`:712`) and card-group (`:834`) templates |
| `.btn-group-toggle` with `data-toggle="buttons"` (button plugin removed) | `.btn-check` radio inputs + `label.btn` siblings; the selected look comes from `:checked`, there is no `.active` class any more | `#fields-source` (`:150`), `#validation-source` (`:305`); read by `fields-tab.js` / `validation-tab.js` (checked radio: unchanged) and by `scripts/smoke.mjs:459` (`label.active input` → must become `input:checked`) |
| `.ml-*`, `.mr-*` (left/right) | `.ms-*`, `.me-*` (start/end) | `index.html` (14 uses, header, legend, toast), `style.css:95` (`.ml-auto`) |
| `.font-weight-bold` / `-normal` | `.fw-bold` / `.fw-normal` | tree-detail template (`:690,710,714`) |
| `.close` with `&times;` | `.btn-close` (no inner text) | toast header (`:422`) |
| `.jumbotron` (removed) | utilities, e.g. `p-5 mb-4 bg-light rounded-3` | Home (`:128`) |
| popover `html: true` | same; Bootstrap 5 sanitises the content with an allow-list: `a`, `p`, `div`, `i`, `b`, `span`, `code`, `ul`, `li` with `class`/`href` are allowed, `button` is not | the tour popovers use `<a class="btn …">`, so they pass; keep them anchors |
| `.tab('dispose')` | removed | already removed (bug-fix item 8) |

Unchanged and fine in 5: `.nav-tabs`/`.nav-link`/`.tab-pane`/`.fade.show` and the `shown.bs.tab` event, `.breadcrumb`, `.card`/`.card-header`/`.list-group-flush`, `.alert`, `.toast` (`.toast-body` kept), `.progress`/`.progress-bar`, `.spinner-grow`, `.display-4`, `.lead`, `.d-flex`/`flex-*`, `.row.row-cols-2`, `.h-100`, `.mh-100`, `.d-none`, `.form-control(-sm)` on inputs, `.btn-outline-*`, `.btn-group(-sm)`, `.custom-*` nowhere else.

Two things to verify rather than assume:
- **Shadow DOM.** The four web components load Bootstrap's CSS into their shadow roots (`appConfig.stylesheets.bootstrap`). Bootstrap 5 defines its values as custom properties on `:root`, which does not match inside a shadow root; the components get them by inheritance from the document, which loads the same stylesheet. Check that cards, list groups, buttons, form controls and the switch render inside the components as on the page; if something is missing, set the needed `--bs-*` properties on `:host` in `bootstrap-web-component.js`'s template handling, not by duplicating rules.
- **Duplicate attribute on the Fields tab button.** `index.html:79` has both `data-toggle="tab"` and `data-toggle="popover"` on one element; the parser keeps the first, so the step-1 tour popover is initialised lazily by `.popover('show')` from the element's other attributes. Keep that behaviour after renaming (`data-bs-toggle="tab"` once; the popover attributes `data-bs-trigger`, `data-bs-placement`, `data-bs-html`, `data-bs-content`, `title` stay), and note it in Progress; cleaning it up properly belongs to the restyle, which rebuilds the header.

## Items

### 1. Switch the library and rename the data attributes
- Files: `index.html`, `src/js/config.js` (`stylesheets.bootstrap`), `src/js/script.js`, the `tree-detail-split-view` template in `index.html`, `src/assets/vendor/bootstrap-5.3.8.min.css` (new).
- Change the two CDN URLs to `bootstrap@5.3.8` (`dist/css/bootstrap.min.css`, `dist/js/bootstrap.bundle.min.js`) in `index.html` and `config.js`; keep jQuery loaded first. Rename every `data-toggle/target/dismiss/placement/trigger/html/content/autohide` to `data-bs-*`, including inside the `data-content` strings only where they are attributes (the tour button markup inside them does not change). `script.js`: `$('[data-bs-toggle="popover"]').popover({html: true})`.
- Revised during implementation (it replaces a planned item 0, see Progress): Bootstrap's CSS is served from the repository, as `src/assets/vendor/bootstrap-5.3.8.min.css`: the npm package's `dist/css/bootstrap.min.css` (the bytes jsDelivr serves) without its leading `@charset "UTF-8";` rule, with a comment on its first line stating the source and why. `index.html`'s `<link>` and `appConfig.stylesheets.bootstrap` both use that path, so the page and the components load the same URL; `bootstrap.bundle.min.js` stays on the CDN. With the rule present, Chromium does not share the parsed stylesheet between the shadow roots that link it, and the Codelists tab's 275 index cards keep the page busy for more than 20 s.
- Verify: tabs switch, the version-selector hover popovers and the quick tour (all four steps, Next/Cancel) work, the error toast shows and closes, the Codelists tab goes idle as with Bootstrap 4 (long tasks, forced layout, filter click). Smoke script: no change, but its three checks of the source toggles' selected state fail until item 3 (Bootstrap 5 has no button plugin, so no label gets `active`), so items 1–3 are pushed together after item 3, with `npm run smoke` passing.

### 2. Form controls and switches
- Files: `index.html` (page and the two templates), `src/assets/style.css`.
- `.custom-select` → `.form-select` on the two version dropdowns (keep `me-2`); `style.css` `.custom-select { min-width }` → `.form-select`. The two filter `<select>`s (`#tree-filter`, `#status-filter`) → `form-select form-select-sm`. The two compact-view switches → `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="compactViewSwitch"><label class="form-check-label" for="compactViewSwitch">Compact view</label></div>`; the components' `change` listeners on `#compactViewSwitch` are unchanged.
- Verify: dropdowns look and work as before; the filter selects filter; the compact view toggles in both components; smoke passes.

### 3. Source toggle groups
- Files: `index.html` (`#fields-source`, `#validation-source`), `scripts/smoke.mjs`.
- Replace each `btn-group btn-group-toggle … data-toggle="buttons"` group with Bootstrap 5's form: the group `div` keeps its id, `btn-group btn-group-sm`, `role="group"` and `aria-labelledby`; inside, per option, `<input type="radio" class="btn-check" name="…" id="…" value="…" autocomplete="off" [checked]>` followed by `<label class="btn btn-outline-secondary" for="…">…</label>`. Same names, values, labels and defaults. `fields-tab.js` and `validation-tab.js` read `input[type="radio"]:checked` and listen to `change` on the radios: unchanged. The smoke script's `label.active input[type="radio"]` (around line 459) becomes `input[type="radio"]:checked`, and any assertion on the label's `active` class becomes one on the checked radio.
- Verify: both toggles switch sources, keyboard-operable (arrow keys between radios), the selected button is highlighted after a switch and after a version change; smoke passes with the updated selector.

### 4. Spacing, weight, close button, Home
- Files: `index.html`, `src/assets/style.css`.
- `ml-*`/`mr-*` → `ms-*`/`me-*` (header, legend, progress bar, toast; `style.css` `.ml-auto` → `.ms-auto`); `font-weight-bold`/`-normal` → `fw-bold`/`fw-normal` (tree-detail template); the toast's close button → `<button type="button" class="btn-close ms-2 mb-1" data-bs-dismiss="toast" aria-label="Close"></button>`; the Home `jumbotron` → `<div class="p-5 mb-4 bg-light rounded-3">` (the restyle replaces this block anyway).
- Verify: header, legend, toast and Home look as before apart from Bootstrap's own differences; smoke passes.

### 5. Components under Bootstrap 5
- Files: `src/js/components/bootstrap-web-component.js` only if needed.
- Open every tab for the usual pairs and check the components: index cards (header colours, property rows, Compare buttons), the card-group filter column and status select, the tree/detail view (search field, filter select, switch, detail list), property cards (old/new value boxes). If Bootstrap 5's custom properties are missing inside the shadow roots (symptom: unstyled buttons or form controls in the components while the page is fine), add the minimum fix in `bootstrap-web-component.js` and record it.
- Verify: screenshots of the Codelists overview, the Fields tree and a property card before and after the upgrade, compared by eye; smoke passes.

### 6. Documentation
- Files: `README.md` (Acknowledgements: Bootstrap 5.3), `CHANGELOG.md` (0.2.0 entry: "Bootstrap upgraded to 5.3"), `package.json` (`bootstrap` dependency `^5.3.8`; it is informational: the app loads the JavaScript from the CDN and the CSS from `src/assets/vendor/`).
- A future Bootstrap upgrade re-vendors the CSS the same way: the npm package's `dist/css/bootstrap.min.css` without its leading `@charset` rule, with the source comment on its first line, under a file name with the new version, and the two references (`index.html`, `appConfig.stylesheets.bootstrap`) updated.

## Verification
- `npm run smoke` after every item (the only intended change in the script is item 3's selector).
- A manual pass through the quick tour and the toast, which the smoke script exercises only partly.
- Visual comparison before/after for the three screens of item 5, with the expectation "same layout, Bootstrap 5's own look", not pixel identity.

## Progress
- (empty)
