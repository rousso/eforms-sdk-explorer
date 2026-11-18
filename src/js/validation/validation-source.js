/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

/*
 * The types shared by the sources of validation files (EfxRulesSource, SchematronSource) and the tabs that show
 * them (ValidationTab, SchematronsTab). This module only holds type definitions.
 */

/**
 * The tab that owns a source of validation files: a TabController that also renders the diff of one file and checks
 * whether a file changed. The index cards of the source call these two methods.
 *
 * @typedef {Object} ValidationSourceOwner
 * @property {function(Object): Promise<*>} ajaxRequest Performs a request of the tab (see TabController#ajaxRequest).
 * @property {function(string): Promise<void>} fetchAndRenderDiffView Fetches both versions of the file with the
 *           given filename and shows their diff.
 * @property {function(string): Promise<string>} checkForChanges Tells how the file with the given filename changed
 *           between the two versions (one of Diff.TypeOfChange). Used only by the sources whose cards check their
 *           status in the background (SchematronSource).
 */

export {};
