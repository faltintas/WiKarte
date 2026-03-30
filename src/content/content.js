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
  const PANEL_WIDTH_STORAGE_KEY = 'wikarte.panelWidthPx';
  const DEFAULT_PANEL_WIDTH = '50vw';
  let resizeInvalidateRaf = 0;

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

  function getPanelMinWidth() {
    return 320;
  }

  function getPanelMaxWidth() {
    const viewportWidth = Math.max(window.innerWidth || 0, 640);
    return Math.max(getPanelMinWidth(), Math.min(Math.round(viewportWidth * 0.8), viewportWidth - 180));
  }

  function clampPanelWidth(px) {
    return Math.min(getPanelMaxWidth(), Math.max(getPanelMinWidth(), Math.round(px)));
  }

  function setPanelWidth(value) {
    const rootStyle = document.documentElement.style;
    if (!value || value === DEFAULT_PANEL_WIDTH) {
      rootStyle.setProperty('--wikarte-panel-width', DEFAULT_PANEL_WIDTH);
      return;
    }
    rootStyle.setProperty('--wikarte-panel-width', value);
  }

  function scheduleInvalidateDuringResize() {
    if (resizeInvalidateRaf) return;
    resizeInvalidateRaf = requestAnimationFrame(() => {
      resizeInvalidateRaf = 0;
      sendInvalidate();
    });
  }

  function readSavedPanelWidth() {
    try {
      const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
      if (!raw) return DEFAULT_PANEL_WIDTH;
      const px = Number(raw);
      if (!Number.isFinite(px) || px <= 0) return DEFAULT_PANEL_WIDTH;
      return `${clampPanelWidth(px)}px`;
    } catch {
      return DEFAULT_PANEL_WIDTH;
    }
  }

  function getCurrentPanelWidth(panel) {
    const rectWidth = panel.getBoundingClientRect?.().width;
    if (Number.isFinite(rectWidth) && rectWidth > 0) {
      return clampPanelWidth(rectWidth);
    }

    const raw = document.documentElement.style.getPropertyValue('--wikarte-panel-width') || DEFAULT_PANEL_WIDTH;
    if (raw.endsWith('px')) {
      const px = Number.parseFloat(raw);
      if (Number.isFinite(px) && px > 0) return clampPanelWidth(px);
    }

    if (raw.endsWith('vw')) {
      const vw = Number.parseFloat(raw);
      if (Number.isFinite(vw) && vw > 0) return clampPanelWidth((window.innerWidth * vw) / 100);
    }

    return clampPanelWidth((window.innerWidth || 0) * 0.5);
  }

  function persistPanelWidth(px) {
    try {
      localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(clampPanelWidth(px)));
    } catch {
      // Ignore storage failures; resizing should still work for the session.
    }
  }

  function setupResizablePanel(panel) {
    const handle = document.createElement('div');
    handle.id = 'wikarte-panel-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'WiKarte map width');
    panel.appendChild(handle);

    let isDragging = false;
    let activePointerId = null;
    let startClientX = 0;
    let startPanelWidth = 0;

    const stopDragging = () => {
      if (!isDragging) return;
      isDragging = false;
      activePointerId = null;
      document.documentElement.classList.remove('wikarte-resizing');
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', stopDragging);
      document.removeEventListener('pointercancel', stopDragging);
      sendInvalidate();
    };

    const onPointerMove = (event) => {
      if (!isDragging) return;
      const delta = startClientX - event.clientX;
      const nextWidth = clampPanelWidth(startPanelWidth + delta);
      setPanelWidth(`${nextWidth}px`);
      persistPanelWidth(nextWidth);
      scheduleInvalidateDuringResize();
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      isDragging = true;
      activePointerId = event.pointerId;
      startClientX = event.clientX;
      startPanelWidth = getCurrentPanelWidth(panel);
      document.documentElement.classList.add('wikarte-resizing');
      if (typeof handle.setPointerCapture === 'function' && activePointerId != null) {
        try {
          handle.setPointerCapture(activePointerId);
        } catch {
          // Ignore browsers/environments that reject pointer capture here.
        }
      }
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', stopDragging);
      document.addEventListener('pointercancel', stopDragging);
      event.preventDefault();
    });
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
    setPanelWidth(readSavedPanelWidth());

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
    setupResizablePanel(panel);

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
    enrichListingsWithUiState(data);
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

  function extractListingId(value) {
    if (typeof value !== 'string') return null;
    return value.match(/(\d{5,})/)?.[1] ?? null;
  }

  function getListingIdFromNodeContext(node) {
    let current = node;

    while (current && current !== document.body) {
      if (current.id && /^\d{5,}$/.test(current.id)) return current.id;

      const directAttrMatch =
        extractListingId(current.getAttribute?.('data-id')) ||
        extractListingId(current.getAttribute?.('data-ad-id')) ||
        extractListingId(current.getAttribute?.('data-testid')) ||
        extractListingId(current.getAttribute?.('data-test-id')) ||
        extractListingId(current.getAttribute?.('href'));
      if (directAttrMatch) return directAttrMatch;

      const listingLink = current.querySelector?.('a[href*="/d/"], a[href*="willhaben.at/iad/"][href*="/d/"]');
      const linkId = extractListingId(listingLink?.getAttribute('href'));
      if (linkId) return linkId;

      current = current.parentElement;
    }

    return null;
  }

  function getListingIdFromElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return getListingIdFromNodeContext(el?.parentElement || null);
    }
    return getListingIdFromNodeContext(el);
  }

  function readListingAttribute(item, name) {
    const attrs = item?.attributes?.attribute;
    if (!Array.isArray(attrs)) return null;
    const match = attrs.find(entry => entry?.name === name);
    return match?.values?.[0] ?? null;
  }

  function getListingIdFromItem(item) {
    if (item?.id) return String(item.id);
    const seoUrl = readListingAttribute(item, 'SEO_URL');
    return seoUrl?.match(/(\d{5,})/)?.[1] ?? null;
  }

  function getWishlistDescriptor(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    const parts = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('data-testid'),
      el.getAttribute('data-test-id'),
      el.getAttribute('name'),
      el.textContent,
      typeof el.className === 'string' ? el.className : ''
    ].filter(Boolean);
    return parts.join(' ').toLowerCase();
  }

  function hasExplicitWishlistControlId(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '';
    return /(?:^|-)save-ad-\d{5,}$/.test(testId);
  }

  function hasWishlistControlLabel(el) {
    const descriptor = getWishlistDescriptor(el);
    if (!descriptor) return false;
    return /(anzeige merken|merkliste|wunschliste|wishlist|watchlist|bookmark|favorite|favourite|saved?)/.test(descriptor);
  }

  function getWishlistedIdFromControl(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '';
    const directMatch = testId.match(/(?:^|-)save-ad-(\d{5,})$/);
    if (directMatch) return directMatch[1];

    return getListingIdFromElement(el);
  }

  function getWishlistControlIdentity(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '';
    if (/(?:^|-)save-ad-\d{5,}$/.test(testId)) {
      return { testId };
    }

    const adId = getWishlistedIdFromControl(el);
    if (!adId) return null;
    return { adId };
  }

  function resolveWishlistControl(identity, fallbackControl = null) {
    if (!identity) return fallbackControl;
    if (identity.testId) {
      return document.querySelector(`[data-testid="${identity.testId}"], [data-test-id="${identity.testId}"]`) || fallbackControl;
    }
    if (identity.adId) {
      return document.querySelector(`[data-testid$="save-ad-${identity.adId}"], [data-test-id$="save-ad-${identity.adId}"]`) || fallbackControl;
    }
    return fallbackControl;
  }

  function isWishlistRelatedControl(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (!getWishlistedIdFromControl(el)) return false;
    return hasExplicitWishlistControlId(el) || hasWishlistControlLabel(el);
  }

  function isWishlistedControl(el) {
    if (!getWishlistedIdFromControl(el)) {
      return false;
    }

    if (!hasExplicitWishlistControlId(el) && !hasWishlistControlLabel(el)) {
      return false;
    }

    const descriptor = getWishlistDescriptor(el);

    return (
      el.getAttribute('aria-pressed') === 'true' ||
      el.getAttribute('aria-checked') === 'true' ||
      el.getAttribute('data-state') === 'checked' ||
      el.getAttribute('data-selected') === 'true' ||
      el.getAttribute('data-active') === 'true' ||
      el.checked === true ||
      /(entfernen|remove|saved|gemerkt|gespeichert|bereits gemerkt|in der merkliste)/.test(descriptor)
    );
  }

  function getWishlistStateForListingId(adId) {
    if (!adId) return false;
    if (isMerklistePage()) return true;

    const exactControls = Array.from(
      document.querySelectorAll(`[data-testid$="save-ad-${adId}"], [data-test-id$="save-ad-${adId}"]`)
    );

    if (exactControls.length) {
      for (let i = exactControls.length - 1; i >= 0; i -= 1) {
        if (isWishlistedControl(exactControls[i])) return true;
        if (
          exactControls[i].getAttribute('aria-pressed') === 'false' ||
          exactControls[i].getAttribute('aria-checked') === 'false' ||
          exactControls[i].checked === false
        ) {
          return false;
        }
      }
      return false;
    }

    return collectWishlistedIds().has(adId);
  }

  function collectWishlistedIds() {
    const wishlistedIds = new Set();
    const controls = document.querySelectorAll('button, a, input, label, [role="button"], [aria-label], [title], [data-testid], [data-test-id]');

    controls.forEach((control) => {
      if (!isWishlistedControl(control)) return;
      const listingId = getWishlistedIdFromControl(control);
      if (listingId) wishlistedIds.add(listingId);
    });

    return wishlistedIds;
  }

  function enrichListingsWithUiState(data) {
    const summaries = data?.advertSummaryList?.advertSummary ?? data?.rows;
    if (!Array.isArray(summaries)) return data;

    summaries.forEach((item) => {
      const itemId = getListingIdFromItem(item);
      item.wikarteWishlisted = Boolean(
        isMerklistePage() ||
        data?.isMerkliste ||
        getWishlistStateForListingId(itemId)
      );
    });

    return data;
  }

  function syncWishlistStateForListing(adId) {
    if (!adId) return;
    postToMap('WIKARTE_WISHLIST_STATE', {
      adId,
      isWishlisted: Boolean(getWishlistStateForListingId(adId))
    });
  }

  function syncWishlistStateFromControl(control) {
    const adId = getWishlistedIdFromControl(control);
    if (!adId) return;

    postToMap('WIKARTE_WISHLIST_STATE', {
      adId,
      isWishlisted: Boolean(isMerklistePage() || isWishlistedControl(control))
    });
  }

  function scheduleWishlistSyncFromControl(control) {
    if (!control) return;
    const identity = getWishlistControlIdentity(control);
    const sync = () => {
      const currentControl = resolveWishlistControl(identity, control);
      syncWishlistStateFromControl(currentControl);
    };
    const schedule = (delay) => {
      setTimeout(() => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(sync);
        } else {
          sync();
        }
      }, delay);
    };

    // willhaben may flip aria-pressed asynchronously or replace the control
    // after the click response arrives, so check a few times briefly.
    [0, 120, 350, 800].forEach(schedule);
  }

  function setupWishlistStateSync() {
    const wishlistObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          if (!isWishlistRelatedControl(target)) return;
          syncWishlistStateFromControl(target);
          return;
        }

        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (isWishlistRelatedControl(node)) {
              syncWishlistStateFromControl(node);
            }
            node.querySelectorAll?.('button, a, input, label, [role="button"], [aria-label], [title], [data-testid], [data-test-id]')
              .forEach((el) => {
                if (isWishlistRelatedControl(el)) syncWishlistStateFromControl(el);
              });
          });
        }
      });
    });

    if (document.body) {
      wishlistObserver.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-pressed', 'aria-checked', 'data-state', 'data-selected', 'data-active']
      });
    }
  }

  function setupHoverHighlight() {
    let lastHighlightedId = null;

    document.addEventListener('mouseover', (e) => {
      if (!isMapVisible || !mapIframe?.contentWindow) return;
      const adId = getListingIdFromElement(e.target);
      if (adId && adId !== lastHighlightedId) {
        lastHighlightedId = adId;
        postToMap('WIKARTE_HIGHLIGHT', { adId });
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (!isMapVisible || !mapIframe?.contentWindow) return;
      const adId = getListingIdFromElement(e.target);
      const nextId = getListingIdFromElement(e.relatedTarget);
      if (adId && adId === lastHighlightedId && nextId !== adId) {
        lastHighlightedId = null;
        postToMap('WIKARTE_UNHIGHLIGHT');
      }
    });

    document.addEventListener('click', (e) => {
      const wishlistControl = e.target?.closest?.('button, a, input, label, [role="button"], [aria-label], [title], [data-testid], [data-test-id]');
      if (isWishlistRelatedControl(wishlistControl)) {
        scheduleWishlistSyncFromControl(wishlistControl);
        return;
      }

      const listingId = getListingIdFromElement(e.target);
      if (!listingId) return;
      setTimeout(() => syncWishlistStateForListing(listingId), 0);
    }, true);
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
    setupWishlistStateSync();
    setupHoverHighlight();

    const data = extractListingsFromNextData();
    if (data) sendListingsToMap(data);
  }

  init();
})();
