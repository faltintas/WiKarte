// Global test setup — runs before every test file

// ── Chrome Extension API mock ──────────────────────────────────────────────
global.chrome = {
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`)
  }
};

// ── MutationObserver (jsdom has it, but make it a spy) ─────────────────────
global.MutationObserver = class {
  constructor(cb) { this._cb = cb; }
  observe() {}
  disconnect() {}
};

// ── Leaflet mock factory (each test file that needs it calls setupLeaflet()) ─
global.setupLeaflet = function () {
  const makeMarker = (coords, opts) => ({
    _coords: coords,
    _opts: opts,
    _popup: null,
    _icon: { options: { html: '<div class="price-tag">€ 500k (75m²)</div>' } },
    bindPopup: jest.fn(function (html) { this._popup = html; return this; }),
    setIcon:   jest.fn(function (icon) { this._icon = icon; }),
    setZIndexOffset: jest.fn(),
    getIcon:   jest.fn(function () { return this._icon; }),
    getElement: jest.fn().mockReturnValue(null)
  });

  const mockMarkers = {
    _layers: [],
    clearLayers: jest.fn(function () { this._layers = []; }),
    addLayer:    jest.fn(function (m) { this._layers.push(m); }),
    getVisibleParent: jest.fn().mockReturnValue(null)
  };

  const mockMap = {
    setView:       jest.fn().mockReturnThis(),
    addLayer:      jest.fn().mockReturnThis(),
    addControl:    jest.fn(),
    removeLayer:   jest.fn(),
    invalidateSize: jest.fn(),
    fitBounds:     jest.fn()
  };

  global.L = {
    map:    jest.fn().mockReturnValue(mockMap),
    tileLayer: jest.fn().mockReturnValue({ addTo: jest.fn() }),
    markerClusterGroup: jest.fn().mockReturnValue(mockMarkers),
    Control: {
      extend: jest.fn().mockImplementation((proto) => {
        function Ctrl() {}
        Object.assign(Ctrl.prototype, proto || {});
        return Ctrl;
      })
    },
    DomUtil: {
      create: jest.fn().mockImplementation((tag, cls) => {
        const el = document.createElement(tag || 'div');
        if (cls) el.className = cls;
        return el;
      })
    },
    DomEvent: {
      on: jest.fn().mockImplementation((el, evt, fn) => {
        if (el && el.addEventListener) el.addEventListener(evt, fn);
      }),
      preventDefault:  jest.fn().mockImplementation((e) => e && e.preventDefault && e.preventDefault()),
      stopPropagation: jest.fn()
    },
    divIcon: jest.fn().mockImplementation((opts) => ({ type: 'divIcon', options: opts })),
    marker:  jest.fn().mockImplementation(makeMarker)
  };

  global.POSTCODE_COORDS = {
    '1010': [48.2082, 16.3738],
    '1020': [48.2167, 16.4000],
    '1160': [48.2164, 16.3125],
    '8010': [47.0707, 15.4395],
    '5020': [47.8095, 13.0550]
  };

  return { mockMap, mockMarkers };
};
