import React, { memo } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';

export type NFTCardProps = {
  imageUrl: string;
  name: string;
  price: number;
  currency: 'TON' | 'STARS' | string;
  secondaryPrice?: number;
  secondaryCurrency?: 'TON' | 'STARS' | string;
  isNew?: boolean;
  isVerified?: boolean;
  onPress?: () => void;
};

function currencyColor(currency: string) {
  if (currency === 'TON') return '#18A1FF';
  if (currency === 'STARS') return '#F59E0B';
  return '#8B5CF6';
}

function currencyIcon(currency: string) {
  if (currency === 'TON') return '💎';
  if (currency === 'STARS') return '⭐';
  return '◼︎';
}

const NFTCard = ({ imageUrl, name, price, currency, secondaryPrice, secondaryCurrency, isNew, isVerified, onPress }: NFTCardProps) => {
  return (
    <Pressable onPress={onPress} style={styles.card} android_ripple={{ color: '#1a1a1d' }}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: imageUrl }} style={styles.image} />
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: currencyColor(currency) }]}>
            <Text style={styles.badgeText}>{currencyIcon(currency)} {currency}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Text style={styles.badgeText}>{Number(price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</Text>
          </View>
        </View>
        {isNew ? (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>NUOVO</Text>
          </View>
        ) : null}
        <View style={styles.overlay} />
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
          {isVerified ? <Text style={styles.verified}>✔︎</Text> : null}
        </View>
        {secondaryPrice && secondaryCurrency ? (
          <Text style={styles.secondaryPrice} numberOfLines={1}>
            ≈ {currencyIcon(secondaryCurrency)} {secondaryCurrency} {Number(secondaryPrice).toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};

export default memo(NFTCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0E1622',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1B2737',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#0A0F14',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  newPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    transform: [{ translateY: 32 }],
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  newPillText: {
    color: '#04140a',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  name: {
    color: 'white',
    fontWeight: '700',
    marginBottom: 2,
    flexShrink: 1,
  },
  verified: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryPrice: {
    color: '#8AA2B6',
    fontSize: 12,
  },
});