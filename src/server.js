import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { scrapeProductReviews } from "./scraper/scrapeProductReviews.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "4mb" }));
app.use(
  express.static("public", {
    etag: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store");
    },
  })
);

const scrapeRequestSchema = z.object({
  url: z.string().url().refine((value) => /^https?:\/\//i.test(value), {
    message: "Only http and https URLs are supported.",
  }),
  maxReviews: z.coerce.number().int().min(1).max(250).default(25),
});

const exportCsvSchema = z.object({
  url: z.string().url(),
  reviews: z.array(z.record(z.any())).min(1).max(250),
});

app.post("/api/scrape", async (req, res) => {
  const parsed = scrapeRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await scrapeProductReviews(parsed.data.url, {
      maxReviews: parsed.data.maxReviews,
    });
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Scrape failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/export/csv", async (req, res) => {
  const parsed = exportCsvSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid export",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const downloadsDir = path.join(os.homedir(), "Downloads");
    await mkdir(downloadsDir, { recursive: true });

    const fileName = buildCsvFileName(parsed.data.url);
    const filePath = path.join(downloadsDir, fileName);
    await writeFile(filePath, reviewsToCsv(parsed.data.reviews), "utf8");

    return res.json({
      fileName,
      path: filePath,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Export failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(port, () => {
  console.log(`Shopify review scraper running at http://localhost:${port}`);
});

function reviewsToCsv(reviews) {
  const columns = ["source", "rating", "title", "body", "author", "date"];
  const rows = reviews.map((review) =>
    columns.map((column) => csvCell(review[column])).join(",")
  );

  return [columns.join(","), ...rows].join("\r\n");
}

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function buildCsvFileName(productUrl) {
  let slug = "shopify-reviews";

  try {
    const url = new URL(productUrl);
    const product = url.pathname.split("/").filter(Boolean).at(-1);
    slug = [url.hostname.replace(/^www\./, ""), product].filter(Boolean).join("-");
  } catch {
    // Fall back to the default slug.
  }

  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "shopify-reviews";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return `${safeSlug}-${timestamp}.csv`;
}
