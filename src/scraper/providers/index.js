import { cleanText, normalizeRating } from "../utils.js";

export function extractProviderReviews(networkPayloads) {
  const reviews = [];

  for (const payload of networkPayloads) {
    const source = detectSource(payload.url);
    const candidates = findReviewLikeObjects(payload.body);

    for (const candidate of candidates) {
      const review = objectToReview(candidate, source);
      if (review) reviews.push(review);
    }
  }

  return reviews;
}

function detectSource(url) {
  if (/judgeme|judge\.me|cdn\.judge\.me/i.test(url)) return "judge.me";
  if (/loox/i.test(url)) return "loox";
  if (/yotpo/i.test(url)) return "yotpo";
  if (/stamped/i.test(url)) return "stamped";
  if (/okendo|okeReviews/i.test(url)) return "okendo";
  if (/juniphq/i.test(url)) return "junip";
  if (/bazaarvoice/i.test(url)) return "bazaarvoice";
  if (/powerreviews/i.test(url)) return "powerreviews";
  return "review-api";
}

function findReviewLikeObjects(value, depth = 0, results = []) {
  if (depth > 8 || value === null || value === undefined) return results;

  if (typeof value === "string") {
    parseEmbeddedJson(value, depth, results);
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) findReviewLikeObjects(item, depth + 1, results);
    return results;
  }

  if (typeof value !== "object") return results;

  if (looksLikeReview(value)) {
    results.push(value);
  }

  for (const child of Object.values(value)) {
    findReviewLikeObjects(child, depth + 1, results);
  }

  return results;
}

function parseEmbeddedJson(value, depth, results) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 1_000_000) return;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;

  try {
    findReviewLikeObjects(JSON.parse(trimmed), depth + 1, results);
  } catch {
    // Non-JSON text responses are intentionally ignored here.
  }
}

function looksLikeReview(value) {
  const keys = Object.keys(value).map((key) => key.toLowerCase());
  const hasBody = keys.some((key) =>
    ["body", "content", "review", "reviewbody", "description", "message", "comment"].includes(key)
    || ["body_html", "bodyhtml"].includes(key)
  );
  const hasReviewHint = keys.some((key) => /review|rating|stars|author|customer|date|title/i.test(key));

  return hasBody && hasReviewHint;
}

function objectToReview(value, source) {
  const body = pick(value, [
    "body",
    "reviewBody",
    "review_body",
    "body_html",
    "bodyHtml",
    "content",
    "review",
    "description",
    "message",
    "comment",
    "text",
  ]);

  if (!cleanText(body)) return null;

  return {
    source,
    title: cleanText(pick(value, ["title", "headline", "name", "subject"])),
    body: cleanText(stripHtml(body)),
    author: cleanText(
      pick(value, [
        "author",
        "author_name",
        "display_name",
        "reviewer_name",
        "public_reviewer_name",
        "user_name",
      "customer_name",
      "name",
      "customer",
    ])
  ),
    rating: normalizeRating(pick(value, ["rating", "score", "stars", "ratingValue", "review_rating"])),
    date: cleanText(
      pick(value, [
        "date",
        "created_at",
        "createdAt",
        "datePublished",
        "published_at",
        "review_date",
      ])
    ),
  };
}

function pick(object, keys) {
  for (const key of keys) {
    const value = object[key];
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "object") {
      if (value.name) return value.name;
      if (value.first_name || value.last_name) {
        return [value.first_name, value.last_name].filter(Boolean).join(" ");
      }
      if (value.value) return value.value;
      if (value.ratingValue) return value.ratingValue;
      continue;
    }

    return value;
  }

  return "";
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}
