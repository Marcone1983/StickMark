import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  stickers: defineTable({
    owner: v.string(), // telegram user id or username
    fileId: v.id("_storage"),
    name: v.string(),
    description: v.string(),
    imageUrl: v.string(), // signed url cached, regenerated on demand
  }).index("by_owner", ["owner"]),

  nfts: defineTable({
    owner: v.string(),
    stickerId: v.id("stickers"),
    name: v.string(),
    description: v.string(),
    imageUrl: v.string(),
    chain: v.union(v.literal("TON"), v.literal("STARS")),
    tokenId: v.string(), // on-chain or logical id
    metadataUrl: v.string(),
  }).index("by_owner", ["owner"]).index("by_sticker", ["stickerId"]),

  listings: defineTable({
    nftId: v.id("nfts"),
    seller: v.string(),
    // Prezzo base usato per i listing a prezzo fisso
    price: v.number(),
    currency: v.union(v.literal("TON"), v.literal("STARS")),
    active: v.boolean(),
    // Modalità vendita
    type: v.optional(v.union(v.literal("fixed"), v.literal("auction"))),
    // Campi d'asta (validi solo se type = 'auction')
    endsAt: v.optional(v.number()), // timestamp ms di fine (24h)
    minBid: v.optional(v.number()),
    buyNowPrice: v.optional(v.number()),
    bidIncrementPercent: v.optional(v.number()), // fisso 20%
    highestBidAmount: v.optional(v.number()),
    highestBidder: v.optional(v.string()),
  })
    .index("by_active", ["active"]) 
    .index("by_currency_and_active", ["currency", "active"]) 
    .index("by_nft", ["nftId"])
    .index("by_nft_and_active", ["nftId", "active"]),

  bids: defineTable({
    listingId: v.id("listings"),
    bidder: v.string(),
    amount: v.number(),
    createdAt: v.number(),
    // escrow fields
    status: v.optional(v.union(v.literal("pending"), v.literal("funded"))),
    method: v.optional(v.union(v.literal("TON"), v.literal("STARS"))),
    // stars escrow
    payload: v.optional(v.string()),
    // ton escrow
    comment: v.optional(v.string()),
  }).index("by_listing", ["listingId"]).index("by_listing_and_status", ["listingId", "status"]),

  orders: defineTable({
    listingId: v.id("listings"),
    buyer: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    // order kind: direct purchase (BUY) or escrow for a bid (BID)
    kind: v.optional(v.union(v.literal("BUY"), v.literal("BID"))),
    method: v.union(v.literal("TON"), v.literal("STARS")),
    amount: v.number(),
    // Link opzionale all'offerta (escrow)
    bidId: v.optional(v.id("bids")),
    // Optional payload indicizzato per gli ordini Stars (lookup webhook)
    starsPayload: v.optional(v.string()),
    // TON specific
    ton: v.optional(v.object({
      to: v.string(),
      comment: v.string(),
      deeplink: v.string(),
      txHash: v.string(),
      verified: v.boolean(),
    })),
    // Stars specific
    stars: v.optional(v.object({
      invoiceLink: v.string(),
      payload: v.string(),
      telegramPaymentChargeId: v.string(),
      providerPaymentChargeId: v.string(),
    })),
  }).index("by_listing", ["listingId"]).index("by_status", ["status"]).index("by_starsPayload_and_status", ["starsPayload", "status"]),

  // Impostazioni di produzione (valori sensibili e tassi)
  settings: defineTable({
    // Inserisci un solo documento: l'ultimo valido
    telegramBotToken: v.string(),
    tonDestinationWallet: v.string(),
    tonToStarsRate: v.number(), // quante Stars per 1 TON (es. 250)
    // Base URL pubblico dell'app per bot Web App
    appBaseUrl: v.optional(v.string()),
    // API key opzionale per rimozione sfondo (ClipDrop)
    clipdropApiKey: v.optional(v.string()),
    // Token opzionale Hugging Face per rimozione sfondo open-source
    huggingfaceApiToken: v.optional(v.string()),
  }),
});