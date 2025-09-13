import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getSettings = query({
  args: {},
  returns: v.object({ clipdropApiKey: v.optional(v.string()), huggingfaceApiToken: v.optional(v.string()) }),
  handler: async (ctx) => {
    const s = await ctx.db.query("settings").order("desc").first();
    return { clipdropApiKey: s?.clipdropApiKey, huggingfaceApiToken: (s as any)?.huggingfaceApiToken } as const;
  },
});

export const getSignedUrl = query({
  args: { fileId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.fileId);
    return url;
  },
});

export const saveBytesToStorage = mutation({
  args: { bytes: v.bytes(), contentType: v.string() },
  returns: v.object({ fileId: v.id("_storage") }),
  handler: async (ctx, args) => {
    const fileId = await ctx.storage.store(new Blob([args.bytes], { type: args.contentType }));
    return { fileId } as const;
  },
});