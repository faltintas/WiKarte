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
  const normalizeLatLng = (value) => {
    if (Array.isArray(value)) return { lat: value[0], lng: value[1] };
    return value;
  };

  const makeMarker = (coords, opts) => ({
    _coords: coords,
    _opts: opts,
    _popup: null,
    _icon: { options: { html: '<div class="price-tag">€ 500k (75m²)</div>' } },
    bindPopup: jest.fn(function (html) { this._popup = html; return this; }),
    setIcon:   jest.fn(function (icon) { this._icon = icon; }),
    setZIndexOffset: jest.fn(),
    getIcon:   jest.fn(function () { return this._icon; }),
    getLatLng: jest.fn(function () { return this._coords; }),
    getElement: jest.fn().mockReturnValue(null)
  });

  const mockMarkers = {
    _layers: [],
    clearLayers: jest.fn(function () { this._layers = []; }),
    addLayer:    jest.fn(function (m) { this._layers.push(m); }),
    getVisibleParent: jest.fn().mockReturnValue(null)
  };

  const makeLayerGroup = (layers = []) => ({
    _layers: [...layers],
    addLayer: jest.fn(function (layer) { this._layers.push(layer); return this; }),
    removeLayer: jest.fn(function (layer) {
      this._layers = this._layers.filter(item => item !== layer);
      return this;
    })
  });

  const mockMap = {
    _layers: new Set(),
    _events: {},
    _zoom: 7,
    _bounds: { intersects: jest.fn().mockReturnValue(false) },
    setView:       jest.fn().mockReturnThis(),
    addLayer:      jest.fn(function (layer) { this._layers.add(layer); return this; }),
    addControl:    jest.fn(),
    createPane:    jest.fn().mockImplementation(() => ({ style: {} })),
    removeLayer:   jest.fn(function (layer) { this._layers.delete(layer); return this; }),
    hasLayer:      jest.fn(function (layer) { return this._layers.has(layer); }),
    on:            jest.fn(function (events, handler) {
      events.split(/\s+/).forEach((eventName) => {
        this._events[eventName] = this._events[eventName] || [];
        this._events[eventName].push(handler);
      });
      return this;
    }),
    off:           jest.fn().mockReturnThis(),
    fire:          jest.fn(function (eventName) {
      (this._events[eventName] || []).forEach(handler => handler());
      return this;
    }),
    getZoom:       jest.fn(function () { return this._zoom; }),
    getBounds:     jest.fn(function () { return this._bounds; }),
    invalidateSize: jest.fn(),
    fitBounds:     jest.fn()
  };

  global.L = {
    map:    jest.fn().mockReturnValue(mockMap),
    tileLayer: jest.fn().mockReturnValue({ addTo: jest.fn() }),
    latLngBounds: jest.fn().mockImplementation((southWest, northEast) => {
      const sw = normalizeLatLng(southWest);
      const ne = normalizeLatLng(northEast);
      return {
        _southWest: sw,
        _northEast: ne,
        intersects(other) {
          const otherSw = normalizeLatLng(other._southWest ?? other[0] ?? other.southWest ?? other.sw);
          const otherNe = normalizeLatLng(other._northEast ?? other[1] ?? other.northEast ?? other.ne);
          if (!otherSw || !otherNe) return false;
          return !(
            otherSw.lat > ne.lat ||
            otherNe.lat < sw.lat ||
            otherSw.lng > ne.lng ||
            otherNe.lng < sw.lng
          );
        }
      };
    }),
    markerClusterGroup: jest.fn().mockReturnValue(mockMarkers),
    geoJSON: jest.fn().mockImplementation((data, opts) => ({
      _data: data,
      _opts: opts,
      setStyle: jest.fn()
    })),
    layerGroup: jest.fn().mockImplementation((layers = []) => makeLayerGroup(layers)),
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
