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
    const hfToken = (settings as any)?.huggingfaceApiToken; // opzionale, non richiesto: presente solo se vuoi throughput dedicato

    const fileUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: args.fileId });
    if (!fileUrl) throw new Error("Impossibile ottenere URL file");

    const srcResp = await fetch(fileUrl);
    if (!srcResp.ok) throw new Error(`Download sorgente fallito: ${srcResp.status}`);
    const srcArrayBuf = await srcResp.arrayBuffer();

    // Helper: converte ArrayBuffer in data URI base64
    const base64 = Buffer.from(srcArrayBuf).toString("base64");
    const dataUri = `data:${args.contentType || "image/png"};base64,${base64}`;

    // 1) Tentativo preferito: endpoint modello HF ufficiale (se token disponibile)
    if (hfToken) {
      try {
        const endpoint = "https://api-inference.huggingface.co/models/briaai/RMBG-1.4";
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": args.contentType || "application/octet-stream" },
          body: srcArrayBuf,
        });
        if (resp.ok) {
          const outArray = await resp.arrayBuffer();
          const saved = await ctx.runMutation(api.imagesData.saveBytesToStorage, { bytes: outArray, contentType: "image/png" });
          const outUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: saved.fileId });
          if (!outUrl) throw new Error("URL firmato mancante per il risultato");
          return { fileId: saved.fileId, imageUrl: outUrl } as const;
        }
        // Se dà rate limit o warmup, prosegui con l'endpoint pubblico
      } catch {
        // Ignora, passa all'endpoint pubblico
      }
    }

    // 2) Alternativa pubblica senza token: Hugging Face Spaces (endpoint Gradio)
    // API: POST https://hf.space/embed/briaai/RMBG-1.4/api/predict
    // Body: { data: ["data:image/...;base64,...."] }
    // Risposta: { data: [ "data:image/png;base64,..." ] } o strutture simili. Effettuiamo parsing robusto.
    const candidates = [
      "https://hf.space/embed/briaai/RMBG-1.4/api/predict",
    ];

    let outputDataUri: string | null = null;
    for (const url of candidates) {
      try {
        // piccola attesa random per evitare throttling in cluster
        await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 100)));
        const grResp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: [dataUri] }),
        });
        const text = await grResp.text();
        if (!grResp.ok) {
          continue;
        }
        let json: any = null;
        try { json = JSON.parse(text); } catch {
          // Prova a cercare una data URI direttamente nel testo
          const idx = text.indexOf("data:image");
          if (idx >= 0) outputDataUri = text.slice(idx).split('"')[0];
        }
        // Estrattore robusto per data URI annidato
        const extractDataUri = (node: any): string | null => {
          if (!node) return null;
          if (typeof node === "string" && node.startsWith("data:image")) return node;
          if (Array.isArray(node)) {
            for (const it of node) { const v = extractDataUri(it); if (v) return v; }
          } else if (typeof node === "object") {
            for (const k of Object.keys(node)) { const v = extractDataUri((node as any)[k]); if (v) return v; }
          }
          return null;
        };
        if (!outputDataUri && json) {
          outputDataUri = extractDataUri(json);
        }
        if (outputDataUri) break;
      } catch {
        // prova il prossimo candidato
      }
    }

    if (!outputDataUri) {
      throw new Error("Rimozione sfondo non disponibile al momento (endpoint pubblico). Riprova tra qualche secondo.");
    }

    // Converte la data URI in bytes
    const commaIdx = outputDataUri.indexOf(",");
    const b64Out = commaIdx >= 0 ? outputDataUri.slice(commaIdx + 1) : outputDataUri;
    const outBytes = Buffer.from(b64Out, "base64");

    // Salva come PNG trasparente
    const saved = await ctx.runMutation(api.imagesData.saveBytesToStorage, { bytes: outBytes, contentType: "image/png" });
    const outUrl = await ctx.runQuery(api.imagesData.getSignedUrl, { fileId: saved.fileId });
    if (!outUrl) throw new Error("URL firmato mancante per il risultato");

    return { fileId: saved.fileId, imageUrl: outUrl } as const;
  },
});