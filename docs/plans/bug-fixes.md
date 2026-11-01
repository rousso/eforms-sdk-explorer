# Plan: bug-fix pass

## Context

While building the SDK 2 support (`sdk2-support.md`), the planning and implementation sessions recorded defects in code they read but were not asked to change. This plan collects the ones confirmed in the code of branch `claude/zealous-feynman-uuwemi` at commit f990023, so they are fixed before the TED design-system restyle, which touches the same templates and stylesheets. The two open upstream bug reports (OP-TED/eforms-sdk-explorer #56 and #57, Codelists tab) are not part of this plan: they could not be reproduced on this branch (1.16.0-rc.5 vs 1.15.1: 11 modified codelists, exactly the 11 with content changes; the `country` filter shows its 5 codelists), and the user will close them upstream after the merge if that stays so.

Working method, as for the SDK 2 plan: one fresh implementation session (Opus 5.5, effort xhigh) on branch `claude/zealous-feynman-uuwemi`, opened with the prompt in `README.md` of this folder; one commit per item below, in the given order; `npm run smoke` before each push; a dated entry in Progress at the end. Rules: the repository's own style (ES modules, one `TabController` subclass per tab, web components, jQuery and Bootstrap 4), object-oriented clean code, no helper grab-bags, no change beyond the item. Questions go to the planning session, not the user.

## Items

### 1. `CustomError` throws instead of reporting the wrapped error
- File: `src/js/custom-error.js`.
- Symptom: when the second constructor argument is a string or another `CustomError`, the constructor calls `this.formatDetail(...)` inside the `super(...)` expression, before `super()` has run, which throws a `ReferenceError`. Every tab wraps errors this way (`new CustomError(ERROR_GENERATING_OVERVIEW, error)`), so the user gets a script error instead of the message. `AjaxError` inherits the problem for the same inputs.
- Fix: compute the message before calling `super()`; make `formatDetail` a static method (it uses no instance state) and call it as such. Keep the three cases and the resulting messages exactly as intended today.
- Verify: a Node check (throwaway or kept under `scripts/`, the implementer's choice) that constructs `CustomError` and `AjaxError` with a string, a `CustomError`, an `AjaxError`, a jqXHR-like object and `undefined`, and asserts the messages; in the browser, a forced failure in a tab shows the toast with the detail, not a console `ReferenceError`.

### 2. View Templates diff is never cleared
- File: `src/js/tabs/view-templates-tab.js` (`#diffContainer()` returns `#view-templates-diff`), `index.html` (the element is `#view-template-diff`, the id `injectTextDiff` is given).
- Symptom: `deactivated()` and `#switchToOverview()` empty an element that does not exist, so the last diff stays in the DOM (memory) and the diff2html scroll listeners stay attached to it.
- Fix: one id for both, following the other tabs' naming (`#view-templates-diff`); update `index.html` and the `injectTextDiff` call.
- Verify: after Compare and back to Overview, `#view-templates-diff` is empty; smoke check.

### 3. Card-group filter keeps values from the previous comparison
- File: `src/js/components/card-group.js` (`empty()` resets `indexCards` and the container but not `filterValues` or the nav), used by every card tab after a version change.
- Symptom: after changing versions, the left filter column keeps entries from the previous pair (and `appendCard` will not re-add an existing value, so entries can also be missing from the nav after a `dispose()`/`empty()` sequence). `ValidationTab` works around it by calling `dispose()`.
- Fix: `empty()` clears the cards, the filter values and the rendered filter options, and restores the `(all)` selection, so that a tab can rebuild from nothing; keep `dispose()` for releasing the component. Remove the workaround in `ValidationTab` if `empty()` now suffices.
- Verify: Codelists 1.15.1 vs 1.14.2 then 2.0.0-alpha.4 vs 2.0.0-alpha.3: the filter column lists only the second pair's parents; smoke check.

### 4. Error toast replays old messages, and the version-list error loses its detail
- File: `src/js/app.js` (`clearApiStatus()`, `updateApiStatus()`, `populateDropdown()`).
- Symptom: `clearApiStatus()` empties the toast body but not `apiStatusMessage`, so the next error shows the previous messages again until the 15-second timeout resets them. `populateDropdown()` catches every error and reports the fixed text "API call failed to fetch tags." (with a stray second argument), discarding the message `SdkRepository` built (`ERROR_FETCHING_VERSIONS` with the detail).
- Fix: `clearApiStatus()` also resets `apiStatusMessage` and the pending timeout; `populateDropdown()` reports `error.message`.
- Verify: trigger two errors with a tab change between them; the toast shows only the second. Simulate a failing versions request; the toast names the versions list.

### 5. A tab keeps the previous comparison on screen when its load fails
- Files: the tabs' `fetchAndRender*` methods (`src/js/tabs/*.js`), possibly `TabController`.
- Symptom: when fetching or rendering fails (toast shown), the tree or cards of the previous pair stay visible under the new version selection, which reads as if they belonged to it.
- Fix: each tab clears its own content (tree, card group, diff, alerts) before fetching, in `fetchAndRender()`, so a failure leaves an empty pane plus the toast. Do this in the tabs, not with a generic hook, unless a clean override point in `TabController` (e.g. a `clear()` called by `activated()`/`versionChanged()` before `fetchAndRender()`) reads better; decide by what is clearer in the code.
- Verify: select a pair, then force a failure (a version whose file is missing, e.g. fwd mode with a faked 500); the pane is empty and the toast names the file; smoke check for one tab.

### 6. Schematrons overview ignores cancellation
- File: `src/js/tabs/schematrons-tab.js` (`fetchAndRenderOverview`).
- Symptom: the per-card `setTimeout` lacks the `if (!this.aborting)` guard the other card tabs have, so a load abandoned by a tab switch keeps appending cards.
- Fix: add the guard, as in `SchemasTab`.
- Verify: switch away from Schematrons while it loads; no cards appear afterwards (observable in the smoke run by counting cards after a quick switch).

### 7. Component stylesheets drift from the page
- Files: `src/js/components/bootstrap-web-component.js` (`requiredCss()`: Bootstrap 4.5.2 from stackpath.bootstrapcdn.com), `src/js/components/tree-detail-split-view.js` (jsTree theme 3.2.1 from cdnjs), `index.html` (Bootstrap 4.6.2 from jsDelivr, jsTree 3.3.12 from cdnjs).
- Symptom: three CDN hosts and two version pairs for the same libraries; the shadow roots render with an older Bootstrap than the page.
- Fix: one place holds the library URLs (e.g. `appConfig.stylesheets` with `bootstrap` and `jstreeTheme`), used by `index.html` through nothing (it stays static) and by the components; same versions as the page (4.6.2, 3.3.12), same hosts.
- Verify: no stylesheet request to stackpath or to the old versions in the smoke run's request log; the page looks the same.

### 8. `deactivated()` disposes nothing
- File: `src/js/tabs/tab-controller.js` (`$(this.#id).tab('dispose')`).
- Symptom: the selector lacks `#`, so the call matches nothing; disposing the Bootstrap tab was never needed (the tab is re-shown later).
- Fix: remove the call.
- Verify: tabs still switch; smoke run unchanged.

### 9. Property values are injected as HTML
- File: `src/js/components/property-card.js` (`render()` sets `innerHTML` from the property values; `#formatPropertyValue` turns objects into JSON with `<br>` and `&nbsp;`).
- Symptom: an SDK text value containing `<` or `&` is parsed as HTML and can break the card.
- Fix: render text values with `textContent`; keep the formatted-JSON path for objects, but escape the JSON text before inserting the line breaks (or render JSON into a `<pre>`-styled element with `textContent`, which removes the `<br>`/`&nbsp;` replacements). Choose the one that keeps today's look.
- Verify: a property value `a < b & c` renders literally in the details pane; JSON values keep their indentation.

## Verification
- `npm run smoke` after each item; extend `scripts/smoke.mjs` with a check for items 2, 3 and 5 (observable in the browser) and keep the request-log checks for item 7.
- Item 1 is checked in Node as described.

## Progress
- (empty)
