import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert, Platform, ActivityIndicator, TextInput } from 'react-native';
import HeaderBack from '../components/HeaderBack';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useNavigation } from '@react-navigation/native';

export default function CreateStickerScreen() {
  const navigation = useNavigation();
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hfToken, setHfToken] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const getUploadUrl = useMutation(api.listings.getUploadUrl);
  const removeBgOpen = useAction(api.images.removeBackgroundOpenSource);
  const removeBgClip = useAction(api.images.removeBackground);
  const settings = useQuery(api.imagesData.getSettings, {});
  const upsertSettings = useMutation(api.payments.upsertSettings);
  const hfConfigured = Boolean(settings?.huggingfaceApiToken);
  const clipConfigured = Boolean(settings?.clipdropApiKey);

  const saveHfToken = async () => {
    try {
      if (!hfToken || hfToken.length < 8) {
        Alert.alert('Token non valido');
        return;
      }
      setSavingKey(true);
      await upsertSettings({ huggingfaceApiToken: hfToken });
      Alert.alert('Token salvato', 'Riapri questa schermata se non lo vedi attivo.');
    } catch (e: any) {
      Alert.alert('Errore salvataggio token', e?.message || '');
    } finally {
      setSavingKey(false);
    }
  };

  const pickImage = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            setSourceUri(url);
          }
        };
        input.click();
        return;
      }
      let ImagePicker: any = null;
      try { ImagePicker = require('expo-image-picker'); } catch {}
      if (!ImagePicker) {
        Alert.alert('Selezione non disponibile', 'Installa expo-image-picker per scegliere dal rullino.');
        return;
      }
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permesso negato', 'Concedi i permessi per accedere alle immagini.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled) {
        const uri = result.assets?.[0]?.uri as string | undefined;
        if (uri) setSourceUri(uri);
      }
    } catch (e: any) {
      Alert.alert('Errore selezione immagine', e?.message || '');
    }
  };

  const process = async () => {
    try {
      if (!sourceUri) {
        Alert.alert('Seleziona prima una foto');
        return;
      }
      setUploading(true);
      const fileResp = await fetch(sourceUri);
      const blob = await fileResp.blob();

      const { url: uploadUrl } = await getUploadUrl({ contentType: blob.type || 'image/png' });
      const putResp = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
      if (!putResp.ok) throw new Error(`Upload failed: ${putResp.status}`);
      const { storageId } = (await putResp.json()) as { storageId: string };

      // Priorità: open-source Hugging Face; in alternativa ClipDrop se configurato
      let removed;
      if (hfConfigured) {
        removed = await removeBgOpen({ fileId: storageId, contentType: blob.type || 'image/png' });
      } else if (clipConfigured) {
        removed = await removeBgClip({ fileId: storageId, contentType: blob.type || 'image/png' });
      } else {
        Alert.alert('Rimozione sfondo non configurata', 'Aggiungi un token Hugging Face gratuito qui sotto.');
        return;
      }
      setResultUrl(removed.imageUrl);
    } catch (e: any) {
      Alert.alert('Rimozione sfondo non disponibile', e?.message || '');
    } finally {
      setUploading(false);
    }
  };

  const continueToMint = (useOriginal?: boolean) => {
    const target = useOriginal ? sourceUri : resultUrl;
    if (!target) {
      Alert.alert('Seleziona un\'immagine o completa la rimozione sfondo');
      return;
    }
    navigation.navigate('Mint' as never, { uri: target } as never);
  };

  return (
    <View style={styles.container}>
      <HeaderBack title="Crea Sticker" />
      <Text style={styles.title}>Crea Sticker da immagine</Text>
      <Text style={styles.subtitle}>Carica una foto, rimuovi lo sfondo con un click (open‑source), poi fai il mint.</Text>

      {!hfConfigured && (
        <View style={{ backgroundColor: '#0E1622', borderColor: '#1B2737', borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 10 }}>
          <Text style={{ color: '#E3F2FF', marginBottom: 8 }}>Rimozione sfondo open‑source. Inserisci il tuo Hugging Face token gratuito:</Text>
          <TextInput
            value={hfToken}
            onChangeText={setHfToken}
            placeholder="hf_xxx..."
            placeholderTextColor="#6B7280"
            autoCapitalize='none'
            style={{ backgroundColor: '#0B1320', color: 'white', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#1B2737' }}
          />
          <Pressable onPress={saveHfToken} disabled={savingKey || hfToken.length < 8} style={[{ marginTop: 8, backgroundColor: '#24A1DE', paddingVertical: 10, borderRadius: 10, alignItems: 'center' }, (savingKey || hfToken.length < 8) && { opacity: 0.6 }]}>
            <Text style={{ color: '#0B0B0C', fontWeight: '800' }}>{savingKey ? 'Salvataggio…' : 'Salva token'}</Text>
          </Pressable>
          {!!clipConfigured && (
            <Text style={{ color: '#8AA3B6', marginTop: 8 }}>Hai anche ClipDrop configurato: verrà usato solo se manca il token Hugging Face.</Text>
          )}
        </View>
      )}

      <Pressable onPress={pickImage} style={({ pressed }) => [styles.selectBtn, pressed && { opacity: 0.8 }]}>
        <Text style={styles.selectText}>{sourceUri ? 'Sostituisci immagine' : 'Seleziona dal dispositivo'}</Text>
      </Pressable>

      <View style={[styles.previewRow] }>
        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>Originale</Text>
          <View style={styles.previewInner}>{sourceUri ? <Image source={{ uri: sourceUri }} style={styles.previewImage} resizeMode='contain' /> : <Text style={styles.placeholder}>Nessuna</Text>}</View>
        </View>
        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>Sticker</Text>
          <View style={styles.previewInner}>{resultUrl ? <Image source={{ uri: resultUrl }} style={styles.previewImage} resizeMode='contain' /> : uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.placeholder}>In attesa</Text>}</View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <Pressable onPress={process} disabled={!sourceUri || uploading || (!hfConfigured && !clipConfigured)} style={[styles.ctaSecondary, (!sourceUri || uploading || (!hfConfigured && !clipConfigured)) && { opacity: 0.6 }]}>
          <Text style={styles.ctaSecondaryText}>Rimuovi sfondo</Text>
        </Pressable>
        <Pressable onPress={() => continueToMint(false)} disabled={!resultUrl} style={[styles.cta, !resultUrl && { opacity: 0.6 }]}>
          <Text style={styles.ctaText}>Continua con sticker</Text>
        </Pressable>
        <Pressable onPress={() => continueToMint(true)} disabled={!sourceUri} style={[styles.ctaOutline, !sourceUri && { opacity: 0.6 }]}>
          <Text style={styles.ctaOutlineText}>Usa immagine originale</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0C', padding: 16 },
  title: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#A1A1AA', marginBottom: 12 },
  selectBtn: { backgroundColor: '#1F2937', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#374151' },
  selectText: { color: 'white', fontWeight: '700' },
  previewRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  previewBox: { flex: 1 },
  previewTitle: { color: '#9CA3AF', marginBottom: 6 },
  previewInner: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#151517', borderWidth: StyleSheet.hairlineWidth, borderColor: '#232327', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '100%' },
  placeholder: { color: '#6B7280' },
  cta: { backgroundColor: '#22C55E', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flex: 1, minWidth: 160 },
  ctaText: { color: '#0B0B0C', fontWeight: '800' },
  ctaSecondary: { backgroundColor: '#111116', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flex: 1, minWidth: 160, borderWidth: StyleSheet.hairlineWidth, borderColor: '#232327' },
  ctaSecondaryText: { color: 'white', fontWeight: '700' },
  ctaOutline: { backgroundColor: 'transparent', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flex: 1, minWidth: 160, borderWidth: StyleSheet.hairlineWidth, borderColor: '#3B3B3F' },
  ctaOutlineText: { color: '#E5E7EB', fontWeight: '700' },
});