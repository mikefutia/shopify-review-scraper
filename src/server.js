import express from "express";
import { z } from "zod";
import { scrapeProductReviews } from "./scraper/scrapeProductReviews.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "256kb" }));
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

app.listen(port, () => {
  console.log(`Shopify review scraper running at http://localhost:${port}`);
});
