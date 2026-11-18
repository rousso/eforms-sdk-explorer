/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { appConfig } from "./config.js";
import { AjaxError, CustomError } from "./custom-error.js";
import { ERROR_FETCHING_DIRECTORY_LISTING, ERROR_FETCHING_VERSIONS } from "./error-messages.js";

/**
 * @typedef {Object} RequestOwner An object that performs and tracks requests, such as a tab.
 * @property {function(Object): Promise<*>} ajaxRequest Performs the request described by the given $.ajax options.
 */

/**
 * @typedef {Object} RepositoryFile A file of the SDK repository, found by {@link SdkRepository#listFolder}.
 * @property {string} path The path of the file, relative to the listed folder.
 * @property {string} name The name of the file.
 * @property {number} size The size of the file, in bytes.
 */

/**
 * Knows how to reach the SDK repository without spending the GitHub API rate limit, which unauthenticated users
 * share per IP address (60 requests per hour):
 * the list of versions comes from the jsDelivr data API, the folder listings of a version from one request to the
 * GitHub git trees API, and both are kept in the browser's local storage (indefinitely for a tag, whose files never
 * change; for appConfig.repositoryCacheMinutes for a branch and for the list of versions).
 * The file tree of a version is downloaded once for all the folders the explorer lists (see #LISTED_FOLDERS): only
 * their listings are kept, not the whole tree, which is too large for the local storage.
 * When the local storage is unavailable or full, the repository works without it.
 */
export class SdkRepository {

    /** The format of the stored entries. Change it when the stored values change, so that older entries are ignored. */
    static #STORAGE_FORMAT = 1;

    /** The prefix of the keys of the stored entries. */
    static #STORAGE_PREFIX = 'sdk-explorer/';

    /** The key under which the list of versions is kept in the browser. */
    static #VERSIONS_KEY = 'versions';

    /** The folders whose listings are kept from the file tree of a version, whichever of them was asked for. */
    static #LISTED_FOLDERS = Object.freeze(['schemas', 'schematrons', 'translations', 'validation']);

    /** @type {RequestOwner} */
    #owner;

    /**
     * @param {RequestOwner} owner The object whose ajaxRequest method performs the requests of the repository.
     */
    constructor(owner) {
        this.#owner = owner;
    }

    /**
     * Lists the versions of the SDK: the names of the tags of the repository.
     *
     * @returns {Promise<string[]>}
     */
    async listVersions() {
        const storageKey = SdkRepository.#VERSIONS_KEY;
        const stored = SdkRepository.#retrieve(storageKey, appConfig.repositoryCacheMinutes);
        // A stored empty list (an earlier build kept one) is no list either: it is downloaded again.
        if (Array.isArray(stored) && stored.length > 0) {
            return stored;
        }

        let response;
        try {
            response = await this.#owner.ajaxRequest({ url: appConfig.versionsUrl, dataType: 'json' });
        } catch (error) {
            throw new AjaxError(ERROR_FETCHING_VERSIONS, error);
        }
        if (!Array.isArray(response?.versions)) {
            throw new CustomError(`${ERROR_FETCHING_VERSIONS}: the response has no list of versions`);
        }
        // An empty list is no list: it is not kept, so that the next attempt downloads it again.
        if (response.versions.length === 0) {
            throw new CustomError(`${ERROR_FETCHING_VERSIONS}: the list of versions is empty`);
        }

        SdkRepository.#store(storageKey, response.versions);
        return response.versions;
    }

    /**
     * Forgets the list of versions kept in the browser, so that the next {@link listVersions} downloads it again:
     * for when no versions could be selected from it, and start-up stops (a reload must then try again).
     */
    forgetVersions() {
        try {
            localStorage.removeItem(SdkRepository.#STORAGE_PREFIX + SdkRepository.#VERSIONS_KEY);
        } catch (error) {
            console.warn('Local storage not usable, the list of versions not forgotten:', error);
        }
    }

    /**
     * Lists the files under a folder of the repository, including those in its sub-folders.
     *
     * @param {string} folderPath The path of the folder from the root of the repository, for example `schematrons`.
     * @param {string} sdkVersion A tag or one of the configured branches.
     * @returns {Promise<RepositoryFile[]>} Empty if the version does not have the folder.
     */
    async listFolder(folderPath, sdkVersion) {
        const maxAgeMinutes = SdkRepository.#maxAgeMinutes(sdkVersion);
        const stored = SdkRepository.#retrieve(SdkRepository.#folderKey(folderPath, sdkVersion), maxAgeMinutes);
        if (stored !== null) {
            return stored;
        }

        const tree = await this.#fetchTree(sdkVersion);
        const folders = new Set([...SdkRepository.#LISTED_FOLDERS, folderPath]);
        let files = [];
        for (const folder of folders) {
            const listing = SdkRepository.#filesUnder(tree, folder);
            SdkRepository.#store(SdkRepository.#folderKey(folder, sdkVersion), listing);
            if (folder === folderPath) {
                files = listing;
            }
        }
        return files;
    }

    /**
     * Downloads the file tree of a version. Each listing that is not kept downloads it again: the request belongs to
     * the load of its owner, which may cancel it, so it is not shared with other loads.
     *
     * @param {string} sdkVersion
     * @returns {Promise<Object[]>} The entries of the tree, as the GitHub git trees API gives them.
     */
    async #fetchTree(sdkVersion) {
        let response;
        try {
            response = await this.#owner.ajaxRequest({
                url: `${appConfig.treesUrl}/${sdkVersion}?recursive=1`,
                headers: { 'Accept': 'application/vnd.github+json' },
                dataType: 'json'
            });
        } catch (error) {
            throw new AjaxError(ERROR_FETCHING_DIRECTORY_LISTING, error);
        }
        if (response.truncated) {
            throw new CustomError(`${ERROR_FETCHING_DIRECTORY_LISTING}: GitHub returned an incomplete file tree for SDK ${sdkVersion}`);
        }
        return response.tree;
    }

    /**
     * @param {Object[]} tree The entries of a file tree.
     * @param {string} folderPath
     * @returns {RepositoryFile[]} The files under the folder.
     */
    static #filesUnder(tree, folderPath) {
        const prefix = `${folderPath}/`;
        return tree
            .filter(entry => entry.type === 'blob' && entry.path.startsWith(prefix))
            .map(entry => ({
                path: entry.path.substring(prefix.length),
                name: entry.path.split('/').pop(),
                size: entry.size
            }));
    }

    /**
     * @param {string} folderPath
     * @param {string} sdkVersion
     * @returns {string} The key under which the listing of the folder is kept in the browser.
     */
    static #folderKey(folderPath, sdkVersion) {
        return `tree/${sdkVersion}/${folderPath}`;
    }

    /**
     * @param {string} sdkVersion
     * @returns {number|null} How long what is known of the version may be kept, in minutes: null (for ever) for a
     *          tag, whose files never change; appConfig.repositoryCacheMinutes for a branch.
     */
    static #maxAgeMinutes(sdkVersion) {
        return appConfig.branches.includes(sdkVersion) ? appConfig.repositoryCacheMinutes : null;
    }

    /**
     * @param {string} path The path of a file from the root of the repository.
     * @param {string} sdkVersion A tag or one of the configured branches.
     * @returns {string} The URL of the content of the file.
     */
    fileUrl(path, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/${path}`;
    }

    /**
     * Gets a value from the local storage.
     *
     * @param {string} key
     * @param {number|null} maxAgeMinutes How old the value may be, or null if it never expires.
     * @returns {*} The stored value, or null if there is none that is usable.
     */
    static #retrieve(key, maxAgeMinutes) {
        try {
            const entry = JSON.parse(localStorage.getItem(SdkRepository.#STORAGE_PREFIX + key));
            if (entry?.format !== SdkRepository.#STORAGE_FORMAT) {
                return null;
            }
            if (maxAgeMinutes !== null && Date.now() - entry.storedAt > maxAgeMinutes * 60000) {
                return null;
            }
            return entry.value;
        } catch (error) {
            console.warn(`Local storage not usable, ${key} not retrieved:`, error);
            return null;
        }
    }

    /**
     * Keeps a value in the local storage.
     *
     * @param {string} key
     * @param {*} value
     */
    static #store(key, value) {
        try {
            const entry = { format: SdkRepository.#STORAGE_FORMAT, storedAt: Date.now(), value: value };
            localStorage.setItem(SdkRepository.#STORAGE_PREFIX + key, JSON.stringify(entry));
        } catch (error) {
            console.warn(`Local storage not usable, ${key} not stored:`, error);
        }
    }
}
