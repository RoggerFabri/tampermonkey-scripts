// ==UserScript==
// @name         Universal Loading Bar
// @namespace    https://rogger-helper
// @version      1.0.0
// @description  Shows a thin, minimal loading bar at the very top of every page; works with page loads, SPA navigations, fetch, and XHR.
// @author       you
// @match        *://*/*
// @exclude      *://chrome.google.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
  
    // ---- Config (tweak to taste) ----
    const BAR_HEIGHT_PX = 3;
    const BAR_COLOR = '#29d';      // any CSS color
    const BAR_BG = 'transparent';  // background behind the progress line
    const Z_INDEX = 2147483647;    // top-most
    const MAX_IDLE_MS = 700;       // finish bar after this since last network activity
    const START_AT = 0.1;          // initial progress
    const TRICKLE_TO = 0.85;       // auto-advance ceiling while loading
    const TRICKLE_RATE = 0.02;     // per tick increment (smaller = smoother)
    const TICK_MS = 120;           // animation tick ms
    const FINISH_FADE_MS = 300;    // fade-out duration
    // ---------------------------------
  
    if (window.top !== window.self) {
      // Still show in iframes, but if you don’t want that, uncomment:
      // return;
    }
  
    // Avoid duplicates (e.g., hot reloads, CSP retries)
    if (window.__tmProgressBar) return;
  
    // Minimal singleton
    const state = {
      progress: 0,
      timer: null,
      activeLoads: 0,
      lastActivity: Date.now(),
      running: false,
      bar: null,
      barInner: null,
    };
    window.__tmProgressBar = state;
  
    // Inject styles + elements ASAP
    function ensureBar() {
      if (state.bar) return;
  
      const style = document.createElement('style');
      style.setAttribute('data-tm-progress-style', 'true');
      style.textContent = `
        .tm-progress {
          position: fixed;
          top: 0; left: 0;
          width: 100%;
          height: ${BAR_HEIGHT_PX}px;
          background: ${BAR_BG};
          z-index: ${Z_INDEX};
          pointer-events: none;
          opacity: 1;
          transition: opacity ${FINISH_FADE_MS}ms ease;
        }
        .tm-progress__line {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 0%;
          background: ${BAR_COLOR};
          will-change: width, opacity, transform;
          transition: width ${TICK_MS}ms ease-out;
        }
        /* Optional subtle shimmer at the leading edge */
        .tm-progress__line::after {
          content: "";
          position: absolute;
          right: 0; top: 0; bottom: 0;
          width: 80px;
          transform: translateX(0);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.3), transparent);
          opacity: .25;
        }
        .tm-progress--hidden { opacity: 0; }
      `;
      (document.head || document.documentElement).appendChild(style);
  
      const bar = document.createElement('div');
      bar.className = 'tm-progress';
      const line = document.createElement('div');
      line.className = 'tm-progress__line';
      bar.appendChild(line);
      (document.body || document.documentElement).appendChild(bar);
  
      state.bar = bar;
      state.barInner = line;
    }
  
    function setProgress(p) {
      state.progress = Math.max(0, Math.min(1, p));
      if (!state.barInner) return;
      state.barInner.style.width = (state.progress * 100).toFixed(2) + '%';
    }
  
    function showBar() {
      ensureBar();
      state.bar.classList.remove('tm-progress--hidden');
    }
  
    function hideBarSoon() {
      if (!state.bar) return;
      state.bar.classList.add('tm-progress--hidden');
      // After fade, reset width to zero so it’s seamless next time
      setTimeout(() => {
        setProgress(0);
      }, FINISH_FADE_MS);
    }
  
    function start() {
      if (state.running) return;
      showBar();
      setProgress(Math.max(state.progress, START_AT));
      state.running = true;
  
      // trickle loop
      function tick() {
        if (!state.running) return;
        // If still loading, trickle toward TRICKLE_TO
        if (state.progress < TRICKLE_TO) {
          setProgress(Math.min(TRICKLE_TO, state.progress + TRICKLE_RATE * (1 - state.progress)));
        }
  
        // If idle long enough and we’ve seen activity before, finish
        const idle = Date.now() - state.lastActivity;
        const docComplete = document.readyState === 'complete';
        if (idle > MAX_IDLE_MS && state.activeLoads === 0 && docComplete) {
          finish();
          return;
        }
  
        state.timer = setTimeout(tick, TICK_MS);
      }
      tick();
    }
  
    function finish() {
      if (!state.running) return;
      state.running = false;
      clearTimeout(state.timer);
      // Smooth to 100 then fade out
      setProgress(1);
      setTimeout(hideBarSoon, 50);
    }
  
    function noteActivity() {
      state.lastActivity = Date.now();
    }
  
    function beginLoad() {
      noteActivity();
      state.activeLoads++;
      start();
      // Nudge forward a bit to make it feel responsive
      if (state.progress < 0.2) setProgress(0.2);
    }
  
    function endLoad() {
      state.activeLoads = Math.max(0, state.activeLoads - 1);
      noteActivity();
      // If document is complete and no active loads, we’ll finish on next tick
    }
  
    // ---- Hook DOM lifecycle ----
    // Start as early as possible
    beginLoad();
  
    // When DOM ready/loaded progresses naturally
    document.addEventListener('readystatechange', () => {
      noteActivity();
      if (document.readyState === 'interactive' && state.progress < 0.6) setProgress(0.6);
      if (document.readyState === 'complete') {
        // Let the trickle loop close it after checking network idle
        if (state.progress < 0.95) setProgress(0.95);
        endLoad();
      }
    }, true);
  
    // beforeunload typically fires on navigation away; show bar early for the next page
    window.addEventListener('beforeunload', () => {
      // Make sure bar is visible on nav away (for instant feedback)
      try { showBar(); setProgress(0.2); } catch {}
    }, { capture: true });
  
    // ---- Hook SPA navigations (history API) ----
    (function hookHistory() {
      const wrap = (obj, key) => {
        const orig = obj[key];
        if (typeof orig !== 'function') return;
        obj[key] = function (...args) {
          const ret = orig.apply(this, args);
          // Treat as a navigation start
          beginLoad();
          // Many SPAs render soon after; give them a moment to fetch
          setTimeout(endLoad, 800);
          return ret;
        };
      };
      wrap(history, 'pushState');
      wrap(history, 'replaceState');
      window.addEventListener('popstate', () => {
        beginLoad();
        setTimeout(endLoad, 800);
      });
    })();
  
    // ---- Hook fetch/XHR to reflect network activity ----
    (function hookFetch() {
      if (!window.fetch) return;
      const _fetch = window.fetch.bind(window);
      window.fetch = function (...args) {
        beginLoad();
        return _fetch(...args)
          .then((res) => { endLoad(); return res; })
          .catch((err) => { endLoad(); throw err; });
      };
    })();
  
    (function hookXHR() {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
  
      XMLHttpRequest.prototype.open = function (...args) {
        this.__tmTracked = true; // mark
        return origOpen.apply(this, args);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        if (this.__tmTracked) {
          beginLoad();
          const onDone = () => { this.removeEventListener('loadend', onDone); endLoad(); };
          this.addEventListener('loadend', onDone);
        }
        return origSend.apply(this, args);
      };
    })();
  
    // If the body wasn’t available at document-start, attach bar once it exists
    if (!document.body) {
      new MutationObserver((_mut, obs) => {
        if (document.body) { ensureBar(); obs.disconnect(); }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } else {
      ensureBar();
    }
  
  })();
  