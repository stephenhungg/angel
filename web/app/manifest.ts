import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "angel — kawaii ai companion",
    short_name: "angel",
    description:
      "a kawaii desktop ai companion. swipe through archetypes, converge on a persona, meet her.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdfe",
    theme_color: "#ff85a8",
    icons: [
      {
        src: "/kawaii/wordmark-pink-nano.png",
        sizes: "2048x2048",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/kawaii/mascot-wave.png",
        sizes: "2048x2048",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["lifestyle", "productivity", "social"],
    lang: "en-US",
    orientation: "portrait-primary",
  };
}
