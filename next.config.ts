import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // Thumbnail proxy requests carry very long CDN URLs and flood the dev terminal.
  logging: {
    incomingRequests: { ignore: [/\/social\/[^/]+\/image/] },
  },
  partialPrefetching: true,
  // The two store pages became filters on one page; keep old bookmarks working.
  redirects: async () => [
    { source: "/dridha/play-store", destination: "/dridha/stores?store=play", permanent: false },
    { source: "/dridha/app-store", destination: "/dridha/stores?store=apple", permanent: false },
    // LinkedIn moved under Influencers.
    { source: "/dridha/linkedin", destination: "/dridha/influencers/linkedin", permanent: false },
  ],
};

export default nextConfig;
