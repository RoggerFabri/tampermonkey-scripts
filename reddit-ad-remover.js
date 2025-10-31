// ==UserScript==
// @name         Reddit Ad Remover
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Remove advertisements from Reddit by hiding shreddit-ad-post elements
// @author       Rogger Fabri
// @match        https://*.reddit.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // CSS to hide ads
    const hideAdsStyle = document.createElement('style');
    hideAdsStyle.textContent = `
        shreddit-ad-post,
        shreddit-ad-post[promoted],
        .promotedlink,
        [class*="promotedlink"] {
            display: none !important;
        }
    `;

    // Function to inject the style
    function injectStyle() {
        if (document.head) {
            document.head.appendChild(hideAdsStyle);
        }
    }

    // Function to remove ad elements
    function removeAds() {
        // Remove shreddit-ad-post elements
        const adPosts = document.querySelectorAll('shreddit-ad-post');
        adPosts.forEach(ad => {
            ad.remove();
        });

        // Also remove any elements with promoted attribute
        const promotedElements = document.querySelectorAll('[promoted]');
        promotedElements.forEach(el => {
            if (el.tagName.toLowerCase().includes('ad')) {
                el.remove();
            }
        });
    }

    // Inject style immediately
    injectStyle();

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            removeAds();
        });
    } else {
        removeAds();
    }

    // Also inject style when head is available (for document-start timing)
    const headObserver = new MutationObserver((mutations, observer) => {
        if (document.head) {
            injectStyle();
            observer.disconnect();
        }
    });

    if (!document.head) {
        headObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // Use MutationObserver to catch dynamically loaded ads
    const observer = new MutationObserver(() => {
        removeAds();
    });

    // Start observing when body is available
    function startObserving() {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            setTimeout(startObserving, 100);
        }
    }

    startObserving();

    console.log('Reddit Ad Remover: Active');
})();

