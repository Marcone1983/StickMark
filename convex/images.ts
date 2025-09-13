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

export const removeBackgroundOpenSource = action({
  args: { fileId: v.id("_storage"), contentType: v.string() },
  returns: v.object({ fileId: v.id("_storage"), imageUrl: v.string() }),
  handler: async (ctx, args) => {
    // Usa Hugging Face Inference API (modello open-source briaai/RMBG-1.4)
    const settings = await ctx.runQuery(api.imagesData.getSettings, {});
    const hfToken = settings.huggingfaceApiToken; // opzionale, consigliato per stabilità

    const fileUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: args.fileId });
    if (!fileUrl) throw new Error("Impossibile ottenere URL file");

    const srcResp = await fetch(fileUrl);
    if (!srcResp.ok) throw new Error(`Download sorgente fallito: ${srcResp.status}`);
    const srcArrayBuf = await srcResp.arrayBuffer();

    const endpoint = "https://api-inference.huggingface.co/models/briaai/RMBG-1.4";
    const headers: Record<string, string> = {};
    if (hfToken) headers["Authorization"] = `Bearer ${hfToken}`;
    headers["Content-Type"] = args.contentType || "application/octet-stream";

    // Semplice retry per warmup del modello (503 con estimated_time)
    let outArray: ArrayBuffer | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const resp = await fetch(endpoint, { method: "POST", headers, body: srcArrayBuf });
      if (resp.ok) {
        outArray = await resp.arrayBuffer();
        break;
      }
      const txt = await resp.text().catch(() => "");
      // Se il modello è in warmup, attende e riprova
      if (resp.status === 503) {
        const wait = 1000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new Error(`Hugging Face error ${resp.status}: ${txt}`);
    }
    if (!outArray) throw new Error("Rimozione sfondo non riuscita (nessun output)");

    // Salva come PNG trasparente
    const saved = await ctx.runMutation(api.imagesData.saveBytesToStorage, { bytes: outArray, contentType: "image/png" });
    const outUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: saved.fileId });
    if (!outUrl) throw new Error("URL firmato mancante per il risultato");

    return { fileId: saved.fileId, imageUrl: outUrl } as const;
  },
});