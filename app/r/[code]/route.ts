import { after, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashVisitor, influencerStoreUrls, parseUserAgent, prefersAppStore } from "@/lib/tracking";

export async function GET(request: NextRequest, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;

  const select = {
    id: true,
    code: true,
    isActive: true,
    influencer: { select: { isActive: true, name: true, platform: true } },
  } as const;
  // Exact match first (older random codes are mixed-case), then case-insensitive so /r/Bharani works too.
  const link =
    (await prisma.link.findUnique({ where: { code }, select })) ??
    (await prisma.link.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select }));

  if (!link) {
    // A name that belonged to a deleted or renamed link shows "expired"; anything else "not found".
    // (The campaign period is only for reference and never blocks a link.)
    const retired = await prisma.retiredCode.findFirst({
      where: { code: { equals: code, mode: "insensitive" } },
      select: { code: true },
    });
    return statusPage(request, retired ? "expired" : "not-found");
  }

  if (!link.isActive || !link.influencer.isActive) {
    return statusPage(request, "unavailable");
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
    await prisma.click.create({
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

  // Straight to the store, tagged with this influencer's UTM campaign.
  const stores = influencerStoreUrls(link.influencer, link.code);

  return new Response(null, {
    status: 302,
    headers: { Location: prefersAppStore(agent) ? stores.ios : stores.android, "Cache-Control": "no-store" },
  });
}

function statusPage(request: NextRequest, status: "expired" | "unavailable" | "not-found") {
  return new Response(null, {
    status: 307,
    headers: { Location: new URL(`/link/${status}`, request.url).toString(), "Cache-Control": "no-store" },
  });
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
