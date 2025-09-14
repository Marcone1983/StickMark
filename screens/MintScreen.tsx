import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TextInput, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from "../convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import HeaderBack from '../components/HeaderBack';

export default function MintScreen() {
  const navigation = useNavigation();
  const route = useRoute() as any;
  const uri: string | undefined = route.params?.uri;

  const [name, setName] = useState('Sticker NFT');
  const [desc, setDesc] = useState('');
  const [supply, setSupply] = useState('1');
  const [price, setPrice] = useState('1');
  const [chain, setChain] = useState<'TON' | 'STARS'>('TON');
  const [isAuction, setIsAuction] = useState(false);
  const [minBid, setMinBid] = useState('1');
  const [buyNowPrice, setBuyNowPrice] = useState('2');
  const [ownerTon, setOwnerTon] = useState('');

  const createSticker = useMutation(api.listings.createSticker);
  const mintAndRecord = useAction(api.ton.mintAndRecord);
  const createListing = useMutation(api.listings.createListing);
  const createAuction = useMutation(api.listings.createAuction);
  const getUploadUrl = useMutation(api.listings.getUploadUrl);
  const saveStickerRecord = useMutation(api.listings.saveStickerRecord);

  const onMint = async () => {
    try {
      if (!uri) {
        Alert.alert('Seleziona un\'immagine dalla schermata precedente');
        return;
      }
      const resp = await fetch(uri);
      const blob = await resp.blob();

      // Upload via Convex signed URL flow
      const { url: uploadUrl } = await getUploadUrl({ contentType: blob.type || "image/png" });
      const putResp = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
      if (!putResp.ok) {
        const text = await putResp.text().catch(() => "");
        throw new Error(`Upload failed: ${putResp.status} ${text}`);
      }
      const json = (await putResp.json().catch(() => null)) as null | { storageId?: string };
      const storageId = json?.storageId;
      if (!storageId) {
        throw new Error("Upload riuscito ma manca storageId nella risposta");
      }

      // Persist sticker record and get a signed URL for preview
      const saved = await saveStickerRecord({ fileId: storageId, contentType: blob.type || "image/png" });
      const imageUrl = saved.imageUrl;

      const sticker = await createSticker({ owner: "@you", fileId: storageId, name, description: desc, imageUrl });

      // Real on-chain mint on TON via Convex action
      let mintedNftId: any = null;
      if (chain === 'TON') {
        if (!ownerTon) {
          Alert.alert("Indirizzo TON mancante", "Inserisci l'indirizzo TON del proprietario dell'NFT.");
          return;
        }
        const rMint = await mintAndRecord({
          stickerId: (sticker as any)._id,
          ownerIdentity: "telegram",
          ownerTonAddress: ownerTon.trim(),
          name,
          description: desc,
          imageUrl,
          amountTonForItem: "0.05",
          extraValueTonForFees: "0.15",
        });
        if (!rMint?.ok) {
          Alert.alert("Mint fallito", rMint?.reason ?? "Errore sconosciuto");
          return;
        }
        mintedNftId = null;
      } else {
        // STARS path mantenuto a livello di DB
      }

      if (isAuction) {
        if (!minBid || !buyNowPrice) {
          Alert.alert('Compila i campi d\'asta');
          return;
        }
        Alert.alert('Mint on-chain avviato', 'Asta disponibile dopo indicizzazione.');
      } else {
        Alert.alert('Mint on-chain completato', 'Crea il listing dal tuo inventario.');
      }

      navigation.navigate('Marketplace' as never);
    } catch (e: any) {
      Alert.alert('Errore durante il mint', e?.message || '');
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBack title="Mint NFT" />
      <Text style={styles.title}>Mint NFT</Text>
      <Text style={styles.subtitle}>Compila i dettagli e scegli la chain</Text>

      {uri ? (
        <Image source={{ uri }} style={styles.preview} />
      ) : (
        <View style={[styles.preview, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: '#A1A1AA' }}>Seleziona un\'immagine da "Carica Sticker" o "Crea Sticker"</Text>
        </View>
      )}

      <View style={styles.field}> 
        <Text style={styles.label}>Nome</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Nome dello sticker" placeholderTextColor="#6B7280" style={styles.input} />
      </View>
      <View style={styles.field}> 
        <Text style={styles.label}>Descrizione</Text>
        <TextInput value={desc} onChangeText={setDesc} placeholder="Dettagli, collezione, autore" placeholderTextColor="#6B7280" style={[styles.input, { height: 80 }]} multiline />
      </View>

      {chain === 'TON' && (
        <View style={styles.field}>
          <Text style={styles.label}>Owner TON address</Text>
          <TextInput
            value={ownerTon}
            onChangeText={setOwnerTon}
            style={styles.input}
            placeholder="es. UQArbhbV..."
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[styles.field, { flex: 1 }]}> 
          <Text style={styles.label}>Supply</Text>
          <TextInput value={supply} onChangeText={setSupply} keyboardType="number-pad" placeholder="1" placeholderTextColor="#6B7280" style={styles.input} />
        </View>
        <View style={[styles.field, { flex: 1 }]}> 
          <Text style={styles.label}>Prezzo (se prezzo fisso)</Text>
          <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="1.0" placeholderTextColor="#6B7280" style={styles.input} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {(['TON', 'STARS'] as const).map((c) => (
          <Pressable key={c} onPress={() => setChain(c)} style={[styles.segment, chain === c && styles.segmentActive]}>
            <Text style={[styles.segmentText, chain === c && styles.segmentTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Pressable onPress={() => setIsAuction(false)} style={[styles.segment, !isAuction && styles.segmentActive]}>
          <Text style={[styles.segmentText, !isAuction && styles.segmentTextActive]}>Prezzo fisso</Text>
        </Pressable>
        <Pressable onPress={() => setIsAuction(true)} style={[styles.segment, isAuction && styles.segmentActive]}>
          <Text style={[styles.segmentText, isAuction && styles.segmentTextActive]}>Asta 24h</Text>
        </Pressable>
      </View>

      {isAuction && (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Offerta minima</Text>
            <TextInput value={minBid} onChangeText={setMinBid} keyboardType="decimal-pad" placeholder="1.0" placeholderTextColor="#6B7280" style={styles.input} />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Compra subito</Text>
            <TextInput value={buyNowPrice} onChangeText={setBuyNowPrice} keyboardType="decimal-pad" placeholder="2.0" placeholderTextColor="#6B7280" style={styles.input} />
          </View>
        </View>
      )}

      <Pressable onPress={onMint} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
        <Text style={styles.ctaText}>{isAuction ? 'Crea Asta e Vai al Marketplace' : 'Mint e Vai al Marketplace'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0C', padding: 16 },
  title: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#A1A1AA', marginBottom: 12 },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#151517', marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#232327' },
  field: { marginBottom: 12 },
  label: { color: '#E5E7EB', marginBottom: 6 },
  input: { backgroundColor: '#111116', color: 'white', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#232327' },
  segment: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#151517', borderWidth: StyleSheet.hairlineWidth, borderColor: '#232327' },
  segmentActive: { backgroundColor: '#1F2937', borderColor: '#374151' },
  segmentText: { color: '#C6C6C8' },
  segmentTextActive: { color: 'white', fontWeight: '700' },
  cta: { marginTop: 16, backgroundColor: '#22C55E', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#0B0B0C', fontWeight: '700' },
});