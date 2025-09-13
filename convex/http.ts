import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// --- Metadata NFT off-chain (TEP-64: URL JSON) ---
http.route({
  path: "/nft/metadata",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new globalThis.URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return new globalThis.Response(JSON.stringify({ error: "missing id" }), { status: 400 });
    const nft = await ctx.db.get(id as any);
    if (!nft) return new globalThis.Response(JSON.stringify({ error: "not found" }), { status: 404 });
    const meta = {
      name: (nft as any).name,
      description: (nft as any).description,
      image: (nft as any).imageUrl, // migrate to IPFS later if needed
      attributes: [],
    };
    return new globalThis.Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
  }),
});

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const update = await req.json();
    await ctx.runAction(api.payments.handleTelegramWebhook, { update });
    return new globalThis.Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }),
});

http.route({
  path: "/tonconnect-manifest.json",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const s = await ctx.runQuery(api.payments.getSettings, {});
    const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const scheme = (req.headers.get('x-forwarded-proto') || 'https') + '://';
    const convexBase = forwardedHost ? scheme + forwardedHost : '';
    const appBase = (s as any)?.appBaseUrl || convexBase;
    const iconUrl = 'https://api.a0.dev/assets/image?text=Sticker%20Mark%20%E2%80%A2%20neon%20sticker%20logo&aspect=1:1';
    const manifest = {
      url: appBase,
      name: "Sticker Mark",
      iconUrl,
      termsOfUseUrl: appBase,
      privacyPolicyUrl: appBase,
      tonconnectVersion: 2,
    } as any;
    return new globalThis.Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } });
  }),
});

export default http;