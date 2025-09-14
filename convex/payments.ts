import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// In produzione, i segreti vanno in tabella settings (non hardcoded)
const TON_API = "https://tonapi.io"; // public read API
const CONVEX_HTTP_BASE = "https://agreeable-meadowlark-896.convex.site"; // Public HTTP router base for webhook/manifest

export const getSettings = query({
  args: {},
  returns: v.object({ telegramBotToken: v.optional(v.string()), tonDestinationWallet: v.optional(v.string()), tonToStarsRate: v.optional(v.number()), appBaseUrl: v.optional(v.string()), apiBaseUrl: v.optional(v.string()), tonNetwork: v.optional(v.union(v.literal("mainnet"), v.literal("testnet"))), tonCollectionAddress: v.optional(v.string()) }),
  handler: async (ctx) => {
    const s = await ctx.db.query("settings").order("desc").first();
    return { telegramBotToken: s?.telegramBotToken, tonDestinationWallet: s?.tonDestinationWallet, tonToStarsRate: s?.tonToStarsRate, appBaseUrl: (s as any)?.appBaseUrl, apiBaseUrl: (s as any)?.apiBaseUrl, tonNetwork: (s as any)?.tonNetwork, tonCollectionAddress: (s as any)?.tonCollectionAddress } as const;
  },
});

async function loadSettings(ctx: any) {
  const s = await ctx.runQuery(api.payments.getSettings, {});
  if (!s.telegramBotToken || !s.tonDestinationWallet || !s.tonToStarsRate || !s.appBaseUrl) {
    throw new Error("Settings mancanti: configura telegramBotToken, tonDestinationWallet, tonToStarsRate, appBaseUrl");
  }
  return {
    telegramBotToken: s.telegramBotToken,
    tonDestinationWallet: s.tonDestinationWallet,
    tonToStarsRate: s.tonToStarsRate,
    appBaseUrl: s.appBaseUrl,
    apiBaseUrl: s.apiBaseUrl,
  } as const;
}

function tonDeeplink(to: string, amountTon: number, comment: string) {
  const amountNano = Math.round(amountTon * 1e9);
  const toParam = encodeURIComponent(to);
  const textParam = encodeURIComponent(comment);
  // Prefer path variant for broad wallet support
  return `ton://transfer/${toParam}?amount=${amountNano}&text=${textParam}`;
}

export const getListingById = query({
  args: { listingId: v.id("listings") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId);
    return l ?? null;
  },
});

export const getOrderById = query({
  args: { orderId: v.id("orders") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.orderId);
    return o ?? null;
  },
});

export const findPendingOrderByPayload = query({
  args: { payload: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_starsPayload_and_status", (q) => q.eq("starsPayload", args.payload).eq("status", "pending"))
      .first();
    return order ?? null;
  },
});

export const createTonOrder = mutation({
  args: {
    listingId: v.id("listings"),
    buyer: v.string(),
    intent: v.optional(v.union(v.literal("BUY"), v.literal("BID"))),
    bidAmount: v.optional(v.number()), // espresso nella currency del listing
    bidId: v.optional(v.id("bids")),
  },
  returns: v.object({ orderId: v.id("orders"), deeplink: v.string(), comment: v.string() }),
  handler: async (ctx, args) => {
    const s = await loadSettings(ctx);
    if (!s.tonDestinationWallet) throw new Error("Config TON mancante");
    const listing = await ctx.db.get(args.listingId);
    if (!listing || !listing.active) throw new Error("Listing non disponibile");

    const intent = args.intent ?? "BUY";

    // Determina l'importo corretto
    let amount: number;
    if (intent === "BID") {
      if (!args.bidAmount) throw new Error("bidAmount richiesto per escrow offerta");
      amount = args.bidAmount;
    } else {
      amount = listing.price;
      const now = Date.now();
      if (listing.type === "auction") {
        const hb = listing.highestBidAmount ?? 0;
        const winner = listing.highestBidder ?? "";
        if (listing.buyNowPrice && winner === args.buyer && Math.abs(hb - listing.buyNowPrice) < 1e-9) {
          amount = listing.buyNowPrice;
        } else if ((listing.endsAt ?? 0) < now && winner === args.buyer && hb > 0) {
          amount = hb;
        } else {
          throw new Error("Per l'asta puoi pagare solo se hai fatto 'Compra subito' oppure se hai vinto (asta finita)");
        }
      }
    }

    // Importo in TON
    const amountTon = listing.currency === "TON" ? amount : Math.max(0.000001, amount / Math.max(1, s.tonToStarsRate));
    const comment = `order:${Date.now()}:${listing._id}:${intent}`;
    const deeplink = tonDeeplink(s.tonDestinationWallet, amountTon, comment);
    const orderId = await ctx.db.insert("orders", {
      listingId: listing._id,
      buyer: args.buyer,
      status: "pending",
      kind: intent,
      method: "TON",
      amount: amountTon,
      bidId: args.bidId,
      ton: { to: s.tonDestinationWallet, comment, deeplink, txHash: "", verified: false },
    });
    return { orderId, deeplink, comment } as const;
  },
});

export const verifyTonOrder = action({
  args: { orderId: v.id("orders") },
  returns: v.object({ verified: v.boolean() }),
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(api.payments.getOrderById, { orderId: args.orderId });
    if (!order || order.method !== "TON" || order.status !== "pending") return { verified: false };
    const comment = (order as any).ton!.comment as string;
    const toWallet = (order as any).ton!.to as string;

    // Retry/backoff semplice: 3 tentativi (0s, 2s, 4s)
    const delays = [0, 2000, 4000];
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
      try {
        const res = await fetch(`${TON_API}/v2/accounts/${encodeURIComponent(toWallet)}/transactions?limit=50`);
        if (!res.ok) continue;
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch {}
        const tx = (data?.transactions || []).find((t: any) => {
          const msg = t.in_msg ?? t.in_messages?.[0] ?? t.out_msgs?.[0] ?? t.message ?? null;
          const body = (msg && (msg.message || msg.comment || msg.body || msg.payload)) ?? "";
          return typeof body === "string" && body.includes(comment);
        });
        if (tx) {
          await ctx.runMutation(api.payments.internalMarkOrderPaid, {
            orderId: args.orderId,
            txHash: String(tx?.hash ?? tx?.transaction_id?.hash ?? ""),
          });
          return { verified: true } as const;
        }
      } catch {}
    }

    return { verified: false };
  },
});

export const createStarsInvoice = action({
  args: {
    listingId: v.id("listings"),
    buyer: v.string(),
    title: v.string(),
    description: v.string(),
    intent: v.optional(v.union(v.literal("BUY"), v.literal("BID"))),
    bidAmount: v.optional(v.number()), // espresso nella currency del listing
    bidId: v.optional(v.id("bids")),
  },
  returns: v.object({ orderId: v.id("orders"), invoiceLink: v.string() }),
  handler: async (ctx, args) => {
    const s = await loadSettings(ctx);
    if (!s.telegramBotToken) throw new Error("Config Telegram mancante");
    const listing = await ctx.runQuery(api.payments.getListingById, { listingId: args.listingId });
    if (!listing || !listing.active) throw new Error("Listing non disponibile");

    const intent = args.intent ?? "BUY";

    // Determina l'importo corretto (asta vs prezzo fisso)
    let amount = listing.price as number;
    const now = Date.now();
    if (intent === "BID") {
      if (!args.bidAmount) throw new Error("bidAmount richiesto per escrow offerta");
      amount = args.bidAmount;
    } else if (listing.type === "auction") {
      const hb = (listing as any).highestBidAmount ?? 0;
      const winner = (listing as any).highestBidder ?? "";
      if ((listing as any).buyNowPrice && winner === args.buyer && Math.abs(hb - (listing as any).buyNowPrice) < 1e-9) {
        amount = (listing as any).buyNowPrice;
      } else if (((listing as any).endsAt ?? 0) < now && winner === args.buyer && hb > 0) {
        amount = hb;
      } else {
        throw new Error("Per l'asta puoi pagare solo se hai fatto 'Compra subito' oppure se hai vinto (asta finita)");
      }
    }

    // Se il listing è in TON, converti in Stars
    const amountStars = (listing.currency === "STARS"
      ? Math.round(amount)
      : Math.max(1, Math.round(amount * Math.max(1, s.tonToStarsRate))));

    const payload = `order:${Date.now()}:${(listing as any)._id}:${intent}`;
    const commonInvoice = {
      title: args.title,
      description: args.description,
      payload,
      currency: "XTR",
      prices: [{ label: (listing as any).nft?.name ?? "Sticker", amount: amountStars }],
    } as any;

    let invoiceLink: string | null = null;
    try {
      const resp = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/createInvoiceLink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commonInvoice),
      });
      const bodyText = await resp.text();
      let json: any = null;
      try { json = JSON.parse(bodyText); } catch {}
      if (resp.ok && json?.ok && typeof json.result === 'string') {
        invoiceLink = json.result as string;
      } else {
        console.warn("Telegram createInvoiceLink non riuscita:", bodyText);
      }
    } catch (e) {
      console.warn("Errore rete createInvoiceLink:", e);
    }

    if (!invoiceLink) {
      // Usa direttamente lo username fornito dal bot (se disponibile) per evitare una getMe
      try {
        const meResp = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/getMe`);
        const t = await meResp.text();
        let me: any = null;
        try { me = JSON.parse(t); } catch {}
        const username: string = me?.ok ? me.result.username : "";
        const uname = username || "wallet";
        // Preferisci https per compatibilità su web e mobile
        invoiceLink = `https://t.me/${encodeURIComponent(uname)}?start=${encodeURIComponent(payload)}`;
      } catch {
        invoiceLink = `https://t.me/${encodeURIComponent("wallet")}?start=${encodeURIComponent(payload)}`;
      }
    }

    const orderId = await ctx.runMutation(api.payments.internalCreateStarsOrder, {
      listingId: (listing as any)._id,
      buyer: args.buyer,
      kind: intent,
      amount: amountStars,
      payload,
      invoiceLink,
      bidId: args.bidId,
    });

    await ctx.runMutation(api.payments.internalUpdateStarsPayload, { orderId, payload });

    return { orderId, invoiceLink } as const;
  },
});

export const handleTelegramWebhook = action({
  args: { update: v.any() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const s = await loadSettings(ctx);
    const update = args.update as any;
    const preCheckout = update.pre_checkout_query;
    const success = update.message?.successful_payment;
    const message = update.message;

    if (message?.text && typeof message.text === "string" && message.text.startsWith("/start")) {
      const parts = message.text.split(/\s+/);
      const payload = parts[1] ?? "";
      if (payload) {
        const order = await ctx.runQuery(api.payments.findPendingOrderByPayload, { payload });
        if (order) {
          const chatId = message.chat?.id;
          const title = "Acquisto Sticker";
          const description = "Paga con Telegram Stars";
          const amount = Math.max(1, Math.round((order as any).amount ?? 1));
          const sendBody = {
            chat_id: chatId,
            title,
            description,
            payload,
            currency: "XTR",
            prices: [{ label: "Sticker", amount }],
          } as any;
          await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/sendInvoice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sendBody),
          });
        }
      } else {
        // /start senza payload: mostra Web App e comandi rapidi
        const chatId = message.chat?.id;
        const keyboard = {
          keyboard: [
            [{ text: "🛍️ Marketplace", web_app: { url: s.appBaseUrl } }],
            [{ text: "⭐ Paga in Stars" }],
            [{ text: "💎 Paga in TON" }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        } as any;
        await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: "Benvenuto su Sticker Mark", reply_markup: keyboard }),
        });
      }
    }

    if (preCheckout) {
      await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/answerPreCheckoutQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pre_checkout_query_id: preCheckout.id, ok: true }),
      });
    }

    if (success) {
      const payload: string = success.invoice_payload;
      const order = await ctx.runQuery(api.payments.findPendingOrderByPayload, { payload });
      if (order) {
        await ctx.runMutation(api.payments.internalMarkStarsPaid, {
          orderId: (order as any)._id,
          telegramPaymentChargeId: success.telegram_payment_charge_id,
          providerPaymentChargeId: success.provider_payment_charge_id,
        });
      }
    }

    return { ok: true } as const;
  },
});

export const internalMarkOrderPaid = mutation({
  args: { orderId: v.id("orders"), txHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const listing = await ctx.db.get((order as any).listingId);
    if (!listing) return null;
    const nft = await ctx.db.get((listing as any).nftId);
    if (!nft) return null;

    if ((order as any).kind === 'BUY') {
      await ctx.db.patch(nft._id, { owner: (order as any).buyer });
      await ctx.db.patch(listing._id, { active: false });
      await ctx.db.patch(order._id, { status: "paid", ton: { ...(order as any).ton, verified: true, txHash: args.txHash } });
    } else {
      // Escrow BID: segna come pagato, marca la bid funded e aggiorna l'highest se supera
      await ctx.db.patch(order._id, { status: "paid", ton: { ...(order as any).ton, verified: true, txHash: args.txHash } });
      const bidId = (order as any).bidId;
      if (bidId) {
        const bid = await ctx.db.get(bidId);
        if (bid) {
          await ctx.db.patch(bid._id, { status: "funded", comment: (order as any).ton?.comment });
          const l = await ctx.db.get((order as any).listingId);
          if (l && (l.highestBidAmount ?? 0) + 1e-9 <= (bid as any).amount) {
            await ctx.db.patch(l._id, { highestBidAmount: (bid as any).amount, highestBidder: (bid as any).bidder });
          }
        }
      }
    }
    return null;
  },
});

export const internalCreateStarsOrder = mutation({
  args: { listingId: v.id("listings"), buyer: v.string(), kind: v.union(v.literal("BUY"), v.literal("BID")), amount: v.number(), payload: v.string(), invoiceLink: v.string(), bidId: v.optional(v.id("bids")) },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("orders", {
      listingId: args.listingId,
      buyer: args.buyer,
      status: "pending",
      kind: args.kind,
      method: "STARS",
      amount: args.amount,
      bidId: args.bidId,
      starsPayload: args.payload,
      stars: { invoiceLink: args.invoiceLink, payload: args.payload, telegramPaymentChargeId: "", providerPaymentChargeId: "" },
    });
    return id;
  },
});

export const internalUpdateStarsPayload = mutation({
  args: { orderId: v.id("orders"), payload: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, { starsPayload: args.payload });
    return null;
  },
});

export const internalMarkStarsPaid = mutation({
  args: { orderId: v.id("orders"), telegramPaymentChargeId: v.string(), providerPaymentChargeId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const listing = await ctx.db.get((order as any).listingId);
    if (!listing) return null;
    const nft = await ctx.db.get((listing as any).nftId);
    if (!nft) return null;

    if ((order as any).kind === 'BUY') {
      await ctx.db.patch(nft._id, { owner: (order as any).buyer });
      await ctx.db.patch(listing._id, { active: false });
      await ctx.db.patch(order._id, { status: "paid", stars: { ...(order as any).stars, telegramPaymentChargeId: args.telegramPaymentChargeId, providerPaymentChargeId: args.providerPaymentChargeId } });
    } else {
      // Escrow BID: segna come pagato, marca la bid funded e aggiorna l'highest se supera
      await ctx.db.patch(order._id, { status: "paid", stars: { ...(order as any).stars, telegramPaymentChargeId: args.telegramPaymentChargeId, providerPaymentChargeId: args.providerPaymentChargeId } });
      const bidId = (order as any).bidId;
      if (bidId) {
        const bid = await ctx.db.get(bidId);
        if (bid) {
          await ctx.db.patch(bid._id, { status: "funded", payload: (order as any).stars?.payload });
          const l = await ctx.db.get((order as any).listingId);
          if (l && (l.highestBidAmount ?? 0) + 1e-9 <= (bid as any).amount) {
            await ctx.db.patch(l._id, { highestBidAmount: (bid as any).amount, highestBidder: (bid as any).bidder });
          }
        }
      }
    }
    return null;
  },
});

export const setTelegramWebhook = action({
  args: { url: v.string() },
  returns: v.object({ ok: v.boolean(), response: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const s = await loadSettings(ctx);
    if (!s.telegramBotToken) throw new Error("Config Telegram mancante");
    try {
      const resp = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: args.url, allowed_updates: ["message","pre_checkout_query","callback_query","successful_payment"] }),
      });
      const text = await resp.text();
      return { ok: resp.ok, response: text } as const;
    } catch (e: any) {
      return { ok: false, response: String(e?.message || e) } as const;
    }
  },
});

// Aggiorna/crea le impostazioni correnti
export const upsertSettings = mutation({
  args: { telegramBotToken: v.optional(v.string()), tonDestinationWallet: v.optional(v.string()), tonToStarsRate: v.optional(v.number()), appBaseUrl: v.optional(v.string()), apiBaseUrl: v.optional(v.string()), clipdropApiKey: v.optional(v.string()), huggingfaceApiToken: v.optional(v.string()), tonNetwork: v.optional(v.union(v.literal("mainnet"), v.literal("testnet"))), tonCollectionAddress: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const current = await ctx.db.query("settings").order("desc").first();
    if (current) {
      await ctx.db.patch(current._id, {
        ...(args.telegramBotToken ? { telegramBotToken: args.telegramBotToken } : {}),
        ...(args.tonDestinationWallet ? { tonDestinationWallet: args.tonDestinationWallet } : {}),
        ...(typeof args.tonToStarsRate === 'number' ? { tonToStarsRate: args.tonToStarsRate } : {}),
        ...(args.appBaseUrl ? { appBaseUrl: args.appBaseUrl } : {}),
        ...(args.apiBaseUrl ? { apiBaseUrl: args.apiBaseUrl } : {}),
        ...(args.clipdropApiKey ? { clipdropApiKey: args.clipdropApiKey } : {}),
        ...(args.huggingfaceApiToken ? { huggingfaceApiToken: args.huggingfaceApiToken } : {}),
        ...(args.tonNetwork ? { tonNetwork: args.tonNetwork } : {}),
        ...(args.tonCollectionAddress ? { tonCollectionAddress: args.tonCollectionAddress } : {}),
      } as any);
    } else {
      await ctx.db.insert("settings", {
        telegramBotToken: args.telegramBotToken ?? "",
        tonDestinationWallet: args.tonDestinationWallet ?? "",
        tonToStarsRate: args.tonToStarsRate ?? 250,
        appBaseUrl: args.appBaseUrl,
        apiBaseUrl: args.apiBaseUrl,
        clipdropApiKey: args.clipdropApiKey,
        huggingfaceApiToken: args.huggingfaceApiToken,
        tonNetwork: args.tonNetwork,
        tonCollectionAddress: args.tonCollectionAddress,
      } as any);
    }
    return { ok: true } as const;
  },
});

// Restituisce lo username pubblico del bot (per costruire link corretti)
export const getBotUsername = action({
  args: {},
  returns: v.object({ ok: v.boolean(), username: v.optional(v.string()) }),
  handler: async (ctx) => {
    const s = await loadSettings(ctx);
    try {
      const me = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/getMe`);
      const text = await me.text();
      const json: any = JSON.parse(text);
      if (json?.ok && json.result?.username) {
        return { ok: true, username: json.result.username } as const;
      }
      return { ok: false } as const;
    } catch {
      return { ok: false } as const;
    }
  },
});

// Configura comando menu, menu button blu con Web App e reply keyboard
export const configureBotMenu = action({
  args: { baseUrl: v.string() },
  returns: v.object({ ok: v.boolean(), details: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const s = await loadSettings(ctx);
    const url = args.baseUrl || s.appBaseUrl;
    try {
      // 1) Comandi standard
      await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "market", description: "Apri il marketplace" },
            { command: "mint", description: "Mint di un nuovo sticker" },
            { command: "help", description: "Guida e supporto" },
          ],
          language_code: "it",
        }),
      });

      // 2) Menu blu a sinistra: punta alla Web App
      await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/setChatMenuButton`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu_button: {
            type: "web_app",
            text: "Gioca a Tapu Rush",
            web_app: { url },
          },
        }),
      });

      return { ok: true } as const;
    } catch (e: any) {
      return { ok: false, details: String(e?.message || e) } as const;
    }
  },
});

// Azione amministrativa: setta token+baseUrl in modo atomico e configura webhook/menu usando il token fornito
export const adminConfigureBot = action({
  args: { telegramBotToken: v.string(), baseUrl: v.string() },
  returns: v.object({ ok: v.boolean(), details: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    // Aggiorna impostazioni tramite mutation (nelle Action non è disponibile ctx.db)
    await ctx.runMutation(api.payments.upsertSettings, { telegramBotToken: args.telegramBotToken, appBaseUrl: args.baseUrl });

    // Configura webhook e menu usando il token fornito direttamente (evitiamo dipendere da loadSettings in caso di race)
    try {
      const webhookUrl = `${CONVEX_HTTP_BASE}/telegram/webhook`;
      // setWebhook
      await fetch(`https://api.telegram.org/bot${args.telegramBotToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message","pre_checkout_query","callback_query","successful_payment"] }),
      });

      // setMyCommands
      await fetch(`https://api.telegram.org/bot${args.telegramBotToken}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "market", description: "Apri il marketplace" },
            { command: "mint", description: "Mint di un nuovo sticker" },
            { command: "help", description: "Guida e supporto" },
          ],
          language_code: "it",
        }),
      });

      // setChatMenuButton -> menu blu a sinistra con Web App
      await fetch(`https://api.telegram.org/bot${args.telegramBotToken}/setChatMenuButton`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu_button: { type: "web_app", text: "Gioca a Tapu Rush", web_app: { url: args.baseUrl } } }),
      });

      return { ok: true } as const;
    } catch (e: any) {
      return { ok: false, details: String(e?.message || e) } as const;
    }
  },
});