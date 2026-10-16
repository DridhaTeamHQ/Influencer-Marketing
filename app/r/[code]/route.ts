import { after, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DOWNLOAD_URL, hashVisitor, parseUserAgent } from "@/lib/tracking";

export async function GET(request: NextRequest, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;

  const select = { id: true, isActive: true, influencer: { select: { isActive: true } } } as const;
  // Exact match first (older random codes are mixed-case), then case-insensitive so /r/Bharani works too.
  const link =
    (await prisma.link.findUnique({ where: { code }, select })) ??
    (await prisma.link.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select }));

  if (!link) {
    return new Response("Link not found", { status: 404 });
  }

  if (link.isActive && link.influencer.isActive) {
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
  }

  return new Response(null, {
    status: 302,
    headers: { Location: DOWNLOAD_URL, "Cache-Control": "no-store" },
  });
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
