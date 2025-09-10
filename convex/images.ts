"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const removeBackground = action({
  args: { fileId: v.id("_storage"), contentType: v.string() },
  returns: v.object({ fileId: v.id("_storage"), imageUrl: v.string() }),
  handler: async (ctx, args) => {
    // Carica settings per recuperare la chiave API ClipDrop
    const settings = await ctx.runQuery(api.imagesData.getSettings, {});
    const apiKey = settings.clipdropApiKey;
    if (!apiKey) {
      throw new Error("Servizio rimozione sfondo non configurato: manca clipdropApiKey in settings");
    }

    // Scarica il file dalla storage URL
    const fileUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: args.fileId });
    if (!fileUrl) throw new Error("Impossibile ottenere URL file");

    const srcResp = await fetch(fileUrl);
    if (!srcResp.ok) throw new Error(`Download sorgente fallito: ${srcResp.status}`);
    const srcArrayBuf = await srcResp.arrayBuffer();

    // Chiamata ClipDrop remove-background
    const formData = new FormData();
    formData.append("image_file", new Blob([srcArrayBuf], { type: args.contentType }), "image" );

    const clipResp = await fetch("https://clipdrop-api.co/remove-background/v1", {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: formData as any,
    });
    if (!clipResp.ok) {
      const text = await clipResp.text().catch(() => "");
      throw new Error(`ClipDrop error ${clipResp.status}: ${text}`);
    }
    const resultArray = await clipResp.arrayBuffer();

    // Salva il risultato su storage Convex
    const saved = await ctx.runMutation(api.imagesData.saveBytesToStorage, { bytes: resultArray, contentType: "image/png" });
    const outUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: saved.fileId });
    if (!outUrl) throw new Error("URL firmato mancante per il risultato");

    return { fileId: saved.fileId, imageUrl: outUrl } as const;
  },
});