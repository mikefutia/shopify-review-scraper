import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { extractVisibleReviews } from "../src/scraper/extractVisibleReviews.js";

test("extracts reviews from visible review widget markup", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setContent(`
      <article class="jdgm-rev">
        <span class="jdgm-rev__author">Katherine</span>
        <span class="jdgm-rev__timestamp">2026-03-15</span>
        <span class="jdgm-star jdgm--on"></span>
        <span class="jdgm-star jdgm--on"></span>
        <span class="jdgm-star jdgm--on"></span>
        <span class="jdgm-star jdgm--on"></span>
        <h3 class="jdgm-rev__title">Solid quality</h3>
        <p class="jdgm-rev__body">This held up after several washes.</p>
      </article>
    `);

    const reviews = await extractVisibleReviews(page);

    assert.deepEqual(reviews, [
      {
        source: "visible-dom",
        title: "Solid quality",
        body: "This held up after several washes.",
        author: "Katherine",
        rating: 4,
        date: "2026-03-15",
      },
    ]);
  } finally {
    await browser.close();
  }
});
