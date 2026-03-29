/**
 * Unit tests for src/content/page-intercept.js
 * Verifies that fetch / XHR / history are intercepted and
 * correct window.postMessage events are dispatched.
 */

const fs   = require('fs');
const path = require('path');


// ── helpers ──────────────────────────────────────────────────────────────────
function loadPageIntercept() {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/content/page-intercept.js'), 'utf8'
  );
  (0, eval)(src);
}

function captureMessages() {
  const captured = [];
  window.addEventListener('message', (e) => captured.push(e.data));
  return captured;
}

function makeFetchResponse(data, contentType = 'application/json') {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return Promise.resolve({
    clone: () => ({
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(body)
    }),
    headers: { get: (h) => (h === 'content-type' ? contentType : null) }
  });
}

const SEARCH_RESULT_DATA = {
  advertSummaryList: {
    advertSummary: [
      { id: '111', attributes: { attribute: [{ name: 'COORDINATES', values: ['48.2,16.3'] }] } }
    ]
  }
};

const NEXT_DATA_SEARCH = {
  pageProps: {
    searchResult: {
      advertSummaryList: {
        advertSummary: [
          { id: '222', attributes: { attribute: [] } }
        ]
      }
    }
  }
};

const NEXT_DATA_MERKLISTE = {
  pageProps: {
    pageProps: {
      currentSavedAds: {
        advertFolderItemList: {
          advertFolderItems: [
            { id: '333', attributes: { attribute: [] } }
          ]
        }
      }
    }
  }
};

// ── setup ────────────────────────────────────────────────────────────────────
let origFetch;
let origXHROpen;
let origXHRSend;
let origPushState;
let origReplaceState;
let captured;

beforeEach(() => {
  origFetch       = window.fetch;
  origXHROpen     = XMLHttpRequest.prototype.open;
  origXHRSend     = XMLHttpRequest.prototype.send;
  origPushState    = history.pushState;
  origReplaceState = history.replaceState;

  // Install a fresh fetch mock
  window.fetch = jest.fn().mockReturnValue(makeFetchResponse({}));

  captured = captureMessages();
  loadPageIntercept();
});

afterEach(() => {
  window.fetch                    = origFetch;
  XMLHttpRequest.prototype.open   = origXHROpen;
  XMLHttpRequest.prototype.send   = origXHRSend;
  history.pushState               = origPushState;
  history.replaceState            = origReplaceState;
});

// ════════════════════════════════════════════════════════════════════════════
// Fetch interception
// ════════════════════════════════════════════════════════════════════════════
describe('fetch interception', () => {
  test('intercepts /iad/ URLs and posts WIKARTE_FETCH_RESULT', async () => {
    window.fetch = jest.fn().mockReturnValue(makeFetchResponse(SEARCH_RESULT_DATA));
    // Re-load so the interceptor wraps the new fetch
    loadPageIntercept();

    await window.fetch('https://www.willhaben.at/iad/search/iad/immobilien');
    await new Promise(r => setTimeout(r, 50));

    const msg = captured.find(m => m.type === 'WIKARTE_FETCH_RESULT');
    expect(msg).toBeDefined();
    expect(msg.data.advertSummaryList).toBeDefined();
  });

  test('does NOT post message for unrelated URLs', async () => {
    window.fetch = jest.fn().mockReturnValue(makeFetchResponse({ foo: 'bar' }));
    loadPageIntercept();

    await window.fetch('https://www.willhaben.at/api/unrelated');
    await new Promise(r => setTimeout(r, 50));

    const msg = captured.find(m => m.type === 'WIKARTE_FETCH_RESULT');
    expect(msg).toBeUndefined();
  });

  test('handles _next/data search result', async () => {
    window.fetch = jest.fn().mockReturnValue(makeFetchResponse(NEXT_DATA_SEARCH));
    loadPageIntercept();

    await window.fetch('https://www.willhaben.at/_next/data/abc/iad/immobilien.json');
    await new Promise(r => setTimeout(r, 50));

    const msg = captured.find(m => m.type === 'WIKARTE_FETCH_RESULT');
    expect(msg).toBeDefined();
  });

  test('handles _next/data Merkliste result', async () => {
    window.fetch = jest.fn().mockReturnValue(makeFetchResponse(NEXT_DATA_MERKLISTE));
    loadPageIntercept();

    await window.fetch('https://www.willhaben.at/_next/data/abc/iad/myprofile/myfindings.json');
    await new Promise(r => setTimeout(r, 50));

    const msg = captured.find(m => m.type === 'WIKARTE_FETCH_RESULT');
    expect(msg).toBeDefined();
    expect(msg.data.advertSummaryList.advertSummary).toHaveLength(1);
  });

  test('includes sourceUrl in message', async () => {
    window.fetch = jest.fn().mockReturnValue(makeFetchResponse(SEARCH_RESULT_DATA));
    loadPageIntercept();

    const testUrl = 'https://www.willhaben.at/iad/search';
    await window.fetch(testUrl);
    await new Promise(r => setTimeout(r, 50));

    const msg = captured.find(m => m.type === 'WIKARTE_FETCH_RESULT');
    expect(msg.sourceUrl).toContain('iad');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// History interception
// ════════════════════════════════════════════════════════════════════════════
describe('history interception', () => {
  test('pushState fires WIKARTE_NAV_CHANGE', async () => {
    history.pushState({}, '', '/iad/immobilien?page=2');
    await new Promise(r => setTimeout(r, 10));

    const msg = captured.find(m => m.type === 'WIKARTE_NAV_CHANGE');
    expect(msg).toBeDefined();
  });

  test('replaceState fires WIKARTE_NAV_CHANGE', async () => {
    history.replaceState({}, '', '/iad/immobilien?rows=60');
    await new Promise(r => setTimeout(r, 10));

    const msg = captured.find(m => m.type === 'WIKARTE_NAV_CHANGE');
    expect(msg).toBeDefined();
  });

  test('original pushState is still called', () => {
    const orig = jest.fn();
    history.pushState = orig;
    loadPageIntercept(); // re-wrap

    history.pushState({ page: 2 }, '', '/iad/immobilien?page=2');
    expect(orig).toHaveBeenCalledWith({ page: 2 }, '', '/iad/immobilien?page=2');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// postListings filtering
// ════════════════════════════════════════════════════════════════════════════
describe('postListings() filtering', () => {
  test('data without advertSummaryList does not trigger message (non-next/data)', async () => {
    window.fetch = jest.fn().mockReturnValue(makeFetchResponse({ random: 'data' }));
    loadPageIntercept();

    await window.fetch('https://www.willhaben.at/iad/search');
    await new Promise(r => setTimeout(r, 50));

    const msg = captured.find(m => m.type === 'WIKARTE_FETCH_RESULT');
    expect(msg).toBeUndefined();
  });

  test('empty advertSummary array does not crash', async () => {
    window.fetch = jest.fn().mockReturnValue(
      makeFetchResponse({ advertSummaryList: { advertSummary: [] } })
    );
    loadPageIntercept();

    await expect(
      window.fetch('https://www.willhaben.at/iad/search')
    ).resolves.toBeDefined();
  });
});
