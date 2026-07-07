import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marked in Red — MMIWG2S Awareness Map",
    short_name: "Marked in Red",
    description:
      "An interactive awareness map for Missing and Murdered Indigenous Women, Girls, and Two-Spirit (MMIWG2S) cases across the United States and Canada.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f9fa",
    theme_color: "#f8f9fa",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
