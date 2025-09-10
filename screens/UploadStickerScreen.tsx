import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import HeaderBack from '../components/HeaderBack';

export default function UploadStickerScreen() {
  const navigation = useNavigation();
  const [imageUri, setImageUri] = useState<string | null>(null);

  const pickImage = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web: usa un input invisibile per scegliere un file
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            setImageUri(url);
          }
        };
        input.click();
        return;
      }

      // Native: prova a caricare dinamicamente expo-image-picker se disponibile
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
        if (uri) setImageUri(uri);
      }
    } catch (e: any) {
      Alert.alert('Errore selezione immagine', e?.message || '');
    }
  };

  const proceed = () => {
    try {
      if (!imageUri) {
        Alert.alert('Seleziona prima un file immagine (PNG/WebP trasparente)');
        return;
      }
      navigation.navigate('Mint' as never, { uri: imageUri } as never);
    } catch (e: any) {
      Alert.alert('Errore', e?.message || '');
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBack title="Carica Sticker" />
      <Text style={styles.title}>Carica Sticker</Text>
      <Text style={styles.subtitle}>Seleziona uno sticker già pronto con sfondo trasparente (PNG/WebP).</Text>

      <Pressable onPress={pickImage} style={({ pressed }) => [styles.selectBtn, pressed && { opacity: 0.8 }]}>
        <Text style={styles.selectText}>{imageUri ? 'Sostituisci immagine' : 'Seleziona dal dispositivo'}</Text>
      </Pressable>

      <View style={[styles.preview, { alignItems: 'center', justifyContent: 'center' }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
        ) : (
          <Text style={{ color: '#A1A1AA' }}>Nessuna immagine selezionata</Text>
        )}
      </View>

      <Pressable onPress={proceed} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
        <Text style={styles.ctaText}>Vai al Mint</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0C', padding: 16 },
  title: { color: 'white', fontSize: 20, fontWeight: '700', marginTop: 8 },
  subtitle: { color: '#A1A1AA', marginTop: 4, marginBottom: 12 },
  selectBtn: { backgroundColor: '#1F2937', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#374151' },
  selectText: { color: 'white', fontWeight: '700' },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#151517', marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#232327' },
  previewImage: { width: '100%', height: '100%' },
  cta: { marginTop: 16, backgroundColor: '#22C55E', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#0B0B0C', fontWeight: '800' },
});