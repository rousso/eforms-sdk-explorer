/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { TabController } from "./tab-controller.js";
import { appState } from "../state.js";
import { appConfig } from "../config.js";
import { Diff, DiffEntry } from "../diff.js";
import { TreeDetailSplitView } from "../components/tree-detail-split-view.js";
import { SdkExplorerApplication } from "../app.js";
import { CustomError, AjaxError } from "../custom-error.js";
import { ERROR_FETCHING_FILE, ERROR_UNEXPECTED_FILE_CONTENT } from "../error-messages.js";

export class FieldsTab extends TabController {

    /** The value of the radio input of the source selector for the forward-compatible metadata (fields/fwd/). */
    static #FORWARD_COMPATIBLE_SOURCE = 'fwd';

    /** The ids of the root tree-nodes of the forward-compatible metadata, chosen so that they cannot clash with SDK ids. */
    static #XML_STRUCTURE_ROOT = 'root:xml-structure';
    static #BUSINESS_ENTITIES_ROOT = 'root:business-entities';
    static #DATA_TYPES_ROOT = 'root:data-types';

    /** The forward-compatible metadata of a version that has none: every item of the other version is added or removed. */
    static #NO_FORWARD_COMPATIBLE_METADATA = Object.freeze({ nodes: [], fields: [], entities: [], properties: [], dataTypes: [] });

    constructor() {
        super('fields-tab');
    }

    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Render the tab again when a different metadata source is selected (Bootstrap fires change on the radio input of the button).
        this.$sourceSelector().on('change', 'input[type="radio"]', async (e) => {
            this.cancelRequests();
            SdkExplorerApplication.startSpinner();
            try {
                await this.fetchAndRender();
            } catch (error) {
                if (error.statusText !== 'abort') {
                    this.showErrorMessage(error.message);
                }
            } finally {
                SdkExplorerApplication.stopSpinner();
            }
        });
    }

    async fetchAndRender() {
        if (this.#selectedSource() === FieldsTab.#FORWARD_COMPATIBLE_SOURCE) {
            await this.#fetchAndRenderForwardCompatibleMetadata();
        } else {
            await this.#fetchAndRenderFieldsJson();
        }
    }

    /**
     * Gets the {@link TreeDetailSplitView} element for this tab.
     * @returns {TreeDetailSplitView}
     */
    #splitView() {
        return document.getElementById('fields-explorer');
    }

    /**
     *
     * @returns {HTMLElement} The toggle button group of the metadata sources, one radio input per source.
     */
    #sourceSelector() {
        return document.getElementById('fields-source');
    }

    /**
     *
     * @returns {JQuery<HTMLElement>}
     */
    $sourceSelector() {
        return $(this.#sourceSelector());
    }

    /**
     * @returns {string} The value of the radio input of the selected metadata source.
     */
    #selectedSource() {
        return this.$sourceSelector().find('input[type="radio"]:checked').val();
    }

    /**
     *
     * @returns {HTMLElement} The alert that names the versions without forward-compatible metadata.
     */
    #alert() {
        return document.getElementById('fields-source-alert');
    }

    /**
     *
     * @returns {JQuery<HTMLElement>}
     */
    $alert() {
        return $(this.#alert());
    }

    /**
     * Fetches fields.json for both versions and renders its nodes and fields.
     */
    async #fetchAndRenderFieldsJson() {
        this.#showVersionsWithoutForwardCompatibleMetadata([]);

        const [response1, response2] = await Promise.all([
            this.#fetchFieldsFile('fields.json', appState.mainVersion),
            this.#fetchFieldsFile('fields.json', appState.baseVersion)
        ]);

        const mainVersionNodes = FieldsTab.#arrayIn(response1, 'xmlStructure', 'fields.json', appState.mainVersion);
        const mainVersionFields = FieldsTab.#arrayIn(response1, 'fields', 'fields.json', appState.mainVersion);
        const baseVersionNodes = FieldsTab.#arrayIn(response2, 'xmlStructure', 'fields.json', appState.baseVersion);
        const baseVersionFields = FieldsTab.#arrayIn(response2, 'fields', 'fields.json', appState.baseVersion);

        try {
            const nodesDiff = Diff.fromArrayComparison(mainVersionNodes, baseVersionNodes, 'id');
            const fieldsDiff = Diff.fromArrayComparison(mainVersionFields, baseVersionFields, 'id');
            this.#splitView().initialise({
                dataCallback: () => this.#createTreeNodes(nodesDiff, fieldsDiff),
                searchableProperties: ['id', 'btId', 'name', 'xpathRelative'],
                titleProperty: 'id',
                subtitleProperty: 'type',
            });
        } catch (error) {
            throw new CustomError('Error while visualising the fields.json', error);
        }
    }

    /**
     * Fetches the forward-compatible metadata (fields/fwd/) for both versions and renders it.
     * A version without forward-compatible metadata is named in the alert and compared as if it had no items.
     */
    async #fetchAndRenderForwardCompatibleMetadata() {
        this.#showVersionsWithoutForwardCompatibleMetadata([]);

        const [mainVersionData, baseVersionData] = await Promise.all([
            this.#fetchForwardCompatibleMetadata(appState.mainVersion),
            this.#fetchForwardCompatibleMetadata(appState.baseVersion)
        ]);

        this.#showVersionsWithoutForwardCompatibleMetadata([
            ...(mainVersionData === null ? [appState.mainVersion] : []),
            ...(baseVersionData === null ? [appState.baseVersion] : [])
        ]);
        const main = mainVersionData ?? FieldsTab.#NO_FORWARD_COMPATIBLE_METADATA;
        const base = baseVersionData ?? FieldsTab.#NO_FORWARD_COMPATIBLE_METADATA;

        try {
            const diffs = {
                nodes: Diff.fromArrayComparison(main.nodes, base.nodes, 'id'),
                fields: Diff.fromArrayComparison(main.fields, base.fields, 'id'),
                entities: Diff.fromArrayComparison(main.entities, base.entities, 'id'),
                properties: Diff.fromArrayComparison(main.properties, base.properties, 'id'),
                dataTypes: Diff.fromArrayComparison(main.dataTypes, base.dataTypes, 'id')
            };
            this.#splitView().initialise({
                dataCallback: () => this.#createForwardCompatibleTreeNodes(diffs),
                searchableProperties: ['id', 'btId', 'name', 'xpathRelative', 'businessTermId', 'dataType', 'entityType'],
                titleProperty: 'id',
                subtitleProperty: 'type',
            });
        } catch (error) {
            throw new CustomError('Error while visualising the forward-compatible metadata', error);
        }
    }

    /**
     * Fetches the forward-compatible metadata of the specified version.
     * The presence of fwd/nodes.json tells whether the version has forward-compatible metadata; once it is present,
     * a missing file is an error.
     *
     * @param {string} sdkVersion
     * @returns {Promise<{nodes: Object[], fields: Object[], entities: Object[], properties: Object[], dataTypes: Object[]}|null>}
     *          null if the version has no forward-compatible metadata.
     *          Business entity properties get an id made of their entity id and name; data types get their type as id.
     */
    async #fetchForwardCompatibleMetadata(sdkVersion) {
        let nodesFile;
        try {
            nodesFile = await this.ajaxRequest({ url: this.#fieldsFileUrl('fwd/nodes.json', sdkVersion), dataType: 'json' });
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            throw new AjaxError(ERROR_FETCHING_FILE('fwd/nodes.json', sdkVersion), error);
        }

        const [fieldsFile, hierarchyFile, propertiesFile, dataTypesFile] = await Promise.all([
            this.#fetchFieldsFile('fwd/fields.json', sdkVersion),
            this.#fetchFieldsFile('fwd/business-entity-hierarchy.json', sdkVersion),
            this.#fetchFieldsFile('fwd/business-entity-properties.json', sdkVersion),
            this.#fetchFieldsFile('fwd/data-types.json', sdkVersion)
        ]);

        return {
            nodes: FieldsTab.#arrayIn(nodesFile, 'nodes', 'fwd/nodes.json', sdkVersion),
            fields: FieldsTab.#arrayIn(fieldsFile, 'fields', 'fwd/fields.json', sdkVersion),
            entities: FieldsTab.#arrayIn(hierarchyFile, 'hierarchy', 'fwd/business-entity-hierarchy.json', sdkVersion),
            properties: FieldsTab.#arrayIn(propertiesFile, 'properties', 'fwd/business-entity-properties.json', sdkVersion)
                .map(property => ({ id: `${property.entityId}.${property.name}`, ...property })),
            dataTypes: FieldsTab.#arrayIn(dataTypesFile, 'dataTypes', 'fwd/data-types.json', sdkVersion)
                .map(dataType => ({ id: dataType.type, ...dataType }))
        };
    }

    /**
     * Fetches a JSON file of the fields folder.
     *
     * @param {string} path The path of the file within the fields folder, for example `fwd/nodes.json`.
     * @param {string} sdkVersion
     * @returns {Promise<Object>}
     */
    async #fetchFieldsFile(path, sdkVersion) {
        try {
            return await this.ajaxRequest({ url: this.#fieldsFileUrl(path, sdkVersion), dataType: 'json' });
        } catch (error) {
            throw new AjaxError(ERROR_FETCHING_FILE(path, sdkVersion), error);
        }
    }

    /**
     * @param {string} path The path of the file within the fields folder.
     * @param {string} sdkVersion
     * @returns {string}
     */
    #fieldsFileUrl(path, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/fields/${path}`;
    }

    /**
     * Gets an array from the content of a loaded file, so that a file without it is reported instead of shown as empty.
     *
     * @param {Object} content The parsed content of the file.
     * @param {string} arrayName The property that holds the array.
     * @param {string} filename The file, for the error message.
     * @param {string} sdkVersion The version, for the error message.
     * @returns {Object[]}
     */
    static #arrayIn(content, arrayName, filename, sdkVersion) {
        const array = content?.[arrayName];
        if (!Array.isArray(array)) {
            throw new CustomError(ERROR_UNEXPECTED_FILE_CONTENT(filename, sdkVersion, arrayName));
        }
        return array;
    }

    /**
     * Shows the alert naming the versions that have no forward-compatible metadata, or hides it if there are none.
     *
     * @param {string[]} sdkVersions
     */
    #showVersionsWithoutForwardCompatibleMetadata(sdkVersions) {
        const versions = [...new Set(sdkVersions)];
        if (versions.length === 0) {
            this.$alert().addClass('d-none').text('');
        } else {
            const verb = versions.length === 1 ? 'has' : 'have';
            this.$alert().text(`SDK ${versions.join(' and ')} ${verb} no forward-compatible metadata (fields/fwd/).`).removeClass('d-none');
        }
    }

    /**
     * Creates the tree-nodes for the JsTree from {@link Diff} objects of SDK Nodes and SDK Fields.
     *
     * @param {Diff} nodesDiff A Diff object containing the differences between the main and base versions of the SDK Nodes.
     * @param {Diff} fieldsDiff A Diff object containing the differences between the main and base versions of the SDK Fields.
     * @param {string} rootId The id of the tree-node under which the nodes without a parent are placed ('#' for the top level).
     *
     * @returns {Array} An array of tree-nodes ready for loading onto a JsTree.
     */
    #createTreeNodes(nodesDiff, fieldsDiff, rootId = '#') {

        const treeNodes = new Map(nodesDiff.map(diffEntry => {
            return [diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentId') ?? rootId,
                text: diffEntry.get('name') ?? diffEntry.id,
                icon: 'jstree-folder',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            }];
        }));


        fieldsDiff.forEach(diffEntry => {
            treeNodes.set(diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentNodeId'),
                text: diffEntry.get('name') ?? diffEntry.id,
                icon: 'jstree-file',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            });
        });

        return Array.from(treeNodes.values());
    }

    /**
     * Creates the tree-nodes for the JsTree from the {@link Diff} objects of the forward-compatible metadata, under
     * three roots: the XML structure (nodes and fields), the business entities (nested by their parent, with their
     * properties as leaves) and the data types.
     * The ids of the tree-nodes of business entities, their properties and data types are prefixed (be:, bep:, dt:)
     * so that they stay unique; the ids of the DiffEntries are the SDK ids.
     *
     * @param {{nodes: Diff, fields: Diff, entities: Diff, properties: Diff, dataTypes: Diff}} diffs
     * @returns {Array} An array of tree-nodes ready for loading onto a JsTree.
     */
    #createForwardCompatibleTreeNodes(diffs) {
        return [
            FieldsTab.#createRootTreeNode(FieldsTab.#XML_STRUCTURE_ROOT, 'XML structure'),
            ...this.#createTreeNodes(diffs.nodes, diffs.fields, FieldsTab.#XML_STRUCTURE_ROOT),

            FieldsTab.#createRootTreeNode(FieldsTab.#BUSINESS_ENTITIES_ROOT, 'Business entities'),
            ...diffs.entities.map(diffEntry => ({
                id: `be:${diffEntry.id}`,
                parent: diffEntry.get('parentId') ? `be:${diffEntry.get('parentId')}` : FieldsTab.#BUSINESS_ENTITIES_ROOT,
                text: diffEntry.get('name') ?? diffEntry.id,
                icon: 'jstree-folder',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            })),
            ...diffs.properties.map(diffEntry => ({
                id: `bep:${diffEntry.id}`,
                parent: `be:${diffEntry.get('entityId')}`,
                text: FieldsTab.#propertyText(diffEntry),
                icon: 'jstree-file',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            })),

            FieldsTab.#createRootTreeNode(FieldsTab.#DATA_TYPES_ROOT, 'Data types'),
            ...diffs.dataTypes.map(diffEntry => ({
                id: `dt:${diffEntry.id}`,
                parent: FieldsTab.#DATA_TYPES_ROOT,
                text: diffEntry.id,
                icon: 'jstree-file',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            }))
        ];
    }

    /**
     * Creates a root tree-node: a heading that groups items, which cannot be selected because it is not an SDK item itself.
     *
     * @param {string} id
     * @param {string} text
     * @returns {Object}
     */
    static #createRootTreeNode(id, text) {
        return {
            id: id,
            parent: '#',
            text: text,
            icon: 'jstree-folder',
            state: {
                opened: true,
                disabled: true
            },
            li_attr: { class: 'root-node' }
        };
    }

    /**
     * @param {DiffEntry} diffEntry A business entity property.
     * @returns {string} The name of the property, followed by its business term, data type or entity type, for example `identifier (BT-137, id)`.
     */
    static #propertyText(diffEntry) {
        const qualifiers = [diffEntry.get('businessTermId'), diffEntry.get('dataType'), diffEntry.get('entityType')].filter(qualifier => qualifier);
        return qualifiers.length > 0 ? `${diffEntry.get('name')} (${qualifiers.join(', ')})` : diffEntry.get('name');
    }
}
