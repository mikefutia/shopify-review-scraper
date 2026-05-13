# Scale AI Shopify Review Scraper

A free local web app from Scale AI for extracting customer reviews from Shopify product pages and exporting them to CSV or JSON.

This is designed to run on your own computer. No API keys are required.

## Features

- Paste a Shopify product page URL and choose a review limit.
- Export reviews as CSV or JSON.
- Uses Playwright, so it can read client-rendered review widgets.
- Extracts reviews from JSON-LD, rendered review markup, and review-provider network responses.
- Includes provider-aware handling for Okendo, Junip, and Judge.me, plus generic support for other review widgets.

## Supported Sources

The scraper currently has focused support for:

- Okendo
- Junip
- Judge.me
- JSON-LD review schema
- Generic visible review markup
- Generic review-like JSON payloads from network responses

Other Shopify review platforms may work partially through the generic extractors, but may need provider-specific pagination adapters.

## Requirements

- Node.js 20 or newer
- npm

## Local Setup

Clone the repo:

```bash
git clone https://github.com/mikefutia/shopify-review-scraper.git
cd shopify-review-scraper
```

Install dependencies:

```bash
npm install
npx playwright install chromium
```

Start the app:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Paste a Shopify product URL, select a review limit, and click `Scrape`.

## Test

```bash
npm test
```

## API

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example-store.com/products/example-product","maxReviews":25}'
```

`maxReviews` defaults to `25` and is capped at `250`.

Example response:

```json
{
  "url": "https://example-store.com/products/example-product",
  "scrapedAt": "2026-05-07T20:00:00.000Z",
  "durationMs": 1400,
  "maxReviews": 25,
  "count": 1,
  "sources": {
    "judge.me": 1
  },
  "reviews": [
    {
      "source": "judge.me",
      "rating": 5,
      "title": "Great product",
      "body": "Review text",
      "author": "Customer",
      "date": "2026-01-10"
    }
  ]
}
```

## Notes

Shopify does not provide reviews through a standard product-page API. Most stores use third-party review apps, so extraction quality depends on the review provider, the storefront implementation, and whether the site blocks automation.

Large review counts can take time because some providers only expose reviews through paginated widgets. The app caps requests at 250 reviews to keep local runs predictable.

## Responsible Use

Use this for research, internal analysis, or your own stores. Respect site terms, rate limits, robots.txt, and applicable laws. Do not use this to overload third-party storefronts.

## License

MIT
