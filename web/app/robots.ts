import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/admin-auth"],
      },
    ],
    sitemap: "https://angel-swipe.vercel.app/sitemap.xml",
    host: "https://angel-swipe.vercel.app",
  };
}
