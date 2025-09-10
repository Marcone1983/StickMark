import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export default function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.image, { opacity }]} />
      <View style={{ height: 10 }} />
      <Animated.View style={[styles.line, { width: '70%', opacity }]} />
      <View style={{ height: 8 }} />
      <Animated.View style={[styles.line, { width: '40%', opacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#121214',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#242428',
    padding: 8,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#0F1115',
    borderRadius: 10,
  },
  line: {
    height: 10,
    backgroundColor: '#1a1b22',
    borderRadius: 6,
  },
});