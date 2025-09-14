// Wallet deeplink utilities for TON payments
// - Builds robust deeplinks (ton:// and https://) and opens them with multiple options
// - Parses an incoming ton://transfer link to derive alternatives and present a chooser prioritizing Telegram Wallet

import { Platform, Linking } from 'react-native';

export async function openTonPaymentChooser(deeplink: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      // Try Telegram desktop/app schema first
      const tg = deeplink.replace('ton://transfer/', 'tg://resolve?domain=wallet&startattach=');
      try { await Linking.openURL(tg); return true; } catch {}
      try { await Linking.openURL(deeplink); return true; } catch {}
      const https = deeplink.replace('ton://transfer/', 'https://tonhub.com/transfer/');
      await Linking.openURL(https);
      return true;
    }
    await Linking.openURL(deeplink);
    return true;
  } catch {
    return false;
  }
}

export async function openTonPaymentWithAlternatives(to: string, amountNano: number, text: string) {
  const params = new URLSearchParams({ amount: String(amountNano), text });
  const ton = `ton://transfer/${encodeURIComponent(to)}?${params.toString()}`;
  return openTonPaymentChooser(ton);
}