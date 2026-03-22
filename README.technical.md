# WiKarte — Technical Reference

This document covers the architecture, data flow, security model, and implementation details of WiKarte for developers.

---

## Architecture Overview

WiKarte is a Manifest V3 Chrome extension that works across all willhaben.at listing categories (real estate, vehicles, electronics, furniture, and anything else). It is composed of three execution contexts that communicate exclusively via `window.postMessage`:

```
┌─────────────────────────────────────────────────────────┐
│  willhaben.at tab                                        │
│                                                          │
│  ┌──────────────────────┐    postMessage (same window)  │
│  │  page-intercept.js   │ ──────────────────────────►   │
│  │  (MAIN world)        │                               │
│  └──────────────────────┘                               │
│                                                          │
│  ┌──────────────────────┐    postMessage (to iframe)    │
│  │  content.js          │ ──────────────────────────►   │
│  │  (ISOLATED world)    │                               │
│  └──────────────────────┘                               │
│                           ┌─────────────────────────┐   │
│                           │  map.html iframe         │   │
│                           │  (chrome-extension://)   │   │
│                           │  map.js + Leaflet        │   │
│                           └─────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## File Structure

```
WiKarte/
├── manifest.json          # MV3 manifest
├── page-intercept.js      # MAIN world: fetch/XHR/history interception
├── content.js             # ISOLATED world: panel, bridge, hover
├── map.html               # iframe document for the map
├── map.js                 # Leaflet rendering and message handling
├── styles.css             # Injected CSS for the panel and toggle button
├── postcodes.js           # POSTCODE_COORDS lookup table for Austria
├── lib/
│   ├── leaflet.js
│   ├── leaflet.css
│   ├── leaflet.markercluster.js
│   ├── MarkerCluster.css
│   └── MarkerCluster.Default.css
└── tests/
    ├── setup.js
    ├── unit/
    │   ├── map-utils.test.js
    │   ├── content.test.js
    │   └── page-intercept.test.js
    └── scenario/
        ├── search-page.test.js
        ├── merkliste-page.test.js
        ├── navigation.test.js
        └── hover-highlight.test.js
```

---

## Execution Contexts

### `page-intercept.js` — MAIN world, `document_start`

Runs in the page's own JavaScript context to intercept network traffic before willhaben's own scripts execute.

**Responsibilities:**
- Monkey-patches `window.fetch` — clones responses, parses JSON or extracts `__NEXT_DATA__` from HTML, and posts `WIKARTE_FETCH_RESULT` messages to `content.js` via `window.postMessage(msg, '*')`
- Monkey-patches `XMLHttpRequest.prototype.open/send` — same logic for XHR responses
- Monkey-patches `history.pushState` and `history.replaceState` — posts `WIKARTE_NAV_CHANGE` on every SPA navigation
- Contains `parseHtmlNextData(html, url)` — shared helper that extracts listing data from HTML pages containing an embedded `<script id="__NEXT_DATA__">` tag, supporting both standard search results and Merkliste pages

**Message validation:** `page-intercept.js` tags outbound messages with `channel: 'wikarte'`. `content.js` accepts only same-window messages on that channel, validates the source URL to `willhaben.at`, and validates that the payload has the expected listing shape before forwarding it.

---

### `content.js` — ISOLATED world, `document_idle`

The bridge layer. Runs in Chrome's isolated extension context so it has access to `chrome.*` APIs without exposing them to the page.

**Responsibilities:**

| Function | Description |
|---|---|
| `createMapPanel()` | Creates `#wikarte-panel` div + iframe (`map.html`) + `#wikarte-toggle` button; appends both to `document.body` |
| `isListPage()` | Determines whether the current page is a listing page by inspecting the URL path and the `__NEXT_DATA__` JSON blob |
| `isMerklistePage()` | Returns `true` for `/myfindings`, `/myadverts`, and `/merkliste` paths |
| `updateVisibility()` | Shows/hides the panel and toggle button based on `isListPage()` |
| `extractListingsFromNextData()` | Parses the `__NEXT_DATA__` script tag on initial page load; handles standard search results and Merkliste structures |
| `fetchMerklisteForCurrentFolder()` | Fetches folder-specific Merkliste data from `/_next/data/{buildId}/…` using `credentials: 'include'` |
| `setupHoverHighlight()` | Attaches `mouseover`/`mouseout` listeners to `document`; walks the DOM upward to find a numeric ad ID |
| `sendListingsToMap(data)` | Queues data if the iframe hasn't loaded yet; otherwise calls `doSend()` immediately |
| `sendInvalidate()` | Posts `WIKARTE_INVALIDATE` to trigger `map.invalidateSize()` after panel resize |
| `sendThemeToMap(theme)` | Posts `WIKARTE_THEME` to the iframe |

**Theme observation:** A `MutationObserver` watches `document.documentElement` for changes to the `data-wh-theme` attribute and calls `sendThemeToMap()` when the value changes.

**Message handling (inbound):**
- `WIKARTE_FETCH_RESULT` — from `page-intercept.js`; filtered on Merkliste pages to `_next/data` URLs only
- `WIKARTE_NAV_CHANGE` — from `page-intercept.js`; triggers a two-pass `updateVisibility()` at 300 ms and 500 ms to handle Next.js hydration timing

**Security validations:**
- `folderId` from `location.search` is validated against `/^\d+$/` before use in a URL
- `buildId` from `__NEXT_DATA__` is validated against `/^[A-Za-z0-9_-]+$/` before interpolation
- Inbound messages from `page-intercept.js` are accepted only when `event.source === window`

---

### `map.html` + `map.js` — Extension iframe

The map lives in a sandboxed `chrome-extension://` iframe. It has no access to the willhaben page's DOM or JavaScript.

**`map.html`** declares a Content-Security-Policy meta tag:
```
default-src 'self';
script-src  'self';
style-src   'self' 'unsafe-inline';   ← Leaflet sets inline styles at runtime
img-src     'self' data: https:;       ← tile layers + listing images
connect-src 'none';                    ← map.js makes no network requests
```

**`map.js`** responsibilities:

| Area | Implementation |
|---|---|
| Map initialisation | `L.map('map').setView([47.5, 14.5], 7)` — centred on Austria |
| Tile layers | `lightTiles` (CARTO Voyager) and `darkTiles` (CARTO Dark Matter); swapped by `setTheme()` |
| Clustering | `L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true, showCoverageOnHover: false })` |
| Marker storage | `markerMap: Map<string, L.Marker>` — keyed by ad ID (from `item.id` and numeric ID extracted from SEO URL) |
| Custom controls | `ResetControl` (re-fits `lastBounds`) and `ThemeControl` (sun/moon toggle), both `position: 'topleft'` |
| Highlight state | Three module-level variables: `highlightedMarker`, `originalIcon`, `highlightedCluster` |
| Message router | `switch` on `event.data.type` for the five `WIKARTE_*` message types |

**Message listener security:** `if (event.source && event.source !== window.parent) return;` — accepts messages from the parent frame only. The `null` source check allows programmatic dispatch in tests.

**`addListings(data)` detail:**
1. Clears `markers` cluster layer and `markerMap`
2. Accepts `data.advertSummaryList.advertSummary` (standard) or `data.rows` (alternative format)
3. For each item, builds a normalised `attrs` object defaulting all `NEEDED_ATTRS` to `'NA'`
4. Merges top-level Merkliste fields (`postCode`, `postalName`, `description`) when attributes are missing
5. Resolves image URL: MMO thumbnail preferred, `advertImageList` fallback
6. Resolves size from `teaserAttributes` when not in `attributes`
7. Resolves SEO URL from `SEO_URL` attribute or `contextLinkList`
8. Resolves coordinates from `COORDINATES` attribute or `POSTCODE_COORDS` lookup
9. Builds popup HTML with lazy-loaded image, price, category-specific fields (size/rooms when present), address, link
10. Registers marker under all known numeric IDs for the listing
11. Fits map bounds at 100 ms, 500 ms, 1500 ms to handle panel sizing race conditions

**`highlightMarker(adId)` detail:**
1. Calls `unhighlightMarker()` to clear any previous state
2. Looks up marker in `markerMap`
3. Calls `markers.getVisibleParent(marker)` to determine if the marker is visible or clustered
4. If clustered: adds `.cluster-highlighted` CSS class to the cluster DOM element
5. If visible: extracts the current label text via `_escapeDiv.innerHTML = originalIcon.options.html; text = _escapeDiv.textContent`, creates a new `highlighted` icon, and raises the z-index

---

## Internal Message Protocol

All messages pass through `window.postMessage`. The message type strings are namespaced with the `WIKARTE_` prefix.

| Message | Direction | Payload | Purpose |
|---|---|---|---|
| `WIKARTE_FETCH_RESULT` | page-intercept → content | `{ data, sourceUrl }` | Intercepted listing data from a fetch/XHR |
| `WIKARTE_NAV_CHANGE` | page-intercept → content | — | SPA route changed |
| `WIKARTE_LISTINGS` | content → map iframe | `{ data }` | Forward listing data to be rendered |
| `WIKARTE_THEME` | content → map iframe | `{ theme: 'light'|'dark' }` | Sync willhaben theme |
| `WIKARTE_INVALIDATE` | content → map iframe | — | Trigger `map.invalidateSize()` |
| `WIKARTE_HIGHLIGHT` | content → map iframe | `{ adId }` | Highlight a marker by ad ID |
| `WIKARTE_UNHIGHLIGHT` | content → map iframe | — | Clear the current highlight |

---

## Security Model

### Extension isolation
- `page-intercept.js` runs in MAIN world but has no `chrome.*` access
- `content.js` runs in ISOLATED world; willhaben's page scripts cannot reach its variables
- The map iframe loads a `chrome-extension://` page — willhaben's page scripts have no access to it

### postMessage validation
- `page-intercept.js → content.js`: validated by `event.source === window` (same-window messages only)
- `content.js → map.js`: each iframe instance receives a random session token in its `map.html` URL, and `map.js` accepts only messages carrying the matching token
- The `chrome-extension://` iframe cannot be embedded by any origin other than the extension itself (enforced by `web_accessible_resources` matching only `*://*.willhaben.at/*`)
- `content.js` posts to the concrete `chrome-extension://<id>` origin of the iframe instead of `'*'`

### URL parameter injection prevention
- `folderId` validated: `/^\d+$/`
- `buildId` validated: `/^[A-Za-z0-9_-]+$/`

### XSS prevention
- `escapeHtml()` uses `div.textContent = str; return div.innerHTML` — safe for `<`, `>`, `&`; does not encode double-quotes (not needed for text nodes)
- A single `_escapeDiv` element is reused across all calls (performance optimisation)
- Image URLs are inserted as `src` attributes, not as raw HTML

### Content Security Policy
The map iframe declares a strict CSP that blocks inline scripts and all external connections.

---

## Styling

`styles.css` is injected into the willhaben page (ISOLATED world, no DOM modifications to willhaben's own elements). It defines:

| Selector | Purpose |
|---|---|
| `#wikarte-panel` | Fixed full-height panel, 50 vw wide, right edge, z-index 99 |
| `#wikarte-panel iframe` | Fills the panel 100 % |
| `#wikarte-toggle` | Fixed button, top-right, z-index 100 |
| `html:not(.wikarte-active) #wikarte-panel` | Hides the panel when inactive |
| `html.wikarte-active #wikarte-toggle` | Shifts toggle left by 50 vw + 10 px when map is open |

Map-internal styles (price tags, popups, dark theme, cluster highlighting) live in `map.html`'s `<style>` block and are scoped to the iframe document.

---

## Data Flow: Initial Page Load

```
Browser loads a willhaben.at listing page (any category)
    │
    ├─ page-intercept.js starts (document_start, MAIN world)
    │   └─ patches fetch, XHR, history
    │
    ├─ content.js starts (document_idle, ISOLATED world)
    │   ├─ createMapPanel()      → injects #wikarte-panel + #wikarte-toggle
    │   ├─ setupHoverHighlight() → attaches mouseover/mouseout listeners
    │   └─ extractListingsFromNextData()
    │       └─ parses __NEXT_DATA__ → sendListingsToMap(data)
    │           └─ iframe not loaded yet → pendingData = data
    │
    └─ iframe load event fires
        ├─ iframeLoaded = true
        ├─ sendThemeToMap(currentTheme)   → WIKARTE_THEME
        ├─ doSend(pendingData)             → WIKARTE_LISTINGS → addListings()
        └─ setTimeout(sendInvalidate, 1000) → WIKARTE_INVALIDATE
```

## Data Flow: SPA Navigation / Filter Change

```
User changes filter, category, or paginates
    │
    ├─ willhaben calls history.pushState()
    │   └─ page-intercept.js intercepts → postMessage(WIKARTE_NAV_CHANGE)
    │       └─ content.js: setTimeout(updateVisibility + fetchMerkliste, 300)
    │                      setTimeout(updateVisibility, 500)
    │
    └─ willhaben fetches new results via fetch()
        └─ page-intercept.js intercepts → postMessage(WIKARTE_FETCH_RESULT)
            └─ content.js filters (Merkliste: _next/data only)
                └─ sendListingsToMap(data) → WIKARTE_LISTINGS → addListings()
```

---

## Testing

The test suite uses **Jest** with **jest-environment-jsdom** and covers 86 tests across 7 files.

```bash
npm test
```

### Test architecture

Extension scripts are loaded into the jsdom environment using indirect `eval`:
```js
(0, eval)(fs.readFileSync('content.js', 'utf8'));
```
This executes the script in the global scope, matching Chrome's content script behaviour.

**Known jsdom constraints:**
- The real extension posts to the concrete `chrome-extension://<id>` iframe origin. In tests, `contentWindow.postMessage` is mocked directly rather than relying on jsdom frame origin semantics.
- Multiple `eval` calls within a single test file accumulate event listeners on `window` and `document`. Tests are designed around final state assertions (e.g. `markerMap.size`) rather than call counts.

### Test files

| File | Scope |
|---|---|
| `tests/unit/map-utils.test.js` | `shortPrice`, `formatPrice`, `escapeHtml`, `addListings`, `highlightMarker`, `unhighlightMarker` |
| `tests/unit/content.test.js` | Panel creation, visibility, theme detection, message handling, hover highlight |
| `tests/unit/page-intercept.test.js` | fetch/XHR interception, `postListings` filtering, history patching |
| `tests/scenario/search-page.test.js` | Full flow: load page, extract listings, render markers, toggle, theme, fetch update |
| `tests/scenario/merkliste-page.test.js` | Merkliste extraction, postcode fallback, fetch filtering, folder data |
| `tests/scenario/navigation.test.js` | SPA route changes, `popstate`, page-type detection for all URL patterns |
| `tests/scenario/hover-highlight.test.js` | mouseover/mouseout dispatch, deduplication, cluster/marker highlight |

### Global test setup (`tests/setup.js`)
- Defines `setupLeaflet()` — a factory that returns a fresh Leaflet mock with `L.map`, `L.tileLayer`, `L.marker`, `L.divIcon`, `L.markerClusterGroup`, `L.Control.extend`, and `L.DomUtil`/`L.DomEvent` helpers
- Defines `chrome.runtime.getURL()` mock returning `'chrome-extension://test-id/'`
- All mock `contentWindow` objects include `{ postMessage: jest.fn(), close: jest.fn(), length: 0 }` — the `close` and `length` properties are required to prevent jsdom from crashing during teardown when it iterates `window.length` frames

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `leaflet` | bundled in `lib/` | Interactive map rendering |
| `leaflet.markercluster` | bundled in `lib/` | Marker clustering |
| `jest` | ^29.7.0 | Test runner |
| `jest-environment-jsdom` | ^29.7.0 | DOM simulation for tests |

No runtime npm dependencies. All runtime libraries are bundled locally to satisfy the extension's CSP (`script-src 'self'`).
