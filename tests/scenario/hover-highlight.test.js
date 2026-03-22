/**
 * Scenario: Hover highlight
 *
 * User hovers over a listing card →
 *   corresponding map marker (or cluster) gets highlighted.
 * User moves mouse away → highlight removed.
 */

const fs   = require('fs');
const path = require('path');


function setNextData(data) {
  const el = document.createElement('script');
  el.id   = '__NEXT_DATA__';
  el.type = 'application/json';
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
}

const SEARCH_DATA = {
  buildId: 'test',
  props: {
    pageProps: {
      searchResult: {
        advertSummaryList: {
          advertSummary: [
            { id: '1234567890', attributes: { attribute: [{ name: 'COORDINATES', values: ['48.2,16.3'] }] } },
            { id: '9876543210', attributes: { attribute: [{ name: 'COORDINATES', values: ['48.3,16.4'] }] } }
          ]
        }
      }
    }
  }
};

// ── setup ────────────────────────────────────────────────────────────────────
let mocks;
let postSpy;
let capturedMapMessages;

beforeEach(() => {
  mocks = setupLeaflet();
  document.body.innerHTML = '<div id="map"></div><div id="status"></div>';
  document.head.innerHTML = '';

  Object.defineProperty(window, 'location', {
    value: { pathname: '/iad/immobilien/wohnung-kaufen', search: '', href: '' },
    writable: true, configurable: true
  });

  setNextData(SEARCH_DATA);
  postSpy = jest.fn();
  capturedMapMessages = [];
});

function loadBoth() {
  const mapSrc = fs.readFileSync(path.join(__dirname, '../../map.js'), 'utf8');
  (0, eval)(mapSrc);

  const contentSrc = fs.readFileSync(path.join(__dirname, '../../content.js'), 'utf8');
  (0, eval)(contentSrc);

  const iframe = document.querySelector('#wikarte-panel iframe');
  Object.defineProperty(iframe, 'contentWindow', {
    get: () => ({
      postMessage: (msg) => {
        postSpy(msg);
        capturedMapMessages.push(msg);
        // Feed map messages through map.js handlers
        window.dispatchEvent(new MessageEvent('message', { data: msg }));
      },
      close: jest.fn(),
      length: 0
    }),
    configurable: true
  });
  iframe.dispatchEvent(new Event('load'));
}

// ════════════════════════════════════════════════════════════════════════════
describe('Scenario: Hover highlight', () => {
  test('hovering listing element sends WIKARTE_HIGHLIGHT to iframe', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    const listingEl = document.createElement('div');
    listingEl.id = '1234567890';
    document.body.appendChild(listingEl);

    listingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));

    const highlightMsgs = postSpy.mock.calls.filter(c => c[0]?.type === 'WIKARTE_HIGHLIGHT');
    expect(highlightMsgs.length).toBeGreaterThan(0);
    expect(highlightMsgs[0][0].adId).toBe('1234567890');
  });

  test('mouseout sends WIKARTE_UNHIGHLIGHT', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    const listingEl = document.createElement('div');
    listingEl.id = '1234567890';
    document.body.appendChild(listingEl);

    listingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    listingEl.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    const unhighlightMsgs = postSpy.mock.calls.filter(c => c[0]?.type === 'WIKARTE_UNHIGHLIGHT');
    expect(unhighlightMsgs.length).toBeGreaterThan(0);
  });

  test('hovering child element of listing triggers highlight', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    // Create listing with child elements (like a real card)
    const listingEl = document.createElement('div');
    listingEl.id = '9876543210';
    const imgEl = document.createElement('img');
    const titleEl = document.createElement('h3');
    titleEl.textContent = 'Beautiful apartment';
    listingEl.appendChild(imgEl);
    listingEl.appendChild(titleEl);
    document.body.appendChild(listingEl);

    // Hover over the child (title), not the parent
    titleEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));

    const highlightMsgs = postSpy.mock.calls.filter(c => c[0]?.type === 'WIKARTE_HIGHLIGHT');
    expect(highlightMsgs.length).toBeGreaterThan(0);
    expect(highlightMsgs[0][0].adId).toBe('9876543210');
  });

  test('hovering non-listing element does NOT send WIKARTE_HIGHLIGHT', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    postSpy.mockClear();

    const navEl = document.createElement('nav');
    navEl.id = 'main-nav'; // non-numeric id
    document.body.appendChild(navEl);

    navEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));

    const highlightMsgs = postSpy.mock.calls.filter(c => c[0]?.type === 'WIKARTE_HIGHLIGHT');
    expect(highlightMsgs).toHaveLength(0);
  });

  test('hovering same listing twice does NOT send duplicate highlights', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));
    postSpy.mockClear();

    const listingEl = document.createElement('div');
    listingEl.id = '1234567890';
    document.body.appendChild(listingEl);

    // First hover — should send highlight(s) depending on how many listeners are active
    listingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    const countAfterFirst = postSpy.mock.calls.filter(c => c[0]?.type === 'WIKARTE_HIGHLIGHT').length;

    // Second hover on the SAME element — deduplication should prevent any new highlights
    listingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    const countAfterSecond = postSpy.mock.calls.filter(c => c[0]?.type === 'WIKARTE_HIGHLIGHT').length;

    expect(countAfterFirst).toBeGreaterThan(0);     // at least one highlight was sent
    expect(countAfterSecond).toBe(countAfterFirst); // no additional highlights on second hover
  });

  test('highlight changes icon to highlighted style', async () => {
    loadBoth();
    await new Promise(r => setTimeout(r, 100));

    // The markers are in markerMap — add a listing element
    const listingEl = document.createElement('div');
    listingEl.id = '1234567890';
    document.body.appendChild(listingEl);

    // Make getVisibleParent return the most-recently-created marker (the one in markerMap)
    // Multiple addListings calls from accumulated listeners means L.marker was called
    // multiple times; the last result for '1234567890' is the live one in markerMap.
    const allMarkerResults = L.marker.mock.results;
    mocks.mockMarkers.getVisibleParent.mockImplementation((m) => m);

    listingEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));

    // Check that at least one marker had its icon set to a highlighted style
    const anyHighlighted = allMarkerResults.some(r =>
      r?.value?.setIcon?.mock?.calls?.some(call => call[0]?.options?.html?.includes('highlighted'))
    );
    expect(anyHighlighted).toBe(true);
  });
});
