/**
 * Unit tests for src/map/map.js utility functions:
 * shortPrice, formatPrice, escapeHtml, addListings, highlight/unhighlight
 */

const fs   = require('fs');
const path = require('path');


// ── helpers ─────────────────────────────────────────────────────────────────
function loadMapJs(mockMarkers) {
  document.body.innerHTML = '<div id="map"></div><div id="status"></div>';
  const src = fs.readFileSync(path.join(__dirname, '../../src/map/map.js'), 'utf8');
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
  const austriaBorder = {
    type: 'Feature',
    properties: { name: 'Austria', iso3: 'AUT' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[9.5, 46.3], [17.2, 46.3], [17.2, 49.1], [9.5, 49.1], [9.5, 46.3]]]
    }
  };
  global.WIKARTE_AUSTRIA_BORDER = austriaBorder;
  window.WIKARTE_AUSTRIA_BORDER = austriaBorder;

  const viennaDistricts = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { districtNumber: '1', districtName: 'Innere Stadt' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[16.35, 48.21], [16.39, 48.21], [16.39, 48.24], [16.35, 48.24], [16.35, 48.21]]]
        }
      }
    ]
  };
  global.WIKARTE_VIENNA_DISTRICTS = viennaDistricts;
  window.WIKARTE_VIENNA_DISTRICTS = viennaDistricts;
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

describe('Vienna district overlay', () => {
  beforeEach(() => {
    mocks.mockMap._zoom = 7;
    mocks.mockMap._bounds = { intersects: jest.fn().mockReturnValue(false) };
    syncViennaDistrictOverlay();
    mocks.mockMap.addLayer.mockClear();
    mocks.mockMap.removeLayer.mockClear();
    L.marker.mockClear();
  });

  test('stays hidden below the district zoom threshold', () => {
    mocks.mockMap._zoom = 10;
    mocks.mockMap._bounds = { intersects: jest.fn().mockReturnValue(true) };

    syncViennaDistrictOverlay();

    expect(mocks.mockMap.addLayer).not.toHaveBeenCalled();
  });

  test('shows district outlines inside Vienna at high zoom', () => {
    mocks.mockMap._zoom = 12;
    mocks.mockMap._bounds = { intersects: jest.fn().mockReturnValue(true) };

    syncViennaDistrictOverlay();

    expect(mocks.mockMap.addLayer).toHaveBeenCalledTimes(1);
    const outlineLayer = mocks.mockMap.addLayer.mock.calls[0][0];
    expect(outlineLayer._data).toBe(global.WIKARTE_VIENNA_DISTRICTS);
    expect(outlineLayer._opts).toEqual(expect.objectContaining({ pane: 'wikarte-district-outlines' }));
    expect(outlineLayer._opts.style()).toEqual(expect.objectContaining({
      color: '#4BB8E0',
      weight: 1.8,
      opacity: 0.75,
      fillOpacity: 0
    }));
  });

  test('reduces district border opacity in dark theme', () => {
    mocks.mockMap._zoom = 12;
    mocks.mockMap._bounds = { intersects: jest.fn().mockReturnValue(true) };
    syncViennaDistrictOverlay();

    const outlineLayer = mocks.mockMap.addLayer.mock.calls[0][0];
    setTheme('dark');

    expect(outlineLayer.setStyle).toHaveBeenCalledWith(expect.objectContaining({
      color: '#4BB8E0',
      opacity: 0.3
    }));
    expect(getViennaDistrictOutlineStyle()).toEqual(expect.objectContaining({
      color: '#4BB8E0',
      opacity: 0.3
    }));
  });

  test('removes district overlays when moving away from Vienna', () => {
    mocks.mockMap._zoom = 12;
    mocks.mockMap._bounds = { intersects: jest.fn().mockReturnValue(true) };
    syncViennaDistrictOverlay();

    mocks.mockMap.addLayer.mockClear();
    mocks.mockMap._bounds = { intersects: jest.fn().mockReturnValue(false) };
    syncViennaDistrictOverlay();

    expect(mocks.mockMap.removeLayer).toHaveBeenCalledTimes(1);
  });
});

describe('basemap switching', () => {
  const getStreetLightLayer = () => mocks.tileLayers[0];
  const getStreetDarkLayer = () => mocks.tileLayers[1];
  const getSatelliteLayer = () => mocks.tileLayers[2];

  beforeEach(() => {
    setBaseLayer('street');
    setTheme('light');
    mocks.mockMap.addLayer.mockClear();
    mocks.mockMap.removeLayer.mockClear();
    mocks.tileLayers.forEach(layer => layer.addTo.mockClear());
  });

  test('switches street mode between light and dark tiles', () => {
    setTheme('dark');

    expect(getStreetDarkLayer().addTo).toHaveBeenCalledWith(mocks.mockMap);
    expect(mocks.mockMap.removeLayer).toHaveBeenCalledWith(getStreetLightLayer());
  });

  test('switches to satellite without using street theme tiles', () => {
    setBaseLayer('satellite');

    expect(getSatelliteLayer().addTo).toHaveBeenCalledWith(mocks.mockMap);
    expect(mocks.mockMap.removeLayer).toHaveBeenCalledWith(getStreetLightLayer());

    mocks.mockMap.removeLayer.mockClear();
    getStreetDarkLayer().addTo.mockClear();

    setTheme('dark');

    expect(getStreetDarkLayer().addTo).not.toHaveBeenCalled();
    expect(mocks.mockMap.removeLayer).not.toHaveBeenCalledWith(getSatelliteLayer());
  });
});

describe('Austria border overlay', () => {
  test('loads the Austria border asset into the map iframe', () => {
    const mapHtml = fs.readFileSync(path.join(__dirname, '../../src/map/map.html'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../manifest.json'), 'utf8'));

    expect(mapHtml).toContain('<script src="../data/austria-border.js"></script>');
    expect(manifest.web_accessible_resources[0].resources).toContain('src/data/austria-border.js');
  });

  test('wires Austria outline styling into the map script', () => {
    const mapSource = fs.readFileSync(path.join(__dirname, '../../src/map/map.js'), 'utf8');
    const borderAsset = fs.readFileSync(path.join(__dirname, '../../src/data/austria-border.js'), 'utf8');

    expect(mapSource).toContain("const austriaOutlinePane = map.createPane('wikarte-austria-outline');");
    expect(mapSource).toContain('function getAustriaBorderStyle()');
    expect(mapSource).toContain('ensureAustriaBorderLayer();');
    expect(borderAsset).toContain('window.WIKARTE_AUSTRIA_BORDER = ');
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

  test('wishlisted items use the gold marker style', () => {
    addListings({
      advertSummaryList: {
        advertSummary: [
          {
            ...makeListing(),
            wikarteWishlisted: true
          }
        ]
      }
    });

    const markerInstance = L.marker.mock.results[0].value;
    expect(markerInstance._opts.icon.options.html).toContain('wishlisted');
  });

  test('real-estate items show price-per-square-meter and a size badge in marker HTML', () => {
    addListings({ advertSummaryList: { advertSummary: [makeListing()] } });
    const markerHtml = L.marker.mock.results[0].value._opts.icon.options.html;
    expect(markerHtml).toContain('€ 450k');
    expect(markerHtml).toContain('price-tag-badge');
    expect(markerHtml).toContain('75 m²');
    expect(markerHtml).not.toMatch(/€ 6(?:\.|&nbsp;|\s)000\/m²/);
  });

  test('real-estate popup shows price-per-square-meter as a tag', () => {
    addListings({ advertSummaryList: { advertSummary: [makeListing()] } });
    const popupHtml = L.marker.mock.results[0].value.bindPopup.mock.calls[0][0];
    expect(popupHtml).toContain('popup-tag');
    expect(popupHtml).toMatch(/€ 6(?:\.|&nbsp;|\s)000\/m²/);
  });

});

// ════════════════════════════════════════════════════════════════════════════
// highlightMarker / unhighlightMarker
// ════════════════════════════════════════════════════════════════════════════
describe('highlightMarker() / unhighlightMarker()', () => {
  beforeEach(() => {
    unhighlightMarker();
    mocks.mockMarkers.clearLayers.mockClear();
    mocks.mockMarkers.addLayer.mockClear();
    mocks.mockMap.addLayer.mockClear();
    mocks.mockMap.removeLayer.mockClear();
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

  test('shows clustered listing as a temporary highlighted marker', () => {
    const fakeCluster = { getElement: () => document.createElement('div') };
    mocks.mockMarkers.getVisibleParent.mockReturnValue(fakeCluster);
    highlightMarker('123456789');
    expect(mocks.mockMap.addLayer).toHaveBeenCalledTimes(1);
    const overlayMarker = mocks.mockMap.addLayer.mock.calls[0][0];
    expect(overlayMarker._coords).toEqual([48.2, 16.3]);
    expect(overlayMarker._opts.icon.options.html).toContain('highlighted');
    expect(overlayMarker._opts.pane).toBe('wikarte-hover-highlight');
    expect(overlayMarker.setZIndexOffset).toHaveBeenCalledWith(20000);
  });

  test('removes temporary clustered highlight marker on unhighlight', () => {
    const fakeCluster = { getElement: () => document.createElement('div') };
    mocks.mockMarkers.getVisibleParent.mockReturnValue(fakeCluster);
    highlightMarker('123456789');
    unhighlightMarker();
    expect(mocks.mockMap.removeLayer).toHaveBeenCalledTimes(1);
  });

  test('updates clustered hover overlay to wishlisted highlight style when wishlist state changes', () => {
    const fakeCluster = { getElement: () => document.createElement('div') };
    mocks.mockMarkers.getVisibleParent.mockReturnValue(fakeCluster);

    highlightMarker('123456789');

    const overlayMarker = mocks.mockMap.addLayer.mock.calls[0][0];
    expect(overlayMarker._opts.icon.options.html).toContain('highlighted');
    expect(overlayMarker._opts.icon.options.html).not.toContain('wishlisted');

    updateMarkerWishlistState('123456789', true);

    expect(overlayMarker.setIcon).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        html: expect.stringContaining('highlighted wishlisted')
      })
    }));
  });
});
