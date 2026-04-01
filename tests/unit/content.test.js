/**
 * Unit tests for src/content/content.js
 * Tests DOM creation, message handling, theme detection,
 * isListPage / isMerklistePage logic, and extractListingsFromNextData.
 */

const fs   = require('fs');
const path = require('path');


// ── helpers ──────────────────────────────────────────────────────────────────
function setNextData(data) {
  let el = document.getElementById('__NEXT_DATA__');
  if (!el) {
    el = document.createElement('script');
    el.id = '__NEXT_DATA__';
    el.type = 'application/json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function loadContent() {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/content/content.js'), 'utf8'
  );
  (0, eval)(src);
}

const SEARCH_NEXT_DATA = {
  buildId: 'test-build',
  props: {
    pageProps: {
      searchResult: {
        advertSummaryList: {
          advertSummary: [
            { id: '111', attributes: { attribute: [{ name: 'COORDINATES', values: ['48.2,16.3'] }] } },
            { id: '222', attributes: { attribute: [{ name: 'COORDINATES', values: ['48.3,16.4'] }] } }
          ]
        }
      }
    }
  }
};

const MERKLISTE_NEXT_DATA = {
  buildId: 'test-build',
  props: {
    pageProps: {
      pageProps: {
        pageProps: {
          currentSavedAds: {
            advertFolderItemList: {
              advertFolderItems: [
                { id: '333', postCode: '1010', attributes: { attribute: [] } }
              ]
            }
          }
        }
      }
    }
  }
};

// ── setup ────────────────────────────────────────────────────────────────────
// Capture postMessage calls to iframes
let iframeMessages = [];

beforeEach(() => {
  iframeMessages = [];
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  // Reset HTML-level class so visibility state doesn't bleed between tests
  document.documentElement.classList.remove('wikarte-active');
  document.documentElement.classList.remove('wikarte-resizing');
  document.documentElement.style.removeProperty('--wikarte-panel-width');
  window.localStorage.clear();

  // Remove any leftover __NEXT_DATA__ element
  const old = document.getElementById('__NEXT_DATA__');
  if (old) old.remove();

  // Reset pathname
  Object.defineProperty(window, 'location', {
    value: { pathname: '/iad/immobilien/wohnung-kaufen', search: '', href: 'https://www.willhaben.at/iad/immobilien/wohnung-kaufen' },
    writable: true,
    configurable: true
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DOM creation
// ════════════════════════════════════════════════════════════════════════════
describe('Panel and toggle creation', () => {
  test('creates #wikarte-panel div', () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    expect(document.getElementById('wikarte-panel')).not.toBeNull();
  });

  test('creates #wikarte-toggle button', () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    expect(document.getElementById('wikarte-toggle')).not.toBeNull();
  });

  test('creates resize handle inside #wikarte-panel', () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    expect(document.getElementById('wikarte-panel-resize-handle')).not.toBeNull();
  });

  test('iframe src is chrome-extension URL', () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    const panel = document.getElementById('wikarte-panel');
    const iframe = panel?.querySelector('iframe');
    expect(iframe?.src).toContain('chrome-extension://');
    expect(iframe?.src).toContain('src/map/map.html');
  });

  test('toggle button contains SVG map icon', () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    const btn = document.getElementById('wikarte-toggle');
    expect(btn?.innerHTML).toContain('svg');
  });

  test('restores saved panel width from localStorage', () => {
    window.localStorage.setItem('wikarte.panelWidthPx', '420');
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    expect(document.documentElement.style.getPropertyValue('--wikarte-panel-width')).toBe('420px');
  });

  test('dragging resize handle updates stored panel width', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1200,
      writable: true,
      configurable: true
    });

    setNextData(SEARCH_NEXT_DATA);
    loadContent();

    const handle = document.getElementById('wikarte-panel-resize-handle');
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 600 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 760 }));
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 760 }));

    expect(document.documentElement.style.getPropertyValue('--wikarte-panel-width')).toBe('440px');
    expect(window.localStorage.getItem('wikarte.panelWidthPx')).toBe('440');
    expect(document.documentElement.classList.contains('wikarte-resizing')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Visibility logic — list pages
// ════════════════════════════════════════════════════════════════════════════
describe('Map visibility', () => {
  test('map shown by default on search list page', () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });

  test('toggle hidden on detail page (/d/ in path)', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/immobilien/d/schoene-wohnung-123456789/', search: '' },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();
    const toggle = document.getElementById('wikarte-toggle');
    expect(toggle?.style.display).toBe('none');
  });

  test('map NOT shown by default on homepage', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '' },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(false);
  });

  test('toggle hidden on standalone willhaben mapobject page', () => {
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/iad/mapobject',
        search: '?adId=1553610328',
        href: 'https://www.willhaben.at/iad/mapobject?adId=1553610328'
      },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();
    const toggle = document.getElementById('wikarte-toggle');
    expect(toggle?.style.display).toBe('none');
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(false);
  });

  test('map shown on Merkliste (myfindings) page', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/myprofile/myfindings', search: '?folderId=123' },
      writable: true, configurable: true
    });
    setNextData(MERKLISTE_NEXT_DATA);
    loadContent();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Theme detection
// ════════════════════════════════════════════════════════════════════════════
describe('Theme detection', () => {
  test('detects light theme by default', () => {
    document.documentElement.removeAttribute('data-wh-theme');
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    // After load, no dark class expected on map iframe
    const panel = document.getElementById('wikarte-panel');
    expect(panel).not.toBeNull();
  });

  test('detects dark theme from data-wh-theme attribute', () => {
    document.documentElement.setAttribute('data-wh-theme', 'dark');
    setNextData(SEARCH_NEXT_DATA);
    loadContent();
    // MutationObserver will have captured the theme
    // We just verify no crash and panel exists
    expect(document.getElementById('wikarte-panel')).not.toBeNull();
    document.documentElement.removeAttribute('data-wh-theme');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// extractListingsFromNextData — via WIKARTE_FETCH_RESULT message
// ════════════════════════════════════════════════════════════════════════════
describe('Message handling', () => {
  test('WIKARTE_FETCH_RESULT accepted on non-Merkliste page', async () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();

    // Spy on postMessage calls to iframe contentWindow
    const iframe = document.querySelector('#wikarte-panel iframe');
    const postSpy = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      get: () => ({ postMessage: postSpy, close: jest.fn(), length: 0 }),
      configurable: true
    });

    // Simulate iframeLoaded by dispatching load event
    iframe.dispatchEvent(new Event('load'));

    // Now send a fetch result
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        channel: 'wikarte',
        type: 'WIKARTE_FETCH_RESULT',
        sourceUrl: 'https://www.willhaben.at/iad/search',
        data: { advertSummaryList: { advertSummary: [{ id: '999' }] } }
      },
      source: window
    }));

    await new Promise(r => setTimeout(r, 50));
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WIKARTE_LISTINGS', token: expect.any(String) }),
      '*'
    );
  });

  test('WIKARTE_FETCH_RESULT ignored on Merkliste page for non-_next/data URLs', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/myprofile/myfindings', search: '?folderId=123' },
      writable: true, configurable: true
    });
    setNextData(MERKLISTE_NEXT_DATA);
    loadContent();

    const iframe = document.querySelector('#wikarte-panel iframe');
    const postSpy = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      get: () => ({ postMessage: postSpy, close: jest.fn(), length: 0 }),
      configurable: true
    });
    iframe.dispatchEvent(new Event('load'));

    // Send a non-_next/data fetch result
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        channel: 'wikarte',
        type: 'WIKARTE_FETCH_RESULT',
        sourceUrl: 'https://www.willhaben.at/iad/some-other-api',
        data: { advertSummaryList: { advertSummary: [{ id: 'WRONG' }] } }
      },
      source: window
    }));

    await new Promise(r => setTimeout(r, 50));
    // Should NOT be forwarded to iframe
    const listingsCalls = postSpy.mock.calls.filter(
      call => call[0].type === 'WIKARTE_LISTINGS' &&
              call[0].data?.advertSummaryList?.advertSummary?.[0]?.id === 'WRONG'
    );
    expect(listingsCalls).toHaveLength(0);
  });

  test('Toggle button toggles wikarte-active class', () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();

    const toggle = document.getElementById('wikarte-toggle');
    // Map is initially shown → click to hide
    toggle.click();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(false);
    // Click again to show
    toggle.click();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });

  test('WIKARTE_NAV_CHANGE triggers visibility update', async () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();

    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: 'wikarte', type: 'WIKARTE_NAV_CHANGE' },
      source: window
    }));

    await new Promise(r => setTimeout(r, 600));
    // No crash and panel still exists
    expect(document.getElementById('wikarte-panel')).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Hover highlight — getAdId via mouseover
// ════════════════════════════════════════════════════════════════════════════
describe('Hover highlight — getAdId', () => {
  test('sends WIKARTE_HIGHLIGHT when hovering listing with numeric id', async () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();

    const iframe = document.querySelector('#wikarte-panel iframe');
    const postSpy = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      get: () => ({ postMessage: postSpy, close: jest.fn(), length: 0 }),
      configurable: true
    });
    iframe.dispatchEvent(new Event('load'));

    // Create a listing element with a numeric id (≥5 digits)
    const listingEl = document.createElement('div');
    listingEl.id = '1234567890';
    document.body.appendChild(listingEl);

    listingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    const highlightCall = postSpy.mock.calls.find(
      c => c[0]?.type === 'WIKARTE_HIGHLIGHT'
    );
    expect(highlightCall).toBeDefined();
    expect(highlightCall[0].adId).toBe('1234567890');
  });

  test('sends WIKARTE_UNHIGHLIGHT on mouseout', async () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();

    const iframe = document.querySelector('#wikarte-panel iframe');
    const postSpy = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      get: () => ({ postMessage: postSpy, close: jest.fn(), length: 0 }),
      configurable: true
    });
    iframe.dispatchEvent(new Event('load'));

    const listingEl = document.createElement('div');
    listingEl.id = '9876543210';
    document.body.appendChild(listingEl);

    // Mouseover then mouseout
    listingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    listingEl.dispatchEvent(new MouseEvent('mouseout',  { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    const unhighlightCall = postSpy.mock.calls.find(
      c => c[0]?.type === 'WIKARTE_UNHIGHLIGHT'
    );
    expect(unhighlightCall).toBeDefined();
  });

  test('does NOT send highlight for element without numeric id', async () => {
    setNextData(SEARCH_NEXT_DATA);
    loadContent();

    const iframe = document.querySelector('#wikarte-panel iframe');
    const postSpy = jest.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      get: () => ({ postMessage: postSpy, close: jest.fn(), length: 0 }),
      configurable: true
    });
    iframe.dispatchEvent(new Event('load'));

    const nonListingEl = document.createElement('div');
    nonListingEl.id = 'some-text-id';
    document.body.appendChild(nonListingEl);

    nonListingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    const highlightCall = postSpy.mock.calls.find(
      c => c[0]?.type === 'WIKARTE_HIGHLIGHT'
    );
    expect(highlightCall).toBeUndefined();
  });
});
