import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Linking, Alert, Platform } from 'react-native';
import HeaderBack from '../components/HeaderBack';
import { useAction } from 'convex/react';
import { api } from "../convex/_generated/api";

export default function ConnectWalletScreen() {
  const [address, setAddress] = useState('');
  const getBotUsername = useAction(api.payments.getBotUsername);
  const [botUname, setBotUname] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const res = await getBotUsername({});
        if (res.ok && res.username) setBotUname(res.username);
      } catch {}
    })();
  }, [getBotUsername]);

  const baseUrl = useMemo(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'https://sticker-mint-nft-1754691872344.app.a0.dev';
  }, []);

  // Use Convex public HTTP router for the manifest (this is where /tonconnect-manifest.json is served)
  const convexHttpBase = 'https://agreeable-meadowlark-896.convex.site';
  const manifestUrl = `${convexHttpBase}/tonconnect-manifest.json`;

  const tonkeeperLink = `https://app.tonkeeper.com/ton-connect?manifestUrl=${encodeURIComponent(manifestUrl)}`;
  const tonconnectUniversal = `tonconnect://connect?manifest=${encodeURIComponent(manifestUrl)}`;
  const tgTonconnect = `tg://resolve?domain=wallet&startattach=tonconnect`;
  const telegramWallet = 'https://t.me/wallet?attach=wallet';
  const botLink = `https://t.me/${botUname || 'NFTSTIBOT'}`;

  const save = () => {
    if (!address || address.length < 5) {
      Alert.alert('Indirizzo non valido');
      return;
    }
    Alert.alert('Wallet collegato', 'Indirizzo salvato: ' + address);
  };

  const openTonkeeperConnect = async () => {
    try {
      await Linking.openURL(tonkeeperLink);
    } catch (e: any) {
      Alert.alert('Impossibile aprire Tonkeeper', e?.message || '');
    }
  };
  const openUniversalTonConnect = async () => {
    try {
      const okTg = await Linking.canOpenURL(tgTonconnect);
      if (okTg) {
        await Linking.openURL(tgTonconnect);
        return;
      }
    } catch {}
    try {
      await Linking.openURL(tonconnectUniversal);
    } catch {
      try { await Linking.openURL(telegramWallet); } catch (e: any) { Alert.alert('Impossibile avviare TonConnect', e?.message || ''); }
    }
  };
  const openTelegramWallet = async () => {
    try {
      await Linking.openURL(telegramWallet);
    } catch (e: any) {
      Alert.alert('Impossibile aprire Wallet Telegram', e?.message || '');
    }
  };
  const openBot = async () => {
    try {
      await Linking.openURL(botLink);
    } catch (e: any) {
      Alert.alert('Errore apertura bot', e?.message || '');
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBack title="Connetti Wallet" />
      <Text style={styles.title}>Connetti il tuo Wallet TON</Text>
      <Text style={styles.subtitle}>Indirizzo manuale, TonConnect o Wallet Telegram</Text>

      <Text style={styles.label}>Indirizzo TON</Text>
      <TextInput
        placeholder="Es. UQ..."
        placeholderTextColor="#6B7280"
        value={address}
        onChangeText={setAddress}
        style={styles.input}
        autoCapitalize="none"
      />

      <Pressable onPress={save} style={[styles.cta, { backgroundColor: '#22C55E' }]}>
        <Text style={styles.ctaText}>Salva indirizzo</Text>
      </Pressable>

      <View style={{ gap: 10, marginTop: 16 }}>
        <Pressable onPress={openUniversalTonConnect} style={[styles.cta, { backgroundColor: '#24A1DE' }]}>
          <Text style={styles.ctaText}>Connetti via TonConnect (Wallet Telegram)</Text>
        </Pressable>
        <Pressable onPress={openTonkeeperConnect} style={[styles.cta, { backgroundColor: '#18A1FF' }]}>
          <Text style={styles.ctaText}>Connetti con Tonkeeper</Text>
        </Pressable>
        <Pressable onPress={openTelegramWallet} style={[styles.cta, { backgroundColor: '#0EA5E9' }]}>
          <Text style={styles.ctaText}>Apri Wallet Telegram</Text>
        </Pressable>
        <Pressable onPress={openBot} style={[styles.cta, { backgroundColor: '#0284C7' }]}>
          <Text style={styles.ctaText}>Apri il Bot Telegram</Text>
        </Pressable>
        <Text style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }}>Manifest TonConnect: {manifestUrl}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14', padding: 16 },
  title: { color: 'white', fontSize: 20, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#8AA2B6', marginTop: 4, marginBottom: 12 },
  label: { color: '#E5E7EB', marginBottom: 6 },
  input: { backgroundColor: '#0B1320', color: 'white', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1B2737' },
  cta: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#0B0B0C', fontWeight: '800' },
});