export function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function normalizeRating(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/([0-5](?:\.\d+)?)/);
  if (!match) return null;

  const rating = Number(match[1]);
  return Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : null;
}

export function normalizeReviews(reviews) {
  const seen = new Set();
  const normalized = [];

  for (const review of reviews) {
    const body = cleanText(review.body);
    const title = cleanText(review.title);
    const author = cleanText(review.author);
    const date = cleanText(review.date);
    const rating = normalizeRating(review.rating);

    if (!body || body.length < 8) continue;

    const key = [body.toLowerCase(), author.toLowerCase(), date, rating].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      source: review.source || "unknown",
      rating,
      title,
      body,
      author,
      date,
    });
  }

  return normalized;
}
