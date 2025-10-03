// ==UserScript==
// @name         Gmail A–Z Sorter
// @namespace    http://tampermonkey.net/
// @version      0.9.1
// @description  Sort the visible Gmail thread list alphabetically by Subject (A→Z or Z→A), ignoring emojis; includes Reset and Auto.
// @author       Rogger Fabri
// @match        https://mail.google.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------------- Utilities ----------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Compile regexes once for performance
  const emojiRegexes = [
    /[\u{1F1E6}-\u{1F1FF}]/gu,
    /[\u{1F300}-\u{1FAFF}]/gu,
    /[\u{1F900}-\u{1F9FF}]/gu,
    /[\u{2600}-\u{26FF}]/gu,
    /[\u{2700}-\u{27BF}]/gu,
    /\uFE0F/gu,
    /[\u20E3]/gu
  ];
  const whitespaceRegex = /\s+/g;

  function stripEmojis(str) {
    if (!str) return '';
    let result = str;
    for (const regex of emojiRegexes) {
      result = result.replace(regex, '');
    }
    return result.trim();
  }
  
  function normalizeText(t) {
    return stripEmojis(t).normalize('NFKD').replace(whitespaceRegex, ' ').trim().toLowerCase();
  }

  // Cache subject extraction with optimized selector
  const subjectSelectors = '.y6 .bog, .y6 span, [data-legacy-thread-id] .y6 .bog, .xS .bqe, .xT .y6 span span, .xT .y6';
  
  function subjectFromRow(row) {
    const el = row.querySelector(subjectSelectors);
    if (el?.textContent) return el.textContent;
    return row.getAttribute('aria-label') || '';
  }

  // Cache container briefly to avoid repeated queries, with validation
  let containerCache = { el: null, time: 0 };
  function getListContainer() {
    const now = Date.now();
    // Validate cached container is still in DOM
    if (containerCache.el && now - containerCache.time < 1000 && document.contains(containerCache.el)) {
      return containerCache.el;
    }
    const tbodies = document.querySelectorAll('div[role="main"] table[role="grid"] tbody');
    for (const tb of tbodies) {
      if (tb.querySelector('tr.zA')) {
        containerCache = { el: tb, time: now };
        return tb;
      }
    }
    containerCache = { el: null, time: now };
    return null;
  }
  
  function getRows() {
    const container = getListContainer();
    if (!container) return { container: null, rows: [] };
    const rows = Array.from(container.querySelectorAll('tr.zA')).filter(r => r.offsetParent !== null);
    return { container, rows };
  }

  // Cache user index since it rarely changes
  let cachedUserIndex = null;
  function userIndex() {
    if (cachedUserIndex === null) {
      const m = location.pathname.match(/\/u\/(\d+)/);
      cachedUserIndex = m ? m[1] : '0';
    }
    return cachedUserIndex;
  }

  function firstAnchorHref(row) {
    const a = row.querySelector('a[href*="#inbox/"], a[href*="#label/"], a[href*="#all/"]');
    return a ? a.href : null;
  }

  function threadUrlFromRow(row) {
    const withTid = row.hasAttribute('data-legacy-thread-id')
      ? row
      : (row.querySelector('[data-legacy-thread-id]') || row.closest('[data-legacy-thread-id]'));
    if (withTid) {
      const tid = withTid.getAttribute('data-legacy-thread-id');
      if (tid) return `${location.origin}/mail/u/${userIndex()}/#inbox/${tid}`;
    }
    const href = firstAnchorHref(row);
    if (href) return href;
    return null;
  }

  // Elements where we should NOT intercept (checkboxes, stars, hover buttons, etc.)
  // Cache control selectors
  const controlSelectors = 'div[role="checkbox"], .T-KT, .T-KT-JX, .afn, td.apU, td.xW, .bq4, .bqX, .ar, .asl, [role="button"], [data-tooltip]';
  const controlAriaRegex = /(archive|delete|trash|remove|mark as read|mark as unread|snooze|move to|label|mute|report spam)/;
  
  function isControlTarget(t) {
    if (!t) return false;
    if (t.closest(controlSelectors)) return true;
    // Only check aria-label if element has one
    if (t.hasAttribute('aria-label')) {
      const al = t.getAttribute('aria-label').toLowerCase();
      if (controlAriaRegex.test(al)) return true;
    }
    return false;
  }

  // ------------- Global capture nav override -------------
  function handleNav(ev) {
    const t = ev.target;
    const row = t && t.closest && t.closest('tr.zA');
    if (!row) return;

    // Allow Gmail to handle quick action buttons & context menu
    if (isControlTarget(t) || ev.button === 2) return;

    const type = ev.type;
    if (type === 'pointerdown' || type === 'mousedown' || type === 'mouseup') {
      ev.stopImmediatePropagation();
      return;
    }

    if (type === 'click' || type === 'auxclick' || (type === 'keydown' && (ev.key === 'Enter' || ev.keyCode === 13))) {
      const url = threadUrlFromRow(row);
      if (!url) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      const newTab = ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.type === 'auxclick' || ev.button === 1;
      if (newTab) window.open(url, '_blank', 'noopener');
      else location.assign(url);
    }
  }

  ['pointerdown','mousedown','mouseup','click','auxclick','keydown']
    .forEach(evt => document.addEventListener(evt, handleNav, true));

  // ---------------- Toolbar (sorting) ----------------
  function ensureToolbar() {
    if (document.getElementById('gm-az-toolbar')) return;
    const host = document.createElement('div');
    host.id = 'gm-az-toolbar';
    Object.assign(host.style, {
      position: 'fixed',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2147483647,
      background: 'rgba(32,33,36,0.92)',
      color: '#fff',
      font: '12px system-ui, -apple-system, Segoe UI, Roboto, Arial',
      borderRadius: '10px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
      padding: '8px',
      display: 'flex',
      gap: '6px'
    });

    function mkBtn(txt, title) {
      const b = document.createElement('button');
      b.textContent = txt; b.title = title || '';
      Object.assign(b.style, {
        background: 'transparent', color: 'inherit',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px', padding: '6px 8px', cursor: 'pointer'
      });
      b.onmouseenter = () => b.style.background = 'rgba(255,255,255,0.06)';
      b.onmouseleave = () => b.style.background = 'transparent';
      return b;
    }

    const btnAZ = mkBtn('A→Z', 'Click to toggle auto-sort A→Z');
    const btnZA = mkBtn('Z→A', 'Click to toggle auto-sort Z→A');
    const btnR  = mkBtn('Reset', 'Restore original order');

    host.append(btnAZ, btnZA, btnR);
    document.body.appendChild(host);

    // Cache localeCompare options for performance
    const compareOpts = { sensitivity: 'base', numeric: true, ignorePunctuation: true };
    
    // Track active mode: null, 'asc', or 'desc'
    let activeMode = null;
    // Flag to prevent observer from reacting to reset operations
    let isResetting = false;

    function tagOriginalIfNeeded(rows){ 
      // Only tag rows that don't already have an index
      rows.forEach(r => {
        if (!r.dataset._gmIdx) {
          const { rows: currentRows } = getRows();
          const idx = currentRows.indexOf(r);
          if (idx >= 0) r.dataset._gmIdx = String(idx);
        }
      });
    }

    function updateButtonStyles() {
      // Reset all buttons
      btnAZ.style.borderColor = 'rgba(255,255,255,0.2)';
      btnAZ.style.boxShadow = 'none';
      btnZA.style.borderColor = 'rgba(255,255,255,0.2)';
      btnZA.style.boxShadow = 'none';
      
      // Highlight active button
      if (activeMode === 'asc') {
        btnAZ.style.borderColor = '#7aa2ff';
        btnAZ.style.boxShadow = '0 0 0 1px #7aa2ff inset';
      } else if (activeMode === 'desc') {
        btnZA.style.borderColor = '#7aa2ff';
        btnZA.style.boxShadow = '0 0 0 1px #7aa2ff inset';
      }
    }

    function sort(dir='asc') {
      const { container, rows } = getRows();
      if (!container || !rows.length) return;
      // Tag original indices before first sort
      tagOriginalIfNeeded(rows);
      const keyed = rows.map(r => ({ key: normalizeText(subjectFromRow(r)), el: r }));
      keyed.sort((a,b) => dir==='asc'
        ? a.key.localeCompare(b.key, undefined, compareOpts)
        : b.key.localeCompare(a.key, undefined, compareOpts)
      );
      const frag = document.createDocumentFragment();
      keyed.forEach(k => frag.appendChild(k.el));
      container.appendChild(frag);
    }

    function reset() {
      const { container, rows } = getRows();
      if (!container || !rows.length) return;
      
      // Filter rows that have original indices and sort by them
      const withIdx = rows.filter(r => r.dataset._gmIdx !== undefined);
      if (withIdx.length === 0) {
        // No indices stored, nothing to reset
        console.log('No original order stored. Sort first, then reset.');
        return;
      }
      
      // Set flags to prevent observer from reacting
      isResetting = true;
      activeMode = null;
      clearTimeout(obs._t);
      mutationCount = 0;
      
      // Update UI immediately
      updateButtonStyles();
      
      // Perform reset
      const sorted = [...withIdx].sort((a,b) => (+a.dataset._gmIdx) - (+b.dataset._gmIdx));
      const frag = document.createDocumentFragment();
      sorted.forEach(r => frag.appendChild(r));
      container.appendChild(frag);
      
      // Clear the flag after a short delay to allow DOM to settle
      setTimeout(() => {
        isResetting = false;
      }, 100);
    }

    btnAZ.onclick = () => {
      if (activeMode === 'asc') {
        // Toggle off
        activeMode = null;
      } else {
        // Toggle on
        activeMode = 'asc';
        sort('asc');
      }
      updateButtonStyles();
      mutationCount = 0;
      clearTimeout(obs._t);
    };
    
    btnZA.onclick = () => {
      if (activeMode === 'desc') {
        // Toggle off
        activeMode = null;
      } else {
        // Toggle on
        activeMode = 'desc';
        sort('desc');
      }
      updateButtonStyles();
      mutationCount = 0;
      clearTimeout(obs._t);
    };
    
    btnR.onclick = reset;

    // Auto-sort observer with increased debounce to prevent flipping
    let mutationCount = 0;
    let lastMutationTime = 0;
    let lastSortTime = 0;
    const obs = new MutationObserver(() => {
      // Ignore mutations during reset or when no active mode
      if (isResetting || !activeMode) return;
      
      const now = Date.now();
      // Reset count if more than 3 seconds passed since last mutation
      if (now - lastMutationTime > 3000) {
        mutationCount = 0;
      }
      lastMutationTime = now;
      mutationCount++;
      clearTimeout(obs._t);
      // Cap the mutation count to prevent unbounded delay growth
      const effectiveCount = Math.min(mutationCount, 5);
      const delay = effectiveCount > 3 ? 1200 : 800;
      obs._t = setTimeout(() => {
        if (!isResetting && activeMode) {
          sort(activeMode);
          lastSortTime = Date.now();
          mutationCount = 0; // Reset counter after sort
        }
      }, delay);
    });
    
    // Periodic check to ensure auto-sort keeps working after long inactivity
    setInterval(() => {
      if (activeMode && !isResetting) {
        const now = Date.now();
        const { rows } = getRows();
        // If we have rows and haven't sorted in the last 5 seconds, check if sort is needed
        if (rows.length > 0 && now - lastSortTime > 5000) {
          // Check if rows are actually out of order
          const keys = rows.map(r => normalizeText(subjectFromRow(r)));
          const needsSort = keys.some((key, i) => {
            if (i === 0) return false;
            return activeMode === 'asc' 
              ? key.localeCompare(keys[i-1], undefined, compareOpts) < 0
              : key.localeCompare(keys[i-1], undefined, compareOpts) > 0;
          });
          if (needsSort) {
            sort(activeMode);
            lastSortTime = now;
          }
        }
      }
    }, 3000);
    
    // Handle visibility change (when tab becomes visible again)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && activeMode && !isResetting) {
        // Small delay to let Gmail settle, then re-sort if needed
        setTimeout(() => {
          const { rows } = getRows();
          if (rows.length > 0) {
            const keys = rows.map(r => normalizeText(subjectFromRow(r)));
            const needsSort = keys.some((key, i) => {
              if (i === 0) return false;
              return activeMode === 'asc' 
                ? key.localeCompare(keys[i-1], undefined, compareOpts) < 0
                : key.localeCompare(keys[i-1], undefined, compareOpts) > 0;
            });
            if (needsSort) {
              sort(activeMode);
              lastSortTime = Date.now();
            }
          }
        }, 1000);
      }
    });
    
    (async function watch() {
      while (true) {
        const c = getListContainer();
        // Check if container changed OR if current observed container is no longer in DOM
        if (c && (obs._c !== c || (obs._c && !document.contains(obs._c)))) {
          if (obs._c) obs.disconnect();
          mutationCount = 0; // Reset counter on container change
          // Watch subtree to catch Gmail's dynamic updates
          obs.observe(c, { childList: true, subtree: true });
          obs._c = c;
          // Sort immediately when reconnecting to a new/changed container
          if (activeMode && !isResetting) {
            setTimeout(() => {
              sort(activeMode);
              lastSortTime = Date.now();
            }, 500);
          }
        }
        // Check more frequently to catch container changes quickly
        await sleep(1000);
      }
    })();
  }

  // ---------------- Boot ----------------
  async function boot() {
    for (let i = 0; i < 80; i++) {
      if (document.querySelector('div[role="main"]')) break;
      await sleep(250);
    }
    ensureToolbar();
    
    // Monitor for toolbar removal with a more specific observer
    const gmailMain = document.querySelector('div[role="main"]');
    if (gmailMain) {
      new MutationObserver(() => {
        if (!document.getElementById('gm-az-toolbar')) ensureToolbar();
      }).observe(gmailMain.parentElement || document.body, { childList: true, subtree: false });
    }
  }

  boot();
})();
