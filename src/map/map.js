// WiKarte — Map Script
// Runs inside the extension iframe (map.html). Renders listings as clustered
// price-tag markers on a Leaflet map and handles highlight/theme/layer messages.

const map         = L.map('map', { maxZoom: 20 }).setView([47.5, 14.5], 7); // Austria center
const statusEl    = document.getElementById('status');
const iframeToken = new URLSearchParams(location.search).get('wikarteToken') || '';
const hoverHighlightPane = map.createPane('wikarte-hover-highlight');
const austriaOutlinePane = map.createPane('wikarte-austria-outline');
const districtOutlinePane = map.createPane('wikarte-district-outlines');
const VIENNA_DISTRICT_OVERLAY_MIN_ZOOM = 11;
const VIENNA_DISTRICT_BOUNDS = L.latLngBounds([48.117, 16.182], [48.323, 16.578]);

if (hoverHighlightPane?.style) {
  hoverHighlightPane.style.zIndex = '750';
  hoverHighlightPane.style.pointerEvents = 'none';
}
if (austriaOutlinePane?.style) {
  austriaOutlinePane.style.zIndex = '325';
  austriaOutlinePane.style.pointerEvents = 'none';
}
if (districtOutlinePane?.style) {
  districtOutlinePane.style.zIndex = '350';
  districtOutlinePane.style.pointerEvents = 'none';
}

// ─── tile layers ─────────────────────────────────────────────────────────────

const lightTiles = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="https://carto.com/">CARTO</a>'
  }
);
const darkTiles = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="https://carto.com/">CARTO</a>'
  }
);
const satelliteTiles = L.tileLayer(
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution:
      'Tiles &copy; Esri'
  }
);

let currentBaseLayer = 'street';
let currentTileLayer = null;

// ─── theme ────────────────────────────────────────────────────────────────────

let currentThemeMode = 'light';

function syncUiModeClasses() {
  document.body.classList.toggle('dark-theme', currentThemeMode === 'dark');
  document.body.classList.toggle('wikarte-satellite-active', currentBaseLayer === 'satellite');
}

function getActiveTileLayer() {
  if (currentBaseLayer === 'street') {
    return currentThemeMode === 'dark' ? darkTiles : lightTiles;
  }
  return satelliteTiles;
}

function syncActiveTileLayer() {
  const nextTileLayer = getActiveTileLayer();
  if (currentTileLayer === nextTileLayer) return;

  if (currentTileLayer && typeof map.removeLayer === 'function') {
    map.removeLayer(currentTileLayer);
  }

  nextTileLayer.addTo(map);
  currentTileLayer = nextTileLayer;
}

function setTheme(theme) {
  currentThemeMode = theme;
  syncUiModeClasses();
  syncActiveTileLayer();
  if (typeof austriaBorderLayer?.setStyle === 'function') {
    austriaBorderLayer.setStyle(getAustriaBorderStyle());
  }
  if (typeof viennaDistrictLayer?.setStyle === 'function') {
    viennaDistrictLayer.setStyle(getViennaDistrictOutlineStyle());
  }
}

function setBaseLayer(layerId) {
  if (!['street', 'satellite'].includes(layerId)) return;
  currentBaseLayer = layerId;
  syncUiModeClasses();
  syncActiveTileLayer();
  if (typeof austriaBorderLayer?.setStyle === 'function') {
    austriaBorderLayer.setStyle(getAustriaBorderStyle());
  }
  if (typeof viennaDistrictLayer?.setStyle === 'function') {
    viennaDistrictLayer.setStyle(getViennaDistrictOutlineStyle());
  }
}

// ─── marker cluster ───────────────────────────────────────────────────────────

const markers = L.markerClusterGroup({
  maxClusterRadius: 40,
  chunkedLoading: true,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false
});
map.addLayer(markers);

const markerMap = new Map(); // adId → Leaflet marker
let   lastBounds = null;
let   fitTimeoutIds = [];
let   austriaBorderLayer = null;
let   viennaDistrictLayer = null;
let   viennaDistrictOverlayVisible = false;

function getAustriaBorderStyle() {
  const opacity = currentBaseLayer === 'satellite'
    ? 0.75
    : (currentThemeMode === 'dark' ? 0.3 : 0.75);
  return {
    color: '#4BB8E0',
    weight: 1.8,
    opacity,
    fillOpacity: 0
  };
}

function getViennaDistrictOutlineStyle() {
  const opacity = currentBaseLayer === 'satellite'
    ? 0.75
    : (currentThemeMode === 'dark' ? 0.3 : 0.75);
  return {
    color: '#4BB8E0',
    weight: 1.8,
    opacity,
    fillOpacity: 0
  };
}

// ─── controls ─────────────────────────────────────────────────────────────────

const ResetControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const a   = L.DomUtil.create('a', 'reset-view-btn', btn);
    a.href  = '#';
    a.title = 'Alle Anzeigen anzeigen';
    // prettier-ignore
    a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>';
    L.DomEvent.on(a, 'click', (e) => {
      L.DomEvent.preventDefault(e);
      if (lastBounds?.length) map.fitBounds(lastBounds, { padding: [30, 30] });
    });
    return btn;
  }
});
map.addControl(new ResetControl());

const LayerControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control wikarte-layer-stack');
    const buttonDefs = [
      { id: 'light', title: 'Streetmap light', previewClass: 'light' },
      { id: 'dark', title: 'Streetmap dark', previewClass: 'dark' },
      { id: 'satellite', title: 'Satellite', previewClass: 'satellite' }
    ];
    buttonDefs.forEach(({ id, title, previewClass }) => {
      const button = L.DomUtil.create('a', `reset-view-btn wikarte-layer-btn wikarte-layer-btn-${previewClass}`, container);
      button.href = '#';
      button.title = title;
      button.setAttribute('aria-label', title);

      L.DomEvent.on(button, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);

        if (id === 'light') {
          currentBaseLayer = 'street';
          setTheme('light');
          return;
        }

        if (id === 'dark') {
          currentBaseLayer = 'street';
          setTheme('dark');
          return;
        }

        setBaseLayer('satellite');
      });
    });

    L.DomEvent.disableClickPropagation(container);
    return container;
  }
});
map.addControl(new LayerControl());
syncUiModeClasses();
syncActiveTileLayer();

// ─── utilities ────────────────────────────────────────────────────────────────

// Reusable element avoids a new DOM node allocation on every escapeHtml call
const _escapeDiv = document.createElement('div');

function escapeHtml(str) {
  if (!str || str === 'NA') return '';
  _escapeDiv.textContent = str;
  return _escapeDiv.innerHTML;
}

function extractTextFromHtml(html) {
  if (!html) return '';
  const parsed = new DOMParser().parseFromString(String(html), 'text/html');
  return parsed.body?.textContent || '';
}

function formatPrice(price) {
  if (!price || price === 'NA') return '';
  const num = parseFloat(price);
  if (isNaN(num)) return escapeHtml(price);
  return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function shortPrice(price) {
  if (!price || price === 'NA') return '?';
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (num >= 100_000)   return Math.round(num / 1000) + 'k';
  return Math.round(num).toLocaleString('de-AT');
}

function formatPricePerSquareMeter(price, size) {
  const priceNum = parseFloat(price);
  const sizeNum = parseFloat(size);
  if (!Number.isFinite(priceNum) || !Number.isFinite(sizeNum) || sizeNum <= 0) return '';
  return `€ ${Math.round(priceNum / sizeNum).toLocaleString('de-AT')}/m²`;
}

function buildMarkerLabelData({ price, sizeLabel, pricePerSqmText }) {
  if (sizeLabel) {
    return {
      variant: 'estate',
      plainText: `€ ${shortPrice(price)} · ${sizeLabel} m²`,
      mainText: `€ ${escapeHtml(shortPrice(price))}`,
      row1Badges: [`${escapeHtml(sizeLabel)} m²`],
      row2Badges: []
    };
  }

  return {
    variant: 'simple',
    plainText: `€ ${shortPrice(price)}`,
    mainText: `€ ${escapeHtml(shortPrice(price))}`,
    row1Badges: [],
    row2Badges: []
  };
}

function buildBadgeRowHtml(badges = []) {
  if (!Array.isArray(badges) || !badges.length) return '';
  return `<span class="price-tag-row">${badges.map(badgeText => `<span class="price-tag-badge">${badgeText}</span>`).join('')}</span>`;
}

function buildMarkerTagHtml(labelData, extraClass = '') {
  const row1BadgeHtml = Array.isArray(labelData.row1Badges) && labelData.row1Badges.length
    ? labelData.row1Badges.map(badgeText => `<span class="price-tag-badge">${badgeText}</span>`).join('')
    : '';
  const topRowHtml = `<span class="price-tag-top-row"><span class="price-tag-main">${labelData.mainText}</span>${row1BadgeHtml}</span>`;
  const row2Html = Array.isArray(labelData.row2Badges) && labelData.row2Badges.length
    ? `<span class="price-tag-row secondary">${buildBadgeRowHtml(labelData.row2Badges)}</span>`
    : '';
  const variantClass = labelData.variant === 'estate' ? ' with-meta' : '';
  return `<div class="price-tag${variantClass}${extraClass}">${topRowHtml}${row2Html}</div>`;
}

function createPriceIcon(labelData, { isWishlisted = false } = {}) {
  const extraClass = isWishlisted ? ' wishlisted' : '';
  return L.divIcon({
    className: 'price-marker',
    html: buildMarkerTagHtml(labelData, extraClass),
    iconSize: null,
    iconAnchor: [0, 0]
  });
}

function sanitizeUrl(url, { allowRelative = false, allowedHosts = null } = {}) {
  if (typeof url !== 'string' || !url.trim()) return '';

  try {
    const parsed = allowRelative
      ? new URL(url, 'https://www.willhaben.at')
      : new URL(url);

    if (parsed.protocol !== 'https:') return '';

    if (allowedHosts && !allowedHosts.some(host =>
      parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    )) {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
}

function buildPopupHtml({ imageUrl, heading, price, detailParts, location, seoUrl }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'listing-popup';

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '';
    img.loading = 'lazy';
    wrapper.appendChild(img);
  }

  const title = document.createElement('h3');
  title.textContent = heading;
  wrapper.appendChild(title);

  if (price) {
    const priceEl = document.createElement('div');
    priceEl.className = 'price';
    priceEl.textContent = price;
    wrapper.appendChild(priceEl);
  }

  const popupTags = detailParts.filter(part => typeof part === 'object' && part?.type === 'tag' && part.value);
  if (popupTags.length) {
    const tagsEl = document.createElement('div');
    tagsEl.className = 'popup-tags';
    popupTags.forEach((tag) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'popup-tag';
      tagEl.textContent = tag.value;
      tagsEl.appendChild(tagEl);
    });
    wrapper.appendChild(tagsEl);
  }

  const detailTextParts = detailParts.filter(part => typeof part === 'string' && part);
  if (detailTextParts.length) {
    const details = document.createElement('div');
    details.className = 'details';
    detailTextParts.forEach((part, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.className = 'details-separator';
        separator.textContent = '•';
        details.appendChild(separator);
      }
      details.appendChild(document.createTextNode(part));
    });
    wrapper.appendChild(details);
  }

  if (location) {
    const locationTags = document.createElement('div');
    locationTags.className = 'popup-tags popup-tags-location';
    const locationTag = document.createElement('span');
    locationTag.className = 'popup-tag popup-tag-location';
    locationTag.textContent = location;
    locationTags.appendChild(locationTag);
    wrapper.appendChild(locationTags);
  }

  if (seoUrl) {
    const link = document.createElement('a');
    link.href = seoUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Anzeige öffnen →';
    wrapper.appendChild(link);
  }

  return wrapper.outerHTML;
}

// ─── attribute names required per listing ─────────────────────────────────────
// Defined once at module level — avoids recreating this array for every listing.
const NEEDED_ATTRS = [
  'MMO', 'PRICE', 'ESTATE_SIZE', 'ADDRESS', 'LOCATION',
  'COORDINATES', 'HEADING', 'POSTCODE', 'ESTATE_SIZE/LIVING_AREA',
  'SEO_URL', 'ROOMS', 'NUMBER_OF_ROOMS', 'BODY_DYN',
  'ALL_IMAGE_URLS', 'PROPERTY_TYPE', 'PRICE_FOR_DISPLAY', 'PRICE/AMOUNT'
];

function ensureAustriaBorderLayer() {
  const borderData = globalThis.WIKARTE_AUSTRIA_BORDER;
  if (!borderData?.geometry || austriaBorderLayer) return;

  austriaBorderLayer = L.geoJSON(borderData, {
    pane: 'wikarte-austria-outline',
    interactive: false,
    style: getAustriaBorderStyle
  });
  map.addLayer(austriaBorderLayer);
}

function ensureViennaDistrictLayers() {
  const districtData = globalThis.WIKARTE_VIENNA_DISTRICTS;
  if (!districtData?.features?.length || viennaDistrictLayer) return;

  viennaDistrictLayer = L.geoJSON(districtData, {
    pane: 'wikarte-district-outlines',
    interactive: false,
    style: getViennaDistrictOutlineStyle
  });
}

function shouldShowViennaDistrictOverlay() {
  if (!globalThis.WIKARTE_VIENNA_DISTRICTS?.features?.length) return false;
  if (typeof map.getZoom === 'function' && map.getZoom() < VIENNA_DISTRICT_OVERLAY_MIN_ZOOM) {
    return false;
  }

  const visibleBounds = typeof map.getBounds === 'function' ? map.getBounds() : null;
  return !!visibleBounds?.intersects?.(VIENNA_DISTRICT_BOUNDS);
}

function syncViennaDistrictOverlay() {
  ensureViennaDistrictLayers();
  if (!viennaDistrictLayer) return;

  const shouldShow = shouldShowViennaDistrictOverlay();
  if (shouldShow === viennaDistrictOverlayVisible) return;

  if (shouldShow) {
    map.addLayer(viennaDistrictLayer);
  } else {
    map.removeLayer(viennaDistrictLayer);
  }

  viennaDistrictOverlayVisible = shouldShow;
}

// ─── listings ─────────────────────────────────────────────────────────────────

function addListings(data) {
  fitTimeoutIds.forEach(clearTimeout);
  fitTimeoutIds = [];
  markers.clearLayers();
  markerMap.clear();

  let summaries;
  if (data.advertSummaryList?.advertSummary) {
    summaries = data.advertSummaryList.advertSummary;
  } else if (data.rows) {
    summaries = data.rows;
  } else {
    if (statusEl) statusEl.textContent = 'No listings found in data';
    return;
  }

  const bounds = [];
  let count = 0;

  summaries.forEach((item) => {
    // Build a normalised attribute map, defaulting all known keys to 'NA'
    const attrs = {};
    NEEDED_ATTRS.forEach(n => { attrs[n] = 'NA'; });

    if (item.attributes?.attribute) {
      item.attributes.attribute.forEach((entry) => {
        attrs[entry.name] = entry.values ? entry.values[0] : 'NA';
      });
    }

    // Merkliste items carry some fields at the top level rather than in attributes
    if (attrs['POSTCODE']  === 'NA' && item.postCode)    attrs['POSTCODE']  = item.postCode;
    if (attrs['LOCATION']  === 'NA' && item.postalName)  attrs['LOCATION']  = item.postalName;
    if (attrs['HEADING']   === 'NA' && item.description) attrs['HEADING']   = item.description;
    if (attrs['PRICE']     === 'NA' && attrs['PRICE/AMOUNT'] !== 'NA') {
      attrs['PRICE'] = attrs['PRICE/AMOUNT'];
    }

    // Image URL — prefer MMO thumbnail, fall back to advertImageList
    let imageUrl = '';
    if (attrs['MMO'] !== 'NA') {
      imageUrl = sanitizeUrl(`https://cache.willhaben.at/mmo/${attrs['MMO']}`, {
        allowedHosts: ['willhaben.at']
      });
    } else {
      const firstImg = item.advertImageList?.advertImage?.[0];
      if (firstImg) {
        imageUrl = sanitizeUrl(firstImg.mainImageUrl || firstImg.referenceImageUrl || '', {
          allowedHosts: ['willhaben.at']
        });
      }
    }

    // teaserAttributes can supply size/rooms when missing from attributes
    if (item.teaserAttributes?.length) {
      item.teaserAttributes.forEach((ta) => {
        if (ta.name === 'ESTATE_SIZE/LIVING_AREA' && attrs['ESTATE_SIZE/LIVING_AREA'] === 'NA') {
          attrs['ESTATE_SIZE/LIVING_AREA'] = ta.values?.[0] ?? 'NA';
        }
        if (ta.name === 'NUMBER_OF_ROOMS' && attrs['NUMBER_OF_ROOMS'] === 'NA') {
          attrs['NUMBER_OF_ROOMS'] = ta.values?.[0] ?? 'NA';
        }
      });
    }

    // Resolve a link to the listing detail page
    let seoUrl = '';
    if (attrs['SEO_URL'] !== 'NA') {
      seoUrl = sanitizeUrl(`https://www.willhaben.at/iad/${attrs['SEO_URL']}`, {
        allowedHosts: ['willhaben.at']
      });
    } else {
      const adLink = item.contextLinkList?.contextLink?.find(
        l => l.rel === 'self' || l.rel === 'seo' || l.uri
      );
      if (adLink?.uri) {
        seoUrl = sanitizeUrl(adLink.uri, {
          allowRelative: true,
          allowedHosts: ['willhaben.at']
        });
      }
    }

    // Resolve coordinates — prefer explicit COORDINATES, fall back to postcode lookup
    let coords;
    const coordStr = attrs['COORDINATES'];
    if (coordStr && coordStr !== 'NA') {
      coords = coordStr.split(',').map(Number);
    } else if (attrs['POSTCODE'] !== 'NA' && typeof POSTCODE_COORDS !== 'undefined') {
      coords = POSTCODE_COORDS[attrs['POSTCODE'].trim()];
    }
    if (!coords || isNaN(coords[0]) || isNaN(coords[1])) return;

    count++;
    bounds.push(coords);

    // Compute size once — used in the popup and in real-estate marker labels
    const sizeLabel = attrs['ESTATE_SIZE/LIVING_AREA'] !== 'NA'
      ? attrs['ESTATE_SIZE/LIVING_AREA']
      : attrs['ESTATE_SIZE'] !== 'NA'
        ? attrs['ESTATE_SIZE']
        : '';

    const rooms = attrs['NUMBER_OF_ROOMS'] !== 'NA'
      ? attrs['NUMBER_OF_ROOMS']
      : attrs['ROOMS'] !== 'NA'
        ? attrs['ROOMS']
        : '';

    const price    = formatPrice(attrs['PRICE']);
    const pricePerSqmText = attrs['ESTATE_SIZE/LIVING_AREA'] !== 'NA'
      ? formatPricePerSquareMeter(attrs['PRICE'], attrs['ESTATE_SIZE/LIVING_AREA'])
      : '';
    const heading  = attrs['HEADING'] && attrs['HEADING'] !== 'NA' ? String(attrs['HEADING']) : '';
    const location = [attrs['POSTCODE'], attrs['LOCATION'], attrs['ADDRESS']]
      .filter(v => v && v !== 'NA')
      .map(escapeHtml)
      .join(', ');

    const detailParts = [];
    if (sizeLabel) detailParts.push({ type: 'tag', value: `${sizeLabel} m\u00B2` });
    if (rooms)     detailParts.push({ type: 'tag', value: `${rooms} Zimmer` });
    if (pricePerSqmText) detailParts.push({ type: 'tag', value: pricePerSqmText });

    const popupHtml = buildPopupHtml({
      imageUrl,
      heading,
      price,
      detailParts,
      location,
      seoUrl
    });

    const labelData = buildMarkerLabelData({
      price: attrs['PRICE'],
      sizeLabel,
      pricePerSqmText
    });

    const isWishlisted = Boolean(item.wikarteWishlisted);
    const marker = L.marker(coords, { icon: createPriceIcon(labelData, { isWishlisted }) });
    marker.wikarteLabelData = labelData;
    marker.wikarteLabelText = labelData.plainText;
    marker.wikarteIsWishlisted = isWishlisted;
    marker.bindPopup(popupHtml, { maxWidth: 300, closeButton: false });
    markers.addLayer(marker);

    // Register the marker under every numeric ID we can find for this listing
    if (item.id) markerMap.set(String(item.id), marker);

    const urlNumericId = (attrs['SEO_URL'] !== 'NA' ? attrs['SEO_URL'] : seoUrl)
      .match(/(\d{5,})/)?.[1];
    if (urlNumericId) markerMap.set(urlNumericId, marker);
  });

  if (bounds.length > 0) {
    lastBounds = bounds;

    function fitAll() {
      map.invalidateSize();
      if (bounds.length === 1) {
        map.setView(bounds[0], 16);
      } else {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
      }
      syncViennaDistrictOverlay();
    }

    // Three retries handle race conditions where the panel container is still
    // transitioning or the browser hasn't finished laying out at 100 ms / 500 ms.
    fitTimeoutIds.push(setTimeout(fitAll, 100));
    fitTimeoutIds.push(setTimeout(fitAll, 500));
    fitTimeoutIds.push(setTimeout(fitAll, 1500));
  }

  if (statusEl) statusEl.textContent = `${count} Anzeigen auf der WiKarte`;
}

// ─── highlight ────────────────────────────────────────────────────────────────

let highlightedMarker  = null;
let originalIcon       = null;
let hoverOverlayMarker = null;

function getMarkerLabelData(source) {
  if (source?.wikarteLabelData) return source.wikarteLabelData;
  const html = source?.options?.html || source?.getIcon?.()?.options?.html;
  if (!html) return buildMarkerLabelData({ price: 'NA', sizeLabel: '', pricePerSqmText: '' });
  const text = extractTextFromHtml(html);
  return {
    variant: 'simple',
    plainText: text,
    mainText: text,
    row1Badges: [],
    row2Badges: []
  };
}

function getMarkerCoords(marker) {
  if (typeof marker?.getLatLng === 'function') {
    const latLng = marker.getLatLng();
    if (Array.isArray(latLng)) return latLng;
    if (latLng && typeof latLng.lat === 'number' && typeof latLng.lng === 'number') {
      return [latLng.lat, latLng.lng];
    }
  }

  if (Array.isArray(marker?._coords) && marker._coords.length >= 2) {
    return marker._coords;
  }

  return null;
}

function createHighlightIcon(labelData, isWishlisted = false) {
  const extraClass = isWishlisted ? ' wishlisted' : '';
  return L.divIcon({
    className: 'price-marker',
    html: buildMarkerTagHtml(labelData, ` highlighted${extraClass}`),
    iconSize: null,
    iconAnchor: [0, 0]
  });
}

function updateMarkerWishlistState(adId, isWishlisted) {
  const marker = markerMap.get(String(adId));
  if (!marker) return;

  marker.wikarteIsWishlisted = Boolean(isWishlisted);
  const labelData = getMarkerLabelData(marker);

  if (highlightedMarker === marker) {
    const highlightIcon = createHighlightIcon(labelData, marker.wikarteIsWishlisted);
    marker.setIcon(highlightIcon);
    if (hoverOverlayMarker) hoverOverlayMarker.setIcon(highlightIcon);
    return;
  }

  marker.setIcon(createPriceIcon(labelData, { isWishlisted: marker.wikarteIsWishlisted }));
}

function highlightMarker(adId) {
  unhighlightMarker();
  const marker = markerMap.get(String(adId));
  if (!marker) return;

  highlightedMarker = marker;
  originalIcon      = marker.getIcon();

  const visibleParent = markers.getVisibleParent(marker);

  if (visibleParent && visibleParent !== marker) {
    const coords = getMarkerCoords(marker);
    const labelData = getMarkerLabelData(marker);

    if (coords && labelData?.plainText) {
      hoverOverlayMarker = L.marker(coords, {
        icon: createHighlightIcon(labelData, marker.wikarteIsWishlisted),
        pane: 'wikarte-hover-highlight',
        interactive: false,
        keyboard: false
      });
      map.addLayer(hoverOverlayMarker);
      if (typeof hoverOverlayMarker.setZIndexOffset === 'function') {
        hoverOverlayMarker.setZIndexOffset(20000);
      }
      highlightedMarker = marker;
    } else {
      highlightedMarker = null;
      originalIcon = null;
    }
  } else {
    // Marker is directly visible — swap its icon for the highlighted variant
    marker.setIcon(createHighlightIcon(getMarkerLabelData(marker), marker.wikarteIsWishlisted));
    marker.setZIndexOffset(10000);
  }
}

function unhighlightMarker() {
  if (hoverOverlayMarker) {
    map.removeLayer(hoverOverlayMarker);
    hoverOverlayMarker = null;
  }
  if (highlightedMarker && originalIcon) {
    highlightedMarker.setIcon(originalIcon);
    highlightedMarker.setZIndexOffset(0);
    highlightedMarker = null;
    originalIcon      = null;
  }
}

// ─── message listener ─────────────────────────────────────────────────────────

window.addEventListener('message', function (event) {
  if (!event.data) return;
  // Accept messages from the parent frame only (our content script).
  // Null source is permitted to allow programmatic dispatch in tests.
  if (event.source && event.source !== window.parent) return;
  if (iframeToken && event.data.token !== iframeToken) return;

  switch (event.data.type) {
    case 'WIKARTE_LISTINGS':
      addListings(event.data.data);
      break;
    case 'WIKARTE_THEME':
      setTheme(event.data.theme);
      break;
    case 'WIKARTE_INVALIDATE':
      map.invalidateSize();
      if (lastBounds?.length) {
        map.fitBounds(lastBounds, { padding: [30, 30], maxZoom: 18 });
      }
      break;
    case 'WIKARTE_HIGHLIGHT':
      highlightMarker(event.data.adId);
      break;
    case 'WIKARTE_UNHIGHLIGHT':
      unhighlightMarker();
      break;
    case 'WIKARTE_WISHLIST_STATE':
      updateMarkerWishlistState(event.data.adId, event.data.isWishlisted);
      break;
  }
});

map.on('zoomend moveend', syncViennaDistrictOverlay);
ensureAustriaBorderLayer();
syncViennaDistrictOverlay();
