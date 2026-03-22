/**
 * Unit tests for map.js utility functions:
 * shortPrice, formatPrice, escapeHtml, addListings, highlight/unhighlight
 */

const fs   = require('fs');
const path = require('path');


// ── helpers ─────────────────────────────────────────────────────────────────
function loadMapJs(mockMarkers) {
  document.body.innerHTML = '<div id="map"></div><div id="status"></div>';
  const src = fs.readFileSync(path.join(__dirname, '../../map.js'), 'utf8');
  // Expose globals created by the script (function decls, vars)
  (0, eval)(src);
}

// ── shared listing fixture ───────────────────────────────────────────────────
function makeListing(overrides = {}) {
  return {
    id: '123456789',
    attributes: {
      attribute: [
        { name: 'COORDINATES',          values: ['48.2,16.3'] },
        { name: 'PRICE',                values: ['450000'] },
        { name: 'HEADING',              values: ['Schöne Wohnung'] },
        { name: 'POSTCODE',             values: ['1010'] },
        { name: 'LOCATION',             values: ['Wien'] },
        { name: 'ESTATE_SIZE/LIVING_AREA', values: ['75'] },
        { name: 'SEO_URL',              values: ['kaufen/d/wohnung-123456789/'] },
        ...( overrides.extraAttrs || [] )
      ]
    },
    ...overrides
  };
}

// ── setup ────────────────────────────────────────────────────────────────────
let mocks;
beforeAll(() => {
  mocks = setupLeaflet();
  loadMapJs(mocks.mockMarkers);
});

// ════════════════════════════════════════════════════════════════════════════
// shortPrice
// ════════════════════════════════════════════════════════════════════════════
describe('shortPrice()', () => {
  test('returns ? for empty/NA', () => {
    expect(shortPrice('')).toBe('?');
    expect(shortPrice('NA')).toBe('?');
    expect(shortPrice(null)).toBe('?');
  });

  test('millions: exact', () => {
    expect(shortPrice('1000000')).toBe('1M');
    expect(shortPrice('2000000')).toBe('2M');
  });

  test('millions: with fraction', () => {
    expect(shortPrice('1500000')).toBe('1.5M');
    expect(shortPrice('1250000')).toBe('1.3M'); // rounds to 1 decimal
  });

  test('≥ 100 000 → rounded k', () => {
    expect(shortPrice('450000')).toBe('450k');
    expect(shortPrice('100000')).toBe('100k');
    expect(shortPrice('999000')).toBe('999k');
    expect(shortPrice('123456')).toBe('123k');
  });

  test('< 100 000 → rounded integer (no decimal cents)', () => {
    // de-AT uses a narrow space as thousands separator in Node.js
    expect(shortPrice('99999')).toMatch(/^99.?999$/);  // accepts . or space separator
    expect(shortPrice('1435.85')).toMatch(/^1.?436$/); // rounds, removes cents
    expect(shortPrice('50')).toBe('50');
    expect(shortPrice('18')).toBe('18');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// formatPrice
// ════════════════════════════════════════════════════════════════════════════
describe('formatPrice()', () => {
  test('returns empty for NA/empty', () => {
    expect(formatPrice('NA')).toBe('');
    expect(formatPrice('')).toBe('');
    expect(formatPrice(null)).toBe('');
  });

  test('formats with EUR and de-AT locale', () => {
    const result = formatPrice('500000');
    expect(result).toContain('500');
    expect(result).toContain('€');
  });

  test('no decimal digits', () => {
    const result = formatPrice('450000.99');
    expect(result).not.toMatch(/,\d{2}/); // no cent digits
  });

  test('non-numeric string returned escaped', () => {
    const result = formatPrice('auf Anfrage');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('sanitizeUrl()', () => {
  test('rejects non-https URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)', { allowedHosts: ['willhaben.at'] })).toBe('');
    expect(sanitizeUrl('http://www.willhaben.at/test', { allowedHosts: ['willhaben.at'] })).toBe('');
  });

  test('accepts https willhaben URLs and normalizes relative paths', () => {
    expect(sanitizeUrl('https://www.willhaben.at/iad/test', { allowedHosts: ['willhaben.at'] }))
      .toBe('https://www.willhaben.at/iad/test');
    expect(sanitizeUrl('/iad/test', { allowRelative: true, allowedHosts: ['willhaben.at'] }))
      .toBe('https://www.willhaben.at/iad/test');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// escapeHtml
// ════════════════════════════════════════════════════════════════════════════
describe('escapeHtml()', () => {
  test('empty / NA returns empty', () => {
    expect(escapeHtml('NA')).toBe('');
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
  });

  test('escapes < > & correctly (text-node approach does not escape ")', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    // div.textContent + innerHTML does not escape double quotes in text nodes
    expect(escapeHtml('"quoted"')).toBe('"quoted"');
  });

  test('plain text is unchanged', () => {
    expect(escapeHtml('Hello Wien')).toBe('Hello Wien');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// addListings — marker placement
// ════════════════════════════════════════════════════════════════════════════
describe('addListings()', () => {
  beforeEach(() => {
    mocks.mockMarkers.clearLayers.mockClear();
    mocks.mockMarkers.addLayer.mockClear();
    L.marker.mockClear();
    document.getElementById('status').textContent = '';
  });

  test('clears existing markers before adding new ones', () => {
    addListings({ advertSummaryList: { advertSummary: [makeListing()] } });
    expect(mocks.mockMarkers.clearLayers).toHaveBeenCalledTimes(1);
  });

  test('adds one marker per valid listing', () => {
    const listings = [makeListing({ id: '111' }), makeListing({ id: '222' })];
    addListings({ advertSummaryList: { advertSummary: listings } });
    expect(mocks.mockMarkers.addLayer).toHaveBeenCalledTimes(2);
  });

  test('skips listings without coordinates or postcode', () => {
    const noCoords = {
      id: '999',
      attributes: { attribute: [{ name: 'PRICE', values: ['100'] }] }
    };
    addListings({ advertSummaryList: { advertSummary: [noCoords] } });
    expect(mocks.mockMarkers.addLayer).not.toHaveBeenCalled();
  });

  test('falls back to POSTCODE_COORDS when no COORDINATES attribute', () => {
    const listing = {
      id: '555',
      attributes: {
        attribute: [
          { name: 'POSTCODE', values: ['1010'] },
          { name: 'PRICE',    values: ['200000'] }
        ]
      }
    };
    addListings({ advertSummaryList: { advertSummary: [listing] } });
    expect(mocks.mockMarkers.addLayer).toHaveBeenCalledTimes(1);
    // Marker placed at Vienna 1010 postcode center
    expect(L.marker).toHaveBeenCalledWith([48.2082, 16.3738], expect.anything());
  });

  test('status text shows correct count', () => {
    addListings({ advertSummaryList: { advertSummary: [makeListing()] } });
    expect(document.getElementById('status').textContent).toMatch(/1/);
  });

  test('status shows no listings for empty array', () => {
    addListings({ advertSummaryList: { advertSummary: [] } });
    expect(mocks.mockMarkers.addLayer).not.toHaveBeenCalled();
  });

  test('accepts data.rows format', () => {
    addListings({ rows: [makeListing()] });
    expect(mocks.mockMarkers.addLayer).toHaveBeenCalledTimes(1);
  });

  test('marker popup includes heading and price', () => {
    addListings({ advertSummaryList: { advertSummary: [makeListing()] } });
    const markerInstance = L.marker.mock.results[0].value;
    expect(markerInstance.bindPopup).toHaveBeenCalled();
    const popupHtml = markerInstance.bindPopup.mock.calls[0][0];
    expect(popupHtml).toContain('Schöne Wohnung');
    expect(popupHtml).toContain('€');
    expect(popupHtml).toContain('rel="noopener noreferrer"');
  });

  test('popup excludes unsafe image and link URLs', () => {
    addListings({
      advertSummaryList: {
        advertSummary: [
          makeListing({
            advertImageList: { advertImage: [{ mainImageUrl: 'javascript:alert(1)' }] },
            contextLinkList: { contextLink: [{ rel: 'self', uri: 'javascript:alert(1)' }] },
            extraAttrs: [
              { name: 'MMO', values: ['NA'] },
              { name: 'SEO_URL', values: ['NA'] }
            ]
          })
        ]
      }
    });
    const popupHtml = L.marker.mock.results[0].value.bindPopup.mock.calls[0][0];
    expect(popupHtml).not.toContain('javascript:');
    expect(popupHtml).not.toContain('<img');
    expect(popupHtml).not.toContain('<a ');
  });

  test('Merkliste item with top-level fields is placed on map', () => {
    const merklisteItem = {
      id: '777',
      postCode: '1160',
      postalName: 'Wien',
      description: 'Tolle Wohnung',
      attributes: {
        attribute: [
          { name: 'PRICE/AMOUNT', values: ['1550'] }
        ]
      }
    };
    addListings({ advertSummaryList: { advertSummary: [merklisteItem] } });
    expect(mocks.mockMarkers.addLayer).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// highlightMarker / unhighlightMarker
// ════════════════════════════════════════════════════════════════════════════
describe('highlightMarker() / unhighlightMarker()', () => {
  beforeEach(() => {
    mocks.mockMarkers.clearLayers.mockClear();
    mocks.mockMarkers.addLayer.mockClear();
    L.marker.mockClear();
    // Load a listing so markerMap has an entry
    addListings({ advertSummaryList: { advertSummary: [makeListing()] } });
    mocks.mockMarkers.getVisibleParent.mockReturnValue(null);
  });

  test('does nothing for unknown adId', () => {
    highlightMarker('UNKNOWN_ID');
    // No error thrown
  });

  test('sets highlight icon on visible marker', () => {
    const marker = L.marker.mock.results[0].value;
    // Simulate marker is directly visible (getVisibleParent returns the marker itself)
    mocks.mockMarkers.getVisibleParent.mockReturnValue(marker);
    highlightMarker('123456789');
    expect(marker.setIcon).toHaveBeenCalled();
    const newIcon = marker.setIcon.mock.calls[marker.setIcon.mock.calls.length - 1][0];
    expect(newIcon.options.html).toContain('highlighted');
  });

  test('unhighlight restores original icon', () => {
    const marker = L.marker.mock.results[0].value;
    mocks.mockMarkers.getVisibleParent.mockReturnValue(marker);
    highlightMarker('123456789');
    unhighlightMarker();
    // setIcon called twice: once to highlight, once to restore
    expect(marker.setIcon).toHaveBeenCalledTimes(2);
  });

  test('adds cluster-highlighted class when inside cluster', () => {
    const fakeClusterEl = document.createElement('div');
    const fakeCluster = { getElement: () => fakeClusterEl };
    mocks.mockMarkers.getVisibleParent.mockReturnValue(fakeCluster);
    highlightMarker('123456789');
    expect(fakeClusterEl.classList.contains('cluster-highlighted')).toBe(true);
  });

  test('removes cluster-highlighted class on unhighlight', () => {
    const fakeClusterEl = document.createElement('div');
    fakeClusterEl.classList.add('cluster-highlighted');
    const fakeCluster = { getElement: () => fakeClusterEl };
    mocks.mockMarkers.getVisibleParent.mockReturnValue(fakeCluster);
    highlightMarker('123456789');
    unhighlightMarker();
    expect(fakeClusterEl.classList.contains('cluster-highlighted')).toBe(false);
  });
});
