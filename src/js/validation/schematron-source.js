/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { appConfig } from "../config.js";
import { Diff, DiffEntry } from "../diff.js";
import { TabController } from "../tabs/tab-controller.js";
import { PropertyCard } from "../components/property-card.js";
import { IndexCard } from "../components/index-card.js";
import { AjaxError } from "../custom-error.js";
import { ERROR_FETCHING_DIRECTORY_LISTING } from "../error-messages.js";

/**
 * The schematrons folder of the SDK as a source of validation files.
 * It has no index file: the index is built from the GitHub directory listing of the folder and its sub-folders.
 * The status of the files found in both versions is checked in the background by their index cards.
 */
export class SchematronSource {

    /** @type {TabController} */
    #tab;

    /**
     * @param {TabController} tab The tab that owns the source. The requests of the source go through this tab, and
     * the index cards call its checkForChanges(filename) and fetchAndRenderDiffView(filename) methods.
     */
    constructor(tab) {
        this.#tab = tab;
    }

    /**
     * @returns {string} The property by which the index cards can be filtered.
     */
    get filterProperty() {
        return 'folder';
    }

    /**
     * Fetches the index of the schematron files of the specified SDK version.
     *
     * @param {string} sdkVersion
     * @returns {Promise<Object[]>} One item per file: name, stage, folder and filename.
     */
    async fetchIndex(sdkVersion) {
        const apiUrl = `${appConfig.contentsFileUrl}/schematrons?ref=${sdkVersion}`;
        const directoryStructure = await this.#fetchGithubDirectory(apiUrl, '');
        return this.#buildIndexFromGithubDirectory(directoryStructure);
    }

    /**
     * @param {string} filename The filename of an index item.
     * @param {string} sdkVersion
     * @returns {string}
     */
    fileUrl(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/schematrons/${filename}`;
    }

    /**
     * Schematron files are compared as they are.
     *
     * @param {string} text
     * @param {string} filename
     * @returns {string}
     */
    normaliseForComparison(text, filename) {
        return text;
    }

    async #fetchGithubDirectory(url, path) {

        const response = await this.#tab.ajaxRequest({
            url: url,
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        }).catch(error => {
            throw new AjaxError(ERROR_FETCHING_DIRECTORY_LISTING, error);
        });

        let directoryStructure = {};
        for (const item of response) {
            if (item.type === 'file') {
                const extension = item.name.split('.').pop();
                if (extension === 'sch') {
                    if (!directoryStructure[path]) {
                        directoryStructure[path] = [];
                    }
                    directoryStructure[path].push(item.name);
                }
            } else if (item.type === 'dir') {
                const subDirStructure = await this.#fetchGithubDirectory(item.url, item.path);
                directoryStructure = { ...directoryStructure, ...subDirStructure };
            }
        }
        return directoryStructure;
    }

    #buildIndexFromGithubDirectory(directoryData) {
        let index = [];

        for (const [path, files] of Object.entries(directoryData)) {
            const trimmedPath = path.split('/').pop();

            files.forEach(file => {
                const filenameWithoutExtension = file.replace('.sch', '');
                let stage = null;

                if (filenameWithoutExtension.startsWith('validation-stage')) {
                    const parts = filenameWithoutExtension.split('-');
                    stage = parts[2]; // The stage is the third part of the filename
                }

                index.push({
                    name: filenameWithoutExtension,
                    stage: stage,
                    folder: trimmedPath,
                    filename: `${trimmedPath}/${file}`
                });
            });
        }

        return index;
    }

    /**
     * Creates an index-card for the specified Schematrons.
     *
     * @param {DiffEntry} diffEntry
     * @returns {IndexCard}
     */
    createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('name'), diffEntry.get('folder') ?? '', 'Compare', diffEntry.typeOfChange);
        component.setActionHandler(async (e) => {
            await this.#tab.fetchAndRenderDiffView(diffEntry.get('filename'));
        });
        // If the Schematrons is not new or removed, then we will need to check for changes inside the Schematrons file.
        if (diffEntry.typeOfChange !== Diff.TypeOfChange.ADDED && diffEntry.typeOfChange !== Diff.TypeOfChange.REMOVED) {
            component.removeAttribute('status');
            component.setStatusCheckCallback(() => Promise.resolve(this.#tab.checkForChanges(diffEntry.baseItem.filename)));
        }

        for (const [key, value] of Object.entries(diffEntry.getItem())) {
            const mainValue = diffEntry?.mainItem ? diffEntry?.mainItem[key] ?? undefined : undefined;
            const baseValue = diffEntry?.baseItem ? diffEntry?.baseItem[key] ?? undefined : undefined;

            const card = PropertyCard.create(key, mainValue, baseValue, diffEntry.typeOfChange);
            component.appendProperty(card);
        }

        // Handle removed properties (the ones in baseItem that do not exit in mainItem).
        if (diffEntry.mainItem) {
            for (const propertyName in diffEntry.baseItem) {
                if (!diffEntry.mainItem.hasOwnProperty(propertyName)) {
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName], Diff.TypeOfChange.REMOVED);
                    component.appendProperty(card);
                }
            }
        }

        return component;
    }
}
