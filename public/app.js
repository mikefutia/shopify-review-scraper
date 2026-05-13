const form = document.querySelector("#scrape-form");
const input = document.querySelector("#product-url");
const maxReviewsInput = document.querySelector("#max-reviews");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const countEl = document.querySelector("#review-count");
const durationEl = document.querySelector("#duration");
const resultsEl = document.querySelector("#results");
const downloadJsonButton = document.querySelector("#download-json");
const downloadCsvButton = document.querySelector("#download-csv");

let lastResult = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = input.value.trim();
  const maxReviews = Number(maxReviewsInput.value);
  setLoading(true);
  setStatus("Scraping");
  resultsEl.innerHTML = "";
  summaryEl.hidden = true;

  try {
    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, maxReviews }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Scrape failed");
    }

    lastResult = payload;
    renderResult(payload);
    setStatus("Complete");
  } catch (error) {
    lastResult = null;
    setStatus("Failed");
    resultsEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  } finally {
    setLoading(false);
  }
});

downloadJsonButton.addEventListener("click", () => {
  if (!lastResult) return;

  const blob = new Blob([JSON.stringify(lastResult, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, buildFileName(lastResult.url, "json"));
});

downloadCsvButton.addEventListener("click", () => {
  if (!lastResult) return;

  const csv = reviewsToCsv(lastResult.reviews);
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, buildFileName(lastResult.url, "csv"));
});

function renderResult(result) {
  summaryEl.hidden = false;
  countEl.textContent = result.count;
  durationEl.textContent = `${(result.durationMs / 1000).toFixed(1)}s`;

  if (!result.reviews.length) {
    resultsEl.innerHTML = `<div class="empty">No reviews were found. This can happen when a store blocks automation or loads reviews from an unsupported provider.</div>`;
    return;
  }

  resultsEl.innerHTML = result.reviews
    .map(
      (review) => `
        <article class="review">
          <div class="review-topline">
            <strong>${escapeHtml(review.author || "Anonymous")}</strong>
            <span>${escapeHtml(review.source)}</span>
          </div>
          <div class="rating">${renderStars(review.rating)} ${review.rating ? `${review.rating}/5` : ""}</div>
          ${review.title ? `<h2>${escapeHtml(review.title)}</h2>` : ""}
          <p>${escapeHtml(review.body)}</p>
          ${review.date ? `<time>${escapeHtml(review.date)}</time>` : ""}
        </article>
      `
    )
    .join("");
}

function setLoading(isLoading) {
  form.querySelector("button").disabled = isLoading;
  input.disabled = isLoading;
  maxReviewsInput.disabled = isLoading;
}

function setStatus(value) {
  statusEl.textContent = value;
}

function renderStars(rating) {
  if (!rating) return "";
  const filled = Math.round(rating);
  return "★★★★★".slice(0, filled) + "☆☆☆☆☆".slice(0, 5 - filled);
}

function reviewsToCsv(reviews) {
  const columns = ["source", "rating", "title", "body", "author", "date"];
  const rows = reviews.map((review) =>
    columns.map((column) => csvCell(review[column])).join(",")
  );

  return [columns.join(","), ...rows].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function buildFileName(productUrl, extension) {
  let slug = "shopify-reviews";

  try {
    const url = new URL(productUrl);
    const product = url.pathname.split("/").filter(Boolean).at(-1);
    slug = [url.hostname.replace(/^www\./, ""), product].filter(Boolean).join("-");
  } catch {}

  return `${slug}.${extension}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
