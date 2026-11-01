/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

/**
 * Smoke test of the eForms SDK Explorer.
 *
 * Serves the repository with http-server on a free port, opens the explorer in Chromium through Playwright, collects
 * console errors and checks the behaviour listed under "Verification" in docs/plans/sdk2-support.md.
 *
 * The explorer reads the SDK from GitHub and jsDelivr, so the test needs network access. It spends 2 requests of the
 * unauthenticated GitHub API budget (60 requests per hour) per run: one git trees request per version, the first time
 * the schematrons folder of a pair is listed; the version list comes from jsDelivr, and listings are then kept in the
 * browser.
 *
 * Usage:
 *   npm install
 *   npx playwright install chromium     (once, unless SMOKE_CHROMIUM_EXECUTABLE_PATH is set)
 *   npm run smoke
 *
 * Environment:
 *   SMOKE_CHROMIUM_EXECUTABLE_PATH  Chromium executable to use instead of the one installed by Playwright.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import httpServer from 'http-server';
import { chromium } from 'playwright';

/**
 * Serves a folder over HTTP on a free local port.
 */
class ExplorerServer {

    /** @type {string} */
    #root;

    /** @type {httpServer.HttpServer} */
    #server = null;

    /**
     * @param {string} root The folder to serve.
     */
    constructor(root) {
        this.#root = root;
    }

    /**
     * @returns {Promise<string>} The URL the folder is served at.
     */
    async start() {
        this.#server = httpServer.createServer({ root: this.#root, cache: -1 });
        await new Promise(resolve => this.#server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${this.#server.server.address().port}`;
    }

    stop() {
        this.#server?.close();
    }
}

/**
 * The explorer opened in a browser page: opens it with a query string and reads what it shows.
 */
class ExplorerPage {

    /** How long to wait for the explorer to fill the version dropdowns, in milliseconds. */
    static #LOAD_TIMEOUT = 60000;

    /**
     * How long to wait for the explorer to finish what it is doing, in milliseconds.
     * Long, because the index cards of the schematrons check hundreds of files in the background.
     */
    static #IDLE_TIMEOUT = 600000;

    /** How long the loading indicator must stay hidden for the explorer to count as idle, in milliseconds. */
    static #IDLE_PERIOD = 500;

    /** How long a card group takes to apply a selected filter (it does so in a timeout), in milliseconds. */
    static #FILTER_PERIOD = 200;

    /**
     * Files that the explorer requests to find out whether a version has them: for these, the browser's "404" console
     * error is expected and is not collected.
     */
    static #FILES_PROBED_FOR_PRESENCE = Object.freeze([
        /\/validation\/[^/]+$/,
        /\/fields\/fwd\/(nodes|business-entity-hierarchy|business-entity-properties|data-types)\.json$/,
        /\/view-templates\/summary\.efx$/
    ]);

    /** The prefix of the URLs of the GitHub API. */
    static #GITHUB_API = 'https://api.github.com/';

    /** @type {import('playwright').Page} */
    #page;

    /** @type {string[]} The URLs of the GitHub API requests made since the page was created. */
    #githubApiRequests = [];

    /** @type {Set<string>} The URLs of the requests that the test made fail on purpose (see {@link failRequestsDuring}). */
    #deliberatelyFailedUrls = new Set();

    /** @type {string[]} The URLs of the stylesheets requested since the page was created, by the page and by its web components. */
    #stylesheetRequests = [];

    /** @type {string} */
    #baseUrl;

    /** @type {string[]} */
    #consoleErrors = [];

    /**
     * @param {import('playwright').Page} page
     * @param {string} baseUrl The URL the explorer is served at.
     */
    constructor(page, baseUrl) {
        this.#page = page;
        this.#baseUrl = baseUrl;
        this.#page.on('console', message => {
            if (message.type() === 'error' && !ExplorerPage.#isExpectedAbsence(message) && !this.#deliberatelyFailedUrls.has(message.location().url)) {
                const url = message.location().url;
                this.#consoleErrors.push(url ? `${message.text()} (${url})` : message.text());
            }
        });
        this.#page.on('pageerror', error => this.#consoleErrors.push(error.message));
        this.#page.on('request', request => {
            if (request.url().startsWith(ExplorerPage.#GITHUB_API)) {
                this.#githubApiRequests.push(request.url());
            }
            if (request.resourceType() === 'stylesheet') {
                this.#stylesheetRequests.push(request.url());
            }
        });
    }

    /**
     * @returns {string[]} The URLs of the stylesheets requested since the page was created, across page loads.
     */
    get stylesheetRequests() {
        return [...this.#stylesheetRequests];
    }

    /**
     * @returns {Promise<string[]>} The URLs of the stylesheets that index.html links into the page.
     */
    async pageStylesheets() {
        return this.#page.$$eval('head link[rel="stylesheet"]', links => links.map(link => link.href));
    }

    /**
     * @returns {string[]} The URLs of the GitHub API requests made since the page was created, across page loads.
     */
    get githubApiRequests() {
        return [...this.#githubApiRequests];
    }

    /**
     * @returns {string[]} The console errors logged since the explorer was last opened.
     */
    get consoleErrors() {
        return [...this.#consoleErrors];
    }

    /**
     * Opens the explorer and waits until it has filled the version dropdowns and decided which tabs to show.
     *
     * @param {string} queryString For example `?version=efx-2`, or an empty string.
     */
    async open(queryString) {
        this.#consoleErrors = [];
        await this.openWithoutWaiting(queryString);
        await this.waitUntilIdle();
        const apiStatus = await this.apiStatus();
        if (apiStatus !== '') {
            throw new Error(`the explorer reported: ${apiStatus}`);
        }
    }

    /**
     * Loads the explorer and waits only until it has filled the version dropdowns, not until it has decided which
     * tabs to show. The console errors collected so far are kept.
     *
     * @param {string} queryString
     */
    async openWithoutWaiting(queryString) {
        await this.#page.goto(`${this.#baseUrl}/${queryString}`);
        await this.#page.waitForFunction(
            () => document.querySelector('#main-version-dropdown').value !== ''
                || document.querySelector('#apiStatus .toast-body').textContent.trim() !== '',
            null,
            { timeout: ExplorerPage.#LOAD_TIMEOUT });
    }

    /**
     * Selects a version in one of the dropdowns, as a user would, without waiting for the explorer to be idle.
     *
     * @param {'main'|'base'} dropdown
     * @param {string} version
     */
    async startSelectingVersion(dropdown, version) {
        await this.#page.selectOption(`#${dropdown}-version-dropdown`, version);
    }

    /**
     * @returns {Promise<{mainVersion: string, baseVersion: string}>} The versions the explorer works with (its appState).
     */
    async appState() {
        return this.#page.evaluate(async () => {
            const { appState } = await import('/src/js/state.js');
            return { mainVersion: appState.mainVersion, baseVersion: appState.baseVersion };
        });
    }

    /**
     * Waits until the button of a tab is shown in the tab bar, for at most the given time.
     *
     * @param {string} tabId
     * @param {number} timeout In milliseconds.
     * @returns {Promise<boolean>} Whether it was shown in time.
     */
    async waitForTabShown(tabId, timeout) {
        return this.#page.waitForSelector(`#${tabId}`, { state: 'visible', timeout }).then(() => true, () => false);
    }

    /**
     * Holds the responses to the requests matching a URL pattern until they are released, so that they arrive late.
     *
     * @param {string} urlPattern A Playwright URL glob, as for page.route().
     * @returns {Promise<{requested: Promise<void>, release: (failStatus?: number) => Promise<void>}>} `requested`
     *          resolves when a matching request is being held; `release` lets the held requests go on (or fail with
     *          the given HTTP status, whose console errors are then not collected) and stops holding new ones.
     */
    async holdRequests(urlPattern) {
        let release;
        const released = new Promise(resolve => { release = resolve; });
        let requested;
        const firstRequest = new Promise(resolve => { requested = resolve; });
        const heldRequests = [];
        const hold = route => {
            requested();
            const answer = failStatus => {
                if (!failStatus) {
                    return route.continue();
                }
                this.#deliberatelyFailedUrls.add(route.request().url());
                return route.fulfill({ status: failStatus, contentType: 'text/plain', body: 'Failed on purpose by the smoke test' });
            };
            // A held request that the page aborted meanwhile cannot go on, which is fine.
            const continued = released.then(answer).catch(() => {});
            heldRequests.push(continued);
            return continued;
        };
        await this.#page.route(urlPattern, hold);
        return {
            requested: firstRequest,
            release: async failStatus => {
                release(failStatus);
                await Promise.all(heldRequests);
                await this.#page.unroute(urlPattern, hold);
            }
        };
    }

    /**
     * Arranges for a version to be selected right after the requests whose URLs end with the given suffixes have
     * all completed, in the same task: before jQuery hands their responses over (it does so in a later task).
     *
     * @param {string[]} urlSuffixes
     * @param {'main'|'base'} dropdown
     * @param {string} version
     */
    async selectVersionWhenRequestsComplete(urlSuffixes, dropdown, version) {
        await this.#actWhenRequestsComplete(urlSuffixes, { selectVersion: { dropdown, version } });
    }

    /**
     * Arranges for a tab to be activated right after the requests whose URLs end with the given suffixes have all
     * completed, in the same task, the way the tab-switch event does it.
     *
     * @param {string[]} urlSuffixes
     * @param {string} tabId
     */
    async openTabWhenRequestsComplete(urlSuffixes, tabId) {
        await this.#actWhenRequestsComplete(urlSuffixes, { openTab: tabId });
    }

    /**
     * Watches the page's XMLHttpRequests and, when the last of the given ones fires "loadend", does the given action
     * synchronously, then stops watching.
     *
     * @param {string[]} urlSuffixes
     * @param {{selectVersion?: {dropdown: string, version: string}, openTab?: string}} action
     */
    async #actWhenRequestsComplete(urlSuffixes, action) {
        await this.#page.evaluate(async ([suffixes, todo]) => {
            const { SdkExplorerApplication } = await import('/src/js/app.js');
            const pending = new Set(suffixes);
            const { open, send } = XMLHttpRequest.prototype;
            const act = () => {
                if (todo.selectVersion) {
                    $(`#${todo.selectVersion.dropdown}-version-dropdown`).val(todo.selectVersion.version).trigger('change');
                } else {
                    $(`#${todo.openTab}`).tab('show');
                    SdkExplorerApplication.instance.activeTabChanged(todo.openTab);
                }
            };
            XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this.smokeTestUrl = String(url);
                return open.call(this, method, url, ...rest);
            };
            XMLHttpRequest.prototype.send = function (...args) {
                const suffix = suffixes.find(candidate => this.smokeTestUrl?.endsWith(candidate));
                if (suffix) {
                    this.addEventListener('loadend', () => {
                        pending.delete(suffix);
                        if (pending.size === 0) {
                            XMLHttpRequest.prototype.open = open;
                            XMLHttpRequest.prototype.send = send;
                            act();
                        }
                    });
                }
                return send.apply(this, args);
            };
        }, [urlSuffixes, action]);
    }

    /**
     * Starts counting the tree-nodes that jsTree adds to the tree of a tree-detail-split-view from now on.
     *
     * @param {string} splitViewId
     */
    async startCountingTreeNodes(splitViewId) {
        await this.#page.evaluate(id => {
            const treeView = document.getElementById(id).shadowRoot.querySelector('#treeView');
            window.smokeTestAddedTreeNodes = 0;
            new MutationObserver(records => {
                records.forEach(record => record.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        window.smokeTestAddedTreeNodes += (node.matches('li') ? 1 : 0) + node.querySelectorAll('li').length;
                    }
                }));
            }).observe(treeView, { childList: true, subtree: true });
        }, splitViewId);
    }

    /**
     * @returns {Promise<number>} The tree-nodes added since {@link startCountingTreeNodes}.
     */
    async countedTreeNodes() {
        return this.#page.evaluate(() => window.smokeTestAddedTreeNodes);
    }

    /**
     * Waits for the given time, so that work the page would do late has had the time to happen.
     *
     * @param {number} milliseconds
     */
    async waitFor(milliseconds) {
        await this.#page.waitForTimeout(milliseconds);
    }

    /**
     * Arranges for a version to be selected as soon as the first card is added to a card group, while the rest of
     * the cards of that load are still to come, as a user who changes the version just as the cards appear.
     *
     * @param {string} cardGroupId
     * @param {'main'|'base'} dropdown
     * @param {string} version
     */
    async selectVersionWhenFirstCardAppears(cardGroupId, dropdown, version) {
        await this.#page.evaluate(([id, which, value]) => {
            const container = document.getElementById(id).shadowRoot.querySelector('#cards-container');
            const observer = new MutationObserver(() => {
                observer.disconnect();
                $(`#${which}-version-dropdown`).val(value).trigger('change');
            });
            observer.observe(container, { childList: true });
        }, [cardGroupId, dropdown, version]);
    }

    /**
     * Selects two other versions, the target version first, as a user would, and waits until the explorer is idle.
     *
     * @param {string} mainVersion
     * @param {string} baseVersion
     */
    async selectVersions(mainVersion, baseVersion) {
        await this.#page.selectOption('#main-version-dropdown', mainVersion);
        await this.waitUntilIdle();
        await this.#page.selectOption('#base-version-dropdown', baseVersion);
        await this.waitUntilIdle();
    }

    /**
     * @param {string} tabId The id of the button of the tab, for example `validation-tab`.
     * @returns {Promise<boolean>} Whether the button of the tab is shown in the tab bar.
     */
    async isTabShown(tabId) {
        return this.#page.isVisible(`#${tabId}`);
    }

    /**
     * @returns {Promise<string>} The id of the button of the active tab.
     */
    async activeTab() {
        return this.#page.$eval('ul.nav-tabs button.nav-link.active', button => button.id);
    }

    /**
     * Opens a tab by clicking its button and waits until the explorer is idle.
     *
     * @param {string} tabId The id of the button of the tab.
     */
    async openTab(tabId) {
        await this.#page.click(`#${tabId}`);
        await this.waitUntilIdle();
    }

    /**
     * Opens a tab that is hidden for the selected versions, through Bootstrap, to compare it with another tab.
     *
     * @param {string} tabId The id of the button of the tab.
     */
    async openHiddenTab(tabId) {
        await this.#page.evaluate(id => $(`#${id}`).tab('show'), tabId);
        await this.waitUntilIdle();
    }

    /**
     * Selects a source in the source selector of the Validation tab and waits until the explorer is idle.
     *
     * @param {string} source The value of the option, for example `schematron`.
     */
    async selectValidationSource(source) {
        await this.#clickToggleButton('validation-source', source);
    }

    /**
     * Selects a source in the metadata source selector of the Fields tab and waits until the explorer is idle.
     *
     * @param {string} source The value of the option, for example `fwd`.
     */
    async selectFieldsSource(source) {
        await this.#clickToggleButton('fields-source', source);
    }

    /**
     * @param {string} groupId The id of a toggle button group of radio inputs.
     * @returns {Promise<{checked: string, active: string[]}>} The value of the checked radio input, and the values of
     *          the radio inputs whose button shows the active state.
     */
    async selectedToggleButton(groupId) {
        return this.#page.$eval(`#${groupId}`, group => ({
            checked: group.querySelector('input[type="radio"]:checked')?.value,
            active: Array.from(group.querySelectorAll('label.active input[type="radio"]'), input => input.value)
        }));
    }

    /**
     * Clicks the button of a toggle button group that holds the radio input with the given value, as a user would,
     * and waits until the explorer is idle.
     *
     * @param {string} groupId
     * @param {string} value
     */
    async #clickToggleButton(groupId, value) {
        await this.#page.click(`#${groupId} label:has(input[value="${value}"])`);
        await this.waitUntilIdle();
    }

    /**
     * Reads the tree of a tree-detail-split-view, once jsTree has finished loading it.
     *
     * @param {string} splitViewId
     * @returns {Promise<Array<{id: string, parent: string, text: string, folder: boolean, status: string}>>}
     *          The tree-nodes; the status is the type of change of the item ('root' for a heading).
     */
    async treeNodes(splitViewId) {
        const readTree = id => {
            const tree = $(document.getElementById(id).shadowRoot.querySelector('#treeView')).jstree(true);
            return tree && !tree.is_loading('#') ? tree.get_json('#', { flat: true }).map(node => ({
                id: node.id,
                parent: node.parent,
                text: node.text,
                folder: node.icon === 'jstree-folder',
                status: (node.li_attr?.class ?? '').replace(/-node$/, '')
            })) : null;
        };
        // jsTree loads large trees in the background: wait until the tree has nodes and stops growing.
        let nodes = null;
        let previousLength = -1;
        do {
            await this.#page.waitForTimeout(ExplorerPage.#IDLE_PERIOD);
            previousLength = nodes?.length ?? -1;
            nodes = await this.#page.evaluate(readTree, splitViewId);
        } while (!nodes || nodes.length === 0 || nodes.length !== previousLength);
        return nodes;
    }

    /**
     * Runs an action while the requests matching a URL pattern fail with an HTTP 500, to see how the explorer reports
     * a failed load. The browser's console errors for these requests are not collected.
     *
     * @param {string} urlPattern A Playwright URL glob, as for page.route().
     * @param {() => Promise<void>} action
     * @param {string} [body] The body of the failed responses.
     */
    async failRequestsDuring(urlPattern, action, body = 'Failed on purpose by the smoke test') {
        const fail = route => {
            this.#deliberatelyFailedUrls.add(route.request().url());
            return route.fulfill({ status: 500, contentType: 'text/html', body: body });
        };
        await this.#page.route(urlPattern, fail);
        try {
            await action();
        } finally {
            await this.#page.unroute(urlPattern, fail);
        }
    }

    /**
     * Runs an action while the JSON responses to the requests matching a URL pattern are rewritten, to see how the
     * explorer shows content that the SDK could contain.
     *
     * @param {string} urlPattern A Playwright URL glob, as for page.route().
     * @param {function(Object): Object} rewrite Gets the parsed response and returns the content to answer with.
     * @param {() => Promise<void>} action
     */
    async rewriteJsonDuring(urlPattern, rewrite, action) {
        const rewriteResponse = async route => {
            const response = await route.fetch();
            await route.fulfill({ response, json: rewrite(await response.json()) });
        };
        await this.#page.route(urlPattern, rewriteResponse);
        try {
            await action();
        } finally {
            await this.#page.unroute(urlPattern, rewriteResponse);
        }
    }

    /**
     * @param {string} splitViewId
     * @param {string} nodeId
     * @returns {Promise<{text: string, elements: string[]}>} The text of a tree-node's label, and the elements in it
     *          other than jsTree's icon.
     */
    async treeLabel(splitViewId, nodeId) {
        await this.treeNodes(splitViewId);
        return this.#page.$eval(`#${splitViewId}`, (splitView, id) => {
            const anchor = splitView.shadowRoot.getElementById(`${id}_anchor`);
            return {
                text: anchor.textContent.trim(),
                elements: Array.from(anchor.querySelectorAll('*')).filter(element => !element.classList.contains('jstree-icon')).map(element => element.tagName)
            };
        }, nodeId);
    }

    /**
     * @param {string} splitViewId
     * @returns {Promise<boolean>} Whether the tree of a tree-detail-split-view has any node.
     */
    async hasTree(splitViewId) {
        return this.#page.evaluate(id => {
            const tree = $(document.getElementById(id).shadowRoot.querySelector('#treeView')).jstree(true);
            return Boolean(tree) && tree.get_json('#', { flat: true }).length > 0;
        }, splitViewId);
    }

    /**
     * @param {string} selector
     * @returns {Promise<string|null>} The text of the element, or null if it is hidden.
     */
    async shownText(selector) {
        return (await this.#page.isVisible(selector)) ? (await this.#page.innerText(selector)).trim() : null;
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<Array<{title: string, subtitle: string, status: string, compareEnabled: boolean}>>}
     *          The index cards of the card group, in display order.
     */
    async indexCards(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => Array.from(cardGroup.shadowRoot.querySelectorAll('index-card'), card => ({
            title: card.getAttribute('title'),
            subtitle: card.getAttribute('subtitle'),
            status: card.getAttribute('status'),
            compareEnabled: !card.shadowRoot.querySelector('#action-button').disabled
        })));
    }

    /**
     * Clicks the button of a tab and returns without waiting for the tab to finish loading.
     *
     * @param {string} tabId The id of the button of the tab.
     */
    async startOpeningTab(tabId) {
        await this.#page.click(`#${tabId}`);
    }

    /**
     * Waits until a card group has at least the given number of cards (while its tab may still be loading).
     *
     * @param {string} cardGroupId
     * @param {number} count
     */
    async waitForCards(cardGroupId, count) {
        await this.#page.waitForFunction(([id, minimum]) => document.getElementById(id).shadowRoot.querySelectorAll('index-card').length >= minimum,
            [cardGroupId, count], { timeout: ExplorerPage.#LOAD_TIMEOUT });
    }

    /**
     * Waits until the property filter of a card group offers the given value (while its tab may still be loading).
     *
     * @param {string} cardGroupId
     * @param {string} value
     */
    async waitForFilterValue(cardGroupId, value) {
        await this.#page.waitForFunction(([id, filterValue]) => Array.from(document.getElementById(id).shadowRoot.querySelectorAll('#filter-options .nav-link'))
            .some(link => link.textContent === filterValue), [cardGroupId, value], { timeout: ExplorerPage.#LOAD_TIMEOUT });
    }

    /**
     * Clicks a value of the property filter of a card group, without waiting for the explorer to be idle.
     *
     * @param {string} cardGroupId
     * @param {string} value
     */
    async clickFilterValue(cardGroupId, value) {
        await this.#page.click(`#${cardGroupId} #filter-options .nav-link:text-is("${value}")`);
        await this.#page.waitForTimeout(ExplorerPage.#FILTER_PERIOD);
    }

    /**
     * Selects a status in the status filter of a card group, without waiting for the explorer to be idle.
     *
     * @param {string} cardGroupId
     * @param {string} status For example `modified`.
     */
    async selectStatusFilter(cardGroupId, status) {
        await this.#page.selectOption(`#${cardGroupId} #status-filter`, status);
        await this.#page.waitForTimeout(ExplorerPage.#FILTER_PERIOD);
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<string>} The status shown in the status filter of a card group.
     */
    async selectedStatusFilter(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => cardGroup.shadowRoot.querySelector('#status-filter').value);
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<Array<{title: string, subtitle: string, status: string|null, visible: boolean}>>}
     *          The index cards of the card group at this moment, with whether the filters show them.
     */
    async cardStates(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => Array.from(cardGroup.shadowRoot.querySelectorAll('index-card'), card => ({
            title: card.getAttribute('title'),
            subtitle: card.getAttribute('subtitle'),
            status: card.getAttribute('status'),
            visible: getComputedStyle(card).display !== 'none'
        })));
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<{shown: boolean, prompt: string, values: string[]}>} The property filter of the card group.
     */
    async cardFilter(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => ({
            shown: getComputedStyle(cardGroup.shadowRoot.querySelector('#nav')).display !== 'none',
            prompt: cardGroup.shadowRoot.querySelector('#filter-prompt').textContent,
            values: Array.from(cardGroup.shadowRoot.querySelectorAll('#filter-options .nav-link'), link => link.textContent)
        }));
    }

    /**
     * Clicks the Compare button of an index card and waits until the explorer is idle.
     *
     * @param {string} cardGroupId
     * @param {string} title The title of the index card.
     */
    async compare(cardGroupId, title) {
        await this.#page.click(`#${cardGroupId} index-card[title="${title}"] #action-button`);
        await this.waitUntilIdle();
    }

    /**
     * Clicks the Overview link of a diff view and waits until the explorer is idle.
     *
     * @param {string} linkId
     */
    async openOverview(linkId) {
        await this.#page.click(`#${linkId}`);
        await this.waitUntilIdle();
    }

    /**
     * @param {string} selector
     * @returns {Promise<boolean>} Whether the element is shown.
     */
    async isShown(selector) {
        return this.#page.isVisible(selector);
    }

    /**
     * @param {string} selector
     * @returns {Promise<boolean>} Whether the element has no content.
     */
    async isEmpty(selector) {
        return this.#page.$eval(selector, element => element.childNodes.length === 0);
    }

    /**
     * @param {string} diffContainerId
     * @returns {Promise<string[]>} The names of the files compared in the diff view.
     */
    async comparedFiles(diffContainerId) {
        return this.#page.$$eval(`#${diffContainerId} .d2h-file-header .d2h-file-name`, names => names.map(name => name.textContent.trim()));
    }

    /**
     * Waits until the loading indicator of the explorer stays hidden for a while.
     */
    async waitUntilIdle() {
        const loadingIndicatorHidden = () => getComputedStyle(document.querySelector('#centralLoadingSpinner')).visibility === 'hidden';
        do {
            await this.#page.waitForFunction(loadingIndicatorHidden, null, { timeout: ExplorerPage.#IDLE_TIMEOUT });
            await this.#page.waitForTimeout(ExplorerPage.#IDLE_PERIOD);
        } while (!(await this.#page.evaluate(loadingIndicatorHidden)));
    }

    /**
     * @param {import('playwright').ConsoleMessage} message
     * @returns {boolean} Whether the message is the browser's report of a 404 for a file probed for presence.
     */
    static #isExpectedAbsence(message) {
        return message.text().includes('status of 404')
            && ExplorerPage.#FILES_PROBED_FOR_PRESENCE.some(pattern => pattern.test(message.location().url ?? ''));
    }

    /**
     * @returns {Promise<Array<{message: string, detail: string|null, elements: string[], detailStyle: {color: string, display: string}|null}>>}
     *          The items of the error toast: the text of the message, the text of the detail line, the elements in the
     *          item other than the detail line, and the detail line's colour and display.
     */
    async toastItems() {
        return this.#page.$$eval('#apiStatus .toast-body li', items => items.map(item => {
            const detail = item.querySelector(':scope > .detail');
            const style = detail ? getComputedStyle(detail) : null;
            return {
                message: Array.from(item.childNodes).filter(node => node !== detail).map(node => node.textContent).join(''),
                detail: detail ? detail.textContent : null,
                elements: Array.from(item.querySelectorAll('*')).filter(element => element !== detail).map(element => element.tagName),
                detailStyle: style ? { color: style.color, display: style.display } : null
            };
        }));
    }

    /**
     * @returns {Promise<boolean>} Whether a script injected through the page set the given global variable.
     * @param {string} name
     */
    async globalIsSet(name) {
        return this.#page.evaluate(variable => window[variable] !== undefined, name);
    }

    /**
     * @returns {Promise<string>} The text of the error toast, empty if there is none.
     */
    async apiStatus() {
        return (await this.#page.textContent('#apiStatus .toast-body')).trim();
    }

    /** @returns {Promise<string>} */
    async mainVersion() {
        return this.#page.inputValue('#main-version-dropdown');
    }

    /** @returns {Promise<string>} */
    async baseVersion() {
        return this.#page.inputValue('#base-version-dropdown');
    }

    /** @returns {Promise<string[]>} The options of the target version dropdown, in display order. */
    async mainVersionOptions() {
        return this.#page.$$eval('#main-version-dropdown option', options => options.map(option => option.value));
    }

    /** @returns {Promise<string[]>} The options of the base version dropdown, in display order. */
    async baseVersionOptions() {
        return this.#page.$$eval('#base-version-dropdown option', options => options.map(option => option.value));
    }
}

/**
 * The checks of the smoke test, grouped by the explorer URL they need, so that each URL is loaded once.
 */
class SmokeTest {

    /**
     * Runs of consecutive versions that the version dropdowns list in this order, latest first.
     * They name real tags of the SDK and hold as long as these tags are listed: the 1.16.0 pre-releases are listed
     * until a release later than 1.16.0 exists.
     */
    static #EXPECTED_VERSION_RUNS = Object.freeze([
        ['2.0.0-alpha.4', '2.0.0-alpha.3', '2.0.0-alpha.2', '2.0.0-alpha.1'],
        ['1.16.0-rc.5', '1.16.0-rc.4', '1.16.0-rc.3', '1.16.0-rc.2', '1.16.0-rc.1',
            '1.16.0-beta.3', '1.16.0-beta.2', '1.16.0-beta.1', '1.15.1'],
    ]);

    /** The roots of the tree of the Fields tab in fwd/ mode. */
    static #FORWARD_COMPATIBLE_ROOTS = Object.freeze(['XML structure', 'Business entities', 'Data types']);

    /** The files of the validation folder of an SDK 2 version, in the order of their index cards. */
    static #VALIDATION_FILES = Object.freeze(['rules.efx', 'stage-1a.efx', 'stage-4m.efx', 'stage-5m.efx', 'dependencies.json']);

    /** @type {ExplorerPage} */
    #explorer;

    /** @type {number} */
    #passed = 0;

    /** @type {number} */
    #failed = 0;

    /**
     * @param {ExplorerPage} explorer
     */
    constructor(explorer) {
        this.#explorer = explorer;
    }

    /**
     * Runs all checks and reports each of them on the console.
     *
     * @returns {Promise<number>} The number of failed checks.
     */
    async run() {
        await this.#checkPairFromQueryString();
        await this.#checkDefaultBaseWithoutPreviousMinor();
        await this.#checkBranchAsTarget();
        await this.#checkPairWithoutRules();
        await this.#checkPairWithRules();
        await this.#checkPairWithPartialForwardCompatibleMetadata();
        await this.#checkFilterAfterVersionChange();
        await this.#checkCodelistsAcrossRenames();
        await this.#checkFiltersWhileLoading();
        console.log(`\n${this.#passed} passed, ${this.#failed} failed; ${this.#explorer.githubApiRequests.length} GitHub API requests`);
        return this.#failed;
    }

    /** A target with EFX rules and a base without. */
    async #checkPairFromQueryString() {
        await this.#scenario('?version=2.0.0-alpha.4&base=1.16.0-rc.5', [
            ['both versions are taken from the query string', async () => {
                assert.equal(await this.#explorer.mainVersion(), '2.0.0-alpha.4');
                assert.equal(await this.#explorer.baseVersion(), '1.16.0-rc.5');
            }],
            ['the target dropdown offers the branches develop and efx-2 at the top', async () => {
                assert.deepEqual((await this.#explorer.mainVersionOptions()).slice(0, 2), ['develop', 'efx-2']);
            }],
            ['both dropdowns list the versions in version order (2.0.0-alpha.4 … 2.0.0-alpha.1 … 1.16.0-rc.5 … 1.16.0-beta.1, 1.15.1)', async () => {
                SmokeTest.#assertVersionOrder(await this.#explorer.mainVersionOptions());
                SmokeTest.#assertVersionOrder(await this.#explorer.baseVersionOptions());
            }],
            ['the releases beyond the first page of tags (1.10.0 to 1.10.2) are listed', async () => {
                const options = await this.#explorer.baseVersionOptions();
                ['1.10.0', '1.10.1', '1.10.2'].forEach(version => assert.ok(options.includes(version), `${version} is missing`));
            }],
            ['the Validation tab is shown and the Schematrons tab is hidden', async () => {
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
            ['the Fields tab in fwd/ mode names 1.16.0-rc.5 as having no forward-compatible metadata and shows every item as added', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#explorer.selectFieldsSource('fwd');
                assert.deepEqual(await this.#explorer.selectedToggleButton('fields-source'), { checked: 'fwd', active: ['fwd'] });
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), 'SDK 1.16.0-rc.5 has no forward-compatible metadata (fields/fwd/).');
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                assert.deepEqual(nodes.filter(node => node.parent === '#').map(node => node.text), SmokeTest.#FORWARD_COMPATIBLE_ROOTS);
                assert.deepEqual(nodes.filter(node => node.parent !== '#' && node.status !== 'added'), []);
            }],
            ['the View Templates tab lists summary.efx, which view-templates.json does not list, as added', async () => {
                await this.#assertViewTemplateStatus('summary.efx', 'added');
            }],
            ['the Validation tab lists the EFX rules files as added, with Compare disabled', async () => {
                await this.#explorer.openTab('validation-tab');
                const cards = await this.#explorer.indexCards('validation-overview-card-group');
                assert.deepEqual(cards.map(card => card.title), SmokeTest.#VALIDATION_FILES);
                cards.forEach(card => {
                    assert.equal(card.status, 'added', card.title);
                    assert.equal(card.compareEnabled, false, card.title);
                });
            }],
            ['selecting 1.15.1 and 1.14.2 while the Validation tab is active activates Home and shows the Schematrons tab again', async () => {
                await this.#explorer.selectVersions('1.15.1', '1.14.2');
                assert.equal(await this.#explorer.activeTab(), 'home-tab');
                await this.#assertTabsShown({ 'validation-tab': false, 'schematrons-tab': true });
            }],
            ['the fwd/ source stays selected in the Fields tab after the version change, and is used', async () => {
                assert.deepEqual(await this.#explorer.selectedToggleButton('fields-source'), { checked: 'fwd', active: ['fwd'] });
                await this.#explorer.openTab('fields-tab');
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), 'SDK 1.15.1 and 1.14.2 have no forward-compatible metadata (fields/fwd/).');
            }],
        ]);
    }

    async #checkDefaultBaseWithoutPreviousMinor() {
        await this.#scenario('?version=2.0.0-alpha.4', [
            ['the base defaults to the release immediately preceding the target', async () => {
                assert.equal(await this.#explorer.mainVersion(), '2.0.0-alpha.4');
                const options = await this.#explorer.baseVersionOptions();
                const precedingRelease = options.slice(options.indexOf('2.0.0-alpha.4') + 1).find(SmokeTest.#isRelease);
                assert.equal(await this.#explorer.baseVersion(), precedingRelease);
            }],
        ]);
    }

    async #checkBranchAsTarget() {
        await this.#scenario('?version=efx-2', [
            ['a branch is accepted as target, with the latest release as base', async () => {
                assert.equal(await this.#explorer.mainVersion(), 'efx-2');
                const latestRelease = (await this.#explorer.baseVersionOptions()).find(SmokeTest.#isRelease);
                assert.equal(await this.#explorer.baseVersion(), latestRelease);
            }],
            ['the Validation tab is shown and the Schematrons tab is hidden', async () => {
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
        ]);
    }

    /** Two versions without EFX rules. */
    async #checkPairWithoutRules() {
        await this.#scenario('?version=1.15.1&base=1.14.2', [
            ['the Schematrons tab is shown and the Validation tab is hidden', async () => {
                await this.#assertTabsShown({ 'validation-tab': false, 'schematrons-tab': true });
            }],
            ['the Fields tab shows fields.json by default, under ND-Root, without the alert', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#assertFieldsJsonTree();
            }],
            ['when the tabs cannot be probed after a version change, the Fields pane is empty and the toast names the file', async () => {
                await this.#explorer.failRequestsDuring('**/1.14.1/validation/rules.efx', async () => {
                    await this.#explorer.startSelectingVersion('base', '1.14.1');
                    await this.#explorer.waitUntilIdle();
                });
                assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                assert.match(await this.#explorer.apiStatus(), /rules\.efx for SDK 1\.14\.1/);
            }],
            ['a probe for an older selection that answers late does not change the tab bar of a newer selection', async () => {
                const olderProbe = await this.#explorer.holdRequests('**/1.14.0/validation/rules.efx');
                await this.#explorer.startSelectingVersion('main', '1.14.0');
                await olderProbe.requested;
                await this.#explorer.startSelectingVersion('main', '2.0.0-alpha.2');
                assert.ok(await this.#explorer.waitForTabShown('validation-tab', 60000), 'the newer selection did not show the Validation tab');
                await olderProbe.release();
                await this.#explorer.waitUntilIdle();
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
            ['a version change made while the tabs are probed at start-up is applied', async () => {
                const startupProbe = await this.#explorer.holdRequests('**/1.15.1/validation/rules.efx');
                await this.#explorer.openWithoutWaiting('?version=1.15.1&base=1.14.2');
                await startupProbe.requested;
                await this.#explorer.startSelectingVersion('main', '2.0.0-alpha.4');
                const validationShown = await this.#explorer.waitForTabShown('validation-tab', 30000);
                await startupProbe.release();
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.mainVersion(), '2.0.0-alpha.4');
                assert.deepEqual(await this.#explorer.appState(), { mainVersion: '2.0.0-alpha.4', baseVersion: '1.14.2' });
                assert.ok(validationShown, 'the Validation tab was not shown for 2.0.0-alpha.4');
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
        ]);
    }

    /** Two versions with the same EFX rules. */
    async #checkPairWithRules() {
        await this.#scenario('?version=2.0.0-alpha.4&base=2.0.0-alpha.3', [
            ['the Fields tab shows fields.json by default, under ND-Root, without the alert', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#assertFieldsJsonTree();
            }],
            ['a slow response for a superseded pair does not replace the tree of the newer pair', async () => {
                const slowResponse = await this.#explorer.holdRequests('**/1.3.2/fields/fields.json');
                await this.#explorer.startSelectingVersion('base', '1.3.2');
                await slowResponse.requested;
                await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.4');
                assert.ok((await this.#explorer.treeNodes('fields-explorer')).length > 0, 'no tree for the newer pair');
                await slowResponse.release();
                await this.#explorer.waitUntilIdle();
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                assert.deepEqual(nodes.filter(node => node.status !== 'unchanged').map(node => node.id).slice(0, 5), [],
                    'the tree is not the one of 2.0.0-alpha.4 against itself');
                await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.3');
                await this.#explorer.waitUntilIdle();
            }],
            ['a response that completed just before a version change does not render: the tree never shows the older pair, and a failed newer load leaves the pane empty', async () => {
                // The newer base (1.3.2) was probed earlier in this scenario, so its load starts at once, before the
                // older responses are handed over.
                const newerIndex = await this.#explorer.holdRequests('**/1.3.2/fields/fields.json');
                await this.#explorer.selectVersionWhenRequestsComplete(['/2.0.0-alpha.4/fields/fields.json', '/2.0.0-alpha.1/fields/fields.json'], 'base', '1.3.2');
                await this.#explorer.startCountingTreeNodes('fields-explorer');
                await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.1');
                await newerIndex.requested;
                await this.#explorer.waitFor(1500);
                const treeNodesWhileHeld = await this.#explorer.countedTreeNodes();
                await newerIndex.release(500);
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.baseVersion(), '1.3.2');
                assert.equal(treeNodesWhileHeld, 0, 'the tree of the older pair was shown');
                assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                assert.match(await this.#explorer.apiStatus(), /fields\.json for SDK 1\.3\.2/);
                await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.3');
                await this.#explorer.waitUntilIdle();
            }],
            ['tree labels are text: a field name containing <b>x</b> is shown as it is', async () => {
                const rewrite = content => {
                    content.fields.find(field => field.id === 'BT-507-Business').name = '<b>x</b> NUTS code';
                    return content;
                };
                await this.#explorer.rewriteJsonDuring('**/2.0.0-alpha.4/fields/fields.json', rewrite, async () => {
                    await this.#explorer.openTab('home-tab');
                    await this.#explorer.openTab('fields-tab');
                    assert.deepEqual(await this.#explorer.treeLabel('fields-explorer', 'BT-507-Business'), { text: '<b>x</b> NUTS code', elements: [] });
                });
            }],
            ['the Fields tab in fwd/ mode shows 262 nodes, 13 modified fields (BT-507-Business among them), 96 business entities and 19 data types', async () => {
                await this.#explorer.selectFieldsSource('fwd');
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), null);
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                assert.deepEqual(nodes.filter(node => node.parent === '#').map(node => node.text), SmokeTest.#FORWARD_COMPATIBLE_ROOTS);
                const xmlStructure = nodes.filter(node => node.parent !== '#' && !/^(be|bep|dt):/.test(node.id));
                assert.equal(xmlStructure.filter(node => node.folder).length, 262, 'nodes');
                const modifiedFields = xmlStructure.filter(node => !node.folder && node.status === 'modified').map(node => node.id);
                assert.equal(modifiedFields.length, 13, `modified fields: ${modifiedFields.join(', ')}`);
                assert.ok(modifiedFields.includes('BT-507-Business'), 'BT-507-Business is not modified');
                assert.equal(nodes.filter(node => node.id.startsWith('be:')).length, 96, 'business entities');
                assert.equal(nodes.filter(node => node.id.startsWith('dt:')).length, 19, 'data types');
            }],
            ['when loading fails, the Fields tab shows an empty pane and the error naming the file, not the previous tree', async () => {
                await this.#explorer.selectFieldsSource('fields-json');
                assert.ok((await this.#explorer.treeNodes('fields-explorer')).length > 0, 'no fields.json tree');
                await this.#explorer.failRequestsDuring('**/2.0.0-alpha.3/fields/fwd/data-types.json', () => this.#explorer.selectFieldsSource('fwd'));
                assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                assert.match(await this.#explorer.apiStatus(), /fwd\/data-types\.json for SDK 2\.0\.0-alpha\.3/);
            }],
            ['the error toast shows the body of a failed response as text, never as HTML, under the message', async () => {
                const body = '<img src=x onerror="window.smokeTestInjected = true">';
                await this.#explorer.failRequestsDuring('**/2.0.0-alpha.3/fields/fwd/data-types.json', async () => {
                    await this.#explorer.selectFieldsSource('fields-json');
                    await this.#explorer.selectFieldsSource('fwd');
                }, body);
                // A source switch does not clear the toast: the item of this failure is the last one.
                assert.deepEqual((await this.#explorer.toastItems()).pop(), {
                    message: 'Error while downloading file fwd/data-types.json for SDK 2.0.0-alpha.3',
                    detail: body,
                    elements: [],
                    detailStyle: { color: 'rgb(255, 0, 0)', display: 'block' }
                });
                assert.equal(await this.#explorer.globalIsSet('smokeTestInjected'), false);
            }],
            ['the View Templates tab lists summary.efx, which view-templates.json does not list, as unchanged', async () => {
                await this.#assertViewTemplateStatus('summary.efx', 'unchanged');
            }],
            ['Compare opens the diff of summary.efx, and going back to Overview empties the diff view', async () => {
                await this.#explorer.compare('view-templates-overview-card-group', 'summary.efx');
                assert.equal(await this.#explorer.isShown('#view-templates-diff-view'), true);
                assert.deepEqual(await this.#explorer.comparedFiles('view-templates-diff'), ['summary.efx']);
                await this.#explorer.openOverview('view-templates-overview-link');
                assert.equal(await this.#explorer.isEmpty('#view-templates-diff'), true);
            }],
            ['leaving the Validation tab right after its files arrived shows no card afterwards', async () => {
                const suffixes = ['2.0.0-alpha.4', '2.0.0-alpha.3'].flatMap(version => SmokeTest.#VALIDATION_FILES.map(file => `/${version}/validation/${file}`));
                await this.#explorer.openTabWhenRequestsComplete(suffixes, 'home-tab');
                await this.#explorer.startOpeningTab('validation-tab');
                await this.#explorer.waitFor(1500);
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'home-tab');
                assert.deepEqual((await this.#explorer.cardStates('validation-overview-card-group')).map(card => card.title), []);
            }],
            ['the Validation tab lists the EFX rules files as unchanged, without a folder filter', async () => {
                await this.#explorer.openTab('validation-tab');
                const cards = await this.#explorer.indexCards('validation-overview-card-group');
                assert.deepEqual(cards.map(card => card.title), SmokeTest.#VALIDATION_FILES);
                cards.forEach(card => {
                    assert.equal(card.status, 'unchanged', card.title);
                    assert.equal(card.compareEnabled, true, card.title);
                });
                assert.equal((await this.#explorer.cardFilter('validation-overview-card-group')).shown, false);
            }],
            ['Compare opens the diff of rules.efx', async () => {
                await this.#explorer.compare('validation-overview-card-group', 'rules.efx');
                try {
                    assert.equal(await this.#explorer.isShown('#validation-diff-view'), true);
                    assert.deepEqual(await this.#explorer.comparedFiles('validation-diff'), ['rules.efx']);
                } finally {
                    await this.#explorer.openOverview('validation-overview-link');
                }
            }],
            ['under EFX rules, the status filter "modified" hides the unchanged files', async () => {
                await this.#explorer.selectStatusFilter('validation-overview-card-group', 'modified');
                assert.deepEqual((await this.#explorer.cardStates('validation-overview-card-group')).filter(card => card.visible).map(card => card.title), []);
            }],
            ['the Schematron source lists the schematrons of the pair with one git trees request per version', async () => {
                const treesRequests = await this.#treesRequestsDuring(() => this.#explorer.selectValidationSource('schematron'));
                assert.equal(treesRequests, 2);
                assert.deepEqual(await this.#explorer.selectedToggleButton('validation-source'), { checked: 'schematron', active: ['schematron'] });
                const cards = await this.#explorer.indexCards('validation-overview-card-group');
                assert.ok(cards.length > 0, 'no cards');
                assert.ok(cards.every(card => card.status), 'a card has no status');
                assert.equal((await this.#explorer.cardFilter('validation-overview-card-group')).shown, true);
            }],
            ['after the switch to Schematron the status filter is back to "all", and the folder "static" shows only its cards, whatever their status', async () => {
                assert.equal(await this.#explorer.selectedStatusFilter('validation-overview-card-group'), 'all');
                const cards = await this.#explorer.cardStates('validation-overview-card-group');
                assert.deepEqual(cards.filter(card => !card.visible).map(card => card.title), []);
                await this.#explorer.clickFilterValue('validation-overview-card-group', 'static');
                const visible = (await this.#explorer.cardStates('validation-overview-card-group')).filter(card => card.visible);
                const staticCards = cards.filter(card => card.subtitle === 'static');
                assert.ok(staticCards.length > 0, 'no static cards');
                assert.equal(visible.length, staticCards.length);
                assert.ok(visible.every(card => card.subtitle === 'static'), 'a card of another folder is shown');
            }],
            ['the Schematrons tab shows the same cards, folder filter and statuses, without any GitHub API request', async () => {
                const validationCards = await this.#explorer.indexCards('validation-overview-card-group');
                const validationFilter = await this.#explorer.cardFilter('validation-overview-card-group');
                const before = this.#explorer.githubApiRequests.length;
                await this.#explorer.openHiddenTab('schematrons-tab');
                assert.deepEqual(this.#explorer.githubApiRequests.slice(before), []);
                assert.deepEqual(await this.#explorer.indexCards('schematrons-overview-card-group'), validationCards);
                assert.deepEqual(await this.#explorer.cardFilter('schematrons-overview-card-group'), validationFilter);
            }],
        ]);
    }

    /**
     * A pair whose codelists have parents (currency among them) that the second pair's do not have.
     * Both pairs predate 1.12.0, which renamed some codelist files, so that the switch does not compare files across the rename.
     */
    async #checkFilterAfterVersionChange() {
        await this.#scenario('?version=1.4.5&base=1.4.0', [
            ['after a version change, the Codelists filter lists only the parents of the codelists shown', async () => {
                await this.#explorer.openTab('codelists-tab');
                assert.ok((await this.#explorer.cardFilter('code-lists-overview-card-group')).values.includes('currency'), 'currency is not a parent in 1.4.5 or 1.4.0');
                await this.#explorer.selectVersions('1.3.6', '1.3.2');
                const parents = new Set((await this.#explorer.indexCards('code-lists-overview-card-group')).map(card => card.subtitle || '(blank)'));
                const filter = await this.#explorer.cardFilter('code-lists-overview-card-group');
                assert.deepEqual([...filter.values].sort(), [...parents, '(all)'].sort());
            }],
            ['the cards of a load superseded by a version change are not added to the newer comparison', async () => {
                // The newer pair's index is held, so that the pane must stay empty until it arrives.
                const newerIndex = await this.#explorer.holdRequests('**/1.4.0/codelists/codelists.json');
                await this.#explorer.openTab('home-tab');
                await this.#explorer.selectVersionWhenFirstCardAppears('code-lists-overview-card-group', 'base', '1.4.0');
                await this.#explorer.startOpeningTab('codelists-tab');
                await newerIndex.requested;
                const whileHeld = await this.#explorer.cardStates('code-lists-overview-card-group');
                await newerIndex.release();
                await this.#explorer.waitUntilIdle();
                assert.deepEqual(whileHeld.map(card => card.title).slice(0, 5), [], `${whileHeld.length} cards of the superseded load were added`);
                assert.equal(await this.#explorer.baseVersion(), '1.4.0');
                const titles = (await this.#explorer.cardStates('code-lists-overview-card-group')).map(card => card.title);
                assert.ok(titles.length > 0, 'no cards');
                assert.deepEqual(titles.filter((title, index) => titles.indexOf(title) !== index), []);
            }],
        ]);
    }

    /**
     * A pair whose codelists take a while to check in the background: the filters must apply to the cards whose
     * status is still pending (upstream issues #56 and #57).
     */
    async #checkFiltersWhileLoading() {
        await this.#scenario('?version=1.16.0-rc.5&base=1.15.1', [
            ['the Codelists parent filter applies while the codelists are still being checked ("country": only its 5 codelists)', async () => {
                await this.#explorer.startOpeningTab('codelists-tab');
                await this.#explorer.waitForFilterValue('code-lists-overview-card-group', 'country');
                await this.#explorer.clickFilterValue('code-lists-overview-card-group', 'country');
                const whileLoading = await this.#explorer.cardStates('code-lists-overview-card-group');
                assert.ok(whileLoading.some(card => !card.status), 'the codelists were already checked');
                assert.deepEqual(whileLoading.filter(card => card.visible && card.subtitle !== 'country').map(card => card.title), []);
                await this.#explorer.waitUntilIdle();
                const visible = (await this.#explorer.cardStates('code-lists-overview-card-group')).filter(card => card.visible);
                assert.equal(visible.length, 5, `visible: ${visible.map(card => card.title).join(', ')}`);
                assert.ok(visible.every(card => card.subtitle === 'country'));
            }],
            ['the Codelists status filter applies while the codelists are still being checked ("modified": no pending codelist, then the 11 modified)', async () => {
                await this.#explorer.openTab('home-tab');
                await this.#explorer.startOpeningTab('codelists-tab');
                await this.#explorer.waitForCards('code-lists-overview-card-group', 100);
                await this.#explorer.selectStatusFilter('code-lists-overview-card-group', 'modified');
                const whileLoading = await this.#explorer.cardStates('code-lists-overview-card-group');
                assert.ok(whileLoading.some(card => !card.status), 'the codelists were already checked');
                assert.deepEqual(whileLoading.filter(card => card.visible && card.status !== 'modified').map(card => card.title), []);
                await this.#explorer.waitUntilIdle();
                const visible = (await this.#explorer.cardStates('code-lists-overview-card-group')).filter(card => card.visible);
                assert.equal(visible.length, 11, `visible: ${visible.map(card => card.title).join(', ')}`);
                assert.ok(visible.every(card => card.status === 'modified'));
            }],
        ]);
    }

    /** A pair on both sides of 1.12.0, which renamed the files of the tailored codelists. */
    async #checkCodelistsAcrossRenames() {
        await this.#scenario('?version=2.0.0-alpha.4&base=1.9.0', [
            ['the Codelists tab compares each version\'s own file (exclusion-ground: criterion_exclusion-ground.gc in 1.9.0), without errors', async () => {
                await this.#explorer.openTab('codelists-tab');
                assert.equal(await this.#explorer.apiStatus(), '');
                const cards = await this.#explorer.indexCards('code-lists-overview-card-group');
                assert.deepEqual(cards.filter(card => !card.status).map(card => card.title), []);
                const renamed = cards.find(card => card.title === 'exclusion-ground');
                assert.ok(renamed, 'exclusion-ground is missing');
                assert.ok(['unchanged', 'modified'].includes(renamed.status), `exclusion-ground is ${renamed.status}`);
            }],
        ]);
    }

    /** A base whose fields/fwd/ folder lacks the business entity files. */
    async #checkPairWithPartialForwardCompatibleMetadata() {
        await this.#scenario('?version=2.0.0-alpha.3&base=2.0.0-alpha.2', [
            ['the Fields tab in fwd/ mode names the files 2.0.0-alpha.2 lacks, shows its business entities as added and compares its data types', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#explorer.selectFieldsSource('fwd');
                assert.equal(await this.#explorer.apiStatus(), '');
                assert.equal(await this.#explorer.shownText('#fields-source-alert'),
                    'SDK 2.0.0-alpha.2 has no fields/fwd/business-entity-hierarchy.json, business-entity-properties.json.');
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                const businessEntities = nodes.filter(node => /^bep?:/.test(node.id));
                assert.ok(businessEntities.length > 0, 'no business entities');
                assert.deepEqual(businessEntities.filter(node => node.status !== 'added'), []);
                const dataTypes = nodes.filter(node => node.id.startsWith('dt:'));
                assert.equal(dataTypes.length, 19, 'data types');
                assert.deepEqual(dataTypes.filter(node => ['added', 'removed'].includes(node.status)), []);
            }],
        ]);
    }

    /**
     * Opens the explorer once and runs the given checks on it, followed by checks for console errors, for requests
     * to the parts of the GitHub API that the explorer must not use (they spend the rate limit) and for stylesheets
     * other than the page's.
     *
     * @param {string} queryString
     * @param {Array<[string, () => Promise<void>]>} checks Pairs of description and check.
     */
    async #scenario(queryString, checks) {
        console.log(`\n${queryString}`);
        const firstRequest = this.#explorer.githubApiRequests.length;
        const firstStylesheet = this.#explorer.stylesheetRequests.length;
        try {
            await this.#explorer.open(queryString);
        } catch (error) {
            this.#report(`the explorer opens with ${queryString}`, error);
            return;
        }
        for (const [description, check] of checks) {
            await this.#check(description, check);
        }
        await this.#check('no console errors', async () => assert.deepEqual(this.#explorer.consoleErrors, []));
        await this.#check('no request to the GitHub tags or contents API', async () => {
            const requests = this.#explorer.githubApiRequests.slice(firstRequest);
            assert.deepEqual(requests.filter(url => /\/repos\/[^/]+\/[^/]+\/(tags|contents)([/?]|$)/.test(url)), []);
        });
        await this.#check('the web components load only the stylesheets the page loads', async () => {
            const pageStylesheets = await this.#explorer.pageStylesheets();
            const others = this.#explorer.stylesheetRequests.slice(firstStylesheet).filter(url => !pageStylesheets.includes(url));
            assert.deepEqual([...new Set(others)], []);
        });
    }

    /**
     * @param {() => Promise<void>} action
     * @returns {Promise<number>} The number of GitHub git trees requests made during the action.
     */
    async #treesRequestsDuring(action) {
        const before = this.#explorer.githubApiRequests.length;
        await action();
        return this.#explorer.githubApiRequests.slice(before).filter(url => url.includes('/git/trees/')).length;
    }

    /**
     * @param {string} description
     * @param {() => Promise<void>} check
     */
    async #check(description, check) {
        try {
            await check();
            this.#report(description, null);
        } catch (error) {
            this.#report(description, error);
        }
    }

    /**
     * @param {string} description
     * @param {Error|null} error null if the check passed.
     */
    #report(description, error) {
        if (error === null) {
            this.#passed++;
            console.log(`  PASS  ${description}`);
        } else {
            this.#failed++;
            console.log(`  FAIL  ${description}\n        ${error.message.split('\n').join('\n        ')}`);
        }
    }

    /**
     * Opens the View Templates tab and asserts that exactly one card has the given title, with the given status.
     *
     * @param {string} title
     * @param {string} status
     */
    async #assertViewTemplateStatus(title, status) {
        await this.#explorer.openTab('view-templates-tab');
        const cards = (await this.#explorer.indexCards('view-templates-overview-card-group')).filter(card => card.title === title);
        assert.equal(cards.length, 1, `${cards.length} cards titled ${title}`);
        assert.equal(cards[0].status, status);
    }

    /**
     * Asserts that the Fields tab shows the tree of fields.json (one root, ND-Root) and no alert.
     */
    async #assertFieldsJsonTree() {
        assert.equal(await this.#explorer.shownText('#fields-source-alert'), null);
        const nodes = await this.#explorer.treeNodes('fields-explorer');
        assert.deepEqual(nodes.filter(node => node.parent === '#').map(node => node.id), ['ND-Root']);
        assert.ok(nodes.length > 1, 'the tree has no fields');
    }

    /**
     * @param {Object<string, boolean>} expected Whether each tab, by the id of its button, is expected to be shown.
     */
    async #assertTabsShown(expected) {
        for (const [tabId, shown] of Object.entries(expected)) {
            assert.equal(await this.#explorer.isTabShown(tabId), shown, `${tabId} is ${shown ? 'hidden' : 'shown'}`);
        }
    }

    /**
     * Asserts that each of the expected runs of versions appears in the dropdown as consecutive options, the runs in
     * the expected order. Other versions may appear before, between and after the runs.
     *
     * @param {string[]} options The options of a version dropdown.
     */
    static #assertVersionOrder(options) {
        let endOfPreviousRun = -1;
        SmokeTest.#EXPECTED_VERSION_RUNS.forEach(run => {
            const start = options.indexOf(run[0]);
            assert.ok(start > endOfPreviousRun, `${run[0]} is missing or out of order: ${options.join(', ')}`);
            assert.deepEqual(options.slice(start, start + run.length), run);
            endOfPreviousRun = start + run.length - 1;
        });
    }

    /**
     * @param {string} version
     * @returns {boolean} Whether the version is a release (not a pre-release and not a branch).
     */
    static #isRelease(version) {
        return /^\d+\.\d+\.\d+$/.test(version);
    }
}

const server = new ExplorerServer(fileURLToPath(new URL('..', import.meta.url)));
const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM_EXECUTABLE_PATH });
try {
    const baseUrl = await server.start();
    const context = await browser.newContext();
    const page = await context.newPage();
    // Every load fetches the SDK files as a first visit does (as in a context with request interception, where
    // Playwright disables the HTTP cache), so that the checks made while a tab is still loading find it loading.
    await (await context.newCDPSession(page)).send('Network.setCacheDisabled', { cacheDisabled: true });
    const failed = await new SmokeTest(new ExplorerPage(page, baseUrl)).run();
    process.exitCode = failed === 0 ? 0 : 1;
} finally {
    await browser.close();
    server.stop();
}
