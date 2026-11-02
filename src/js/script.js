/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { SdkExplorerApplication } from './app.js';


$(document).ready(() => {
    SdkExplorerApplication.init();

    // Enable Bootstrap popovers everywhere
    $('[data-bs-toggle="popover"]').popover({html:true});

    // The EU banner's "How do you know?" button shows and hides its explanation; Escape hides it again
    const $globanToggle = $('.ted-globan__toggle');
    const showGlobanExplanation = (shown) => {
        $globanToggle.attr('aria-expanded', String(shown));
        $('#ted-globan-dropdown').prop('hidden', !shown);
    };
    $globanToggle.on('click', () => showGlobanExplanation($globanToggle.attr('aria-expanded') !== 'true'));
    $(document).on('keydown', (event) => {
        if (event.key === 'Escape' && $globanToggle.attr('aria-expanded') === 'true') {
            showGlobanExplanation(false);
            $globanToggle.trigger('focus');
        }
    });

    // Keep --ted-bar-height at the height of the pinned bar, for the elements of the work area that stick under it
    const bar = document.querySelector('.ted-bar');
    new ResizeObserver(() => document.documentElement.style.setProperty('--ted-bar-height', `${bar.offsetHeight}px`)).observe(bar);

    var currentStep = 0;

    // Move to the next step when the "Next" button is clicked
    $(document).on('click', '.next-step', function () {
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep++;
        $('[data-step="' + currentStep + '"]').popover('show');
    });

    // Cancel the tour when the "Cancel" button is clicked
    $(document).on('click', '.cancel-tour', function () {
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep = 0;
    });

    // Start the tour when the "Start Tour" button is clicked
    $('#start-tour').click(function () {
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep = 0;
        $('[data-step="' + currentStep + '"]').popover('show');
    });
});

