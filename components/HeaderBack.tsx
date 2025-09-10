import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function HeaderBack({ title }: { title: string }) {
  const navigation = useNavigation();
  return (
    <View style={styles.wrapper}>
      <View style={styles.gradientBar} />
      <View style={styles.root}>
        <Pressable onPress={() => navigation.navigate('Home' as never)} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.backIcon}>←</Text>
          <Text style={styles.backText}>Menu</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: '#0A0F14' },
  gradientBar: {
    height: 3,
    backgroundColor: '#24A1DE',
    opacity: 0.75,
  },
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0A0F14',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1B2737',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backIcon: { color: 'white', fontSize: 18 },
  backText: { color: 'white', fontWeight: '800' },
  title: { color: '#8FB9DD', fontWeight: '800' },
});