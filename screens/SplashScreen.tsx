import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, StyleSheet, Animated, Easing, Platform, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAction } from 'convex/react';
import { api } from '../convex/_generated/api';

export default function SplashScreen() {
  const navigation = useNavigation();
  const setWebhook = useAction(api.payments.setTelegramWebhook);
  const progress = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);

  const baseUrl = useMemo(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
    return 'https://sticker-mint-nft-1754691872344.app.a0.dev';
  }, []);

  useEffect(() => {
    const url = `${baseUrl}/telegram/webhook`;
    setWebhook({ url }).catch(() => {});
    Animated.timing(progress, { toValue: 1, duration: 1400, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start(() => setDone(true));
  }, [baseUrl, progress, setWebhook]);

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigation.navigate('Home' as never), 200);
      return () => clearTimeout(t);
    }
  }, [done, navigation]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      <Image source={require('../assets/1000193689.png')} style={styles.logo} />
      <View style={styles.barBg}>
        <Animated.View style={[styles.barFill, { width }]} />
      </View>
      <Text style={styles.caption}>Caricamento…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  logo: { width: 140, height: 140, resizeMode: 'contain', marginBottom: 18 },
  barBg: { width: '100%', height: 8, borderRadius: 999, backgroundColor: '#1F2026', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#22C55E' },
  caption: { color: '#9CA3AF', marginTop: 8 }
});