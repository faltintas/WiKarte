# WiKarte

A Chrome extension that adds an interactive map panel to [willhaben.at](https://www.willhaben.at), letting you see listings geographically while you browse search results, wishlist pages, and saved-ad folders across all categories.

---

## What it does

WiKarte injects a 50 % wide map panel on the right side of willhaben.at listing pages. It works across all categories — real estate, vehicles, electronics, furniture, or anything else listed on willhaben. Every item on the current page appears as a price-tag marker on the map. Hovering an item in the list highlights its marker on the map, even when that item currently sits inside a cluster. Clicking a marker opens a popup with the photo, price, details, and a direct link.

The map toolbar offers three quick map modes: Street light, Street dark, and Satellite.

---

## Features

- **Live map panel** — appears automatically on search results, wishlist pages, saved-ad folders, and My Adverts pages
- **Price-tag markers** — each listing shows its price directly on the map
- **Marker clustering** — nearby listings cluster at low zoom levels; spiderfies at max zoom
- **Hover highlight** — mousing over a listing card highlights the corresponding marker, including a temporary pop-out marker for clustered items
- **Popups** — click any marker to see the photo, title, price, available details, address, and a link
- **Auto-fit** — map fits all visible listings into view on every page load
- **Reset view** — toolbar button to re-fit all listings after manual panning/zooming
- **Three map modes** — Street light, Street dark, and Satellite via image buttons in the map toolbar
- **Toggle button** — show or hide the map panel at any time
- **Wishlist marker state** — saved items are shown in gold and update live when you add or remove them from a wishlist
- **Austria border + Vienna district overlay** — subtle geographic outlines for easier orientation; Satellite keeps them fully visible
- **Postcode fallback** — listings without GPS coordinates are placed using a built-in Austrian postcode lookup table

---

## Requirements

- Google Chrome (or any Chromium-based browser)
- No external accounts or API keys required — Street view uses CARTO tiles and Satellite uses Esri imagery

---

## Privacy

WiKarte reads listing data already present on the willhaben.at page you are viewing. It makes no independent network requests to third-party analytics or tracking services. Map tiles are fetched only from the selected basemap provider: CARTO for Street view and Esri for Satellite view.

---

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Documentation

- Functional overview: [docs/README.functional.md](./docs/README.functional.md)
- Technical architecture: [docs/README.technical.md](./docs/README.technical.md)
- Developer notes: [docs/README.dev.md](./docs/README.dev.md)
