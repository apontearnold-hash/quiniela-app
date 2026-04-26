import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.api-sports.io" },
      { protocol: "https", hostname: "media-1.api-sports.io" },
      { protocol: "https", hostname: "media-2.api-sports.io" },
      { protocol: "https", hostname: "media-3.api-sports.io" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
}

export default nextConfig
