// Wallet deeplink utilities for TON payments
// - Builds robust deeplinks (ton:// and https://) and opens them with multiple options
// - Parses an incoming ton://transfer link to derive alternatives and present a chooser prioritizing Telegram Wallet

import { Alert, Linking, Platform } from 'react-native';

export type TonTransferParts = {
  to: string;
  amountNano?: string; // amount in nanotons as string
  text?: string; // optional comment
};

function parseTonTransferUrl(url: string): TonTransferParts | null {
  // Expect: ton://transfer?to=ADDR&amount=NNN&text=COMMENT or ton://transfer/ADDR?amount=...&text=...
  if (!url.startsWith('ton://transfer')) return null;
  // Path variant
  if (url.startsWith('ton://transfer/')) {
    const after = url.slice('ton://transfer/'.length);
    const qIndex = after.indexOf('?');
    const toEncoded = qIndex === -1 ? after : after.slice(0, qIndex);
    const to = decodeURIComponent(toEncoded);
    const query = qIndex === -1 ? '' : after.slice(qIndex + 1);
    const params: Record<string, string> = {};
    if (query) {
      for (const kv of query.split('&')) {
        const [k, v] = kv.split('=');
        if (!k) continue;
        params[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
      }
    }
    const amountNano = params['amount'] ? String(params['amount']) : undefined;
    const text = params['text'] ? String(params['text']) : undefined;
    return { to, amountNano, text };
  }
  // Query variant
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const query = url.slice(qIndex + 1);
  const params: Record<string, string> = {};
  for (const kv of query.split('&')) {
    const [k, v] = kv.split('=');
    if (!k) continue;
    params[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
  }
  const to = params['to'] || '';
  if (!to) return null;
  const amountNano = params['amount'] ? String(params['amount']) : undefined;
  const text = params['text'] ? String(params['text']) : undefined;
  return { to, amountNano, text };
}

function buildTonkeeperHttpsLink(parts: TonTransferParts): string {
  const base = `https://app.tonkeeper.com/transfer/${encodeURIComponent(parts.to)}`;
  const qs: string[] = [];
  if (parts.amountNano) qs.push(`amount=${encodeURIComponent(parts.amountNano)}`);
  if (parts.text) qs.push(`text=${encodeURIComponent(parts.text)}`);
  return qs.length ? `${base}?${qs.join('&')}` : base;
}

function buildTonhubLink(parts: TonTransferParts): string {
  // tonhub://transfer/ADDRESS?amount=...&text=...
  const base = `tonhub://transfer/${encodeURIComponent(parts.to)}`;
  const qs: string[] = [];
  if (parts.amountNano) qs.push(`amount=${encodeURIComponent(parts.amountNano)}`);
  if (parts.text) qs.push(`text=${encodeURIComponent(parts.text)}`);
  return qs.length ? `${base}?${qs.join('&')}` : base;
}

function buildTonTransferPathVariant(parts: TonTransferParts): string {
  // ton://transfer/ADDRESS?amount=...&text=...
  const base = `ton://transfer/${encodeURIComponent(parts.to)}`;
  const qs: string[] = [];
  if (parts.amountNano) qs.push(`amount=${encodeURIComponent(parts.amountNano)}`);
  if (parts.text) qs.push(`text=${encodeURIComponent(parts.text)}`);
  return qs.length ? `${base}?${qs.join('&')}` : base;
}

function buildTelegramWalletAttach(): string {
  // Opens Telegram Wallet attach UI; user can choose TON transfer inside Wallet
  return 'https://t.me/wallet?attach=wallet';
}

function buildTelegramWalletAppScheme(): string {
  // tg:// scheme for Telegram app
  return 'tg://resolve?domain=wallet&attach=wallet';
}

async function openIfSupported(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function openTonPaymentWithAlternatives(primaryTonUrl: string): Promise<boolean> {
  // Attempt primary URL first, then a compatible https link for wallets like Tonkeeper, then Tonhub
  const parts = parseTonTransferUrl(primaryTonUrl);
  const candidates: string[] = [primaryTonUrl];
  if (parts) {
    candidates.push(buildTonTransferPathVariant(parts));
    candidates.push(buildTonkeeperHttpsLink(parts));
    candidates.push(buildTonhubLink(parts));
  }
  for (const url of candidates) {
    const ok = await openIfSupported(url);
    if (ok) return true;
  }
  // Try Telegram attach as a last resort
  const tgOk = (await openIfSupported(buildTelegramWalletAppScheme())) || (await openIfSupported(buildTelegramWalletAttach()));
  return tgOk;
}

export async function openTonPaymentChooser(primaryTonUrl: string): Promise<boolean> {
  // Trigger the transfer intent first; then offer options.
  const parts = parseTonTransferUrl(primaryTonUrl);
  const tonkeeper = parts ? buildTonkeeperHttpsLink(parts) : null;
  const tonhub = parts ? buildTonhubLink(parts) : null;
  const pathVariant = parts ? buildTonTransferPathVariant(parts) : null;
  const telegramHttps = buildTelegramWalletAttach();
  const telegramScheme = buildTelegramWalletAppScheme();

  // 1) Try to execute the transfer immediately (best UX)
  if (await openIfSupported(primaryTonUrl)) return true;
  if (pathVariant && (await openIfSupported(pathVariant))) return true;

  // 2) If Telegram Wallet is present, open it and forward the transfer intent
  const tgOpened = (await openIfSupported(telegramScheme)) || (await openIfSupported(telegramHttps));
  if (tgOpened) {
    // Give Telegram Wallet a moment to mount, then try to pass the transfer intent in multiple formats
    const forwarded = (await openIfSupported(primaryTonUrl)) || (pathVariant ? await openIfSupported(pathVariant) : false);
    if (forwarded) return true;
  }

  // 3) Offer a chooser for Tonhub/Tonkeeper/Other
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Scegli il wallet',
      'Seleziona il wallet con cui vuoi pagare in TON',
      [
        {
          text: 'Wallet Telegram',
          onPress: async () => {
            const ok1 = (await openIfSupported(telegramScheme)) || (await openIfSupported(telegramHttps));
            const ok2 = (await openIfSupported(primaryTonUrl)) || (pathVariant ? await openIfSupported(pathVariant) : false);
            resolve(Boolean(ok1 || ok2));
          },
        },
        {
          text: 'Tonhub',
          onPress: async () => {
            const ok = tonhub ? await openIfSupported(tonhub) : await openIfSupported(primaryTonUrl);
            resolve(ok);
          },
        },
        {
          text: 'Tonkeeper',
          onPress: async () => {
            const ok = tonkeeper ? await openIfSupported(tonkeeper) : await openIfSupported(primaryTonUrl);
            resolve(ok);
          },
        },
        {
          text: 'Altro',
          onPress: async () => {
            const ok = await openTonPaymentWithAlternatives(primaryTonUrl);
            resolve(ok);
          },
          style: 'default',
        },
        { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      ],
      { cancelable: true }
    );
  });
}