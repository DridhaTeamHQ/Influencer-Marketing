/** The dashboard lives under this path; everything else on the domain (except /r/ and /go/ links) goes to the main site. */
export const ADMIN_BASE = "/dridha";

export const routes = {
  dashboard: ADMIN_BASE,
  influencers: `${ADMIN_BASE}/influencers`,
  influencer: (id: string) => `${ADMIN_BASE}/influencers/${id}`,
  linkedin: `${ADMIN_BASE}/linkedin`,
  playStore: `${ADMIN_BASE}/play-store`,
  appStore: `${ADMIN_BASE}/app-store`,
  social: `${ADMIN_BASE}/social`,
  instagram: `${ADMIN_BASE}/social/instagram`,
  facebook: `${ADMIN_BASE}/social/facebook`,
  youtube: `${ADMIN_BASE}/social/youtube`,
  login: `${ADMIN_BASE}/login`,
};

/** Where visitors land when they open any non-dashboard, non-link URL. */
export const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL ?? "https://www.dailymattr.com";
