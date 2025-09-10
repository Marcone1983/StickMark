import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listActive = query({
  args: { currency: v.optional(v.union(v.literal("TON"), v.literal("STARS"))) },
  returns: v.array(
    v.object({
      _id: v.id("listings"),
      _creationTime: v.number(),
      price: v.number(),
      currency: v.union(v.literal("TON"), v.literal("STARS")),
      active: v.boolean(),
      seller: v.string(),
      // campi d'asta opzionali
      type: v.optional(v.union(v.literal("fixed"), v.literal("auction"))),
      endsAt: v.optional(v.number()),
      minBid: v.optional(v.number()),
      buyNowPrice: v.optional(v.number()),
      bidIncrementPercent: v.optional(v.number()),
      highestBidAmount: v.optional(v.number()),
      highestBidder: v.optional(v.string()),
      nft: v.object({
        _id: v.id("nfts"),
        owner: v.string(),
        name: v.string(),
        description: v.string(),
        imageUrl: v.string(),
        chain: v.union(v.literal("TON"), v.literal("STARS")),
        tokenId: v.string(),
      }),
    })
  ),
  handler: async (ctx, args) => {
    const q = args.currency
      ? ctx.db
          .query("listings")
          .withIndex("by_currency_and_active", (q) => q.eq("currency", args.currency!).eq("active", true))
      : ctx.db.query("listings").withIndex("by_active", (q) => q.eq("active", true));

    const listings = await q.collect();

    const out = await Promise.all(
      listings.map(async (l) => {
        const nft = await ctx.db.get(l.nftId);
        if (!nft) return null;
        return {
          _id: l._id,
          _creationTime: l._creationTime,
          price: l.price,
          currency: l.currency,
          active: l.active,
          seller: l.seller,
          type: l.type,
          endsAt: l.endsAt,
          minBid: l.minBid,
          buyNowPrice: l.buyNowPrice,
          bidIncrementPercent: l.bidIncrementPercent,
          highestBidAmount: l.highestBidAmount,
          highestBidder: l.highestBidder,
          nft: {
            _id: nft._id,
            owner: nft.owner,
            name: nft.name,
            description: nft.description,
            imageUrl: nft.imageUrl,
            chain: nft.chain,
            tokenId: nft.tokenId,
          },
        } as const;
      })
    );

    return out.filter((x): x is NonNullable<typeof x> => x !== null);
  },
});

export const publicSettings = query({
  args: {},
  returns: v.object({ tonToStarsRate: v.number() }),
  handler: async (ctx) => {
    const s = await ctx.db.query("settings").order("desc").first();
    return { tonToStarsRate: s?.tonToStarsRate ?? 250 } as const;
  },
});

export const getUploadUrl = mutation({
  args: { contentType: v.string() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    // Use Convex storage API to generate a one-time upload URL (support old/new SDKs)
    const s: any = ctx.storage as any;
    const url: string = s.generateUploadUrl
      ? await s.generateUploadUrl()
      : await s.getUploadUrl();
    return { url } as const;
  },
});

export const saveStickerRecord = mutation({
  args: { fileId: v.id("_storage"), contentType: v.string() },
  returns: v.object({ imageUrl: v.string() }),
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.fileId);
    if (!url) throw new Error("Failed to generate image URL");
    // Only return a signed URL for the uploaded file; do not insert a stickers row here.
    return { imageUrl: url } as const;
  },
});

export const createSticker = mutation({
  args: {
    owner: v.string(),
    fileId: v.id("_storage"),
    name: v.string(),
    description: v.string(),
    imageUrl: v.string(),
  },
  returns: v.object({ _id: v.id("stickers") }),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("stickers", {
      owner: args.owner,
      fileId: args.fileId,
      name: args.name,
      description: args.description,
      imageUrl: args.imageUrl,
    });
    return { _id: id } as const;
  },
});

export const mintNft = mutation({
  args: {
    owner: v.string(),
    stickerId: v.id("stickers"),
    name: v.string(),
    description: v.string(),
    imageUrl: v.string(),
    chain: v.union(v.literal("TON"), v.literal("STARS")),
    tokenId: v.string(),
    metadataUrl: v.string(),
  },
  returns: v.object({ _id: v.id("nfts") }),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("nfts", {
      owner: args.owner,
      stickerId: args.stickerId,
      name: args.name,
      description: args.description,
      imageUrl: args.imageUrl,
      chain: args.chain,
      tokenId: args.tokenId,
      metadataUrl: args.metadataUrl,
    });
    return { _id: id } as const;
  },
});

export const createListing = mutation({
  args: {
    nftId: v.id("nfts"),
    seller: v.string(),
    price: v.number(),
    currency: v.union(v.literal("TON"), v.literal("STARS")),
  },
  returns: v.object({ _id: v.id("listings") }),
  handler: async (ctx, args) => {
    const nft = await ctx.db.get(args.nftId);
    if (!nft) throw new Error("NFT not found");
    if (nft.owner !== args.seller) throw new Error("Not owner");

    const id = await ctx.db.insert("listings", {
      nftId: args.nftId,
      seller: args.seller,
      price: args.price,
      currency: args.currency,
      active: true,
      type: "fixed",
    });
    return { _id: id } as const;
  },
});

export const createAuction = mutation({
  args: {
    nftId: v.id("nfts"),
    seller: v.string(),
    currency: v.union(v.literal("TON"), v.literal("STARS")),
    minBid: v.number(),
    buyNowPrice: v.number(),
  },
  returns: v.object({ _id: v.id("listings") }),
  handler: async (ctx, args) => {
    const nft = await ctx.db.get(args.nftId);
    if (!nft) throw new Error("NFT not found");
    if (nft.owner !== args.seller) throw new Error("Not owner");

    const endsAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
    const id = await ctx.db.insert("listings", {
      nftId: args.nftId,
      seller: args.seller,
      price: args.minBid,
      currency: args.currency,
      active: true,
      type: "auction",
      endsAt,
      minBid: args.minBid,
      buyNowPrice: args.buyNowPrice,
      bidIncrementPercent: 20,
      highestBidAmount: args.minBid,
      highestBidder: "",
    });
    return { _id: id } as const;
  },
});

export const placeBid = mutation({
  args: { listingId: v.id("listings"), bidder: v.string(), amount: v.number(), method: v.optional(v.union(v.literal("TON"), v.literal("STARS"))) },
  returns: v.object({ ok: v.boolean(), bidId: v.optional(v.id("bids")), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId);
    if (!l || !l.active) return { ok: false, reason: "Listing non attivo" } as const;
    if (l.type !== "auction") return { ok: false, reason: "Non è un'asta" } as const;
    if ((l.endsAt ?? 0) < Date.now()) return { ok: false, reason: "Asta scaduta" } as const;

    const base = Math.max(l.minBid ?? 0, l.highestBidAmount ?? 0);
    const minNext = base * (1 + (l.bidIncrementPercent ?? 20) / 100);
    if (args.amount + 1e-9 < minNext) {
      return { ok: false, reason: `Offerta troppo bassa. Minimo: ${minNext.toFixed(6)} ${l.currency}` } as const;
    }

    // Registra la bid (escrow pendente). Non aggiorniamo highest finché non è funded.
    const bidId = await ctx.db.insert("bids", { listingId: l._id, bidder: args.bidder, amount: args.amount, createdAt: Date.now(), status: "pending", method: args.method });
    return { ok: true, bidId } as const;
  },
});

export const buyNowAuction = mutation({
  args: { listingId: v.id("listings"), buyer: v.string() },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId);
    if (!l || !l.active) return { ok: false, reason: "Listing non attivo" } as const;
    if (l.type !== "auction") return { ok: false, reason: "Non è un'asta" } as const;
    if ((l.endsAt ?? 0) < Date.now()) return { ok: false, reason: "Asta scaduta" } as const;

    if (!l.buyNowPrice) return { ok: false, reason: "Prezzo 'compra subito' non impostato" } as const;

    // Non trasferiamo qui: il pagamento effettivo avviene con TON/Stars come per i fixed
    // Qui chiudiamo l'asta e settiamo highestBid come buyNow per coerenza
    await ctx.db.patch(l._id, { highestBidAmount: l.buyNowPrice, highestBidder: args.buyer });
    return { ok: true } as const;
  },
});

export const finalizeAuction = mutation({
  args: { listingId: v.id("listings") },
  returns: v.object({ ok: v.boolean(), winner: v.optional(v.string()), amount: v.optional(v.number()), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId);
    if (!l) return { ok: false, reason: "Listing inesistente" } as const;
    if (l.type !== "auction") return { ok: false, reason: "Non è un'asta" } as const;
    if ((l.endsAt ?? 0) > Date.now()) return { ok: false, reason: "Asta non ancora finita" } as const;

    if (!l.highestBidder || !l.highestBidAmount) return { ok: false, reason: "Nessuna offerta valida" } as const;

    // Chiude l'asta. Il trasferimento effettivo dell'NFT avviene quando l'ordine viene pagato (TON/Stars)
    await ctx.db.patch(l._id, { active: false });
    return { ok: true, winner: l.highestBidder, amount: l.highestBidAmount } as const;
  },
});

export const finalizeAuctionAndSettle = mutation({
  args: { listingId: v.id("listings") },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId);
    if (!l) return { ok: false, reason: "Listing inesistente" } as const;
    if (l.type !== "auction") return { ok: false, reason: "Non è un'asta" } as const;
    if ((l.endsAt ?? 0) > Date.now()) return { ok: false, reason: "Asta non ancora finita" } as const;
    if (!l.highestBidder || !l.highestBidAmount) return { ok: false, reason: "Nessuna offerta valida" } as const;

    // Trova un bid funded che corrisponde al top (highest)
    const fundedBids = await ctx.db
      .query("bids")
      .withIndex("by_listing_and_status", (q) => q.eq("listingId", l._id).eq("status", "funded" as any))
      .collect();
    const winnerBid = fundedBids.find((b) => b.bidder === l.highestBidder && Math.abs(b.amount - (l.highestBidAmount ?? 0)) < 1e-9);
    if (!winnerBid) return { ok: false, reason: "Nessun escrow valido per il vincitore" } as const;

    const nft = await ctx.db.get(l.nftId);
    if (!nft) return { ok: false, reason: "NFT mancante" } as const;

    await ctx.db.patch(nft._id, { owner: l.highestBidder });
    await ctx.db.patch(l._id, { active: false });
    return { ok: true } as const;
  },
});

export const cancelListing = mutation({
  args: { listingId: v.id("listings"), requester: v.string() },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId);
    if (!l) return { ok: false, reason: "Listing inesistente" } as const;
    const nft = await ctx.db.get(l.nftId);
    const authorized = l.seller === args.requester || (nft && nft.owner === args.requester);
    if (!authorized) return { ok: false, reason: "Non autorizzato" } as const;
    await ctx.db.patch(l._id, { active: false });
    return { ok: true } as const;
  },
});

export const removeListing = mutation({
  args: { listingId: v.id("listings"), requester: v.string() },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.listingId);
    if (!l) return { ok: false, reason: "Listing inesistente" } as const;
    const nft = await ctx.db.get(l.nftId);
    const authorized = l.seller === args.requester || (nft && nft.owner === args.requester);
    if (!authorized) return { ok: false, reason: "Non autorizzato" } as const;
    // Rimuovi completamente il record per evitare ri-visualizzazione
    await ctx.db.delete(l._id);
    return { ok: true } as const;
  },
});

export const deleteNft = mutation({
  args: { nftId: v.id("nfts"), owner: v.string() },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const nft = await ctx.db.get(args.nftId);
    if (!nft) return { ok: false, reason: "NFT inesistente" } as const;
    if (nft.owner !== args.owner) return { ok: false, reason: "Non autorizzato" } as const;

    // Non permettere se è listato attivo (usa indice combinato)
    const activeListing = await ctx.db
      .query("listings")
      .withIndex("by_nft_and_active", (q) => q.eq("nftId", nft._id).eq("active", true))
      .first();
    if (activeListing) return { ok: false, reason: "NFT attualmente in vendita" } as const;

    await ctx.db.delete(nft._id);
    return { ok: true } as const;
  },
});