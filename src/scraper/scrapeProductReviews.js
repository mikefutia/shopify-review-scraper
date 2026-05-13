import { chromium } from "playwright";
import { extractJsonLdReviews } from "./extractJsonLdReviews.js";
import { extractVisibleReviews } from "./extractVisibleReviews.js";
import { extractProviderReviews } from "./providers/index.js";
import { normalizeReviews } from "./utils.js";

const REVIEW_URL_PATTERN = /review|reviews|judgeme|judge\.me|loox|yotpo|stamped|okendo|bazaarvoice|powerreviews/i;

export async function scrapeProductReviews(productUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 45_000;
  const maxReviews = clamp(Number(options.maxReviews || 25), 1, 250);
  const startedAt = Date.now();
  const networkPayloads = [];

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      viewport: { width: 1440, height: 1100 },
    });

    page.setDefaultTimeout(timeoutMs);

    page.on("response", async (response) => {
      const responseUrl = response.url();
      const contentType = response.headers()["content-type"] || "";

      if (!REVIEW_URL_PATTERN.test(responseUrl)) return;
      if (!/json|javascript|text|html/i.test(contentType)) return;

      try {
        if (/json/i.test(contentType)) {
          networkPayloads.push({
            url: responseUrl,
            contentType,
            body: await response.json(),
          });
          return;
        }

        const text = await response.text();
        if (text && text.length < 1_000_000) {
          networkPayloads.push({ url: responseUrl, contentType, body: text });
        }
      } catch {
        // Some third-party review endpoints stream or block body reads.
      }
    });

    const response = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    if (!response || !response.ok()) {
      throw new Error(`Product page returned ${response?.status() || "no"} response.`);
    }

    await settleReviewWidgets(page);
    await loadAdditionalVisibleReviews(page, maxReviews);
    await fetchAdditionalProviderPages(page, networkPayloads, maxReviews);

    const html = await page.content();
    const [jsonLdReviews, visibleReviews, providerReviews] = await Promise.all([
      Promise.resolve(extractJsonLdReviews(html)),
      extractVisibleReviews(page),
      Promise.resolve(extractProviderReviews(networkPayloads)),
    ]);

    const hasProviderSpecificDom = visibleReviews.some((review) =>
      ["okendo-dom"].includes(review.source)
    );
    const pageReviews =
      providerReviews.length > 0 && !hasProviderSpecificDom
        ? [...jsonLdReviews, ...providerReviews]
        : [...jsonLdReviews, ...visibleReviews];

    const reviews = normalizeReviews(pageReviews).slice(0, maxReviews);

    return {
      url: productUrl,
      scrapedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      maxReviews,
      count: reviews.length,
      sources: summarizeSources(reviews),
      reviews,
    };
  } finally {
    await browser.close();
  }
}

async function fetchAdditionalProviderPages(page, networkPayloads, maxReviews) {
  const junipPayload = networkPayloads.find(
    (payload) =>
      /juniphq\.com\/.+\/reviews/i.test(payload.url) &&
      Array.isArray(payload.body?.data) &&
      payload.body?.meta?.after
  );

  if (!junipPayload || junipPayload.body.data.length >= maxReviews) return;

  const fetchedPayloads = await page.evaluate(
    async ({ firstUrl, firstAfter, maxReviews }) => {
      const payloads = [];
      let after = firstAfter;
      let loaded = 5;

      while (after && loaded < maxReviews) {
        const nextUrl = buildJunipNextUrl(firstUrl, after);
        const response = await fetch(nextUrl);
        if (!response.ok) break;

        const body = await response.json();
        const count = Array.isArray(body?.data) ? body.data.length : 0;
        if (!count) break;

        payloads.push({ url: nextUrl, body });
        loaded += count;
        after = body?.meta?.after;
      }

      return payloads;

      function buildJunipNextUrl(url, cursor) {
        const [base, query = ""] = url.split("?");
        const params = query
          .split("&")
          .filter(Boolean)
          .filter((param) => !param.startsWith("page_after="));
        const versionIndex = params.findIndex((param) => param.startsWith("v="));
        const versionParam = versionIndex >= 0 ? params.splice(versionIndex, 1)[0] : "";

        params.push(`page_after=${cursor}`);
        if (versionParam) params.push(versionParam);

        return `${base}?${params.join("&")}`;
      }
    },
    {
      firstUrl: junipPayload.url,
      firstAfter: junipPayload.body.meta.after,
      maxReviews,
    }
  );

  for (const payload of fetchedPayloads) {
    networkPayloads.push({
      url: payload.url,
      contentType: "application/json",
      body: payload.body,
    });
  }
}

async function loadAdditionalVisibleReviews(page, maxReviews) {
  const targetCount = maxReviews + Math.min(10, Math.ceil(maxReviews * 0.25));
  const maxClicks = Math.min(55, Math.ceil(maxReviews / 5) + 6);
  let stalledClicks = 0;

  for (let i = 0; i < maxClicks; i += 1) {
    const currentCount = await visibleReviewCount(page);
    if (currentCount >= targetCount) return;

    const clicked = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          ".oke-showMore-button, .junip-see-more, button[aria-label*='Show more reviews' i], button"
        )
      );
      const button =
        candidates.find((node) =>
          /show more reviews/i.test(`${node.textContent || ""} ${node.getAttribute("aria-label") || ""}`) && !node.disabled
        ) ||
        candidates.find((node) => {
        const text = `${node.textContent || ""} ${node.getAttribute("aria-label") || ""}`;
        return /show more|load more|see more reviews|see more/i.test(text) && !/read more|^more$/i.test(text.trim()) && !node.disabled;
      });

      if (!button) return false;
      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    });

    if (!clicked) return;

    await page.waitForTimeout(1500);

    const nextCount = await visibleReviewCount(page);
    if (nextCount <= currentCount) {
      stalledClicks += 1;
      if (stalledClicks >= 2) return;
    } else {
      stalledClicks = 0;
    }
  }
}

async function visibleReviewCount(page) {
  return page.evaluate(
    () =>
      document.querySelectorAll(".oke-w-reviews-list-item").length ||
      document.querySelectorAll(".junip-review-list-item-container").length ||
      document.querySelectorAll(".jm-review-widget [data-testid*='review'], .jdgm-full-rev, .jdgm-rev").length ||
      document.querySelectorAll(
        ".jdgm-rev, .loox-review, .yotpo-review, .stamped-review, .okeReviews-review, [itemprop='review'], [data-review-id]"
      ).length
  );
}

async function settleReviewWidgets(page) {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

  const selectors = [
    "#judgeme_product_reviews",
    ".jdgm-rev",
    ".loox-reviews",
    ".yotpo-reviews",
    ".stamped-reviews",
    ".okeReviews",
    ".junip-review",
    ".junip-reviews",
    ".junip-product-review",
    ".jdgm-review-widget",
    ".jdgm-full-rev",
    ".jdgm-rev",
    "[data-review-id]",
    "[itemprop='review']",
  ];

  await page
    .waitForSelector(selectors.join(","), { timeout: 5_000 })
    .catch(() => {});

  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(450);
  }
}

function summarizeSources(reviews) {
  return reviews.reduce((sources, review) => {
    sources[review.source] = (sources[review.source] || 0) + 1;
    return sources;
  }, {});
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
