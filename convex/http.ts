import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const update = await req.json();
    await ctx.runAction(api.payments.handleTelegramWebhook, { update });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } });
  }),
});

export default http;