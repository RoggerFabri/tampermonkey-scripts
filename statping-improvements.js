// ==UserScript==
// @name         Statping Dashboard Column Sorter
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Add column sorting functionality to Statping dashboard table
// @author       Rogger Fabri
// @match        https://status.home/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const SORTABLE_HEADER_CLASS = 'tm-statping-sortable-header';
    const SORT_INDICATOR_CLASS = 'tm-statping-sort-indicator';
    const STYLE_ID = 'tm-statping-sort-style';
    let observerInitialized = false;

    window.addEventListener('load', () => {
        injectStyles();
        waitForTable();
    });

    function waitForTable(retryCount = 0) {
        if (ensureSorting()) {
            initObserver();
            return;
        }

        if (retryCount < 10) {
            setTimeout(() => waitForTable(retryCount + 1), 500);
        } else {
            initObserver();
        }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${SORTABLE_HEADER_CLASS} {
                position: relative;
                padding-right: 18px !important;
                cursor: pointer;
                user-select: none;
            }
            .${SORT_INDICATOR_CLASS} {
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 11px;
                opacity: 0.4;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
        `;
        document.head.appendChild(style);
    }

    function initObserver() {
        if (observerInitialized || !document.body) {
            return;
        }

        const observer = new MutationObserver(() => {
            ensureSorting();
        });

        observer.observe(document.body, { childList: true, subtree: true });
        observerInitialized = true;
    }

    function ensureSorting() {
        const table = document.querySelector('table.table');
        if (!table) {
            return false;
        }

        const headers = table.querySelectorAll('thead th');
        const tbody = table.querySelector('tbody');

        if (!headers.length || !tbody) {
            return false;
        }

        if (table.dataset.tmSortingInitialized !== 'true') {
            console.log('Enabling Statping dashboard sorting');
        }

        headers.forEach((header, index) => {
            if (index >= headers.length - 1) {
                return;
            }

            if (header.dataset.tmSortableBound === 'true') {
                return;
            }

            header.dataset.tmSortableBound = 'true';
            header.dataset.tmSortableIndex = String(index);
            header.dataset.sortDirection = '';
            header.classList.add(SORTABLE_HEADER_CLASS);
            header.title = 'Click to sort';

            let indicator = header.querySelector(`.${SORT_INDICATOR_CLASS}`);
            if (!indicator) {
                indicator = document.createElement('span');
                indicator.className = SORT_INDICATOR_CLASS;
                indicator.textContent = '|';
                header.appendChild(indicator);
            } else {
                indicator.textContent = '|';
                indicator.style.opacity = '0.4';
            }

            header.removeEventListener('click', onHeaderClick);
            header.addEventListener('click', onHeaderClick);
        });

        table.dataset.tmSortingInitialized = 'true';
        return true;
    }

    function onHeaderClick(event) {
        const header = event.currentTarget;
        const columnIndex = Number(header.dataset.tmSortableIndex);
        const table = header.closest('table');
        const indicator = header.querySelector(`.${SORT_INDICATOR_CLASS}`);

        if (!table || Number.isNaN(columnIndex) || !indicator) {
            return;
        }

        sortTable(table, columnIndex, header, indicator);
    }

    function sortTable(table, columnIndex, header, indicator) {
        const tbody = table.querySelector('tbody');
        if (!tbody) {
            return;
        }

        const rows = Array.from(tbody.querySelectorAll('tr'));

        const isAscending = header.dataset.sortDirection !== 'asc';
        header.dataset.sortDirection = isAscending ? 'asc' : 'desc';

        table.querySelectorAll('thead th').forEach(th => {
            if (th !== header) {
                th.dataset.sortDirection = '';
            }
        });

        table.querySelectorAll(`.${SORT_INDICATOR_CLASS}`).forEach(ind => {
            if (ind !== indicator) {
                ind.textContent = '|';
                ind.style.opacity = '0.4';
            }
        });

        indicator.textContent = isAscending ? '^' : 'v';
        indicator.style.opacity = '1';

        rows.sort((a, b) => {
            const aCells = a.querySelectorAll('td');
            const bCells = b.querySelectorAll('td');

            if (!aCells[columnIndex] || !bCells[columnIndex]) {
                return 0;
            }

            let aText = '';
            let bText = '';

            switch (columnIndex) {
                case 0:
                    aText = aCells[columnIndex].textContent.trim();
                    bText = bCells[columnIndex].textContent.trim();
                    break;
                case 1: {
                    const aStatus = aCells[columnIndex].querySelector('.badge');
                    const bStatus = bCells[columnIndex].querySelector('.badge');
                    aText = aStatus ? aStatus.textContent.trim() : '';
                    bText = bStatus ? bStatus.textContent.trim() : '';
                    break;
                }
                case 2: {
                    const aVisibility = aCells[columnIndex].querySelector('.badge');
                    const bVisibility = bCells[columnIndex].querySelector('.badge');
                    aText = aVisibility ? aVisibility.textContent.trim() : '';
                    bText = bVisibility ? bVisibility.textContent.trim() : '';
                    break;
                }
                case 3:
                    aText = aCells[columnIndex].textContent.trim();
                    bText = bCells[columnIndex].textContent.trim();
                    break;
                case 4: {
                    const aFailedBars = aCells[columnIndex].querySelectorAll('path[fill*="245,142,73"], path[fill*="224,26,26"]');
                    const bFailedBars = bCells[columnIndex].querySelectorAll('path[fill*="245,142,73"], path[fill*="224,26,26"]');
                    return isAscending ?
                        aFailedBars.length - bFailedBars.length :
                        bFailedBars.length - aFailedBars.length;
                }
                default:
                    return 0;
            }

            if (!aText && !bText) {
                return 0;
            }
            if (!aText) {
                return isAscending ? 1 : -1;
            }
            if (!bText) {
                return isAscending ? -1 : 1;
            }

            const comparison = aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
            return isAscending ? comparison : -comparison;
        });

        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
    }
})();
