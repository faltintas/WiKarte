# WiKarte — Functional Reference

This document describes every user-facing feature of WiKarte in detail. WiKarte works across all willhaben categories — real estate, vehicles, electronics, furniture, or any other type of listing.

---

## 1. Map Panel

### Automatic appearance
When you navigate to any search results page on willhaben.at (e.g. `/iad/immobilien/wohnung-kaufen`, `/iad/auto-motor-tuning`, `/iad/marktplatz`, or any other category), WiKarte automatically injects a map panel that occupies the right half of the browser window. The existing willhaben page is not modified; the panel is layered on top of it via CSS.

### Pages where the map appears
- Standard search result pages (any category under `/iad/`)
- Wishlist / saved-ads pages at `/iad/myprofile/myfindings`
- Individual wishlist folders (via `?folderId=…`)
- My Adverts pages (`/myadverts`)

### Pages where the map does NOT appear
- Individual listing detail pages (URLs containing `/d/`)
- The willhaben homepage (`/`)
- The `/iad` root path

---

## 2. Toggle Button

A floating button with a map icon is injected into the top-right corner of the browser window whenever the map is active.

- **Click** — hides or shows the map panel
- When the map panel is visible, the toggle button shifts left to clear the panel edge so it is always accessible
- When the map is hidden, the toggle button returns to the right edge
- The button is hidden entirely on pages where the map is not applicable (detail pages, homepage)

---

## 3. Price-Tag Markers

Each item that has a resolvable location is placed on the map as a price-tag marker — a white rounded label showing the item's price.

**Price formatting:**
| Price range | Display format | Example |
|---|---|---|
| ≥ 1 000 000 | Millions with one decimal | `€ 1.2M` |
| ≥ 100 000 | Rounded to nearest thousand | `€ 350k` |
| < 100 000 | Full number in de-AT locale | `€ 89 500` |
| Not available | Question mark | `€ ?` |

For categories that include a size attribute (e.g. living area for real estate), the size is appended to the marker label, e.g. `€ 350k (85m²)`. For other categories the label shows price only.

**Hover state** — the marker scales up slightly and turns blue on hover.

**Wishlist state** — items already saved in a willhaben wishlist are shown in gold. When a saved item is hovered, the hover state uses a blue background with a gold border so the saved state stays visible.

---

## 4. Marker Clustering

When many listings are close together at the current zoom level, they are grouped into a circular cluster badge showing the count. Cluster behaviour:

- Cluster radius: 40 px
- Hovering a listing card in the list whose marker is inside a cluster shows a temporary standalone highlighted marker above the cluster (see §8)
- Clicking a cluster zooms in to reveal individual markers; at maximum zoom the cluster spiderfies (spreads markers radially so each is accessible)
- Coverage polygons on cluster hover are disabled to keep the map clean

---

## 5. Listing Popups

Clicking any price-tag marker opens a popup containing:

| Field | Notes |
|---|---|
| Photo | MMO thumbnail (`cache.willhaben.at/mmo/…`) or `advertImageList` fallback; omitted if unavailable |
| Title / heading | The listing title |
| Price | Formatted with `€` and de-AT locale; omitted if unavailable |
| Size | In m² — shown for categories that provide a size attribute (e.g. real estate, storage); omitted otherwise |
| Rooms | Shown for categories that provide a room count (e.g. real estate); omitted otherwise |
| Address | Postcode + location name + street, comma-separated; shows whichever parts are available |
| Link | "Anzeige öffnen →" — opens the listing detail page in a new tab |

All fields are omitted gracefully when data is not available for the given category or item. Images load lazily.

---

## 6. Auto-Fit View

Every time a new batch of listings is loaded, the map automatically fits all markers into the visible area with 30 px padding on each side.

- **Single listing** — map zooms to level 16 and centres on that listing
- **Multiple listings** — map fits the bounding box of all listing coordinates
- The fit is attempted three times (at 100 ms, 500 ms, 1500 ms) to handle race conditions where the panel container is still sizing itself when listings arrive

---

## 7. Reset View Button

A circular-arrow toolbar button in the top-left of the map resets the view to fit all current listings. Use this after manually panning or zooming to return to the full overview.

---

## 8. Hover Highlight

Moving the mouse over a listing card in the willhaben page highlights the corresponding marker on the map.

**How it works:**
- WiKarte detects the numeric ad ID from the DOM element under the cursor using element IDs, data attributes, and listing links
- If the marker is directly visible on the map, its icon switches to a blue highlighted variant and is raised to the top of the z-stack
- If the marker is inside a cluster, WiKarte creates a temporary standalone highlighted marker above the cluster so the item remains readable
- Moving the mouse off the listing restores the original marker icon and removes any temporary hover marker
- Hovering the same listing twice in a row does not send duplicate messages

---

## 9. Light and Dark Theme

### Automatic sync
WiKarte observes willhaben's `data-wh-theme` attribute on the `<html>` element via a `MutationObserver`. When willhaben switches theme (via its own toggle), WiKarte's map switches instantly to match.

**Light theme** — CARTO Voyager tiles (colourful, readable road map)
**Dark theme** — CARTO Dark Matter tiles (dark background, white labels)

The popup and status bar also switch styling between light and dark modes.

### Manual override
The map toolbar contains two buttons — a sun (☀) and a moon (☽):
- Click **sun** to force the map to light theme
- Click **moon** to force the map to dark theme
- The active button is highlighted in blue

This override applies to the map panel only and does not change willhaben's own theme.

---

## 10. SPA Navigation Tracking

willhaben.at is a Next.js single-page application. WiKarte intercepts `history.pushState` and `history.replaceState` and fires a `WIKARTE_NAV_CHANGE` message whenever the route changes, without a full page reload.

On navigation:
- The map panel and toggle button visibility are re-evaluated for the new page type
- If the new page is a Merkliste folder, the extension fetches the folder's listing data
- A two-pass update (at 300 ms and 500 ms) handles Next.js hydration delays

`popstate` events (browser back/forward) are also handled.

---

## 11. Wishlist / Saved Ads Support

WiKarte fully supports willhaben's wishlist / saved-ads feature, regardless of which categories the saved items belong to.

### Initial load
Saved ads are extracted from the `__NEXT_DATA__` script tag on page load. Both the single-folder and all-folders view are supported.

### Folder navigation
When navigating to a specific folder (`?folderId=…`), WiKarte fetches the folder's listing data from the Next.js data API (`/_next/data/{buildId}/iad/myprofile/myfindings.json?folderId=…`) using the session cookies already present in the browser. The `folderId` parameter is validated to be numeric; the `buildId` is validated to contain only alphanumeric characters, hyphens, and underscores before being interpolated into the URL.

### Live wishlist marker updates
On normal search result pages, WiKarte also inspects willhaben's own save button state. Items that are already in a wishlist are shown with a gold marker, and adding or removing a listing from a wishlist updates the marker immediately without reloading the page.

The extension uses willhaben's own wishlist controls and state hints such as `aria-pressed="true"` plus listing IDs embedded in `data-testid` values like `search-result-entry-save-ad-<id>`.

### Noise filtering
On Merkliste pages, fetch interception ignores API calls that are not `_next/data` navigation responses (e.g. recommendation or analytics endpoints) to prevent spurious map updates.

---

## 12. Coordinate Resolution

WiKarte resolves each listing's map position using two strategies in order:

1. **Explicit coordinates** — the `COORDINATES` attribute (`lat,lng` string) when present
2. **Postcode lookup** — if no coordinates are available, the listing's `POSTCODE` attribute is looked up in the bundled `src/data/postcodes.js` table covering all Austrian postcodes

Listings that cannot be resolved by either strategy are silently skipped and are not placed on the map.

---

## 13. Geographic Overlays

WiKarte adds two subtle geographic overlays to make orientation easier without getting in the way of listing markers:

- **Austria border** — always visible as a lightweight blue national outline
- **Vienna district boundaries** — visible when zoomed in far enough around Vienna

Both overlays are rendered beneath listing markers and cluster badges so they remain informative without competing with the actual results.

---

## 14. Status Bar

A small translucent overlay in the bottom-left corner of the map shows:
- `Waiting for listings…` — initial state before any data arrives
- `N Anzeigen auf der WiKarte` — once listings are loaded (N = number of markers placed)
- `No listings found in data` — when data arrives but contains no usable listings

---

## 15. Fetch Interception

WiKarte intercepts outgoing `fetch` and `XMLHttpRequest` calls made by willhaben itself. When a response from a `/iad/`, `search`, or `_next/data` URL contains listing data, it is forwarded to the map without any additional network requests from the extension. This means the map stays in sync with infinite-scroll, pagination, and filter changes automatically.

---

## 16. Data Isolation and Privacy

- WiKarte does not send any listing data, user data, or behavioural data to any external server
- The only external network requests are map tile fetches to CARTO's CDN, which is standard for any Leaflet-based map
- The extension only activates on `*.willhaben.at` domains (as declared in `manifest.json`)
- The extension does not request optional runtime permissions
