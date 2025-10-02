// ==UserScript==
// @name         Gmail A–Z Sorter
// @namespace    http://tampermonkey.net/
// @version      0.4.0
// @description  Sort the visible Gmail thread list alphabetically by Subject (A→Z or Z→A), ignoring emojis; includes Reset and Auto.
// @author       Rogger Fabri
// @match        https://mail.google.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ------- Helpers -------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Remove emojis & variation selectors; keep text
  function stripEmojis(str) {
    if (!str) return '';
    // Common emoji ranges + VS16 + keycaps + flags
    return str
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')         // flags
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')         // symbols & pictographs
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')         // Supplemental Symbols & Pictographs
      .replace(/[\u{2600}-\u{26FF}]/gu, '')           // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '')           // Dingbats
      .replace(/\uFE0F/gu, '')                        // Variation Selector-16
      .replace(/[\u20E3]/gu, '')                      // keycap
      .trim();
  }

  function normalizeText(t) {
    return stripEmojis(t)
      .normalize('NFKD')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Try several selectors for subject inside a row
  function subjectFromRow(row) {
    // Gmail keeps a subject span with class 'bog' (legacy) inside '.y6'
    // Newer UIs may restructure, so try a few.
    const candidates = [
      '.y6 .bog',             // classic subject span
      '.y6 span',             // fallback inside y6
      '[data-legacy-thread-id] .y6 .bog', // thread list
      'span[dir] .bog',
      '.xS .bqe',             // promotions/social
      '.xT .y6 span span',    // subject text
      '.xT .y6'               // last resort
    ];
    for (const sel of candidates) {
      const el = row.querySelector(sel);
      if (el && el.textContent) return el.textContent;
    }
    // Absolute fallback: use the row's aria-label (often includes subject)
    const ar = row.getAttribute('aria-label');
    if (ar) return ar;
    return '';
  }

  // Locate the tbody that contains message rows
  function getListContainer() {
    // Primary thread table
    const tbodies = document.querySelectorAll('div[role="main"] table[role="grid"] tbody');
    for (const tb of tbodies) {
      // Look for conversation rows inside
      if (tb.querySelector('tr.zA,[role="row"]')) return tb;
    }
    // Legacy fallback
    return document.querySelector('div[role="main"] .aeF .UI table tbody');
  }

  // Return the row elements we can sort
  function getRows() {
    const container = getListContainer();
    if (!container) return { container: null, rows: [] };
    // Gmail marks conversations with tr.zA (read/unread variants)
    // Avoid header rows like "Categories"
    const rows = Array.from(container.querySelectorAll('tr.zA,[role="row"]'))
      .filter(r => !r.querySelector('th') && r.offsetParent !== null);
    return { container, rows };
  }

  // ------- Toolbar -------
  function ensureToolbar() {
    if (document.getElementById('gm-az-toolbar')) return;

    const host = document.createElement('div');
    host.id = 'gm-az-toolbar';
    host.style.position = 'fixed';
    host.style.zIndex = '999999';
    host.style.bottom = '16px';
    host.style.right = '16px';
    host.style.background = 'rgba(32,33,36,0.92)';
    host.style.color = '#fff';
    host.style.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    host.style.borderRadius = '10px';
    host.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
    host.style.padding = '8px';
    host.style.display = 'flex';
    host.style.gap = '6px';

    function mkBtn(label, title) {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title || '';
      Object.assign(b.style, {
        background: 'transparent',
        color: 'inherit',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px',
        padding: '6px 8px',
        cursor: 'pointer'
      });
      b.onmouseenter = () => b.style.background = 'rgba(255,255,255,0.06)';
      b.onmouseleave = () => b.style.background = 'transparent';
      return b;
    }

    const btnAZ   = mkBtn('A→Z', 'Sort by Subject A→Z (ignore emojis)');
    const btnZA   = mkBtn('Z→A', 'Sort by Subject Z→A (ignore emojis)');
    const btnRst  = mkBtn('Reset', 'Restore original order');
    const btnAuto = mkBtn('Auto', 'Auto-sort A→Z when list changes (toggle)');
    btnAuto.dataset.active = '0';

    host.append(btnAZ, btnZA, btnRst, btnAuto);
    document.body.appendChild(host);

    // Remember original order via data-index
    function tagOriginalOrder(rows) {
      rows.forEach((r, i) => {
        if (!r.dataset._gmIndex) r.dataset._gmIndex = String(i);
      });
    }

    function sortRows(dir = 'asc') {
      const { container, rows } = getRows();
      if (!container || rows.length === 0) return;

      tagOriginalOrder(rows);

      const keyed = rows.map(r => {
        const subj = subjectFromRow(r);
        return {
          key: normalizeText(subj),
          el: r
        };
      });

      keyed.sort((a, b) => {
        const cmp = a.key.localeCompare(b.key, undefined, { sensitivity: 'base', numeric: true, ignorePunctuation: true });
        return dir === 'asc' ? cmp : -cmp;
      });

      const frag = document.createDocumentFragment();
      keyed.forEach(k => frag.appendChild(k.el));
      container.appendChild(frag);
    }

    function resetRows() {
      const { container, rows } = getRows();
      if (!container || rows.length === 0) return;
      const sorted = [...rows].sort((a, b) => {
        const ai = Number(a.dataset._gmIndex ?? Number.MAX_SAFE_INTEGER);
        const bi = Number(b.dataset._gmIndex ?? Number.MAX_SAFE_INTEGER);
        return ai - bi;
      });
      const frag = document.createDocumentFragment();
      sorted.forEach(r => frag.appendChild(r));
      container.appendChild(frag);
    }

    btnAZ.addEventListener('click', () => sortRows('asc'));
    btnZA.addEventListener('click', () => sortRows('desc'));
    btnRst.addEventListener('click', resetRows);

    btnAuto.addEventListener('click', () => {
      const active = btnAuto.dataset.active === '1';
      btnAuto.dataset.active = active ? '0' : '1';
      btnAuto.style.borderColor = active ? 'rgba(255,255,255,0.2)' : '#7aa2ff';
      btnAuto.style.boxShadow = active ? 'none' : '0 0 0 1px #7aa2ff inset';
    });

    // Mutation observer: when list updates, optionally auto sort
    const observer = new MutationObserver(() => {
      if (btnAuto.dataset.active === '1') {
        // Debounce a bit to let Gmail finish rendering
        clearTimeout(observer._t);
        observer._t = setTimeout(() => sortRows('asc'), 250);
      }
    });

    (async function watch() {
      while (true) {
        const container = getListContainer();
        if (container && observer._container !== container) {
          if (observer._container) observer.disconnect();
          observer.observe(container, { childList: true, subtree: true });
          observer._container = container;
        }
        await sleep(800);
      }
    })();
  }

  // ------- Boot -------
  async function boot() {
    // Wait until Gmail main pane exists
    for (let i = 0; i < 60; i++) {
      if (document.querySelector('div[role="main"]')) break;
      await sleep(500);
    }
    ensureToolbar();
  }

  // Re-boot on navigation (Gmail is an SPA)
  const navObs = new MutationObserver(() => {
    if (!document.getElementById('gm-az-toolbar')) ensureToolbar();
  });
  navObs.observe(document.documentElement, { childList: true, subtree: true });

  boot();
})();
