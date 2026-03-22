/**
 * Scenario: Standard search results page
 *
 * User opens willhaben.at search results →
 *   map panel appears, markers placed for each listing with coordinates.
 */

const fs   = require('fs');
const path = require('path');


// ── shared fixtures ──────────────────────────────────────────────────────────
function makeSummary(id, lat, lng, price = '350000', size = '65') {
  return {
    id,
    attributes: {
      attribute: [
        { name: 'COORDINATES',             values: [`${lat},${lng}`] },
        { name: 'PRICE',                   values: [price] },
        { name: 'HEADING',                 values: [`Wohnung ${id}`] },
        { name: 'POSTCODE',                values: ['1010'] },
        { name: 'LOCATION',                values: ['Wien'] },
        { name: 'ESTATE_SIZE/LIVING_AREA', values: [size] },
        { name: 'SEO_URL',                 values: [`kaufen/d/wohnung-${id}/`] }
      ]
    }
  };
}

const THIRTY_LISTINGS = Array.from({ length: 30 }, (_, i) =>
  makeSummary(String(1000000 + i), 48.1 + i * 0.01, 16.3 + i * 0.01)
);

function buildSearchNextData(summaries) {
  return {
    buildId: 'test-build',
    props: {
      pageProps: {
        searchResult: {
          advertSummaryList: { advertSummary: summaries }
        }
      }
    }
  };
}

// ── setup ────────────────────────────────────────────────────────────────────
let mocks;
let postSpy;

beforeEach(() => {
  // Leaflet mocks
  mocks = setupLeaflet();

  // DOM — #map and #status are needed by map.js at load time
  document.body.innerHTML  = '<div id="map"></div><div id="status"></div>';
  document.head.innerHTML  = '';
  document.documentElement.removeAttribute('data-wh-theme');

  // Location: standard search page
  Object.defineProperty(window, 'location', {
    value: { pathname: '/iad/immobilien/wohnung-kaufen', search: '', href: 'https://www.willhaben.at/iad/immobilien/wohnung-kaufen' },
    writable: true, configurable: true
  });

  // Set __NEXT_DATA__
  const el = document.createElement('script');
  el.id   = '__NEXT_DATA__';
  el.type = 'application/json';
  el.textContent = JSON.stringify(buildSearchNextData(THIRTY_LISTINGS));
  document.head.appendChild(el);

  postSpy = jest.fn();
});

function loadBoth() {
  // Load map.js first (iframe context, but we simulate it inline)
  const mapSrc = fs.readFileSync(path.join(__dirname, '../../map.js'), 'utf8');
  (0, eval)(mapSrc);

  // Load content.js
  const contentSrc = fs.readFileSync(path.join(__dirname, '../../content.js'), 'utf8');
  (0, eval)(contentSrc);

  // Wire iframe's contentWindow postMessage → spy AND process via addListings
  const iframe = document.querySelector('#wikarte-panel iframe');
  Object.defineProperty(iframe, 'contentWindow', {
    get: () => ({
      postMessage: (msg) => {
        postSpy(msg);
        // Simulate map.js receiving the message
        if (msg.type === 'WIKARTE_LISTINGS') addListings(msg.data);
        if (msg.type === 'WIKARTE_INVALIDATE') {
          mocks.mockMap.invalidateSize();
          mocks.mockMap.fitBounds();
        }
      },
      close: jest.fn(),
      length: 0
    }),
    configurable: true
  });

  iframe.dispatchEvent(new Event('load'));
}

// ════════════════════════════════════════════════════════════════════════════
// Scenario tests
// ════════════════════════════════════════════════════════════════════════════
describe('Scenario: Search results page', () => {
  test('map panel is created and visible by default', () => {
    loadBoth();
    expect(document.getElementById('wikarte-panel')).not.toBeNull();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });

  test('map toggle button is visible', () => {
    loadBoth();
    const toggle = document.getElementById('wikarte-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.style.display).not.toBe('none');
  });

  test('all 30 listings are placed as markers', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));
    expect(mocks.mockMarkers.addLayer).toHaveBeenCalledTimes(30);
  });

  test('WIKARTE_LISTINGS message is sent to iframe', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    const listingsMsg = postSpy.mock.calls.find(c => c[0]?.type === 'WIKARTE_LISTINGS');
    expect(listingsMsg).toBeDefined();
    expect(listingsMsg[0].data.advertSummaryList.advertSummary).toHaveLength(30);
  });

  test('user clicking toggle hides the map', () => {
    loadBoth();
    const toggle = document.getElementById('wikarte-toggle');
    toggle.click();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(false);
  });

  test('user clicking toggle again shows the map', () => {
    loadBoth();
    const toggle = document.getElementById('wikarte-toggle');
    toggle.click(); // hide
    toggle.click(); // show
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });

  test('WIKARTE_THEME message sent to iframe on load', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));
    const themeMsg = postSpy.mock.calls.find(c => c[0]?.type === 'WIKARTE_THEME');
    expect(themeMsg).toBeDefined();
  });

  test('fetch result updates markers (count change simulation)', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));
    mocks.mockMarkers.addLayer.mockClear();

    // Simulate willhaben fetching 60 results
    const SIXTY_LISTINGS = Array.from({ length: 60 }, (_, i) =>
      makeSummary(String(2000000 + i), 48.1 + i * 0.005, 16.3 + i * 0.005)
    );
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        channel: 'wikarte',
        type: 'WIKARTE_FETCH_RESULT',
        sourceUrl: 'https://www.willhaben.at/iad/search',
        data: { advertSummaryList: { advertSummary: SIXTY_LISTINGS } }
      },
      source: window
    }));
    await new Promise(r => setTimeout(r, 100));

    expect(mocks.mockMarkers.clearLayers).toHaveBeenCalled();
    // Use _layers.length (final map state) rather than addLayer call count,
    // because accumulated window.message listeners from previous tests may call
    // addListings multiple times (each clears + re-adds, so final state = 60).
    expect(mocks.mockMarkers._layers).toHaveLength(60);
  });

  test('listings without coordinates are skipped', async () => {
    // Override __NEXT_DATA__ with one valid + one without coords
    const el = document.getElementById('__NEXT_DATA__');
    el.textContent = JSON.stringify(buildSearchNextData([
      makeSummary('VALID',   48.2, 16.3),
      { id: 'NO_COORDS', attributes: { attribute: [{ name: 'PRICE', values: ['100000'] }] } }
    ]));

    loadBoth();
    await new Promise(r => setTimeout(r, 100));
    expect(mocks.mockMarkers.addLayer).toHaveBeenCalledTimes(1);
  });
});
