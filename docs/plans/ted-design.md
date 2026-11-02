# Plan: TED design-system restyle of the eForms SDK Explorer

## Context

The SDK Explorer is published on docs.ted.europa.eu as a public TED tool, but it still looks like a default Bootstrap page. This plan applies the TED design system to it without changing what the application does or how it is built. It stays vanilla JavaScript with jQuery, Bootstrap, jsTree and diff2html, the four web components, and GitHub Pages hosting. The work is a style layer over Bootstrap plus markup changes in `index.html` and the components' templates. JavaScript changes only where the plan says so.

The design was made and reviewed on a canvas in a design session (https://claude.ai/artifact/1jEXEYzTFqSUx7xJEX8gJo). An implementation session does not need the canvas: everything it needs is in this repository.

- **Mockups:** `docs/plans/ted-design/mockups/`. There is one self-contained static HTML file per screen, with the design-system files it needs beside it, and one 1440 px PNG per screen. Serve the folder with `npx http-server docs/plans/ted-design/mockups -p 8081` and open each mockup next to the app at the same width (1440 px). The HTML is the reference for exact values: open it in the browser's inspector to read a colour, size or spacing.
  - `home.html` / `home.png`: Home, with the TED header and footer, the two comparison buttons, and the side card (quick tour, reading the comparison).
  - `fields.html` / `fields.png`: the Fields tab. The comparison line has the base and target chips, the target's version menu open, and the legend. The tree is scrolled to the review nodes, `BT-799-ReviewBody` is selected, and Compact view is on.
  - `notice-types.html` / `notice-types.png`: the Notice types overview, filtered to `cont-modif` (38, 39 and 40 modified; E6 added).
  - `codelist-comparison.html` / `codelist-comparison.png`: the comparison of `notice-subtype_can-modif.gc`.
  - `states.html` / `states.png`: loading, the error toast, and the first quick-tour step on Home's "Choose versions…".
  - `version-dialog.html` / `version-dialog.png`: the "Choose the versions to compare" dialog over Home.
  - All mockup data is real: 1.13.0 compared with 1.12.0. The version menus list real tags and branches.
- **Design-system files:** under `src/assets/ted/`, copied unchanged from the TED Design System (https://claude.ai/code/artifact/5f2babc1-182b-43ea-84b8-060db9114a49, version `1792679212-d421`):
  - `tokens.css`: every token as a CSS custom property (`--gs-base-*`), the `ted-*` type classes, and the `gs-icon` `@font-face`.
  - `icons.css`: the `gs-icon-*` glyph classes.
  - `fonts/gs-icon.woff`: the OP Global Style icon font.
  - `img/`: `eu.svg` (banner flag), `logo-eu--en.svg`, `logo-eu--mobile.svg`, `EU-flag.png` (footer) and `op-lockup-blue.png` (Publications Office lockup, footer).
  - `ted-theme.css` is not among them: Increment 1 creates it and the later increments fill it.
- **Prerequisite:** `docs/plans/bootstrap5-upgrade.md`, merged into `develop` before Increment 1 starts. The increments name Bootstrap 5 classes (`form-select`, `form-check`, `form-switch`, `btn-check`, `ms-*`/`me-*`, `btn-close`, `data-bs-*`).
- **Working method:** as in `docs/plans/README.md`, on branch `feature/ted-design`. Use one implementation session per increment or per group of increments, one commit per increment, `npm run smoke` before each push, and a dated entry in Progress at the end.

## Decisions

The user approved every decision below after reviewing the canvas and these mockups. Decision 2 and the destination of Home's "Compare" button (Decision 3) were confirmed last, on 2026-11-02.

1. **Page family and full public chrome.** The TED design system has two families that must never be mixed on one screen. The page family uses `--gs-base-*` tokens and Arial and is meant for public TED sites. The application family (`Eui*`, Inter) is for eNotices2-style applications. The user chose the page family because the explorer is a public tool on docs.ted.europa.eu. For the same reason it gets the full public chrome: the EU global banner, the EU logo row, the service row with the green service stripe, the 8 px green divider, and the full public footer. The `internal` variant (no banner and no EU logo row) is reserved for TED-team applications, so it is not used.
2. **Header names (confirmed by the user).** Site name "EU tenders" (from the design system's own header example), service chip "Ted ■ eForms SDK Explorer", description "Explore and compare different versions of the eForms SDK". The header's own navigation stays empty.
3. **Plain TED header, pinned tabs, a comparison line, and comparison actions on Home** (the user chose this after comparing it on the canvas with selectors in the header):
   - **Header:** the TED header carries no application controls. The design system says the header is identical on every TED site: only the names and the navigation vary.
   - **Pinned bar:** the ten sections are the existing Bootstrap tabs (`ul.nav-tabs`), restyled as TED tabs. They sit in one row under the header with the loading indicator. While the page scrolls, the header scrolls away and this row, about 50 px high, stays pinned at the top.
   - **Comparison line:** at the top of the work area of every tab except Home, one line reads "Comparing [base: 1.12.0 ▾] › [target: 1.13.0 ▾]", with the change legend right-aligned on the same line. It scrolls with the page.
     - The two chips are Bootstrap dropdown buttons in a light TED style, modelled on GitHub's branch chips.
     - Each chip opens a menu in sections: Branches (target only; a branch cannot be a base), Pre-releases and Releases, the current version highlighted.
     - Choosing a version reloads the comparison, as choosing in today's select does.
   - **Home:** Home has no comparison line. It offers a primary button "Compare 1.12.0 › 1.13.0", which opens the Fields tab on the pair already selected (Fields confirmed by the user), and a secondary "Choose versions…". That button opens a TED dialog with both lists, their explanations, Cancel and Compare; Compare applies both choices in one reload.
   - Choosing versions through chips, menus and a dialog is a behaviour change, so it gets its own increment (Increment 10) after the restyle. Increments 3 to 9 keep today's two selects, placed in the comparison line.
4. **One page scroll (the user's request).** The page is the only main scroll; panels do not get their own scrollbars. The following stick under the pinned bar:
   - the tree's search/filter header
   - the Details panel, which scrolls on its own only when a field's details are taller than the window
   - the card group's filter list
   This replaces today's fixed-height layout (`84px`, `42px`, `calc(100vh - 84px - 42px - 42px - 44px)` in `style.css`), which also breaks the page at 1024 px and 768 px.
5. **Change colours.** Added, removed and modified are the product's core signal. They use TED semantic tokens: a strong colour for markers and a surface tint for rows and labels.

   | Change | Marker (white glyph on) | Tint | Glyph |
   |---|---|---|---|
   | added | `--gs-base-color-success` #467A39 | `--gs-base-color-success-surface` #F3FBEF | `gs-icon-add-plus` (`\e900`) |
   | removed | `--gs-base-color-error-100` #BB0202 | `--gs-base-color-error-surface` #FCEAEC | `gs-icon-minus` (`\e92c`) |
   | modified | `--gs-base-color-info` #006FB4 | `--gs-base-color-info-surface` #EEF5FB | a 6 px white dot, drawn in CSS (the user rejected the pencil icon) |

   - A marker is a 16 px square with a 2 px radius and a white 10 px glyph.
   - White on each marker colour has a contrast of at least 5:1, and every change carries its marker, so meaning never rests on colour alone.
   - The tints map onto the existing variables in `src/assets/style.css` (Increment 2), so diff2html, the tree and the cards follow them.
   - In the file diff, the gutter keeps `+`/`−` as text, as diff convention.
6. **White work area (the user's request).** The work area is white on every screen; grey made the screens clash with the light-blue footer. Panels and cards separate themselves with a 1 px `--gs-base-color-gray-20` border and the TED card shadow `0 1px 3px 0 rgba(0, 0, 0, 0.2)`.
7. **Error toast stays bottom right (the user's request).** `#apiStatus` keeps its position and behaviour. It is restyled as a TED error Notification.
8. **Pre-release alert removed (the user's request)** from Home.
9. **Labels.** "Metadata source:" and "Source:" keep their text, colon included (the smoke script finds them). Tab labels change to sentence case: "Notice types", "View templates". The comparison line reads "Comparing", and its two controls are labelled "base:" and "target:" inside the control, as in the mockup. Each also gets an accessible name, "Base version" and "Target version".
10. **Home content (the user's choices).**
    - **Main column:** the heading "eForms SDK Explorer", the lead "Explore and compare different versions of the eForms SDK.", the existing paragraph, then the two comparison buttons (from Increment 10). The column is at most 48rem wide.
    - **Side card,** on the right edge of the page:
      - First, "New to the SDK Explorer?", one line on what the tour covers, and the "Start quick tour" button (`#start-tour`, as a tertiary small button).
      - Then, below a thin rule, "Reading the comparison", which explains base, target and the three markers using the tour's own wording.
    - The legend is not shown on Home: Home marks no changes, and the side card explains the markers.

## Constraints

- **No behaviour change**, except in Increment 10, which changes how versions are chosen and nothing else. Everything the application does today, it still does, in the same way. `npm run smoke` (`scripts/smoke.mjs`) passes after every increment with every check, 69 after the Bootstrap upgrade (the count is recorded in the Progress section of `docs/plans/bootstrap5-upgrade.md`). An increment that adds a check records the new count in Progress, and that count is the expected one from then on. A run with a lower pass count is a failed increment.
- **Smoke selectors.** The script relies on the elements below. An increment that changes one of them, or a text the script reads, updates `scripts/smoke.mjs` in the same commit, and says so in Progress.
  - `#main-version-dropdown` and `#base-version-dropdown`.
  - The tab buttons, found with `ul.nav-tabs button.nav-link.active` and by their ids (`#home-tab` … `#release-notes-tab`, `#validation-tab`, `#schematrons-tab`). The `li.nav-item` wrappers stay, and visibility stays the `d-none` class on the `li`.
  - `#fields-source` and `#validation-source`: ids, radio names and values unchanged. The script reads `input[type="radio"]:checked`.
  - `#fields-source-alert`.
  - `#centralLoadingSpinner`, through its CSS `visibility` (`hidden` when idle): the script's idle wait uses it.
  - `#apiStatus .toast-body` with its `li` items and `span.detail`.
  - The component ids (`#fields-explorer`, the card-group ids per tab, `#notice-type-explorer`).
  - Inside the shadow roots: `#treeView`, `#filter-options .nav-link` (clicked by text), `#nav` (its `display`), `#filter-prompt` (its text), `#status-filter` and `#action-button`.
  - The diff containers (`#validation-diff`, `#view-templates-diff`, …) and diff2html's `.d2h-file-header .d2h-file-name`.
  - `#release-notes`.
- **No React, and the four web components stay.** The mockups were drawn with the design system's React components, but here their look is reproduced in CSS on the existing markup. Copy values from the mockup HTML.
- **Shadow DOM.** Page CSS does not reach into a component's shadow root; custom properties do, because they inherit. So a component's class-based styling must come from its own `<template>` or from a stylesheet listed in `appConfig.stylesheets`.
- **Stylesheets in the shadow roots.** Every stylesheet the components load through `appConfig.stylesheets` must not begin with an `@charset` rule. It must be served from the site's own origin, or from a CDN that sends CORS headers. The reason is measured: with an `@charset` rule, Chromium cannot share one parsed sheet between shadow roots. The Bootstrap upgrade found that each of the 275 Codelists cards re-parsed Bootstrap 5's 232 KB, costing 20 s of main-thread work. For that reason Bootstrap is served from `src/assets/vendor/` without the rule. `tokens.css` and `icons.css` have no `@charset`. Keep `ted-theme.css` that way: plain ASCII, so it never needs one. Keep it small too, because the components load it into every shadow root.
- **Icon font.** The `gs-icon` `@font-face` must be declared in the document (by `tokens.css`, linked in `index.html`). An `@font-face` inside a shadow root is ignored; with the document's declaration, the glyphs render in the components too.
- **Tokens, not literals.** `ted-theme.css` and the templates reference `var(--gs-base-…)` tokens. The only literals are those the design system itself declares as literals: the 3 px button radius, the card shadow, and `#757575` for the ghost button's focus ring. Also allowed, each with a comment naming its token: the `-rgb` triplets Bootstrap needs (`--bs-link-color-rgb`) and the colours inside SVG data URIs (the select's chevron, the checkbox's tick).
- **Tour anchors.** The quick tour shows popovers on `[data-step="0"]` to `[data-step="3"]` (`src/js/script.js`), and it starts on Home. Step 0 is today on `.version-text` and step 3 on `.legend-title`, and both elements change. Move their popover attributes as follows, so that the tour still has four steps in the same order:
  - Increment 3: step 0 to the comparison line's version group, and step 3 to the legend.
  - Increment 10: the comparison line is hidden on Home from then on. Step 0 moves to Home's "Choose versions…", and step 3 to the side card's marker list. The tour then stays on Home and never switches tab.
- **Empty state.** Since the bug-fix pass, a tab clears itself before it loads, and after a failed load its pane stays empty while the toast explains the error. In the new design an empty pane shows the tab's heading and toolbar and nothing below them: white, no placeholder text, and no empty panel frames for the tree, details or diff. The card group shows only its header row. This applies to every tab.

## Design reference (values used below)

- **Type.** Arial (`--font-sans`) throughout; monospace `--font-mono` for identifiers, XPaths, JSON and code. Body 16 px, line height 1.62 for prose and 1.5 for interface text, colour `--gs-base-color-gray-100` (#333). Page heading H1 32 px bold, line height 1.15. Headings inside components and regions (panel, card, filter list) 18 px bold, never larger. Captions 13 px; status lines 13 px uppercase with `0.02em` tracking in `--gs-base-color-gray-75`.
- **Links.** `--gs-base-color-eu-blue-100` #0E47CB, underlined; on hover the underline goes, the colour stays. Focus: `2px solid` eu-blue-100 at a 4 px offset, with a `0.015rem` outline radius.
- **Buttons.**
  - Shared: radius 3 px, 2 px border, no shadow, 120 ms colour transition.
  - Size m: 16 px bold, padding `10px 18px`. Size sm: 14 px regular, padding `8px 12px`.
  - Primary: eu-blue-100 fill and border, white text; hover eu-blue-110 #0D40B7; focus outline `2px solid --gs-base-color-link-110` (#0D40B7) at a 2 px offset.
  - Focus rings per variant (the design system's `focus.css`), all `2px solid` at a 2 px offset on `:focus-visible`: primary link-110; secondary and secondary-filled eu-blue-100; tertiary gray-75; ghost `#757575`; `[aria-disabled="true"]` gray-75; anything else link-110. In a toggle group the ring goes on `.btn-check:focus-visible + .btn`: link-110 when the radio is checked, eu-blue-100 when it is not. An `a.btn` takes the button's ring, not the link's.
  - Secondary: transparent fill, eu-blue-100 border and text; hover `--gs-base-color-eu-blue-10` fill.
  - Secondary-filled (a non-selected button in a group): eu-blue-5 fill and border, eu-blue-100 text.
  - Tertiary (Start quick tour): transparent fill, gray-75 border and text; hover gray-10 fill.
  - Ghost: transparent fill and border, eu-blue-100 text, padding `6px 8px`.
  - Disabled: gray-5 fill, gray-30 border and text.
  - Remove Bootstrap's focus `box-shadow` on every control.
- **Form controls.** Height 44 px, 16 px text at line height 1.4, `1px solid --gs-base-color-gray-60` border, radius 4 px, padding `10px 14px` (select `10px 40px 10px 14px`, with Bootstrap's chevron recoloured gray-75, 12 px from the right), white fill; disabled, a gray-5 fill. Focus: a text input `2px solid` eu-blue-100 at a 2 px offset; a select `2px solid` eu-blue-100 at a -1 px offset, over its border. Label above the control: 14 px bold gray-100, 6 px gap; helper text 14 px gray-75, 6 px below. Checkbox: an 18 px box with a 2 px radius (`--gs-base-radius-xs`) and a gray-60 border on white; when checked, an eu-blue-100 border and fill with a 14 px white tick; focus link-110 at a 2 px offset; its label 16 px gray-100, 0.55rem from the box, gray-30 when disabled. The comparison line's two selects (Increments 3 to 9) are the one exception: they take the chip look below.
- **Version chips** (the comparison line).
  - Chip: eu-blue-10 fill, `1px solid eu-blue-20` border, 4 px radius, eu-blue-100 text, padding `5px 10px`, 6 px gap, monospace 14 px bold, line height 1.35, 120 ms colour transition. Hover: eu-blue-20 fill.
  - Inside the chip, before the version, "base:" or "target:" in Arial 14 px regular, `--gs-base-color-eu-gray-80`. After it, `gs-icon-caret-sharp-down-f` (`\e90c`) at 9 px.
  - Menu: white, `1px solid gray-20`, 4 px radius, `--gs-base-shadow-2`, at least 220 px wide, padding `4px 0`, 6 px below the chip and aligned with its left edge.
  - Section headings: 13 px uppercase with `0.02em` tracking, gray-75, padding `8px 14px 2px`. Every section after the first starts with a `1px solid gray-10` rule, 4 px margin and 10 px top padding.
  - Items: 16 px / 1.62, eu-blue-100, no underline, padding `8px 14px`. The current version: eu-blue-10 fill, #333 text, bold.
- **Dialog** (Choose versions…). The TED Modal: a `--gs-base-scrim` backdrop, the dialog at most 600 px wide with a 2 px radius (`--gs-base-radius-xs`) and `--gs-base-shadow-4`. Header on gray-5, padding `24px 24px 16px`, title 18 px bold, close button `gs-icon-close` at 20 px. Body padding 24 px. Buttons right-aligned, 12 px apart: Cancel secondary, Compare primary. Copy exact values from `version-dialog.html`.
- **Tabs.** 16 px, padding `12px 16px`, no borders or backgrounds of their own. Active tab: bold with a `3px solid --gs-base-color-forest-110` bottom border. The list has a `1px solid gray-20` bottom border.
- **Panels and cards.** White, `1px solid gray-20`, radius 8 px, shadow `0 1px 3px 0 rgba(0,0,0,0.2)`, 16 px padding.
- **Notification** (the toast, the fwd/ alert). A `4px` left bar in the status colour (`--gs-base-color-error` or `--gs-base-color-warning`) on the matching surface tint (`error-surface`, `warning-surface`). Padding `14px 16px`, title bold, text 16 px / 1.62, close button gray-75.
- **Loading indicator.** A 20 px ring with a `gray-20` track and a `forest-110` leading arc, rotating. Progress: a 3 px line, `gray-20` track, `forest-110` bar.
- **Breadcrumb.** 14 px; links eu-blue-100 underlined; `gs-icon-chevron-right` separator in gray-75; current item #333.
- **Spacing.** 24 px page gutter, 16 px between panels, 8 px radius on panels. No 20 px step: use 16 or 24.

## Increments

Sizes: S is about half an implementation session, M about one, L about two.

### Increment 1 — design-system files and their loading (S)
Files: `index.html` (head), `src/js/config.js`, `src/js/components/bootstrap-web-component.js`; new `src/assets/ted/ted-theme.css`.
- Create `ted-theme.css` with a header comment and one empty, commented section per later increment (foundation, chrome, home, cards, tree and detail, file diff, states, other tabs).
- In `index.html`, link the stylesheets in this order: Bootstrap, `src/assets/ted/tokens.css`, `src/assets/ted/icons.css`, `src/assets/ted/ted-theme.css`, the existing library sheets (jsTree theme, github-markdown, diff2html), then `src/assets/style.css` last.
- Add `tedIcons` and `tedTheme` to `appConfig.stylesheets`, with paths relative to `index.html` (`./src/assets/ted/icons.css`, `./src/assets/ted/ted-theme.css`).
- `BootstrapWebComponent.requiredCss()` returns Bootstrap, then `tedIcons`, then `tedTheme`; `TreeDetailSplitView` keeps adding the jsTree theme. `tokens.css` is not loaded into the shadow roots: its custom properties inherit, and its `@font-face` belongs in the document.
- Verification: smoke passes with every check. No visible change yet, because the theme is empty. In the inspector, every component's shadow root has the two new links, and `document.fonts` lists `gs-icon`. Neither new sheet starts with `@charset`. With 1.13.0 vs 1.12.0, the Codelists tab loads no slower than before this increment: compare the Performance panel's main-thread time with the previous commit.

### Increment 2 — theme foundation (M)
Files: `ted-theme.css` (foundation section), `src/assets/style.css` (variables).
- Bootstrap 5.3 custom properties on `:root`: `--bs-body-font-family: var(--font-sans)`, `--bs-body-color` and `--bs-heading-color: var(--gs-base-color-gray-100)`, `--bs-link-color` and `--bs-link-hover-color: var(--gs-base-color-eu-blue-100)` (and their `-rgb` variants), `--bs-border-color: var(--gs-base-color-gray-20)`, `--bs-border-radius: var(--gs-base-radius-s)`.
- Links, headings and focus rings as in the design reference.
- Buttons as in the design reference: `.btn-primary`; `.btn-outline-primary` as secondary; `.btn-outline-secondary` and `.btn:disabled` as disabled; `.btn-link` as ghost; `.btn-sm`. Toggle groups: `.btn-check:checked + .btn` is primary, `.btn-check:not(:checked) + .btn` is secondary-filled.
- Form controls: `.form-select`, `.form-control` and `.form-control-sm` get the 44 px TED look, with the `-sm` variants at the same size, as the mockups show. `.form-check-input[type=checkbox]` gets the TED checkbox look.
- `style.css` variables: point `--added-item-background-color`, `--removed-item-background-color` and `--modified-item-background-color` at the three surface tints. Point `--added-item-highlight` and its removed and modified siblings at the same tints, because emphasis now comes from weight and an underline (Increments 6 and 7). Add `--added-marker-color`, `--removed-marker-color` and `--modified-marker-color` (the three strong colours). Remove `--op-green-color`, `--dark-background-color` and `--light-background-color` once nothing uses them.
- Verification: smoke passes with every check. Open the app and check:
  - The text is Arial and #333.
  - Start quick tour, Compare, the selects and the toggle groups look like the mockups.
  - Tabbing through the page shows the TED focus rings and no blue glow.

### Increment 3 — chrome and layout (L)
Files: `index.html` (header, bar, comparison line, tabs, footer), `src/assets/style.css` (layout), `ted-theme.css` (chrome section), `src/js/script.js`.
- **Header:**
  - Replace `<header class="navbar …">` with the TED header. Take the markup from `mockups/home.html`, from the `ted-globan` banner down to the 8 px green divider, and turn its inline styles into `ted-site-header__…` classes in `ted-theme.css`.
  - The header carries no application controls (Decision 3). The two version selects leave it for the comparison line below. "Compare SDK versions", `.version-text` and the CSS arrow (`.comparison-text`) are removed.
  - Images come from `src/assets/ted/img/`. Link the EU logo to https://european-union.europa.eu/index_en and the site name to https://ted.europa.eu.
  - The banner's "How do you know?" button toggles its explanation (`aria-expanded`, Escape closes it): a few lines in `script.js`, in the style of the existing handlers.
  - Below 576 px, show `logo-eu--mobile.svg` through `<picture>`, as the mockup does.
  - The old `ted-logo.png` is no longer used; leave the file alone.
- **Pinned bar.** One row, `position: sticky; top: 0`, white, `1px solid gray-20` bottom border, padding `4px 24px 0`:
  - The existing `ul.nav-tabs` (ids, `li.nav-item`, `button.nav-link` and `d-none` unchanged), restyled as TED tabs, with sentence-case labels. Remove the 20 px spacer `div`.
  - Then `#centralLoadingSpinner` (id, tour step 2 and the `visibility` contract unchanged), restyled as the TED loading indicator: the 20 px ring only, with a visually hidden "Loading" text, so the bar stays one row at 1440 px.
    - Tour step 2's first sentence becomes "A loading indicator will appear here while data is being processed in the background.", since the ring does not flash. The rest of the popover stays. Added by the design session at the user's request.
  - Nothing else: the legend goes to the comparison line, not the bar.
  - The row wraps on narrow screens.
  - The `.progress`/`.progress-bar` pair moves to the bar's bottom edge as the 3 px progress line. Its classes stay, so `tab-controller.js` is unchanged.
- **Comparison line, interim form.** Increment 10 turns the selects into chips and hides the line on Home. Until then it holds today's two selects and is shown on every tab, Home included. Take the layout from `mockups/fields.html` (the `role="group"` element labelled "Versions compared"):
  - One element, `div.ted-comparison-line`, in `main` before the tab panes (`.tab-content`), so that one copy serves every tab. It has `role="group"` and `aria-label` "Versions compared". It is not sticky: it scrolls with the page.
  - Layout: a flex row that wraps, gap `8px 12px`, `padding-bottom: 12px`, a `1px solid gray-10` bottom border, 16 px space below it, 14 px text in gray-75.
  - Contents, in order:
    - the text "Comparing";
    - a visible `<label for="base-version-dropdown">` reading "base:" (14 px, `--gs-base-color-eu-gray-80`), then `#base-version-dropdown`;
    - a 14 px `gs-icon-chevron-right` in gray-75;
    - the label "target:", then `#main-version-dropdown`;
    - a flex spacer;
    - the change legend, moved from the footer: a `ul` labelled "Change markers", with the three markers and "Added", "Removed" and "Modified", 14 px, gap `8px 20px`. Remove the old footer legend and its "Legend:" text.
  - Each select also gets an `aria-label` ("Base version", "Target version"), so its name says what it is. Ids, options, change handlers and hover popovers are unchanged, so the smoke script's `selectOption` calls still work.
  - The selects look like the chips, as far as a `<select>` allows:
    - `width: auto`, `--gs-base-color-eu-blue-10` fill, `1px solid --gs-base-color-eu-blue-20` border, 4 px radius, eu-blue-100 text;
    - monospace 14 px bold, line height 1.35, padding `5px 28px 5px 10px`;
    - Bootstrap's chevron background image, recoloured eu-blue-100, at 10 px, 10 px from the right;
    - hover: eu-blue-20 fill.
  - Wrap "Comparing" through the target select in one `span` and move tour step 0 from `.version-text` to it, with the same `data-bs-*` popover attributes. Move step 3 from `.legend-title` to the legend's `ul`, and change "color coding" in its text to "markers": "The SDK Explorer highlights changed items using the markers you see in this legend."
- **Layout:**
  - Remove the fixed heights and `max-height` rules in `style.css` (`body > header`, `body > nav`, `body > main`, `body > footer`, the `100vh` body). The page scrolls.
  - `main` gets a 24 px gutter and a white background.
  - Add `--ted-bar-height` on `:root`, set from the bar's height by a `ResizeObserver` in `script.js`. The sticky elements of the later increments sit at `top: calc(var(--ted-bar-height) + 16px)`. It is a CSS custom property, so it reaches into the shadow roots.
- **Footer:**
  - Replace the old `<footer>` with the TED footer, taken from `mockups/home.html`'s `<footer>`: the band with the OP lockup and the Need help? / Follow us / Legal / About us / Other services columns, then the europa.eu band.
  - Links as in the mockup. Social links in the mandated order: Mastodon, LinkedIn, Bluesky, Facebook, YouTube, Other.
  - Move `#apiStatus` out of the footer to the end of `body`, unchanged.
- Verification: smoke passes with every check. At 1440 px, compare the header, bar and footer with `home.png`, and the comparison line with the one in `fields.png`; the selects stand in for the chips until Increment 10. At 1024 px and 768 px, check that the bar wraps without overlapping the tabs, that the tabs wrap or scroll inside the bar, and that the legend wraps under the versions. The quick tour still shows four steps on the moved anchors.

### Increment 4 — Home (S)
Files: `index.html` (Home pane), `ted-theme.css` (home section).
- Remove the pre-release `.alert` and the `.jumbotron`.
- **Layout** (`home.html`'s `main`): a flex row that wraps, `justify-content: space-between`, `align-items: flex-start`, gap `32px 48px`, padding `40px 0 64px` inside `main`'s 24 px gutter. The text column stays at the left edge and the side card at the right edge; on a narrow screen the card goes below the text.
- **Text column:** `flex: 1 1 560px`, at most 48rem wide, 24 px between blocks.
  - H1 "eForms SDK Explorer", 12 px above the lead paragraph "Explore and compare different versions of the eForms SDK." (20 px / 1.75).
  - The existing paragraph, 16 px / 1.62.
  - The two comparison buttons come in Increment 10, not here.
- **Side card:** an `aside` labelled by its second heading, `flex: 1 1 320px`, at most 440 px wide, 24 px padding, with the card look (border, 8 px radius, shadow) and 16 px between blocks.
  - First block: "New to the SDK Explorer?" (18 px), the line "The quick tour shows where to choose the versions, how to switch between sections and how changes are marked." (14 px / 1.5), and `#start-tour` (id unchanged), labelled "Start quick tour", as a tertiary sm button. A `1px solid gray-10` rule and 20 px padding close the block.
  - Then "Reading the comparison" (18 px), its paragraph, and the three marker items. Copy the texts from `home.html`.
  - The old sentence "If you are new to the SDK Explorer, take the quick tour." goes: the first block replaces it.
- Until Increment 10, the comparison line, with its legend, still shows above Home. That is expected.
- Verification: smoke passes with every check. Compare with `home.png`, apart from the two buttons and the comparison line above. Start quick tour runs the four steps.

### Increment 5 — card overview (M)
Files: `index.html` (the overview panes of Notice types, Codelists, Schemas, Schematrons, Validation, Translations and View templates: headings and breadcrumbs), `#card-group-template`, `#index-card-template` and `#property-card-template` in `index.html`, `ted-theme.css` (cards section), `src/js/components/index-card.js` (status label).
- **Headings and breadcrumbs:**
  - Each overview gets an H1 with the tab's name ("Notice types", "Codelists", …) in place of the single-item breadcrumb "Overview".
  - The comparison views keep their breadcrumb, restyled as the TED breadcrumb. Its first item reads the tab's name instead of "Overview" (same link ids). The second stays "Comparison"; showing the compared item's name instead, as the mockup does, is optional item O4.
- **Card group header:**
  - The status filter `#status-filter` gets a visible label "Show".
  - The compact-view switch becomes a TED checkbox: `form-check` without `form-switch`, same id and label.
  - Both sit right-aligned on the heading's row.
- **Filter list** `#nav`:
  - A white panel 220–260 px wide, with the existing `#filter-prompt` text as its 18 px heading. Keep the texts: the smoke script reads them; the mockup's "Form type" is illustrative.
  - Items as 14 px links, the active one bold on `--gs-base-color-eu-blue-10`.
  - Sticky at `top: calc(var(--ted-bar-height) + 16px)`.
- **Cards** (`#index-card-template`):
  - The TED card: 8 px radius, gray-20 border, the card shadow.
  - Card header: a status line (marker plus "ADDED", "REMOVED", "MODIFIED" or "UNCHANGED"), the title (18 px bold) and the subtitle (16 px, gray-75), on the status tint. `IndexCard.render()` writes the status label text from `this.status`: the only JavaScript change here.
  - While a card's status is still unknown, its header is gray-5 with no animation: remove the `fadeToWhite` keyframes, because TED motion rules exclude decorative loops.
  - `#action-button` as a secondary sm button, styled in the template; disabled for added and removed as today.
  - Grid: `repeat(auto-fill, minmax(300px, 1fr))`, 16 px gap.
- **Property rows** (`#property-card-template`, card use): label 13 px bold, value monospace 13 px, `1px solid gray-10` dividers.
- Verification: smoke passes with every check. Compare Notice types (1.13.0 vs 1.12.0, form type `cont-modif`) with `notice-types.png`. The status filter and compact view still filter as before.

### Increment 6 — tree and detail (M/L)
Files: `index.html` (Fields toolbar, `#tree-detail-split-view-template`, `#property-card-template`), `ted-theme.css` (tree section), `src/js/components/tree-detail-split-view.js` (one jsTree option).
- **Fields toolbar:** H1 "Fields" on the left. On the right, "Metadata source:" (text kept) and the `#fields-source` toggle group: `btn-check` radios, selected primary, the other secondary-filled.
- **fwd/ alert:** `#fields-source-alert` as a TED warning Notification.
- **Panels:**
  - Structure and Details are two panels side by side, each `flex: 1 1 480px`, and they stack on a narrow screen.
  - Structure panel header: "Structure" (18 px), then the search input with a visible label "Search" (placeholder "Name, ID or property"), then `#tree-filter` with the label "Show". It sticks at `top: var(--ted-bar-height)`. The tree itself has no own scroll.
  - Details panel: sticky at `top: calc(var(--ted-bar-height) + 16px)`, with `max-height: calc(100vh - var(--ted-bar-height) - 32px)`. Its property list scrolls inside only when it is taller.
- **Tree:**
  - Set jsTree's `core.themes.icons: false` (no folder or file icons).
  - Rows 28 px. A node row (`ND-…`) shows the caret and the node id in monospace 13 px.
  - Field rows: the marker (CSS `::before` on `.added-node > a`, `.removed-node > a` and `.modified-node > a`, using the glyph codepoints from `icons.css`, plus the dot) and the label on its tint with a 4 px radius.
  - Selected row: gray-10 background, label bold.
  - These replace today's highlight rules for the `*-node` classes.
- **Details:**
  - Header: "Details" (18 px) and the Compact view checkbox (`form-check`, same id).
  - Below it: `#detail-title` 18 px bold, `#detail-subtitle` monospace 14 px gray-75, and the compact-view note as a 13 px gray-75 line (it is an `.alert` today).
  - Property rows: a two-column grid, 170 px label (14 px bold, with the marker of a changed property) and the value (monospace 13 px).
  - A modified property shows two boxes stacked: "Base" (the error-surface caption strip) above "Target" (the success-surface caption strip), each with a 1 px gray-20 border and a 4 px radius. An added property shows only the Target box, a removed one only the Base box.
  - The captions are static template text. Showing the version numbers is O4.
- Verification: smoke passes with every check. Compare Fields (1.13.0 vs 1.12.0, `fields.json`, the review nodes expanded, `BT-799-ReviewBody` selected, Compact view on) with `fields.png`. The mockup's highlighting inside the values is optional item O1, and its JSON layout O2; do not attempt them here. Search, the Show filter and Compact view behave as before.

### Increment 7 — file diff (M)
Files: `ted-theme.css` (diff section), `src/assets/style.css` (diff2html overrides).
- **diff2html renders in the document**, so these are document-level rules:
  - Lines in monospace 13 px, 22 px high.
  - Line numbers gray-75 on gray-5. Added lines on success-surface, removed on error-surface. `+`/`−` gutter signs in the marker colours.
  - Changed words (`ins`, `del`) bold, with an inset 2 px underline in the marker colour; `del` also struck through.
  - Hunk header lines on eu-blue-5 in gray-75.
  - File header: the file name in monospace 15 px bold. diff2html's change tag shown as a status line (marker plus its text).
- **Base and Target headings:**
  - Above the two sides, "Base" and "Target" headings in 13 px bold on gray-5, as CSS `::before` on the two `.d2h-file-side-diff` columns. The mockup's sticky heading row needs new markup and is not required.
  - Remove `.d2h-code-wrapper`'s `max-height` and inner scroll, so the page is the only vertical scroll. The horizontal scroll and its synchronisation in `diff.js` stay.
- **The diff panel** gets the panel look (border, radius, shadow).
- Verification: smoke passes with every check (`.d2h-file-header .d2h-file-name` unchanged). Compare the Codelists comparison of `notice-subtype_can-modif` (1.13.0 vs 1.12.0) with `codelist-comparison.png`, except the H1 with the codelist name, which is O4.

### Increment 8 — toast, tour and loading states (S/M)
Files: `index.html` (`#apiStatus`), `ted-theme.css` (states section), `src/assets/style.css`.
- **`#apiStatus`** stays fixed at the bottom right (16 px from the edges), at most 420 px wide, with `--gs-base-shadow-2`, styled as a TED error Notification:
  - Remove the header's red `svg`, because the left bar replaces it.
  - "Error" bold; the close button is `btn-close` in gray-75.
  - List items 16 px / 1.62 in #333, `span.detail` in gray-75 (it is red today).
  - Behaviour unchanged.
- **Tour popovers:**
  - White, `1px solid gray-20`, 4 px radius, `--gs-base-shadow-2`, padding 20 px.
  - Title 18 px bold, without Bootstrap's grey header band; body 14 px / 1.5.
  - The tour's Cancel link styled as a ghost button and Next as a primary sm button, through their existing classes (`.cancel-tour`, `.next-step`).
- **The hover popovers** of the selects get the same look.
- Verification: smoke passes with every check (the toast's `li` and `span.detail` unchanged). Compare with `states.png`: force an error, for example by blocking `raw.githubusercontent.com` in the inspector, then run the tour and watch a tab load.

### Increment 9 — remaining tabs, release notes, documentation (S)
Files: `index.html`, `ted-theme.css` (other tabs section), `README.md`, `CHANGELOG.md`.
- **Validation:** H1 "Validation", and "Source:" (text kept) with the `#validation-source` toggle group, styled like Fields.
- **Schemas, Schematrons, Translations, View templates:** the patterns of Increments 5 and 7 apply; check each one.
- **Release notes** (`#release-notes`): the TED typography applies to the Markdown HTML: H1 32, H2 28, H3 24, body 16 / 1.62, links, code in monospace 15 px, text width at most 65rem.
- **README and CHANGELOG:** describe the new look in the README's "Using the SDK Explorer" section if it mentions the old one, and add a CHANGELOG entry.
- Verification: smoke passes with every check. Go through every tab at 1440 px and at 1024 px with 1.13.0 vs 1.12.0 and with a 2.x pair (Validation visible). Nothing is left in the default Bootstrap look.

### Increment 10 — version chips, Home actions and the dialog (M/L)
This is the one increment that changes behaviour (Decision 3): how the user chooses versions, not what a choice does.
Files: `index.html` (comparison line, Home buttons, dialog, tour attributes), `ted-theme.css` (new picker section), new `src/js/version-picker.js`, `src/js/script.js` (start the picker, tour), `scripts/smoke.mjs`.
- **The selects stay, hidden.** `#main-version-dropdown` and `#base-version-dropdown` remain the state holders: `app.js` fills them, reads them, and reloads on their `change` event (the two handlers in `init()`).
  - Hide them with the `hidden` attribute, so that neither the keyboard nor a screen reader reaches them, since the chips replace them. Remove their labels from the comparison line, and remove their hover popovers (`data-bs-*` attributes): a hidden element cannot be hovered, and the dialog's explanations carry the same text.
  - The picker never reloads anything itself. It sets a select's value and triggers `change`, so `app.js` and every tab controller stay unchanged.
- **`src/js/version-picker.js`**, a small class started from `script.js` once `SdkExplorerApplication.init()` has resolved (`script.js` awaits it; today it does not). By then `populateDropdown()` has filled both selects, including an option appended for a version given in the query string, so the picker builds the menus once and never rebuilds them.
  - Sections:
    - Branches: the values in `appConfig.branches`. Target menu only; a branch cannot be a base.
    - Pre-releases: the values whose `SdkVersion.tryParse()` result has `isPreRelease` (`src/js/sdk-version.js`).
    - Releases: the rest.
    - Inside each section, keep the options' order (latest first).
  - It writes the current value into each chip, and marks it in the menu with `.active` and `aria-current="true"`.
  - Choosing an item: if it differs from the select's value, set the value and trigger `change` on that select.
- **Chips and menus.** Use Bootstrap dropdowns, not a new widget: each chip is a `.dropdown` with a `button.dropdown-toggle` and a `.dropdown-menu` with `.dropdown-header`, `.dropdown-divider` and `.dropdown-item` entries.
  - Ids: `#base-version-chip` and `#target-version-chip`.
  - Each `button` keeps the accessible name "Base version" or "Target version". Its visible text is "base:" or "target:" followed by the version.
  - Style them as the design reference's version chips. Replace Bootstrap's caret (`.dropdown-toggle::after`) with `\e90c`.
  - Menus at most 60vh high, scrolling inside when longer.
  - Bootstrap's dropdown supplies the keyboard behaviour: arrow keys move, Escape closes, focus returns to the chip.
- **Home.**
  - Hide the comparison line while Home is active: `main:has(#home-tab-content.active) .ted-comparison-line { display: none; }`. `:has` works in every current browser; no JavaScript is needed.
  - Add the two buttons under the text, in one row 12 px apart, as in `home.html`:
    - Primary "Compare 1.12.0 › 1.13.0", with the selected pair, updated by the picker. It shows the Fields tab: `bootstrap.Tab.getOrCreateInstance(document.querySelector('#fields-tab')).show()`. The user confirmed Fields as the destination (Decision 3).
    - Secondary "Choose versions…", which opens the dialog.
- **The dialog** (`version-dialog.html`): a Bootstrap `.modal` with id `#version-dialog`, styled as the design reference's dialog.
  - Text: "Every tab shows what changed from the base version to the target version."
  - Two `form-select`s in two columns, labelled "Base version" and "Target version". Each has its explanation under it, 13 px gray-75; copy the texts from the mockup. Fill both from the hidden selects each time the dialog opens: same options, same current values.
  - Cancel closes and changes nothing.
  - Compare closes the dialog and applies both choices with one reload:
    - If only one value differs, set it on its hidden select and trigger `change`.
    - If both differ, set the base select's value and `appState.baseVersion` (import `appState` from `src/js/state.js`) without an event. Then set the target select's value and trigger `change` on it. The target's handler reloads once, with both values.
    - Do not trigger both selects: that would start two reloads. `app.js` would drop the first one's results, but only after it had started its requests.
    - If neither differs, only close.
  - Focus goes to the base select when the dialog opens, and back to "Choose versions…" when it closes.
- **Tour.** The tour starts on Home, where the comparison line is now hidden:
  - Step 0 moves to "Choose versions…". Title "Choose the versions to compare". Text: "Compare the suggested versions of the SDK, or choose the ones you want to compare." and the existing paragraph on base and target, as in `states.png`. Placement `bottom`.
  - Step 3 moves from the legend to the side card's marker list ("Reading the comparison"), which is on Home. Text: "The SDK Explorer highlights changed items using these markers. The legend at the top of every tab repeats them." Placement `left`.
  - Steps 1 and 2 are unchanged.
- **Smoke script.** Hidden selects fail Playwright's visibility check, so the two page-object methods that call `page.selectOption` on the version selects, `startSelectingVersion()` and `selectVersions()`, change in this increment.
  - Choose versions the way a user does: click the chip (`#base-version-chip` or `#target-version-chip`), then the menu's `.dropdown-item` with the version's text.
  - Do not pass `force: true` to `selectOption`: the check should exercise the chips.
  - The page-object methods that read the current values and the options from the hidden selects stay.
  - Add checks:
    - the target menu has a Branches section and the base menu has none;
    - choosing an item reloads with the new pair;
    - on Home the comparison line is hidden, and "Compare x › y" shows Fields;
    - the dialog's Compare with two changed values starts exactly one reload. Count the calls to `versionChanged`, or the spinner's hidden-to-visible transitions.
  - Record the new check count in Progress. From this increment on, it is the expected count.
- Verification: the smoke script passes with the new count. Compare Home with `home.png`, the Fields comparison line and open menu with `fields.png`, and the dialog with `version-dialog.png`. Run the tour: step 0 on "Choose versions…", step 3 on the side card. Then choose versions with the keyboard alone: Tab to a chip, Enter, the arrow keys, Enter.

## Optional items (each needs the user's go-ahead; not part of the restyle)

These change behaviour or text, so they stay out of the increments above.
- **O1 — highlight the changed part inside a value.** In the details panel, mark what changed inside a modified value, as `fields.png` shows: in a string (the XPath segment) and in an array (the notice types). Use jsdiff, which is already loaded (`Diff.diffWords` for strings, `Diff.diffArrays` for arrays), in `PropertyCard`.
- **O2 — compact JSON.** In `PropertyCard.#formatPropertyValue`, put each object's top-level keys on their own lines and short arrays inline, as `fields.png` shows, instead of `JSON.stringify(value, null, 2)`.
- **O3 — "Step n of 4"** in the tour popovers (`src/js/script.js`), as `states.png` shows.
- **O4 — mockup texts that need JavaScript:**
  - the version numbers in the Base/Target captions (details panel and diff headings)
  - the compared item's name as the last breadcrumb item and as the comparison H1
  - the field's name as `#detail-title`, with "id · type" as its subtitle

- **O5 — components without Bootstrap.** Proposed by the planning session. Inside their shadow roots the components use Bootstrap only for:
  - cards, list groups, buttons, form controls, the switch, `alert` and `nav`
  - layout utilities: `row`, `col`, `d-flex`, `flex-*`, `h-100`, `m-*`/`p-*`

  Once Increments 5 and 6 have given every one of those elements its TED look, the templates can style them with their own CSS and the tokens alone. Concretely:
  - Replace the utility classes with template rules.
  - Drop the Bootstrap classes from the templates and from `index-card.js` (`btn`, `btn-outline-*`).
  - Remove Bootstrap from `BootstrapWebComponent.requiredCss()`, which would then load only `tedIcons` and `tedTheme`. Rename the class too, since its name would no longer fit; it is imported by the four components.

  This removes the per-shadow-root cost of Bootstrap entirely, and decouples the components from Bootstrap's class names for any later Bootstrap upgrade. The page keeps Bootstrap.
  - Size: M, after Increment 9.
  - Verification: smoke passes with every check, with no selector change, since the shadow-root ids stay. The visual checklist for Fields, Notice types and the comparison views is unchanged against the mockups. With 1.13.0 vs 1.12.0, the Codelists tab's main-thread time is measured before and after, and recorded in Progress.

## Files

- **Add:**
  - `src/assets/ted/ted-theme.css` (Increment 1) and `src/js/version-picker.js` (Increment 10).
  - Already committed: `src/assets/ted/tokens.css`, `icons.css`, `fonts/gs-icon.woff`, `img/*`, and `docs/plans/ted-design/mockups/*`.
- **Modify:**
  - `index.html`, `src/assets/style.css`, `src/js/config.js`, `src/js/components/bootstrap-web-component.js`, `src/js/components/tree-detail-split-view.js` (one jsTree option), `src/js/components/index-card.js` (status label), `src/js/script.js` (banner toggle, `--ted-bar-height`, tour anchors, starting the version picker), `README.md`, `CHANGELOG.md`.
  - `scripts/smoke.mjs` where an increment changes a selector or a text it uses, and in Increment 10.
- **Unchanged:** every tab controller, `app.js`, `state.js`, `diff.js` and `card-group.js`. The version picker only reads `appState` and sets the selects.

## Verification

- **Smoke test.** `npm run smoke` after every increment: every check, with no new console errors. A cloud session cannot reach every service the app uses; use the stand-ins described in the Progress section of `docs/plans/sdk2-support.md` where needed, and say so in Progress.
- **Visual check after every increment.** Run the app (`npx http-server -p 8080 .`, then `http://localhost:8080/?version=1.13.0&base=1.12.0`) and the mockups (`npx http-server docs/plans/ted-design/mockups -p 8081`) side by side at 1440 px. Take a full-page screenshot of the screen the increment touches, in the state the mockup shows, and compare it with the PNG. Each point below is either right or wrong; note in Progress any that is wrong on purpose.
  - **Font:** Arial everywhere, monospace only for identifiers, values and code; text #333.
  - **Header:** EU banner (dark, "An official website of the European Union", "How do you know?"); EU logo row with a light-blue rule; "EU tenders"; the grey chip with the green stripe and "Ted ■ eForms SDK Explorer"; the description; no application controls; the 8 px green divider.
  - **Bar:** one row, about 50 px: the tabs in sentence case, the active one bold with a 3 px green underline; the loading ring after the tabs; nothing else. The bar stays pinned while the page scrolls, and the header scrolls away.
  - **Comparison line:** "Comparing", the base and target versions with the chevron between them, and the legend at the right with three markers, above the work area. It scrolls with the page. Until Increment 10 the versions are the two selects in the chip look, on every tab. From Increment 10 they are the chips with their sectioned menus, and Home has no comparison line.
  - **Home:** a text column at most 48rem wide at the left, the side card at the right edge, no legend. From Increment 10, the "Compare x › y" and "Choose versions…" buttons, and the dialog as in `version-dialog.png`.
  - **Status colours:** green plus, red minus and blue dot markers; tints on tree labels, card headers and diff lines exactly as in the mockups.
  - **Cards:** 8 px radius, border and soft shadow; status line; 18 px title; secondary Compare, greyed when disabled.
  - **Tree and details:** no jsTree folder icons; markers before changed fields; the selected row grey with a bold label; Base above Target in the details.
  - **Diff:** coloured lines, bold underlined changed words, grey line numbers, hunk headers on light blue.
  - **Toast:** bottom right, red left bar on pink, "Error", close button.
  - **Footer:** light-blue bands; the Publications Office lockup; the EU flag; the link columns.
- **Narrow widths.** At 1024 px and 768 px, nothing overlaps, the bar wraps, the panels stack, and the page has no horizontal scroll.

## Session hand-off

The user starts each implementation session from the app on `rousso/eforms-sdk-explorer`, branch `feature/ted-design`, with the opening prompt from `docs/plans/README.md` naming the increment. Suggested grouping:
- Session A: Increments 1 and 2.
- Session B: Increment 3.
- Session C: Increments 4 and 5.
- Session D: Increments 6 and 7.
- Session E: Increments 8 and 9.
- Session F: Increment 10. The user may merge the restyle (Increments 1 to 9) before it, because Increment 10 is the only behaviour change.
- The optional items follow only if the user asks.

Questions about the design go to the design session, and questions about the plan to the planning session, not to the user.

## Progress

- 2026-11-02: the design session committed the plan, the design-system files (`src/assets/ted/`) and the mockups (`docs/plans/ted-design/mockups/`). The user approved the design with the comparison line, the version chips, the Home actions and the dialog (Decisions 3 and 10). Still to confirm: the header names (Decision 2) and Fields as the destination of "Compare x › y" (Decision 3).
- 2026-11-02: the planning session reviewed the plan: smoke counts and selectors aligned with the Bootstrap upgrade (69 checks, no Bootstrap 4 fallbacks, methods named instead of line numbers), Increment 10 states when the picker starts and what happens to the hidden selects' popovers. The branch is based on `develop` before the Bootstrap upgrade; it is rebased onto `develop` once the upgrade is merged, before Increment 1 starts.
- 2026-11-02: the user confirmed the header names (Decision 2) and Fields as the destination of Home's "Compare x › y" (Decision 3). No decision is open.
- 2026-11-02: Increment 1 done (`93bb81c`), as described, no deviation.
  - `index.html` links, in order: Bootstrap, `tokens.css`, `icons.css`, `ted-theme.css`, the jsTree theme, github-markdown, diff2html, `style.css`. `appConfig.stylesheets` has `tedIcons` and `tedTheme`; `BootstrapWebComponent.requiredCss()` returns Bootstrap, `tedIcons`, `tedTheme`, and `TreeDetailSplitView` still appends the jsTree theme. `ted-theme.css` holds a header comment (what loads it, why it stays plain ASCII and small, the allowed literals) and one empty, commented section per later increment: foundation, chrome, home, cards, tree and detail, file diff, states, other tabs. Increment 10 adds its picker section.
  - Checked in the browser (1.13.0 vs 1.12.0): every shadow root has the new links: 277 index cards, 1575 property cards, the 7 card groups and both tree/detail views, the latter also with the jsTree theme. `document.fonts` lists `gs-icon`; it stays `unloaded` until a glyph uses it, since nothing does yet. Neither `icons.css` nor `ted-theme.css` starts with `@charset`. `ted-theme.css` is pure ASCII; `tokens.css` and `icons.css` have em dashes in comments only. No visible change: the two design-system files style only `:root` custom properties (`--gs-base-*`, `--eui-*`, `--font-*`, none of which the app already uses), the `ted-*` type classes and the `gs-icon` classes, and no markup uses those classes yet.
  - Codelists tab, 1.13.0 vs 1.12.0, 277 cards, headless Chromium, served with `max-age=600` as GitHub Pages does. Main-thread time from the tab click, Performance-panel metrics through CDP:
    - previous commit `da6c1c1`, five runs: 8.4–10.4 s, 14.0 s with cold downloads; style recalc 1.1–1.8 s; 3–9 long tasks (0.4–2.3 s); idle after about 10 s.
    - this increment, three runs: 8.5–8.9 s; style recalc 1.5–1.7 s; 6–7 long tasks (0.7–1.0 s); idle after about 10 s; forced layout 2–4 ms.
    - No slower, within the run-to-run spread. The two extra sheets per shadow root are shared like Bootstrap's.
  - Smoke: 69 passed, 2 GitHub API requests (cloud run, with the git-trees stand-in of `docs/plans/sdk2-support.md`'s Progress). A first run had 66: one schematron download through the proxy ended in `ERR_CONNECTION_RESET`, so that card had no status, and two checks and "no console errors" failed with it. The re-run passed all 69.
  - For Increment 2: the theme sections are in place; fill "Foundation". The components already load `icons.css` and `ted-theme.css`, so rules there reach the shadow roots too. Class rules in `ted-theme.css` apply in both the page and every component.
- 2026-11-02: Increment 2 done (`26a7a97`).
  - `ted-theme.css`, foundation section:
    - the Bootstrap variables of the plan on `:root` (`--bs-link-color-rgb` and `--bs-link-hover-color-rgb` are the triplet 14, 71, 203 of eu-blue-100, commented);
    - links (underline off on hover), bold headings with a 32 px / 1.15 `h1`;
    - the focus rings; the buttons (`.btn` m by default, `.btn-sm` and `.btn-group-sm > .btn`, primary, secondary `.btn-outline-primary`, ghost `.btn-link`, disabled `.btn-outline-secondary` / `:disabled`), with the mockups' `inline-flex`, `0.4rem` gap and line height 1.15;
    - the toggle groups (checked primary, the others secondary-filled);
    - the 44 px controls at both sizes, `.form-label`, `.form-text`, and the checkbox.
  - `style.css`: the three background variables and the three highlights point at the surface tints, and `--added-marker-color`, `--removed-marker-color` and `--modified-marker-color` are new.
  - Deviation, decided by the design session: the plan's design reference contradicted the design system in four places. The design session corrected them, and the corrected values are in the design reference above, in the same commit:
    - the focus rings follow `focus.css` per variant: primary link-110, not `#1454B7`; the ghost's `#757575` is now the allowed literal;
    - the checkbox is 18 px with a 2 px radius;
    - the label gap is 6 px;
    - the controls use line height 1.4 and the design system's focus rules, and the select's chevron is recoloured gray-75 12 px from the right.
  - Deviation: `--op-green-color`, `--dark-background-color` and `--light-background-color` stay. The old header in `style.css` and the `#card-group-template` and `#tree-detail-split-view-template` styles in `index.html` still use them; remove each one with the increment that restyles its last user (3, then 5 and 6).
  - Interim looks, expected until later increments:
    - the tree's highlighted labels and diff2html's changed words are now only as strong as their tints (Increments 6 and 7 add weight and the underline);
    - the compact-view switches look like TED checkboxes through rules on `.form-switch .form-check-input` (Bootstrap 5.3 draws the switch from `--bs-form-switch-bg`); those rules can go once Increments 5 and 6 change the markup to a plain `form-check`;
    - `#start-tour` is a primary m button until Increment 4 makes it tertiary sm, which needs its gray-75 ring;
    - Compare is a secondary m button until Increment 5;
    - the two filter selects keep their inline 100 px width, tight for 16 px text, until Increments 5 and 6;
    - Home's heading keeps `.display-4`'s size until Increment 4;
    - the card titles are bold.
  - Checked in the browser, 1.13.0 vs 1.12.0, 1440 px:
    - body Arial, `#333`;
    - Start quick tour primary, Compare secondary, the selects and inputs 44 px with the gray-75 chevron, the source toggle checked primary and the other secondary-filled (14 px);
    - the checkbox 18 px with a 2 px radius and its 16 px label 0.55rem away, unchecked white, checked eu-blue-100 with the tick;
    - tabbing from the tab bar through the Fields tab: the checked radio link-110 at 2 px, the search input eu-blue-100 at 2 px, the select eu-blue-100 at -1 px, tree links eu-blue-100 at 4 px, tabs and the checkbox link-110 at 2 px, no box-shadow anywhere;
    - no console errors.
  - Smoke: 69 passed, twice: before and after the design session's corrections.
  - For Increment 3: the design session added, at the user's request, that tour step 2's first sentence becomes "A loading indicator will appear here while data is being processed in the background." in the commit that restyles the spinner. Add a line about it to Increment 3's spinner bullet. The header's old `style.css` rules are the last users of `--op-green-color` and `--dark-background-color`.
