import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, TextInput, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from "../convex/_generated/api";
import { useQuery } from "convex/react";
import NFTCard from '../components/NFTCard';
import SkeletonCard from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';
import HeaderBack from '../components/HeaderBack';

export default function MarketplaceScreen() {
  const navigation = useNavigation();
  const listingsRaw = useQuery(api.listings.listActive, {});
  const settings = useQuery(api.listings.publicSettings, {});
  // Usa 250 se non presente in settings
  const rate = settings?.tonToStarsRate ?? 250;
  const isLoading = listingsRaw === undefined;
  const listings = useMemo(() => listingsRaw ?? [], [listingsRaw]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'TON' | 'STARS'>('ALL');
  const [sort, setSort] = useState<'TRENDING' | 'PRICE_ASC' | 'PRICE_DESC'>('TRENDING');

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = listings.filter((l) => {
      const name = l.nft.name?.toLowerCase?.() || '';
      const matchSearch = q.length === 0 || name.includes(q);
      const matchFilter = filter === 'ALL' || l.currency === filter;
      return matchSearch && matchFilter;
    });
    if (sort === 'PRICE_ASC') arr = [...arr].sort((a, b) => a.price - b.price);
    if (sort === 'PRICE_DESC') arr = [...arr].sort((a, b) => b.price - a.price);
    return arr;
  }, [listings, search, filter, sort]);

  const resultText = useMemo(() => `${filtered.length} risultati`, [filtered.length]);

  const secondaryFor = useCallback((item: any) => {
    if (item.currency === 'TON') {
      return { secondaryCurrency: 'STARS', secondaryPrice: Math.max(1, Math.round(item.price * Math.max(1, rate))) };
    }
    return { secondaryCurrency: 'TON', secondaryPrice: Math.max(0.000001, item.price / Math.max(1, rate)) };
  }, [rate]);

  const isNew = useCallback((ts: number) => {
    const hours = (Date.now() - ts) / (1000 * 60 * 60);
    return hours < 24;
  }, []);

  const isVerifiedSeller = useCallback((seller: string) => {
    // Verifica semplice: seller ufficiale @you (puoi collegarlo ad una whitelist lato server)
    return seller === '@you' || seller?.toLowerCase?.().includes('official') || seller?.toLowerCase?.().includes('verify');
  }, []);

  // Stabilizza header per evitare rimontaggi frequenti che su web possono rompere il DOM
  const header = useMemo(() => (
    <View>
      <HeaderBack title="Marketplace" />
      <View style={styles.headerInner}>
        <Text style={styles.title}>Sticker Mark ✦</Text>
        <Text style={styles.subtitle}>Marketplace</Text>

        <View style={styles.searchRow}>
          <TextInput
            placeholder="Cerca sticker, collezioni..."
            placeholderTextColor="#7A7A7E"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filters}>
          {(['ALL','TON','STARS'] as const).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter===f && styles.chipActive]}>
              <Text style={[styles.chipText, filter===f && styles.chipTextActive]}>{f === 'ALL' ? 'TUTTO' : f}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sortRow}>
          {(['TRENDING','PRICE_ASC','PRICE_DESC'] as const).map((s) => (
            <Pressable key={s} onPress={() => setSort(s)} style={[styles.sortChip, sort===s && styles.sortChipActive]}>
              <Text style={[styles.sortText, sort===s && styles.sortTextActive]}>
                {s === 'TRENDING' ? 'Di tendenza' : s === 'PRICE_ASC' ? 'Prezzo: Crescente' : 'Prezzo: Decrescente'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.resultBar}>
          <Text style={styles.resultText}>{resultText}</Text>
        </View>
      </View>
    </View>
  ), [search, filter, sort, resultText]);

  const data = isLoading ? [1,2,3,4,5,6] : filtered;

  const isWeb = Platform.OS === 'web';

  return (
    <View style={styles.container}>
      <FlatList
        data={data as any[]}
        keyExtractor={(item: any, idx) => {
          if (isLoading) return `skeleton-${idx}`;
          const raw = (item && ((item as any)._id || (item as any).id || (item as any).nft?._id || (item as any).nft?.id)) ?? idx;
          const str = typeof raw === 'string' ? raw : String(raw);
          return `listing-${str}`;
        }}
        numColumns={2}
        {...(!isWeb ? { stickyHeaderIndices: [0] } : {})}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ gap: 12, paddingVertical: 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            {isLoading ? (
              <SkeletonCard />
            ) : (
              <NFTCard
                imageUrl={item.nft.imageUrl}
                name={item.nft.name}
                price={item.price}
                currency={item.currency}
                secondaryCurrency={secondaryFor(item).secondaryCurrency}
                secondaryPrice={secondaryFor(item).secondaryPrice}
                isNew={isNew(item._creationTime)}
                isVerified={isVerifiedSeller(item.seller)}
                onPress={() => navigation.navigate('NftDetail' as never, { id: item.nft._id } as never)}
              />
            )}
          </View>
        )}
        ListEmptyComponent={isLoading ? undefined : (
          <EmptyState
            title="Nessun listing attivo"
            description="Crea il tuo primo annuncio dalla sezione Mint"
            ctaLabel="Vai al Mint"
            onPressCta={() => navigation.navigate('Mint' as never)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14', paddingHorizontal: 16 },
  headerInner: {
    paddingTop: Platform.OS === 'web' ? 8 : 0,
    paddingBottom: 8,
    backgroundColor: '#0B0F14',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1B2737',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 10,
  },
  title: { color: 'white', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#8AA2B6', marginTop: 2 },
  searchRow: { marginTop: 12 },
  searchInput: { backgroundColor: '#0B1320', color: 'white', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1B2737' },
  filters: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#0E1622', borderWidth: 1, borderColor: '#1B2737' },
  chipActive: { backgroundColor: '#24A1DE22', borderColor: '#24A1DE' },
  chipText: { color: '#C6D3DF', fontWeight: '700' },
  chipTextActive: { color: '#EAF6FF' },
  sortRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#0F1724', borderWidth: 1, borderColor: '#1B2737' },
  sortChipActive: { backgroundColor: '#1D4ED822', borderColor: '#1D4ED8' },
  sortText: { color: '#A8B7C8', fontWeight: '700', fontSize: 12 },
  sortTextActive: { color: '#EAF6FF' },
  resultBar: { marginTop: 8 },
  resultText: { color: '#8FB9DD', fontSize: 12 },
});