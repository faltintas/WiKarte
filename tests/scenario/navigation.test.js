/**
 * Scenario: SPA navigation between pages
 *
 * 1. User is on search results → map visible
 * 2. User clicks a listing → navigates to detail page → map hides
 * 3. User presses back → returns to list → map shows again
 */

const fs   = require('fs');
const path = require('path');


function setNextData(data) {
  let el = document.getElementById('__NEXT_DATA__');
  if (!el) {
    el = document.createElement('script');
    el.id   = '__NEXT_DATA__';
    el.type = 'application/json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

const SEARCH_DATA = {
  buildId: 'test',
  props: {
    pageProps: {
      searchResult: {
        advertSummaryList: {
          advertSummary: [
            { id: '111', attributes: { attribute: [{ name: 'COORDINATES', values: ['48.2,16.3'] }] } }
          ]
        }
      }
    }
  }
};

function loadContent() {
  const src = fs.readFileSync(path.join(__dirname, '../../src/content/content.js'), 'utf8');
  (0, eval)(src);
}

// ── setup ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  setupLeaflet();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.documentElement.classList.remove('wikarte-active');
});

// ════════════════════════════════════════════════════════════════════════════
describe('Scenario: Navigation', () => {
  test('map hidden and toggle absent on detail page (initial load)', () => {
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/iad/immobilien/d/tolle-wohnung-1234567890/',
        search:   '',
        href:     'https://www.willhaben.at/iad/immobilien/d/tolle-wohnung-1234567890/'
      },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();

    expect(document.documentElement.classList.contains('wikarte-active')).toBe(false);
    const toggle = document.getElementById('wikarte-toggle');
    expect(toggle?.style.display).toBe('none');
  });

  test('map shown on list page (initial load)', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/immobilien/wohnung-kaufen', search: '', href: '' },
      writable: true, configurable: true
    });
    setNextData(SEARCH_DATA);
    loadContent();

    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });

  test('homepage: map panel hidden, toggle hidden', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '', href: '' },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();

    expect(document.documentElement.classList.contains('wikarte-active')).toBe(false);
    const toggle = document.getElementById('wikarte-toggle');
    expect(toggle?.style.display).toBe('none');
  });

  test('/iad root: map hidden', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad', search: '', href: '' },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();

    expect(document.documentElement.classList.contains('wikarte-active')).toBe(false);
  });

  test('popstate event triggers visibility update', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/immobilien/wohnung-kaufen', search: '', href: '' },
      writable: true, configurable: true
    });
    setNextData(SEARCH_DATA);
    loadContent();

    window.dispatchEvent(new PopStateEvent('popstate', {}));
    await new Promise(r => setTimeout(r, 100));

    // Still on list page → still visible
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });

  test('WIKARTE_NAV_CHANGE calls updateVisibility', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/immobilien/wohnung-kaufen', search: '', href: '' },
      writable: true, configurable: true
    });
    setNextData(SEARCH_DATA);
    loadContent();

    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: 'wikarte', type: 'WIKARTE_NAV_CHANGE' },
      source: window
    }));
    await new Promise(r => setTimeout(r, 600));

    expect(document.getElementById('wikarte-panel')).not.toBeNull();
  });

  test('myadverts page treated as list page', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/myprofile/myadverts', search: '', href: '' },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();

    const toggle = document.getElementById('wikarte-toggle');
    expect(toggle?.style.display).not.toBe('none');
  });

  test('merkliste URL pattern detected as list page', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/iad/merkliste', search: '', href: '' },
      writable: true, configurable: true
    });
    setNextData({ buildId: 'x', props: { pageProps: {} } });
    loadContent();

    const toggle = document.getElementById('wikarte-toggle');
    expect(toggle?.style.display).not.toBe('none');
  });
});
