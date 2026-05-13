import { cleanText, normalizeRating } from "./utils.js";

const CONTAINER_SELECTORS = [
  ".jdgm-rev",
  ".loox-review",
  ".yotpo-review",
  ".stamped-review",
  ".okeReviews-review",
  ".oke-w-reviews-list-item",
  "[itemprop='review']",
  "[data-review-id]",
].join(",");

export async function extractVisibleReviews(page) {
  return page.evaluate(
    ({ containerSelectors }) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const containers = Array.from(document.querySelectorAll(containerSelectors));
      const results = [];

      for (const container of containers) {
        const text = clean(container.innerText || container.textContent);
        if (text.length < 20 || text.length > 5000) continue;

        const author = pickText(container, [
          ".jdgm-rev__author",
          ".loox-review__author",
          ".yotpo-user-name",
          ".stamped-review-header-title",
          ".okeReviews-review-reviewer-name",
          ".oke-w-reviewer-name",
          "[itemprop='author']",
          "[class*='author' i]",
          "[class*='name' i]",
        ]);

        const title = pickText(container, [
          ".jdgm-rev__title",
          ".loox-review__title",
          ".yotpo-review-title",
          ".stamped-review-title",
          ".okeReviews-review-title",
          ".oke-reviewContent-title",
          "[itemprop='name']",
          "[class*='title' i]",
        ]);

        const body = pickText(container, [
          ".jdgm-rev__body",
          ".loox-review__content",
          ".content-review",
          ".yotpo-review-content",
          ".stamped-review-content-body",
          ".okeReviews-review-primary",
          ".oke-reviewContent-body",
          "[itemprop='reviewBody']",
          "[class*='body' i]",
          "[class*='content' i]",
        ]) || text;

        const date = pickText(container, [
          ".jdgm-rev__timestamp",
          ".loox-review__date",
          ".yotpo-review-date",
          ".stamped-review-date",
          ".okeReviews-review-date",
          ".oke-w-reviewMinimal-date",
          "time",
          "[itemprop='datePublished']",
          "[class*='date' i]",
        ]);

        const rating = readRating(container);

        if (!isLikelyReview({ container, title, body, author, date, rating, text })) {
          continue;
        }

        results.push({
          source: container.matches(".oke-w-reviews-list-item") ? "okendo-dom" : "visible-dom",
          title,
          body,
          author,
          rating,
          date,
        });
      }

      return results;

      function pickText(root, selectors) {
        for (const selector of selectors) {
          const node = root.querySelector(selector);
          const value = clean(node?.getAttribute("content") || node?.getAttribute("datetime") || node?.textContent);
          if (value) return value;
        }
        return "";
      }

      function readRating(root) {
        const explicit = root.querySelector(
          "[itemprop='ratingValue'], [aria-label*='star' i], [title*='star' i], .oke-reviewContent-stars"
        );
        const raw =
          explicit?.getAttribute("content") ||
          explicit?.getAttribute("aria-label") ||
          explicit?.getAttribute("title") ||
          explicit?.textContent ||
          "";
        const explicitMatch = String(raw).match(/([0-5](?:\.\d+)?)/);
        if (explicitMatch) return Number(explicitMatch[1]);

        const filledStars = root.querySelectorAll(
          ".jdgm-star.jdgm--on, .loox-icon-star, .yotpo-icon-star, .stamped-fa-star, [class*='star'][class*='full']"
        ).length;

        return filledStars > 0 ? Math.min(filledStars, 5) : null;
      }

      function isLikelyReview({ container, title, body, author, date, rating, text }) {
        const hasSchema = Boolean(container.matches("[itemprop='review']") || container.querySelector("[itemprop='reviewBody']"));
        const hasKnownReviewClass = Boolean(
          container.matches(".jdgm-rev, .loox-review, .yotpo-review, .stamped-review, .okeReviews-review, .oke-w-reviews-list-item")
        );
        const hasProviderReviewId = Boolean(container.getAttribute("data-review-id"));
        const hasReviewBody = Boolean(body && body !== text);
        const hasReviewSignals = [author, date, rating, title].filter(Boolean).length;
        const isControlText = /Search Reviews|Write a Review|Most Recent|Highest Rating|Lowest Rating|Click to scroll to reviews/i.test(text);

        if (isControlText) return false;
        if (!hasSchema && !hasKnownReviewClass && !hasProviderReviewId) return false;
        if (!hasReviewBody && hasReviewSignals < 2) return false;
        if (body.length < 12) return false;

        return true;
      }
    },
    { containerSelectors: CONTAINER_SELECTORS }
  ).then((reviews) =>
    reviews.map((review) => ({
      ...review,
      title: cleanText(review.title),
      body: cleanText(review.body),
      author: cleanText(review.author),
      date: cleanText(review.date),
      rating: normalizeRating(review.rating),
    }))
  );
}
