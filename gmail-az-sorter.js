// ==UserScript==
// @name         Gmail A–Z Sorter
// @namespace    http://tampermonkey.net/
// @version      0.7.1
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

  function stripEmojis(str) {
    if (!str) return '';
    return str
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/\uFE0F/gu, '')
      .replace(/[\u20E3]/gu, '')
      .trim();
  }
  function normalizeText(t) {
    return stripEmojis(t).normalize('NFKD').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function subjectFromRow(row) {
    const candidates = [
      '.y6 .bog', '.y6 span', '[data-legacy-thread-id] .y6 .bog',
      '.xS .bqe', '.xT .y6 span span', '.xT .y6'
    ];
    for (const sel of candidates) {
      const el = row.querySelector(sel);
      if (el && el.textContent) return el.textContent;
    }
    return row.getAttribute('aria-label') || '';
  }

  function getListContainer() {
    const tbodies = document.querySelectorAll('div[role="main"] table[role="grid"] tbody');
    for (const tb of tbodies) if (tb.querySelector('tr.zA')) return tb;
    return null;
  }
  function getRows() {
    const container = getListContainer();
    if (!container) return { container: null, rows: [] };
    const rows = Array.from(container.querySelectorAll('tr.zA')).filter(r => r.offsetParent !== null);
    return { container, rows };
  }

  function userIndex() {
    const m = location.pathname.match(/\/u\/(\d+)/);
    return m ? m[1] : '0';
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
  function isControlTarget(t) {
    if (!t) return false;
    if (t.closest('div[role="checkbox"], .T-KT, .T-KT-JX, .afn')) return true;
    // hover quick-action areas
    if (t.closest('td.apU, td.xW, .bq4, .bqX, .ar, .asl')) return true;
    if (t.closest('[role="button"], [data-tooltip], [aria-label]')) return true;
    const al = (t.getAttribute('aria-label') || '').toLowerCase();
    if (/(archive|delete|trash|remove|mark as read|mark as unread|snooze|move to|label|mute|report spam)/.test(al)) return true;
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

    const btnAZ = mkBtn('A→Z', 'Sort by Subject A→Z');
    const btnZA = mkBtn('Z→A', 'Sort by Subject Z→A');
    const btnR  = mkBtn('Reset', 'Restore order');
    const btnAuto = mkBtn('Auto', 'Auto-sort A→Z on updates'); btnAuto.dataset.active = '0';

    host.append(btnAZ, btnZA, btnR, btnAuto);
    document.body.appendChild(host);

    function tagOriginal(rows){ rows.forEach((r,i)=>{ if (!r.dataset._gmIdx) r.dataset._gmIdx = String(i); }); }

    function sort(dir='asc') {
      const { container, rows } = getRows();
      if (!container || !rows.length) return;
      tagOriginal(rows);
      const keyed = rows.map(r => ({ key: normalizeText(subjectFromRow(r)), el: r }));
      keyed.sort((a,b) => dir==='asc'
        ? a.key.localeCompare(b.key, undefined, { sensitivity:'base', numeric:true, ignorePunctuation:true })
        : b.key.localeCompare(a.key, undefined, { sensitivity:'base', numeric:true, ignorePunctuation:true })
      );
      const frag = document.createDocumentFragment();
      keyed.forEach(k => frag.appendChild(k.el));
      container.appendChild(frag);
    }

    function reset() {
      const { container, rows } = getRows();
      if (!container || !rows.length) return;
      const sorted = [...rows].sort((a,b) => (+a.dataset._gmIdx) - (+b.dataset._gmIdx));
      const frag = document.createDocumentFragment();
      sorted.forEach(r => frag.appendChild(r));
      container.appendChild(frag);
    }

    btnAZ.onclick = () => sort('asc');
    btnZA.onclick = () => sort('desc');
    btnR.onclick  = reset;
    btnAuto.onclick = () => {
      const on = btnAuto.dataset.active === '1';
      btnAuto.dataset.active = on ? '0' : '1';
      btnAuto.style.borderColor = on ? 'rgba(255,255,255,0.2)' : '#7aa2ff';
      btnAuto.style.boxShadow = on ? 'none' : '0 0 0 1px #7aa2ff inset';
    };

    const obs = new MutationObserver(() => {
      if (btnAuto.dataset.active === '1') {
        clearTimeout(obs._t); obs._t = setTimeout(() => sort('asc'), 250);
      }
    });
    (async function watch() {
      while (true) {
        const c = getListContainer();
        if (c && obs._c !== c) {
          if (obs._c) obs.disconnect();
          obs.observe(c, { childList: true, subtree: true });
          obs._c = c;
        }
        await sleep(800);
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
  }

  new MutationObserver(() => {
    if (!document.getElementById('gm-az-toolbar')) ensureToolbar();
  }).observe(document.documentElement, { childList: true, subtree: true });

  boot();
})();
