import assert from "node:assert/strict";
import test from "node:test";
import { extractProviderReviews } from "../src/scraper/providers/index.js";
import { normalizeReviews } from "../src/scraper/utils.js";

test("extracts nested provider review payloads", () => {
  const reviews = extractProviderReviews([
    {
      url: "https://judge.me/api/reviews",
      body: {
        data: {
          reviews: [
            {
              title: "Works well",
              body: "<p>I would buy this again.</p>",
              reviewer_name: "Grace",
              rating: 4,
              created_at: "2026-02-01",
            },
          ],
        },
      },
    },
  ]);

  assert.deepEqual(normalizeReviews(reviews), [
    {
      source: "judge.me",
      rating: 4,
      title: "Works well",
      body: "I would buy this again.",
      author: "Grace",
      date: "2026-02-01",
    },
  ]);
});
