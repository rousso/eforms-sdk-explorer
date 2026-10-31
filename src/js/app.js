/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { appConfig } from "./config.js";
import { appState } from "./state.js";
import { SdkVersion } from "./sdk-version.js";
import { SdkRepository } from "./sdk-repository.js";
import { HomeTab } from "./tabs/home-tab.js";
import { FieldsTab } from "./tabs/fields-tab.js";
import { NoticeTypesTab } from "./tabs/notice-types-tab.js";
import { CodelistsTab } from "./tabs/codelists-tab.js";
import { SchemasTab } from "./tabs/schemas-tab.js";
import { SchematronsTab } from "./tabs/schematrons-tab.js";
import { ValidationTab } from "./tabs/validation-tab.js";
import { TranslationsTab } from "./tabs/translations-tab.js";
import { ViewTemplatesTab } from "./tabs/view-templates-tab.js";
import { ReleaseNotesTab } from "./tabs/release-notes-tab.js";
import { TabController } from "./tabs/tab-controller.js";

export class SdkExplorerApplication {

    /** @type {SdkExplorerApplication} */
    static instance = new SdkExplorerApplication();

    /** @type {Map<string, TabController>} */
    tabs = new Map();

    /** @type {TabController} */
    #activeTab = null

    /** @type {SdkRepository} */
    #repository = new SdkRepository(this);

    /** @type {number} */
    #spinnerCounter = 0;

    /** @type {string} */
    apiStatusMessage = '';

    /** @returns {string} */
    get newVersion() {
        return appState.mainVersion;
    }

    /** @returns {string} */
    getComparisonVersion() {
        return appState.baseVersion;
    }

    constructor() {
        if (SdkExplorerApplication.instance) {
            throw new Error("Do not instantiate this class by calling the constructor. It's a singleton. Use the instance property instead.");
        }

        this.#addTab(new HomeTab());
        this.#addTab(new FieldsTab());
        this.#addTab(new NoticeTypesTab());
        this.#addTab(new CodelistsTab());
        this.#addTab(new SchemasTab());
        this.#addTab(new SchematronsTab());
        this.#addTab(new ValidationTab());
        this.#addTab(new TranslationsTab());
        this.#addTab(new ViewTemplatesTab());
        this.#addTab(new ReleaseNotesTab());
    }

    static async init() {
        await SdkExplorerApplication.instance.populateDropdown();
        await SdkExplorerApplication.instance.#initTabVisibility();

        $('ul.nav-tabs').on('shown.bs.tab', 'li.nav-item > button.nav-link', function (event) {
            const activeTabId = $(event.target).attr('id');
            console.log('Active tab changed:', activeTabId);
            SdkExplorerApplication.instance.activeTabChanged(activeTabId);
        });

        SdkExplorerApplication.instance.$mainVersionDropdown().change(function () {
            appState.mainVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });

        SdkExplorerApplication.instance.$baseVersionDropdown().change(function () {
            appState.baseVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });
    }

    #mainVersionDropdown() {
        return document.querySelector('#main-version-dropdown');
    }
    $mainVersionDropdown() {
        return $(this.#mainVersionDropdown());
    }

    #baseVersionDropdown() {
        return document.querySelector('#base-version-dropdown');
    }

    $baseVersionDropdown() {
        return $(this.#baseVersionDropdown());
    }

    #apiStatus() {
        return document.querySelector('#apiStatus');
    }

    $apiStatus() {
        return $(this.#apiStatus());
    }

    #toastBody() {
        return document.querySelector('#apiStatus .toast-body');
    }

    /**
     * @param {TabController} tab 
     * @returns {HTMLElement} The nav item that holds the button of the tab.
     */
    #navItem(tab) {
        return document.getElementById(tab.getId()).closest('li.nav-item');
    }

    /**
     * 
     * @param {TabController} tab 
     * @returns 
     */
    #addTab(tab) {
        tab.init();
        this.tabs.set(tab.getId(), tab);
    }

    async activeTabChanged(activeTabId) {
        this.startSpinner();
        this.clearApiStatus();
        try {
            await this.#activeTab?.deactivated();
            this.#activeTab = this.tabs.get(activeTabId);
            await this.#activeTab.activated();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message);
        }
        finally {
            this.stopSpinner();
        }
    }

    async versionChanged() {
        this.startSpinner();
        this.clearApiStatus();
        try {
            if (await this.#showApplicableTabs()) {
                await this.#activeTab?.versionChanged();
            }
        } catch (error) {
            if (error.statusText !== 'abort') {
                SdkExplorerApplication.updateApiStatus(error.message);
            }
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * Shows the tabs that apply to the versions selected when the application starts.
     */
    async #initTabVisibility() {
        this.startSpinner();
        try {
            await this.#showApplicableTabs();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message);
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * Asks every tab whether it applies to the selected versions, then shows the nav buttons of the tabs that do 
     * and hides the others. If the active tab is hidden, the Home tab is activated instead.
     * 
     * @returns {Promise<boolean>} true if the active tab is still shown, false if the Home tab is being activated instead.
     */
    async #showApplicableTabs() {
        const tabs = Array.from(this.tabs.values());
        const applicable = await Promise.all(tabs.map(tab => tab.isApplicable()));
        tabs.forEach((tab, index) => $(this.#navItem(tab)).toggleClass('d-none', !applicable[index]));

        const activeTabIsShown = !this.#activeTab || applicable[tabs.indexOf(this.#activeTab)];
        if (!activeTabIsShown) {
            // Showing the Home tab activates it (see activeTabChanged).
            $('#home-tab').tab('show');
        }
        return activeTabIsShown;
    }

    static startSpinner() {
        SdkExplorerApplication.instance.startSpinner();
    }

    static stopSpinner() {
        SdkExplorerApplication.instance.stopSpinner();
    }

    startSpinner() {
        this.#spinnerCounter++;
        this.#toggleSpinner();
    }

    stopSpinner() {
        this.#spinnerCounter--;
        this.#toggleSpinner();
    }

    #toggleSpinner() {
        if (this.#spinnerCounter > 0) {
            $('#centralLoadingSpinner').css('visibility', 'visible');
        } else {
            $('#centralLoadingSpinner').css('visibility', 'hidden');
        }
    }

    clearApiStatus() {
        // Clear the message inside the toast body
        SdkExplorerApplication.instance.#toastBody().textContent = '';

        // Hide the toast
        SdkExplorerApplication.instance.$apiStatus().toast('hide');
    }

    static updateApiStatus(message) {

        SdkExplorerApplication.instance.apiStatusMessage += '<li>' + message + '</li>';
        SdkExplorerApplication.instance.#toastBody().innerHTML = SdkExplorerApplication.instance.apiStatusMessage;

        clearTimeout(SdkExplorerApplication.instance.fadeTimeOut);

        setTimeout(() => {
            // Display the toast
            SdkExplorerApplication.instance.$apiStatus().toast('show');
            SdkExplorerApplication.instance.fadeTimeOut = setTimeout(() => {
                SdkExplorerApplication.instance.$apiStatus().toast('hide');
                SdkExplorerApplication.instance.apiStatusMessage = '';
            }, 15000);
        }, 0);
    }

    /**
     * Gets the default base version for the given target version.
     * For a tagged target, it is the latest patch of the previous minor version in the same major version;
     * if there is none, it is the release immediately preceding the target in version order.
     * For a branch target, it is the latest release.
     * Pre-releases are never a default base.
     * 
     * @param {string} target The target version: a tag or one of the configured branches.
     * @param {SdkVersion[]} releases All released versions, latest first.
     * @returns {SdkVersion|undefined}
     */
    #defaultBaseFor(target, releases) {
        if (appConfig.branches.includes(target)) {
            return releases[0];
        }
        const targetVersion = SdkVersion.tryParse(target);
        return releases.find(release => release.major === targetVersion.major && release.minor < targetVersion.minor)
            ?? releases.find(release => release.compare(targetVersion) < 0);
    }

    /**
     * Gets the main and base versions from the query string if provided.
     * 
     * @returns 
     */
    #getVersionsFromQueryString() {
        // Parse the query string
        let params = new URLSearchParams(window.location.search);
        let versionParam = params.get('version');
        let baseParam = params.get('base');

        if (window.location.search) {
            // Remove the query string from the URL
            history.replaceState(null, null, window.location.pathname);
        }

        return [versionParam, baseParam];
    }

    /**
     * Performs a request of the application's {@link SdkRepository}, which tabs perform with TabController.ajaxRequest.
     * The requests of the application are not tracked: there is only one, for the list of versions, made at start-up.
     * 
     * @param {Object} options The options to pass to $.ajax().
     * @returns {Promise} A promise that resolves with the AJAX response.
     */
    ajaxRequest(options) {
        return $.ajax(options);
    }

    async populateDropdown() {
        this.startSpinner();
        this.clearApiStatus();
        try {
            // Tags that are not versions are ignored, latest version first
            const availableVersions = (await this.#repository.listVersions())
                .map(tagName => SdkVersion.tryParse(tagName))
                .filter(version => version !== null)
                .sort((a, b) => b.compare(a));
            const availableVersionNames = availableVersions.map(version => version.toString());
            const releases = availableVersions.filter(version => !version.isPreRelease);

            // Filter out versions older than the threshold
            const threshold = SdkVersion.tryParse(appConfig.thresholdVersion);
            const recentVersions = availableVersions.filter(version => version.compare(threshold) >= 0);

            // Filter out pre-releases of released versions
            const recentReleases = recentVersions.filter(version => !version.isPreRelease);
            const latestRelease = recentReleases[0];
            const preReleasesOfLatestRelease = recentVersions.filter(version => version.isPreReleaseOf(latestRelease));
            const preReleasesOfUnreleasedVersions = recentVersions.filter(version =>
                version.isPreRelease && !recentReleases.some(release => version.isPreReleaseOf(release)));

            // Sort versions by version number, latest first
            const listedVersions = [...recentReleases, ...preReleasesOfLatestRelease, ...preReleasesOfUnreleasedVersions]
                .sort((a, b) => b.compare(a))
                .map(version => version.toString());

            // Populate the dropdowns
            this.$mainVersionDropdown().empty();
            this.$baseVersionDropdown().empty();

            // Add the configured branches to the top of the main version dropdown.
            // This will allow us to compare any version to any of these branches.
            appConfig.branches.forEach(branch => {
                this.$mainVersionDropdown().append($('<option>', { value: branch, text: branch }));
            });

            listedVersions.forEach(version => {
                const option = $('<option>', { value: version, text: version });
                this.$mainVersionDropdown().append(option.clone());
                this.$baseVersionDropdown().append(option);
            });

            // Get versions from the query string if provided
            let [mainVersion, baseVersion] = this.#getVersionsFromQueryString();

            // Validate the versions passed in the query string.
            // Branches are accepted only as the main version.
            if (!appConfig.branches.includes(mainVersion) && !listedVersions.includes(mainVersion)) {
                if (availableVersionNames.includes(mainVersion)) {
                    const option = $('<option>', { value: mainVersion, text: mainVersion });
                    this.$mainVersionDropdown().append(option);
                } else {
                    mainVersion = latestRelease.toString();
                }
            }
            if (!listedVersions.includes(baseVersion)) {
                if (availableVersionNames.includes(baseVersion)) {
                    const option = $('<option>', { value: baseVersion, text: baseVersion });
                    this.$baseVersionDropdown().append(option);
                } else {
                    baseVersion = this.#defaultBaseFor(mainVersion, releases)?.toString() ?? mainVersion;
                    if (!listedVersions.includes(baseVersion)) {
                        const option = $('<option>', { value: baseVersion, text: baseVersion });
                        this.$baseVersionDropdown().append(option);
                    }
                }
            }
            
            this.$mainVersionDropdown().val(mainVersion);
            this.$baseVersionDropdown().val(baseVersion);
            appState.mainVersion = mainVersion;
            appState.baseVersion = baseVersion;
        } catch (error) {
            SdkExplorerApplication.updateApiStatus('API call failed to fetch tags.', false);
            console.error('Error populating dropdowns:', error);
        } finally {
            this.stopSpinner();
        }
    }
}