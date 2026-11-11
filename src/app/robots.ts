import type { MetadataRoute } from "next";

/** Служебные разделы. Префикс без завершающего слэша закрывает и саму страницу, и всё внутри неё. */
const PRIVATE = [
  "/api/",
  "/auth",
  "/outreach",
  "/dashboard",
  "/agents",
  "/chats",
  "/settings",
  "/smm",
  "/ads",
  "/funnels",
  "/sites",
  "/playground",
  "/test-creatives",
  "/widget",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE,
    },
  };
}
