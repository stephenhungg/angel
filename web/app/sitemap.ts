import type { MetadataRoute } from "next";

const URL = "https://angel-swipe.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${URL}/`,         lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${URL}/download`, lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${URL}/swipe`,    lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${URL}/about`,    lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${URL}/privacy`,  lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];
}
