import * as cheerio from "cheerio";
import { cleanText, normalizeRating } from "./utils.js";

export function extractJsonLdReviews(html) {
  const $ = cheerio.load(html);
  const reviews = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();
    if (!raw.trim()) return;

    for (const item of parseJsonLd(raw)) {
      collectReviews(item, reviews);
    }
  });

  return reviews;
}

function parseJsonLd(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function collectReviews(node, reviews) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const child of node) collectReviews(child, reviews);
    return;
  }

  if (Array.isArray(node["@graph"])) {
    collectReviews(node["@graph"], reviews);
  }

  const rawReviews = Array.isArray(node.review) ? node.review : node.review ? [node.review] : [];

  for (const review of rawReviews) {
    if (!review || typeof review !== "object") continue;

    reviews.push({
      source: "json-ld",
      title: cleanText(review.name || review.headline),
      body: cleanText(review.reviewBody || review.description),
      author: cleanText(review.author?.name || review.author),
      rating: normalizeRating(review.reviewRating?.ratingValue || review.ratingValue),
      date: cleanText(review.datePublished || review.dateCreated),
    });
  }
}
