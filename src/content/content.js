// WiKarte — Content Script
// Runs in ISOLATED world at document_idle. Creates the map panel iframe,
// extracts listing data from the page, and bridges communication between
// the page interceptor (MAIN world) and the map iframe.
(function () {
  'use strict';

  let mapIframe    = null;
  let mapOrigin    = '';
  let iframeToken  = '';
  let isMapVisible = false;
  let iframeLoaded = false;
  let pendingData  = null;   // holds latest unsent data while iframe is loading
  let currentTheme = 'light';

  function makeSessionToken() {
    try {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch { /* ignore crypto failures */ }
    return `wikarte-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function postToMap(type, extra = {}) {
    if (!mapIframe?.contentWindow || !mapOrigin || !iframeToken) return;
    const targetOrigin = mapOrigin === 'null' ? '*' : mapOrigin;
    mapIframe.contentWindow.postMessage({ type, token: iframeToken, ...extra }, targetOrigin);
  }

  function isValidWillhabenUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      const parsed = new URL(url, location.href);
      return (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        (parsed.hostname === 'willhaben.at' || parsed.hostname.endsWith('.willhaben.at'))
      );
    } catch {
      return false;
    }
  }

  function isValidListingPayload(data) {
    return !!(
      data &&
      typeof data === 'object' &&
      (
        Array.isArray(data.rows) ||
        Array.isArray(data?.advertSummaryList?.advertSummary)
      )
    );
  }

  // ─── theme ────────────────────────────────────────────────────────────────

  function detectWillhabenTheme() {
    return document.documentElement.getAttribute('data-wh-theme') === 'dark'
      ? 'dark'
      : 'light';
  }

  function sendThemeToMap(theme) {
    currentTheme = theme;
    postToMap('WIKARTE_THEME', { theme });
  }

  // Observe willhaben's theme attribute and sync it to the map
  const _themeObserver = new MutationObserver(() => {
    const newTheme = detectWillhabenTheme();
    if (newTheme !== currentTheme) sendThemeToMap(newTheme);
  });
  _themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-wh-theme']
  });

  // ─── page-type detection ──────────────────────────────────────────────────

  function isMerklistePage() {
    const { pathname } = location;
    return (
      pathname.includes('myfindings') ||
      pathname.includes('myadverts')  ||
      pathname.includes('merkliste')
    );
  }

  function isListPage() {
    const { pathname } = location;
    if (/\/d\//.test(pathname)) return false;
    if (pathname === '/' || pathname === '/iad' || pathname === '/iad/') return false;

    if (isMerklistePage()) return true;

    const nextDataEl = document.getElementById('__NEXT_DATA__');
    if (!nextDataEl) return false;

    try {
      const data = JSON.parse(nextDataEl.textContent);
      if (data?.props?.pageProps?.searchResult?.advertSummaryList?.advertSummary) return true;
      // Fallback: scan a bounded portion of pageProps for listing indicators
      const str = JSON.stringify(data?.props?.pageProps ?? {}).substring(0, 10_000);
      return str.includes('advertSummary') || str.includes('COORDINATES') || str.includes('adId');
    } catch {
      return false;
    }
  }

  // ─── visibility ───────────────────────────────────────────────────────────

  function sendInvalidate() {
    postToMap('WIKARTE_INVALIDATE');
  }

  function updateVisibility() {
    const isList = isListPage();
    const toggle = document.getElementById('wikarte-toggle');

    if (!isList) {
      document.documentElement.classList.remove('wikarte-active');
      isMapVisible = false;
      if (toggle) toggle.style.display = 'none';
    } else {
      if (toggle) toggle.style.display = '';
      if (!isMapVisible) {
        isMapVisible = true;
        document.documentElement.classList.add('wikarte-active');
        // Leaflet tiles need a size hint after the panel becomes visible
        setTimeout(sendInvalidate, 200);
      }
    }
  }

  // ─── panel creation ───────────────────────────────────────────────────────

  function createMapPanel() {
    const panel = document.createElement('div');
    panel.id = 'wikarte-panel';

    iframeToken = makeSessionToken();
    mapIframe = document.createElement('iframe');
    mapIframe.src = `${chrome.runtime.getURL('src/map/map.html')}?wikarteToken=${encodeURIComponent(iframeToken)}`;
    mapOrigin = new URL(mapIframe.src).origin;
    mapIframe.allow = 'fullscreen';

    mapIframe.addEventListener('load', () => {
      iframeLoaded = true;
      sendThemeToMap(currentTheme);

      if (pendingData) {
        doSend(pendingData);
        pendingData = null;
      }

      // Allow the map container to finish sizing before invalidating
      setTimeout(sendInvalidate, 1000);
    });

    panel.appendChild(mapIframe);
    document.body.appendChild(panel);

    const toggle = document.createElement('button');
    toggle.id = 'wikarte-toggle';
    // prettier-ignore
    toggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>';

    toggle.addEventListener('click', () => {
      isMapVisible = !isMapVisible;
      document.documentElement.classList.toggle('wikarte-active', isMapVisible);
      if (isMapVisible) setTimeout(sendInvalidate, 200);
    });
    document.body.appendChild(toggle);

    currentTheme = detectWillhabenTheme();

    // Determine initial visibility from page type
    const isList = isListPage();
    if (isList) {
      isMapVisible = true;
      document.documentElement.classList.add('wikarte-active');
    } else {
      toggle.style.display = 'none';
    }
  }

  // ─── listing extraction ───────────────────────────────────────────────────

  function extractListingsFromNextData() {
    const nextDataEl = document.getElementById('__NEXT_DATA__');
    if (!nextDataEl) return null;

    try {
      const data = JSON.parse(nextDataEl.textContent);
      const pp   = data?.props?.pageProps;
      if (!pp) return null;

      // Standard search result
      if (pp.searchResult?.advertSummaryList?.advertSummary) {
        return pp.searchResult;
      }

      // Merkliste: deeply nested pageProps structure
      const deepPP = pp?.pageProps?.pageProps;
      if (deepPP?.currentSavedAds) {
        const items = deepPP.currentSavedAds.advertFolderItemList?.advertFolderItems;
        if (items?.length) {
          return { advertSummaryList: { advertSummary: items } };
        }
      }

      // Multiple Merkliste folders
      if (deepPP?.savedAdsLists) {
        const allItems = deepPP.savedAdsLists.flatMap(
          folder => folder?.advertFolderItemList?.advertFolderItems ?? []
        );
        if (allItems.length) {
          return { advertSummaryList: { advertSummary: allItems } };
        }
      }
    } catch (e) {
      console.warn('[WiKarte] Failed to parse __NEXT_DATA__:', e);
    }

    return null;
  }

  // ─── data sending ─────────────────────────────────────────────────────────

  function doSend(data) {
    postToMap('WIKARTE_LISTINGS', { data });
  }

  function sendListingsToMap(data) {
    if (!mapIframe || !data) return;
    if (iframeLoaded) {
      doSend(data);
    } else {
      // Queue the latest data; only one batch is needed (iframe sends all on load)
      pendingData = data;
    }
  }

  // ─── Merkliste folder fetch ───────────────────────────────────────────────

  function fetchMerklisteForCurrentFolder() {
    try {
      const folderId = new URLSearchParams(location.search).get('folderId');
      // Validate folderId is numeric to prevent URL injection
      if (!folderId || !/^\d+$/.test(folderId)) return;

      const nextDataEl = document.getElementById('__NEXT_DATA__');
      if (!nextDataEl) return;

      const buildId = JSON.parse(nextDataEl.textContent)?.buildId;
      // Validate buildId is safe for URL path segments
      if (!buildId || !/^[A-Za-z0-9_-]+$/.test(buildId)) return;

      const url = `/_next/data/${buildId}/iad/myprofile/myfindings.json?folderId=${folderId}`;

      fetch(url, { credentials: 'include' })
        .then(r => r.text())
        .then(text => {
          let data = null;
          try { data = JSON.parse(text); } catch { /* not JSON */ }

          if (!data) {
            const m = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (m) try { data = JSON.parse(m[1]); } catch { /* malformed */ }
          }
          if (!data) return;

          const pp = data?.props?.pageProps?.pageProps?.pageProps
                  ?? data?.pageProps?.pageProps
                  ?? data?.pageProps;
          const items = pp?.currentSavedAds?.advertFolderItemList?.advertFolderItems;
          if (items?.length) {
            sendListingsToMap({ advertSummaryList: { advertSummary: items }, isMerkliste: true });
          }
        })
        .catch(e => console.warn('[WiKarte] Merkliste fetch failed:', e));
    } catch { /* ignore any unexpected errors */ }
  }

  // ─── hover highlight ──────────────────────────────────────────────────────

  function setupHoverHighlight() {
    let lastHighlightedId = null;

    /** Walk up the DOM from `el` to find the nearest ancestor with a numeric ad ID. */
    function getAdId(el) {
      let node = el;
      while (node && node !== document.body) {
        if (node.id && /^\d{5,}$/.test(node.id)) return node.id;
        node = node.parentElement;
      }
      return null;
    }

    document.addEventListener('mouseover', (e) => {
      if (!isMapVisible || !mapIframe?.contentWindow) return;
      const adId = getAdId(e.target);
      if (adId && adId !== lastHighlightedId) {
        lastHighlightedId = adId;
        postToMap('WIKARTE_HIGHLIGHT', { adId });
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (!isMapVisible || !mapIframe?.contentWindow) return;
      const adId = getAdId(e.target);
      const nextId = getAdId(e.relatedTarget);
      if (adId && adId === lastHighlightedId && nextId !== adId) {
        lastHighlightedId = null;
        postToMap('WIKARTE_UNHIGHLIGHT');
      }
    });
  }

  // ─── message handling ─────────────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    // Only process messages originating from the same window (page-intercept.js)
    if (event.source !== window) return;
    if (event.data?.channel !== 'wikarte') return;

    if (event.data?.type === 'WIKARTE_FETCH_RESULT') {
      const srcUrl = event.data.sourceUrl ?? '';
      if (!isValidWillhabenUrl(srcUrl)) return;
      // On Merkliste pages, ignore non-navigation fetches (e.g. recommendation APIs)
      if (isMerklistePage() && !srcUrl.includes('_next/data')) return;
      if (!isValidListingPayload(event.data.data)) return;
      sendListingsToMap(event.data.data);
    }

    if (event.data?.type === 'WIKARTE_NAV_CHANGE') {
      // Two-pass update: Next.js may not have committed DOM changes immediately.
      // First pass handles the common case; second pass is a safety retry.
      setTimeout(() => {
        updateVisibility();
        if (isMerklistePage()) fetchMerklisteForCurrentFolder();
      }, 300);
      setTimeout(updateVisibility, 500);
    }
  });

  window.addEventListener('popstate', updateVisibility);

  // ─── init ─────────────────────────────────────────────────────────────────

  function init() {
    createMapPanel();
    setupHoverHighlight();

    const data = extractListingsFromNextData();
    if (data) sendListingsToMap(data);
  }

  init();
})();
