/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { appConfig } from './config.js';
import { appState } from './state.js';
import { SdkVersion } from './sdk-version.js';

/**
 * Lets the user choose the two versions to compare: through the version chips of the comparison line, and through
 * Home's "Compare" button and "Choose versions…" dialog.
 *
 * The two hidden version selects stay the holders of the selection: the application fills them, reads them and
 * reloads on their change event. The picker only reads them, and makes a choice by setting a select's value and
 * triggering its change event, as a choice in the select itself would. It never reloads anything itself.
 */
export class VersionPicker {

    /** @type {HTMLSelectElement} */
    #baseSelect = document.getElementById('base-version-dropdown');

    /** @type {HTMLSelectElement} */
    #targetSelect = document.getElementById('main-version-dropdown');

    /** @type {HTMLSelectElement} */
    #dialogBaseSelect = document.getElementById('version-dialog-base');

    /** @type {HTMLSelectElement} */
    #dialogTargetSelect = document.getElementById('version-dialog-target');

    /**
     * Builds the menus of the two chips from the options of the selects, once (the selects must be filled by then),
     * shows the selection, and hooks the chips, Home's buttons and the dialog.
     */
    start() {
        this.#buildMenu(this.#chip('base'), this.#baseSelect);
        this.#buildMenu(this.#chip('target'), this.#targetSelect);
        this.#showSelection();

        // A change of the selection, from a chip, the dialog or the application, shows in the chips and on Home.
        $(this.#baseSelect).add(this.#targetSelect).on('change', () => this.#showSelection());

        // Home's "Compare x › y" shows the comparison of the selected pair, from the Fields tab.
        $('#compare-versions').on('click', () => bootstrap.Tab.getOrCreateInstance(document.querySelector('#fields-tab')).show());

        // The dialog offers the options of the selects, with their current values, each time it opens.
        $('#version-dialog')
            .on('show.bs.modal', () => this.#fillDialog())
            .on('shown.bs.modal', () => this.#dialogBaseSelect.focus());
        $('#version-dialog-compare').on('click', () => this.#applyDialog());
    }

    /**
     * @param {'base'|'target'} role
     * @returns {HTMLElement} The dropdown of the chip of the base or target version.
     */
    #chip(role) {
        return document.querySelector(`.ted-version-chip[data-version-role="${role}"]`);
    }

    /**
     * Fills the menu of a chip with the options of its select, in sections: Branches (only the target select has
     * branches: a branch cannot be a base), Pre-releases and Releases, each in the options' order (latest first).
     *
     * @param {HTMLElement} chip
     * @param {HTMLSelectElement} select
     */
    #buildMenu(chip, select) {
        const values = Array.from(select.options, option => option.value);
        const sections = [
            ['Branches', values.filter(value => appConfig.branches.includes(value))],
            ['Pre-releases', values.filter(value => !appConfig.branches.includes(value) && SdkVersion.tryParse(value)?.isPreRelease)],
            ['Releases', values.filter(value => !appConfig.branches.includes(value) && !SdkVersion.tryParse(value)?.isPreRelease)]
        ].filter(([, sectionValues]) => sectionValues.length > 0);

        const $menu = $(chip).find('.dropdown-menu').empty();
        sections.forEach(([heading, sectionValues], index) => {
            if (index > 0) {
                $menu.append($('<li>').append($('<hr>', { class: 'dropdown-divider' })));
            }
            $menu.append($('<li>').append($('<h6>', { class: 'dropdown-header', text: heading })));
            sectionValues.forEach(value => $menu.append($('<li>').append(
                $('<button>', { type: 'button', class: 'dropdown-item', text: value, 'data-value': value })
                    .on('click', () => {
                        VersionPicker.#choose(select, value);
                        // Bootstrap closes the menu; the focus goes back to the chip, as after Escape.
                        $(chip).find('.dropdown-toggle').trigger('focus');
                    }))));
        });
    }

    /**
     * Shows the selected versions: in each chip, as the current item of its menu, and in Home's "Compare" button.
     */
    #showSelection() {
        [[this.#chip('base'), this.#baseSelect], [this.#chip('target'), this.#targetSelect]].forEach(([chip, select]) => {
            $(chip).find('.ted-version-chip__version').text(select.value);
            $(chip).find('.dropdown-item').each(function () {
                const current = this.dataset.value === select.value;
                $(this).toggleClass('active', current).attr('aria-current', current ? 'true' : null);
            });
        });
        $('#compare-versions .ted-home__pair').text(`${this.#baseSelect.value} › ${this.#targetSelect.value}`);
    }

    /**
     * Gives the dialog's two selects the options and the values of the two hidden selects.
     */
    #fillDialog() {
        [[this.#dialogBaseSelect, this.#baseSelect], [this.#dialogTargetSelect, this.#targetSelect]].forEach(([dialogSelect, select]) => {
            $(dialogSelect).empty().append(Array.from(select.options, option => new Option(option.text, option.value)));
            dialogSelect.value = select.value;
        });
    }

    /**
     * Applies the dialog's choices with one reload, and closes it.
     * When both versions change, the base select takes its value (and appState its version) without an event, and
     * only the target select triggers change: its handler reloads once, with both values. Triggering both selects
     * would start two reloads.
     */
    #applyDialog() {
        const base = this.#dialogBaseSelect.value;
        const target = this.#dialogTargetSelect.value;
        const baseChanged = base !== this.#baseSelect.value;
        const targetChanged = target !== this.#targetSelect.value;

        bootstrap.Modal.getOrCreateInstance(document.getElementById('version-dialog')).hide();

        if (baseChanged && targetChanged) {
            this.#baseSelect.value = base;
            appState.baseVersion = base;
            VersionPicker.#choose(this.#targetSelect, target);
        } else if (baseChanged) {
            VersionPicker.#choose(this.#baseSelect, base);
        } else if (targetChanged) {
            VersionPicker.#choose(this.#targetSelect, target);
        }
    }

    /**
     * Chooses a version in a select, as the user would in the select itself: the application reloads on its change
     * event. Choosing the selected version again changes nothing.
     *
     * @param {HTMLSelectElement} select
     * @param {string} value
     */
    static #choose(select, value) {
        if (select.value !== value) {
            $(select).val(value).trigger('change');
        }
    }
}
