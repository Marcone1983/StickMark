"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const removeBackground = action({
  args: { fileId: v.id("_storage"), contentType: v.string() },
  returns: v.object({ fileId: v.id("_storage"), imageUrl: v.string() }),
  handler: async (ctx, args) => {
    // Carica settings per recuperare provider e chiavi/URL
    const settings = await ctx.runQuery(api.imagesData.getSettings, {});
    const provider = settings.bgRemovalProvider || (settings.rembgUrl ? 'rembg' : (settings.clipdropApiKey ? 'clipdrop' : null));
    if (!provider) {
      throw new Error("Rimozione sfondo non configurata: imposta un endpoint Rembg (gratuito) o una chiave ClipDrop");
    }

    // Scarica il file dalla storage URL
    const fileUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: args.fileId });
    if (!fileUrl) throw new Error("Impossibile ottenere URL file");

    const srcResp = await fetch(fileUrl);
    if (!srcResp.ok) throw new Error(`Download sorgente fallito: ${srcResp.status}`);
    const srcArrayBuf = await srcResp.arrayBuffer();

    let resultArray: ArrayBuffer | null = null;

    if (provider === 'rembg') {
      const rembgUrl = settings.rembgUrl!; // validato sopra
      // API tipica Rembg self-host: POST binary e ritorna PNG trasparente
      const rembgResp = await fetch(rembgUrl, {
        method: 'POST',
        headers: { 'Content-Type': args.contentType || 'application/octet-stream' },
        body: srcArrayBuf as any,
      });
      if (!rembgResp.ok) {
        const text = await rembgResp.text().catch(() => "");
        throw new Error(`Rembg error ${rembgResp.status}: ${text}`);
      }
      resultArray = await rembgResp.arrayBuffer();
    } else {
      const apiKey = settings.clipdropApiKey!;
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
      resultArray = await clipResp.arrayBuffer();
    }

    // Salva il risultato su storage Convex
    const saved = await ctx.runMutation(api.imagesData.saveBytesToStorage, { bytes: resultArray!, contentType: "image/png" });
    const outUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: saved.fileId });
    if (!outUrl) throw new Error("URL firmato mancante per il risultato");

    return { fileId: saved.fileId, imageUrl: outUrl } as const;
  },
});