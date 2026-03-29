# Chrome Web Store Submission

This file contains the prepared submission text and release checklist for WiKarte.

## Package

Build the upload ZIP:

```bash
npm run build:webstore
```

Output:

```text
dist/wikarte-webstore.zip
```

The ZIP keeps `manifest.json` at the root as required by Chrome Web Store upload guidance and excludes repository-only files.

## Listing Copy

### Extension name

WiKarte

### Short description

Show willhaben listings on an interactive map while browsing search results, wishlists, and saved ads.

### Detailed description

WiKarte adds an interactive side-panel map to willhaben.at so you can explore listings geographically while you browse.

Features:

- Shows listing markers directly on a map beside willhaben search results
- Supports search pages, wishlist folders, saved ads, and My Adverts pages
- Highlights markers when you hover matching listings in the page, including clustered items
- Marks wishlisted items directly on the map and updates them live when you save or remove them
- Opens popups with image, price, details, address, and direct listing link
- Automatically fits the visible listings on the map
- Supports light and dark themes
- Adds subtle Austria and Vienna district outlines for easier orientation
- Uses postcode fallback for listings without explicit coordinates

WiKarte works only on willhaben.at pages and does not require accounts or API keys.

## Category

Choose the category that best fits shopping or productivity. If in doubt, use:

- `Productivity`

## Privacy Fields

Use answers consistent with the current codebase:

### Privacy policy URL

Host the contents of `docs/privacy-policy.md` at a public URL, then paste that URL into the dashboard.

Good options:

- GitHub Pages page for this repository
- a `privacy-policy.md` rendered on GitHub if you prefer a simple public URL

### Data collection disclosure guidance

Based on the current implementation:

- The extension processes website content from willhaben pages in order to provide its core feature
- The extension does **not** send user data to the developer's own backend
- The extension does **not** use advertising or analytics SDKs
- The extension does **not** sell or transfer user data for unrelated purposes

If the dashboard asks which data types are handled, disclose only what is actually necessary for page content processing, such as website content or browsing context, and avoid selecting categories that are not truly used.

## Screenshots

Official guidance says screenshots should be `1280x800` or `640x400`, with at least one screenshot and preferably up to five. Source: [Supplying Images](https://developer.chrome.com/docs/webstore/images).

Recommended screenshots:

1. Search results page with map panel open
2. Marker popup with image and price visible
3. Hover highlight behavior
4. Dark theme
5. Wishlist or saved ads page

## Submission Notes For Review

Use this in the reviewer notes field if needed:

```text
WiKarte runs only on willhaben.at pages and adds a map side panel for listing results, wishlists, and saved ads. It reads listing data already present on the page or returned by willhaben navigation responses in order to place markers on a Leaflet map. It also reads willhaben's own wishlist button state so saved items can be marked on the map. It does not transmit data to the developer's own servers.
```

## Release Checklist

1. Run `npm test -- --runInBand`
2. Run `npm run build:webstore`
3. Verify `dist/wikarte-webstore.zip`
4. Upload the ZIP in the Chrome Developer Dashboard
5. Fill in the listing text from this document
6. Add at least one screenshot, preferably five
7. Add your hosted privacy policy URL
8. Submit for review

## Official References

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare/)
- [Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [Supplying Images](https://developer.chrome.com/docs/webstore/images)
