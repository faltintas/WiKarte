/**
 * Scenario: Merkliste (saved ads) page
 *
 * User opens their Merkliste →
 *   map shows saved ads using postcode fallback for coordinates.
 */

const fs   = require('fs');
const path = require('path');


function buildMerklisteNextData(items) {
  return {
    buildId: 'test-build',
    props: {
      pageProps: {
        pageProps: {
          pageProps: {
            currentSavedAds: {
              advertFolderItemList: { advertFolderItems: items }
            }
          }
        }
      }
    }
  };
}

function makeMerklisteItem(id, postCode = '1010', price = '450000') {
  return {
    id,
    postCode,
    postalName: 'Wien',
    description: `Merkliste Wohnung ${id}`,
    attributes: {
      attribute: [
        { name: 'PRICE/AMOUNT', values: [price] },
        { name: 'LOCATION',     values: ['Wien'] },
        { name: 'POSTCODE',     values: [postCode] },
        { name: 'SEO_URL',      values: [`kaufen/d/wohnung-${id}/`] }
      ]
    },
    advertImageList: { advertImage: [{ mainImageUrl: `https://img.willhaben.at/${id}.jpg` }] },
    contextLinkList: { contextLink: [{ rel: 'self', uri: `/iad/kaufen/d/wohnung-${id}/` }] }
  };
}

// ── setup ────────────────────────────────────────────────────────────────────
let mocks;
let postSpy;

beforeEach(() => {
  mocks = setupLeaflet();

  document.body.innerHTML = '<div id="map"></div><div id="status"></div>';
  document.head.innerHTML = '';

  Object.defineProperty(window, 'location', {
    value: {
      pathname: '/iad/myprofile/myfindings',
      search:   '?folderId=8296525',
      href:     'https://www.willhaben.at/iad/myprofile/myfindings?folderId=8296525'
    },
    writable: true, configurable: true
  });

  postSpy = jest.fn();
});

function setNextData(data) {
  const el = document.createElement('script');
  el.id   = '__NEXT_DATA__';
  el.type = 'application/json';
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
}

function loadBoth() {
  const mapSrc = fs.readFileSync(path.join(__dirname, '../../src/map/map.js'), 'utf8');
  (0, eval)(mapSrc);

  const contentSrc = fs.readFileSync(path.join(__dirname, '../../src/content/content.js'), 'utf8');
  (0, eval)(contentSrc);

  const iframe = document.querySelector('#wikarte-panel iframe');
  Object.defineProperty(iframe, 'contentWindow', {
    get: () => ({
      postMessage: (msg) => {
        postSpy(msg);
        if (msg.type === 'WIKARTE_LISTINGS') addListings(msg.data);
      },
      close: jest.fn(),
      length: 0
    }),
    configurable: true
  });
  iframe.dispatchEvent(new Event('load'));
}

// ════════════════════════════════════════════════════════════════════════════
describe('Scenario: Merkliste page', () => {
  test('map panel is created and shown', () => {
    setNextData(buildMerklisteNextData([makeMerklisteItem('AAA')]));
    loadBoth();
    expect(document.getElementById('wikarte-panel')).not.toBeNull();
    expect(document.documentElement.classList.contains('wikarte-active')).toBe(true);
  });

  test('Merkliste items are extracted and sent to map', async () => {
    const items = [
      makeMerklisteItem('M001', '1010'),
      makeMerklisteItem('M002', '1160'),
      makeMerklisteItem('M003', '1020')
    ];
    setNextData(buildMerklisteNextData(items));
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    const listingsMsg = postSpy.mock.calls.find(c => c[0]?.type === 'WIKARTE_LISTINGS');
    expect(listingsMsg).toBeDefined();
    expect(listingsMsg[0].data.advertSummaryList.advertSummary).toHaveLength(3);
  });

  test('items are placed using postcode coordinates', async () => {
    setNextData(buildMerklisteNextData([makeMerklisteItem('M001', '1010')]));
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    // 1010 is in POSTCODE_COORDS → marker should be placed
    expect(mocks.mockMarkers.addLayer).toHaveBeenCalledTimes(1);
    expect(L.marker).toHaveBeenCalledWith([48.2082, 16.3738], expect.anything());
  });

  test('popup contains item description and price', async () => {
    setNextData(buildMerklisteNextData([makeMerklisteItem('M001', '1010', '299000')]));
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    const marker = L.marker.mock.results[0]?.value;
    expect(marker).toBeDefined();
    expect(marker._popup).toContain('Merkliste Wohnung M001');
  });

  test('non-_next/data fetch is ignored on Merkliste page', async () => {
    setNextData(buildMerklisteNextData([makeMerklisteItem('REAL')]));
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    const countBefore = mocks.mockMarkers.clearLayers.mock.calls.length;

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        channel: 'wikarte',
        type: 'WIKARTE_FETCH_RESULT',
        sourceUrl: 'https://www.willhaben.at/iad/some-recommendation-api',
        data: { advertSummaryList: { advertSummary: [{ id: 'RANDOM', attributes: { attribute: [] } }] } }
      },
      source: window
    }));
    await new Promise(r => setTimeout(r, 100));

    // clearLayers should NOT have been called an extra time for the random data
    expect(mocks.mockMarkers.clearLayers.mock.calls.length).toBe(countBefore);
  });

  test('empty Merkliste does not crash', async () => {
    setNextData(buildMerklisteNextData([]));
    loadBoth();
    await new Promise(r => setTimeout(r, 100));
    expect(mocks.mockMarkers.addLayer).not.toHaveBeenCalled();
  });

  test('unknown postcode items are skipped', async () => {
    const item = makeMerklisteItem('X001', '9999'); // not in POSTCODE_COORDS
    setNextData(buildMerklisteNextData([item]));
    loadBoth();
    await new Promise(r => setTimeout(r, 100));
    expect(mocks.mockMarkers.addLayer).not.toHaveBeenCalled();
  });
});
