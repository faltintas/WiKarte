// WiKarte — Page Interceptor
// Runs in MAIN world at document_start. Intercepts fetch/XHR and history
// navigation to forward listing data and SPA route changes to the content script.
(function () {
  'use strict';

  // ─── listing post ──────────────────────────────────────────────────────────

  /**
   * Post extracted listing data to the content script via same-window message.
   * Using '*' is safe here: both sender and receiver are the same window object,
   * and content.js already validates event.source === window.
   */
  function postListings(data, sourceUrl) {
    if (!data) return;
    const isNextData = sourceUrl && sourceUrl.includes('_next/data');

    // Direct advertSummaryList (standard search API response)
    if (data.advertSummaryList?.advertSummary) {
      window.postMessage(
        { channel: 'wikarte', type: 'WIKARTE_FETCH_RESULT', data, sourceUrl: sourceUrl ?? '' },
        '*'
      );
      return;
    }

    // Next.js _next/data wrapper — unwrap and re-check
    if (isNextData && data.pageProps) {
      const { pageProps } = data;

      if (pageProps.searchResult?.advertSummaryList) {
        window.postMessage(
          { channel: 'wikarte', type: 'WIKARTE_FETCH_RESULT', data: pageProps.searchResult, sourceUrl },
          '*'
        );
        return;
      }

      const items = pageProps.pageProps?.currentSavedAds
        ?.advertFolderItemList?.advertFolderItems;
      if (items?.length) {
        window.postMessage(
          {
            channel: 'wikarte',
            type: 'WIKARTE_FETCH_RESULT',
            data: { advertSummaryList: { advertSummary: items } },
            sourceUrl
          },
          '*'
        );
      }
    }
  }

  /**
   * Extract listing data from an HTML string that contains a __NEXT_DATA__ script tag.
   * Handles both search result pages and Merkliste (saved-ads) pages.
   */
  function parseHtmlNextData(html, url) {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return;

    let nd;
    try { nd = JSON.parse(match[1]); } catch { return; }

    // Deep-nested pageProps structure used on Merkliste/myfindings pages
    const pp = nd?.props?.pageProps?.pageProps?.pageProps;
    if (!pp) return;

    if (pp.currentSavedAds) {
      const items = pp.currentSavedAds.advertFolderItemList?.advertFolderItems;
      if (items?.length) {
        window.postMessage(
          {
            channel: 'wikarte',
            type: 'WIKARTE_FETCH_RESULT',
            data: { advertSummaryList: { advertSummary: items }, isMerkliste: true },
            sourceUrl: url
          },
          '*'
        );
      }
    }

    if (pp.searchResult) {
      postListings({ pageProps: { searchResult: pp.searchResult } }, url);
    }
  }

  // ─── fetch interception ───────────────────────────────────────────────────

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');
    const result = origFetch.apply(this, args);

    if (url.includes('/iad/') || url.includes('search') || url.includes('_next/data')) {
      result.then(function (response) {
        const clone = response.clone();
        const ct   = response.headers.get('content-type') ?? '';

        if (ct.includes('application/json')) {
          return clone.json().then(d => postListings(d, url));
        }

        return clone.text().then(html => {
          try { postListings(JSON.parse(html), url); return; } catch { /* not JSON */ }
          parseHtmlNextData(html, url);
        });
      }).catch(() => { /* ignore network errors */ });
    }

    return result;
  };

  // ─── XHR interception ────────────────────────────────────────────────────

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._whUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this._whUrl ?? '';
    if (url.includes('/iad/') || url.includes('search') || url.includes('_next/data')) {
      this.addEventListener('load', () => {
        try { postListings(JSON.parse(this.responseText), url); return; } catch { /* not JSON */ }
        parseHtmlNextData(this.responseText, url);
      });
    }
    return origSend.apply(this, args);
  };

  // ─── history interception ─────────────────────────────────────────────────

  const origPush    = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (...args) {
    const result = origPush.apply(this, args);
    window.postMessage({ channel: 'wikarte', type: 'WIKARTE_NAV_CHANGE' }, '*');
    return result;
  };

  history.replaceState = function (...args) {
    const result = origReplace.apply(this, args);
    window.postMessage({ channel: 'wikarte', type: 'WIKARTE_NAV_CHANGE' }, '*');
    return result;
  };
})();
