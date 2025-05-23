// ==UserScript==
// @name         Gmail Label Toggle
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Toggle visibility of emails by label in Gmail
// @author       You
// @match        https://mail.google.com/mail/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Add CSS for the toggle button
    GM_addStyle(`
        .label-toggle-btn {
            cursor: pointer;
            margin-left: 5px;
            opacity: 0.7;
            transition: opacity 0.2s;
            font-size: 14px;
            display: inline-block;
        }
        .label-toggle-btn:hover {
            opacity: 1;
        }
        .label-toggle-btn.active {
            transform: rotate(45deg);
            opacity: 1;
        }
        .label-toggle-hidden {
            display: none !important;
        }
    `);

    // Store hidden labels
    const hiddenLabels = new Set();

    // Function to add toggle buttons to labels
    function addToggleButtons() {
        // Target the label elements in the sidebar
        const labelElements = document.querySelectorAll('.TO .aio.aip .nU a');

        labelElements.forEach(labelElement => {
            // Skip if we've already added a toggle button
            if (labelElement.querySelector('.label-toggle-btn')) return;

            // Get the label name (clean it from emojis if needed)
            let labelText = labelElement.textContent.trim();

            // Create the toggle button
            const toggleBtn = document.createElement('span');
            toggleBtn.className = 'label-toggle-btn';
            toggleBtn.textContent = '✖';
            toggleBtn.title = 'Toggle visibility of emails with this label';

            // Set active state if already hidden
            if (hiddenLabels.has(labelText)) {
                toggleBtn.classList.add('active');
            }

            // Add click event
            toggleBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                toggleLabelVisibility(labelText, toggleBtn);
            });

            // Add the button to the label
            labelElement.appendChild(toggleBtn);
        });
    }

    // Function to toggle visibility of emails with a specific label
    function toggleLabelVisibility(labelText, buttonElement) {
        // Toggle button active state
        buttonElement.classList.toggle('active');

        // Update hidden labels set
        if (hiddenLabels.has(labelText)) {
            hiddenLabels.delete(labelText);
        } else {
            hiddenLabels.add(labelText);
        }

        // Apply visibility changes to matching email rows
        updateEmailVisibility();
    }

    // Apply visibility to emails based on current hidden labels
    function updateEmailVisibility() {
        // Target all email rows in the inbox
        const emailRows = document.querySelectorAll('tr.zA');

        emailRows.forEach(row => {
            // Find the label element within the row
            const labelElements = row.querySelectorAll('.ar.as .at');
            let shouldHide = false;

            // Check if the row has any hidden labels
            labelElements.forEach(label => {
                const labelTitle = label.getAttribute('title') || '';
                if (hiddenLabels.has(labelTitle)) {
                    shouldHide = true;
                }
            });

            // Apply visibility
            if (shouldHide) {
                row.classList.add('label-toggle-hidden');
            } else {
                row.classList.remove('label-toggle-hidden');
            }
        });
    }

    // Initialize the observer to watch for DOM changes
    function initObserver() {
        // Options for the observer
        const observerOptions = {
            childList: true,
            subtree: true
        };

        // Observer for label sidebar updates
        const sidebarObserver = new MutationObserver(mutations => {
            addToggleButtons();
        });

        // Start observing the sidebar for label changes
        const sidebarContainer = document.querySelector('.TK');
        if (sidebarContainer) {
            sidebarObserver.observe(sidebarContainer, observerOptions);
        }

        // Observer for inbox content updates
        const inboxObserver = new MutationObserver(mutations => {
            updateEmailVisibility();
        });

        // Start observing the inbox for email changes
        const inboxContainer = document.querySelector('.Cp');
        if (inboxContainer) {
            inboxObserver.observe(inboxContainer, observerOptions);
        }
    }

    // Main initialization function
    function init() {
        // Add initial toggle buttons
        addToggleButtons();

        // Initialize observers
        setTimeout(initObserver, 1000);

        // Check periodically for new labels that might not trigger the observer
        setInterval(addToggleButtons, 3000);
    }

    // Wait for Gmail to fully load
    function waitForGmail() {
        if (document.querySelector('.TK') && document.querySelector('.Cp')) {
            init();
        } else {
            setTimeout(waitForGmail, 1000);
        }
    }

    // Start the waiting process
    waitForGmail();
})();