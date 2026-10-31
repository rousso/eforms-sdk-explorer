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
 * The explorer reads the SDK from the live GitHub API, so the test needs network access and spends a few requests of
 * the unauthenticated API budget (60 requests per hour).
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

    /** @type {import('playwright').Page} */
    #page;

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
            if (message.type() === 'error') {
                const url = message.location().url;
                this.#consoleErrors.push(url ? `${message.text()} (${url})` : message.text());
            }
        });
        this.#page.on('pageerror', error => this.#consoleErrors.push(error.message));
    }

    /**
     * @returns {string[]} The console errors logged since the explorer was last opened.
     */
    get consoleErrors() {
        return [...this.#consoleErrors];
    }

    /**
     * Opens the explorer and waits until it has filled the version dropdowns.
     *
     * @param {string} queryString For example `?version=efx-2`, or an empty string.
     */
    async open(queryString) {
        this.#consoleErrors = [];
        await this.#page.goto(`${this.#baseUrl}/${queryString}`);
        await this.#page.waitForFunction(
            () => document.querySelector('#main-version-dropdown').value !== ''
                || document.querySelector('#apiStatus .toast-body').textContent.trim() !== '',
            null,
            { timeout: ExplorerPage.#LOAD_TIMEOUT });
        const apiStatus = await this.apiStatus();
        if (apiStatus !== '') {
            throw new Error(`the explorer reported: ${apiStatus}`);
        }
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
        await this.#checkVersionsFromQueryString();
        await this.#checkDefaultBaseWithoutPreviousMinor();
        await this.#checkBranchAsTarget();
        console.log(`\n${this.#passed} passed, ${this.#failed} failed`);
        return this.#failed;
    }

    async #checkVersionsFromQueryString() {
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
        ]);
    }

    /**
     * Opens the explorer once and runs the given checks on it, followed by a check for console errors.
     *
     * @param {string} queryString
     * @param {Array<[string, () => Promise<void>]>} checks Pairs of description and check.
     */
    async #scenario(queryString, checks) {
        console.log(`\n${queryString}`);
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
    const page = await (await browser.newContext()).newPage();
    const failed = await new SmokeTest(new ExplorerPage(page, baseUrl)).run();
    process.exitCode = failed === 0 ? 0 : 1;
} finally {
    await browser.close();
    server.stop();
}
