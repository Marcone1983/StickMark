import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAction } from 'convex/react';
import { api } from "../convex/_generated/api";

export default function HomeScreen() {
  const navigation = useNavigation();
  const configureBotMenu = useAction(api.payments.configureBotMenu);
  const getBotUsername = useAction(api.payments.getBotUsername);
  const [botUname, setBotUname] = useState<string>('');

  const baseUrl = useMemo(() => {
    return 'https://sticker-mint-nft-1754691872344.app.a0.dev';
  }, []);

  useEffect(() => {
    (async () => {
      // Configura solo il menu blu usando le settings correnti (token e baseUrl già impostati via pannello/admin)
      try { await configureBotMenu({ baseUrl }); } catch {}
      try {
        const res = await getBotUsername({});
        if (res.ok && res.username) setBotUname(res.username);
      } catch {}
    })();
  }, [baseUrl, configureBotMenu, getBotUsername]);

  const actions = useMemo(
    () => [
      { label: 'Carica Sticker', subtitle: 'PNG/WebP trasparente, max 512x512', route: 'UploadSticker' },
      { label: 'Crea Sticker da immagine', subtitle: 'Carica una foto, rimuovi lo sfondo, poi mint', route: 'CreateSticker' },
      { label: 'Mint NFT', subtitle: 'Trasforma lo sticker in NFT', route: 'Mint' },
      { label: 'Marketplace', subtitle: 'Compra e vendi gli sticker', route: 'Marketplace' },
      { label: 'Connetti Wallet TON', subtitle: 'Tonkeeper, Tonhub o Wallet Telegram', route: 'ConnectWallet' },
      { label: 'Impostazioni', subtitle: 'Token bot, URL App/API, TON collection', route: 'AdminSettings' },
    ],
    []
  );

  const openBot = () => {
    const uname = botUname || 'wallet';
    const url = `https://t.me/${uname}`;
    // @ts-ignore
    if (typeof window !== 'undefined') window.open(url, '_blank');
  };

  // Usa direttamente l'URL remoto per il logo (il file locale non è un asset binario)
  const LOGO_URL = 'https://nabdgzjpwhkjfimljnql.supabase.co/storage/v1/object/public/project_assets/faecd4f3-781e-4590-ae31-c9e1e6b3dcdc/assets/1689c808-e7eb-4643-b678-4f34773f7363_1000193689.png';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image source={{ uri: LOGO_URL }} style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Sticker Mark</Text>
          <Text style={styles.subtitle}>Carica, crea, mint, vendi i tuoi sticker come NFT. Paga in TON o Stars.</Text>
        </View>
      </View>

      <Pressable onPress={openBot} style={({ pressed }) => [styles.botCta, pressed && { opacity: 0.9 }]}>
        <Text style={styles.botCtaText}>Apri Bot Telegram</Text>
      </Pressable>

      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable key={a.route} onPress={() => navigation.navigate(a.route as never)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
            <Text style={styles.cardTitle}>{a.label}</Text>
            <Text style={styles.cardSubtitle}>{a.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14', paddingHorizontal: 16, paddingTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  logo: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#0E1622', borderWidth: 1, borderColor: '#1B2737' },
  title: { fontSize: 22, fontWeight: '800', color: 'white', marginBottom: 4 },
  subtitle: { color: '#8AA2B6' },
  botCta: { backgroundColor: '#24A1DE', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  botCtaText: { color: '#041014', fontWeight: '900' },
  actions: { gap: 12 },
  card: { backgroundColor: '#0E1622', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1B2737' },
  cardTitle: { color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardSubtitle: { color: '#8AA2B6' },
});