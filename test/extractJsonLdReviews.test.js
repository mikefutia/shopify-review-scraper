import assert from "node:assert/strict";
import test from "node:test";
import { extractJsonLdReviews } from "../src/scraper/extractJsonLdReviews.js";

test("extracts JSON-LD product reviews", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@type": "Product",
        "review": [
          {
            "@type": "Review",
            "name": "Great shirt",
            "reviewBody": "The material is better than expected.",
            "author": { "name": "Ada" },
            "reviewRating": { "ratingValue": "5" },
            "datePublished": "2026-01-10"
          }
        ]
      }
    </script>
  `;

  assert.deepEqual(extractJsonLdReviews(html), [
    {
      source: "json-ld",
      title: "Great shirt",
      body: "The material is better than expected.",
      author: "Ada",
      rating: 5,
      date: "2026-01-10",
    },
  ]);
});
