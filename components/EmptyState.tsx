import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

export type EmptyStateProps = {
  title: string;
  description?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
};

export default function EmptyState({ title, description, ctaLabel, onPressCta }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.illustration} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {ctaLabel && onPressCta ? (
        <Pressable onPress={onPressCta} style={styles.cta}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  illustration: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: '#111218',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#23242c',
    marginBottom: 12,
  },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  description: { color: '#A1A1AA', textAlign: 'center', marginTop: 6 },
  cta: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  ctaText: { color: 'white', fontWeight: '700' },
});