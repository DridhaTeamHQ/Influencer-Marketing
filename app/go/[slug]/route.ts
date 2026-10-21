import { after, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashVisitor, parseUserAgent } from "@/lib/tracking";

/** Partner links (e.g. Tamada Media on LinkedIn). Counted on their own, apart from influencer clicks. */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[slug]">) {
  const { slug } = await ctx.params;

  const link = await prisma.partnerLink.findFirst({
    where: { slug: { equals: slug, mode: "insensitive" } },
    select: { id: true, isActive: true, destinationUrl: true, androidUrl: true, iosUrl: true },
  });

  if (!link || !link.isActive) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: new URL(`/link/${link ? "unavailable" : "not-found"}`, request.url).toString(),
        "Cache-Control": "no-store",
      },
    });
  }

  const ua = request.headers.get("user-agent") ?? "";
  const agent = parseUserAgent(ua);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const country =
    request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? null;
  const referrer = request.headers.get("referer");

  // Record the click after the redirect has been sent so it never slows users down.
  after(async () => {
    await prisma.partnerClick.create({
      data: {
        linkId: link.id,
        device: agent.device,
        os: agent.os,
        browser: agent.browser,
        isBot: agent.isBot,
        country: country && country !== "XX" ? country.toUpperCase() : null,
        referrer: referrer ? safeHost(referrer) : null,
        visitorId: hashVisitor(ip, ua),
      },
    });
  });

  // Every visitor goes to a store: iPhone, iPad and Mac to the App Store, everyone else to the Play Store.
  const prefersAppStore = agent.device === "IOS" || agent.os === "macOS";
  const location =
    (prefersAppStore ? link.iosUrl ?? link.androidUrl : link.androidUrl ?? link.iosUrl) ??
    link.destinationUrl;

  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
