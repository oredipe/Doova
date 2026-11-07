import type { MetadataRoute } from "next";

// Lets people add Doova to their home screen. On iPhones, phone notifications only work from there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doova",
    short_name: "Doova",
    description: "Real tasks, real pay, locked before anyone starts.",
    start_url: "/tasks",
    scope: "/",
    display: "standalone",
    background_color: "#F6F6F1",
    theme_color: "#F6F6F1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
