import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Platform, ScrollView } from 'react-native';
import HeaderBack from '../components/HeaderBack';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';

export default function AdminSettingsScreen() {
  const current = useQuery(api.payments.getSettings, {});
  const upsert = useMutation(api.payments.upsertSettings);
  const setWebhook = useAction(api.payments.setTelegramWebhook);
  const configureMenu = useAction(api.payments.configureBotMenu);

  const [telegramBotToken, setTelegramBotToken] = useState(current?.telegramBotToken ?? '');
  const [tonDestinationWallet, setTonDestinationWallet] = useState(current?.tonDestinationWallet ?? '');
  const [tonToStarsRate, setTonToStarsRate] = useState(String(current?.tonToStarsRate ?? 250));
  const [appBaseUrl, setAppBaseUrl] = useState(current?.appBaseUrl ?? '');
  const [apiBaseUrl, setApiBaseUrl] = useState((current as any)?.apiBaseUrl ?? 'https://agreeable-meadowlark-896.convex.site');
  const [tonNetwork, setTonNetwork] = useState<'mainnet' | 'testnet'>((current?.tonNetwork as any) || 'mainnet');
  const [tonCollectionAddress, setTonCollectionAddress] = useState(current?.tonCollectionAddress ?? '');

  const convexHttpBase = 'https://agreeable-meadowlark-896.convex.site';
  const webhookUrl = `${apiBaseUrl || convexHttpBase}/telegram/webhook`;

  const save = async () => {
    try {
      const rate = Number(tonToStarsRate);
      if (!telegramBotToken || !tonDestinationWallet || !appBaseUrl) {
        Alert.alert('Completa i campi richiesti', 'Token bot, wallet TON destinazione e URL app sono necessari.');
        return;
      }
      await upsert({
        telegramBotToken,
        tonDestinationWallet,
        tonToStarsRate: isNaN(rate) ? 250 : rate,
        appBaseUrl,
        apiBaseUrl,
        tonNetwork,
        tonCollectionAddress,
      });
      try { await setWebhook({ url: webhookUrl }); } catch {}
      try { await configureMenu({ baseUrl: appBaseUrl }); } catch {}
      Alert.alert('Impostazioni salvate', 'Pagamenti e bot sono stati configurati.');
    } catch (e: any) {
      Alert.alert('Errore salvataggio', e?.message || '');
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBack title="Impostazioni" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>Configurazione produzione</Text>
        <Text style={styles.note}>Compila questi valori una volta. Stars e TON funzioneranno subito.</Text>

        <View style={styles.field}> 
          <Text style={styles.label}>Telegram Bot Token</Text>
          <TextInput value={telegramBotToken} onChangeText={setTelegramBotToken} style={styles.input} autoCapitalize='none' />
        </View>
        <View style={styles.field}> 
          <Text style={styles.label}>Wallet TON destinazione (pagamenti)</Text>
          <TextInput value={tonDestinationWallet} onChangeText={setTonDestinationWallet} style={styles.input} autoCapitalize='none' />
        </View>
        <View style={styles.field}> 
          <Text style={styles.label}>Tasso Stars per 1 TON</Text>
          <TextInput value={tonToStarsRate} onChangeText={setTonToStarsRate} style={styles.input} keyboardType='numeric' />
        </View>
        <View style={styles.field}> 
          <Text style={styles.label}>App Base URL (Web App per Telegram)</Text>
          <TextInput value={appBaseUrl} onChangeText={setAppBaseUrl} style={styles.input} autoCapitalize='none' placeholder='https://tuo-dominio.app' />
        </View>
        <View style={styles.field}> 
          <Text style={styles.label}>API Base URL (Convex HTTP Router)</Text>
          <TextInput value={apiBaseUrl} onChangeText={setApiBaseUrl} style={styles.input} autoCapitalize='none' placeholder='https://agreeable-meadowlark-896.convex.site' />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {(['mainnet','testnet'] as const).map(net => (
            <Pressable key={net} onPress={() => setTonNetwork(net)} style={[styles.segment, tonNetwork===net && styles.segmentActive]}>
              <Text style={[styles.segmentText, tonNetwork===net && styles.segmentTextActive]}>{net.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.field}> 
          <Text style={styles.label}>TON Collection Address</Text>
          <TextInput value={tonCollectionAddress} onChangeText={setTonCollectionAddress} style={styles.input} autoCapitalize='none' placeholder='es. EQB...' />
        </View>

        <Pressable onPress={save} style={styles.cta}>
          <Text style={styles.ctaText}>Salva e configura bot</Text>
        </Pressable>

        <Text style={styles.help}>Webhook: {webhookUrl}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14', padding: 16 },
  title: { color: 'white', fontSize: 20, fontWeight: '800', marginTop: 8 },
  note: { color: '#8AA2B6', marginTop: 4, marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { color: '#E5E7EB', marginBottom: 6 },
  input: { backgroundColor: '#0B1320', color: 'white', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1B2737' },
  segment: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#151517', borderWidth: StyleSheet.hairlineWidth, borderColor: '#232327' },
  segmentActive: { backgroundColor: '#1F2937', borderColor: '#374151' },
  segmentText: { color: '#C6C6C8' },
  segmentTextActive: { color: 'white', fontWeight: '700' },
  cta: { marginTop: 8, backgroundColor: '#22C55E', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#0B0B0C', fontWeight: '800' },
  help: { color: '#8AA2B6', marginTop: 12, fontSize: 12 },
});