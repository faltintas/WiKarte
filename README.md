# WiKarte

A Chrome extension that adds an interactive map panel to [willhaben.at](https://www.willhaben.at), letting you see any listings plotted spatially as you browse — search results, saved ads, and Merkliste folders across all categories.

---

## What it does

WiKarte injects a 50 % wide map panel on the right side of willhaben.at listing pages. It works across all categories — real estate, vehicles, electronics, furniture, or anything else listed on willhaben. Every item on the current page appears as a price-tag marker on the map. Hovering an item in the list highlights its marker on the map. Clicking a marker opens a popup with the photo, price, details, and a direct link.

The map follows willhaben's own light/dark theme automatically, and can be toggled independently from within the extension.

---

## Features

- **Live map panel** — appears automatically on search result and Merkliste pages
- **Price-tag markers** — each listing shows its price directly on the map
- **Marker clustering** — nearby listings cluster at low zoom levels; spiderfies at max zoom
- **Hover highlight** — mousing over a listing card highlights the corresponding marker or cluster
- **Popups** — click any marker to see the photo, title, price, available details, address, and a link
- **Auto-fit** — map fits all visible listings into view on every page load
- **Reset view** — toolbar button to re-fit all listings after manual panning/zooming
- **Light / dark theme** — synced automatically with willhaben's theme; overridable from the map toolbar
- **Toggle button** — show or hide the map panel at any time
- **SPA navigation** — tracks Next.js client-side route changes; map updates without page reloads
- **Merkliste support** — works on saved-ads pages and individual Merkliste folders
- **Postcode fallback** — listings without GPS coordinates are placed using a built-in Austrian postcode lookup table

---

## Installation (developer mode)

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder

---

## Requirements

- Google Chrome (or any Chromium-based browser)
- No external accounts or API keys required — all map tiles are loaded from CARTO's public CDN

---

## Privacy

WiKarte reads listing data already present on the willhaben.at page you are viewing. It makes no independent network requests to third-party analytics or tracking services. Map tiles are fetched from CARTO's public tile CDN (same as any Leaflet-based map).

---

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
