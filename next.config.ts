import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // The two store pages became filters on one page; keep old bookmarks working.
  redirects: async () => [
    { source: "/dridha/play-store", destination: "/dridha/stores?store=play", permanent: false },
    { source: "/dridha/app-store", destination: "/dridha/stores?store=apple", permanent: false },
  ],
};

export default nextConfig;
