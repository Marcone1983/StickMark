import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Linking, Alert, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from "../convex/_generated/api";
import { useQuery, useMutation, useAction } from "convex/react";
import HeaderBack from '../components/HeaderBack';
import { openTonPaymentWithAlternatives, openTonPaymentChooser } from '../lib/wallet';

export default function NftDetailScreen() {
  const route = useRoute() as any;
  const navigation = useNavigation();
  const nftId: string = route.params?.id;
  const listings = useQuery(api.listings.listActive, {});
  const listing = listings?.find((l) => l.nft._id === nftId);
  const settings = useQuery(api.listings.publicSettings, {});
  const rate = settings?.tonToStarsRate ?? 250;

  const createTonOrder = useMutation(api.payments.createTonOrder);
  const verifyTonOrder = useAction(api.payments.verifyTonOrder);
  const createStarsInvoice = useAction(api.payments.createStarsInvoice);
  const deleteNft = useMutation(api.listings.deleteNft);
  const placeBid = useMutation(api.listings.placeBid);
  const buyNowAuction = useMutation(api.listings.buyNowAuction);
  const removeListing = useMutation(api.listings.removeListing);
  const cancelListing = useMutation(api.listings.cancelListing);

  const [bidAmount, setBidAmount] = useState('');

  // Simple notify helper
  const notify = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (type === 'success') {
      Alert.alert('Successo', message);
    } else if (type === 'error') {
      Alert.alert('Errore', message);
    } else {
      console.log('[INFO]', message);
    }
  };

  const tonPrice = useMemo(() => {
    if (!listing) return 0;
    return listing.currency === 'TON' ? listing.price : Math.max(0.000001, listing.price / Math.max(1, rate));
  }, [listing, rate]);
  const starsPrice = useMemo(() => {
    if (!listing) return 0;
    return listing.currency === 'STARS' ? Math.round(listing.price) : Math.max(1, Math.round(listing.price * Math.max(1, rate)));
  }, [listing, rate]);

  const verifyTonWithRetry = async (orderId: string) => {
    for (let i = 0; i < 4; i++) {
      const v = await verifyTonOrder({ orderId: orderId as any });
      if (v.verified) return true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };

  const onBuyTon = async () => {
    if (!listing) return;
    try {
      const res = await createTonOrder({ listingId: listing._id, buyer: "@buyer" });
      const opened = await openTonPaymentChooser(res.deeplink);
      if (!opened) {
        notify('Nessun wallet TON disponibile', 'error');
        return;
      }
      notify('Verifica del pagamento in corso...');
      const ok = await verifyTonWithRetry(res.orderId as any);
      if (ok) {
        notify('Pagamento TON confermato. NFT trasferito.', 'success');
        navigation.navigate('Marketplace' as never);
      } else {
        notify('Pagamento non ancora verificato. Riprova tra poco.');
      }
    } catch (e: any) {
      notify(e?.message || "Errore nell'ordine TON", 'error');
    }
  };

  const onBuyStars = async () => {
    if (!listing) return;
    try {
      const res = await createStarsInvoice({ listingId: listing._id, buyer: "@buyer", title: listing.nft.name, description: listing.nft.description });
      try {
        await Linking.openURL(res.invoiceLink);
      } catch {
        // se è tg:// e fallisce, prova https://t.me
        if (res.invoiceLink.startsWith('tg://')) {
          const httpsLink = res.invoiceLink.replace('tg://resolve?domain=', 'https://t.me/').replace('&start=', '?start=');
          await Linking.openURL(httpsLink);
        } else {
          throw new Error('Impossibile aprire il link');
        }
      }
      notify('Invoice Stars aperta. Attendi conferma dal bot.');
    } catch (e: any) {
      notify(e?.message || 'Errore creazione invoice Stars', 'error');
    }
  };

  const onRemoveListing = async () => {
    if (!listing) return;
    try {
      if (listing.active) {
        const r1 = await cancelListing({ listingId: listing._id as any, requester: listing.seller });
        if (!r1.ok) {
          const r2 = await removeListing({ listingId: listing._id as any, requester: listing.seller });
          if (!r2.ok) return notify(r2.reason || 'Impossibile rimuovere annuncio', 'error');
        }
      }
      notify('Annuncio rimosso', 'success');
    } catch (e: any) {
      notify(e?.message || 'Errore rimozione annuncio', 'error');
    }
  };

  const onDelete = async () => {
    if (!listing) return;
    Alert.alert('Conferma', 'Vuoi cancellare questo NFT? Operazione irreversibile.', [
      { text: 'Annulla' },
      { text: 'Cancella', style: 'destructive', onPress: async () => {
        try {
          // Disattiva qualsiasi annuncio attivo prima di eliminare l'NFT
          try {
            if (listing.active) {
              const r1 = await cancelListing({ listingId: listing._id as any, requester: listing.seller });
              if (!r1.ok) {
                await removeListing({ listingId: listing._id as any, requester: listing.seller });
              }
            }
          } catch {}

          const res = await deleteNft({ nftId: listing.nft._id, owner: listing.nft.owner });
          if (res.ok) {
            notify('NFT cancellato', 'success');
            navigation.navigate('Home' as never);
          } else {
            notify(res.reason || 'Impossibile cancellare', 'error');
          }
        } catch (e: any) {
          notify(e?.message || 'Errore cancellazione NFT', 'error');
        }
      } }
    ]);
  };

  const onPlaceBid = async () => {
    if (!listing) return;
    const amount = Number(bidAmount);
    if (!amount || isNaN(amount)) {
      notify('Inserisci un importo valido', 'error');
      return;
    }
    try {
      const res = await placeBid({ listingId: listing._id, bidder: '@buyer', amount });
      if (res.ok) {
        const bidId = res.bidId as any;
        Alert.alert('Offerta inserita', 'Scegli come bloccare i fondi per l\'offerta', [
          { text: 'TON', onPress: async () => {
            try {
              const order = await createTonOrder({ listingId: listing._id, buyer: '@buyer', intent: 'BID', bidAmount: amount, bidId });
              const opened = await openTonPaymentChooser(order.deeplink);
              if (!opened) {
                notify('Nessun wallet TON disponibile per aprire il pagamento', 'error');
                return;
              }
              notify('Apri il wallet TON per bloccare i fondi.');
            } catch (e: any) { notify(e?.message || 'Errore TON', 'error'); }
          }},
          { text: 'Stars', onPress: async () => {
            try {
              const invoice = await createStarsInvoice({ listingId: listing._id, buyer: '@buyer', title: listing.nft.name, description: listing.nft.description, intent: 'BID', bidAmount: amount, bidId });
              await Linking.openURL(invoice.invoiceLink);
              notify('Invoice Stars aperta. Completa per bloccare i fondi.');
            } catch (e: any) { notify(e?.message || 'Errore Stars', 'error'); }
          }},
          { text: 'Annulla', style: 'cancel' }
        ]);
      } else {
        notify(res.reason || 'Offerta rifiutata', 'error');
      }
    } catch (e: any) {
      notify(e?.message || 'Errore invio offerta', 'error');
    }
  };

  const onBuyNow = async () => {
    if (!listing) return;
    try {
      const res = await buyNowAuction({ listingId: listing._id, buyer: '@buyer' });
      if (res.ok) {
        notify('Hai selezionato Compra Subito. Procedi al pagamento TON o Stars.', 'success');
      } else {
        notify(res.reason || 'Operazione non riuscita', 'error');
      }
    } catch (e: any) {
      notify(e?.message || 'Errore Compra Subito', 'error');
    }
  };

  if (!listing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <HeaderBack title="Dettaglio" />
        <Text style={{ color: 'white' }}>NFT non trovato o non in vendita.</Text>
        <Pressable onPress={() => navigation.navigate('Marketplace' as never)} style={[styles.secondary]} >
          <Text style={styles.secondaryText}>Torna al Marketplace</Text>
        </Pressable>
      </View>
    );
  }

  const item = listing.nft;
  const isAuction = listing.type === 'auction';
  const timeLeft = Math.max(0, (listing.endsAt ?? Date.now()) - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const base = Math.max(listing.minBid ?? 0, listing.highestBidAmount ?? 0);
  const minNext = base * (1 + (listing.bidIncrementPercent ?? 20) / 100);

  return (
    <View style={styles.container}>
      <HeaderBack title="Dettaglio NFT" />
      <Image source={{ uri: item.imageUrl }} style={styles.image} />
      <Text style={styles.title}>{item.name}</Text>
      <Text style={styles.creator}>Collezione: Sticker Mark • Chain: {item.chain}</Text>

      <View style={styles.priceBox}>
        <Text style={styles.priceTitle}>{isAuction ? 'Offerta attuale' : 'Prezzo'}</Text>
        <Text style={styles.priceLine}>{listing.price} {listing.currency}</Text>
        <Text style={styles.priceSub}>Equiv: {tonPrice.toFixed(6)} TON • {starsPrice} Stars</Text>
        {isAuction && (
          <>
            <Text style={[styles.priceSub, { marginTop: 4 }]}>Tempo rimanente: {hoursLeft}h</Text>
            <Text style={[styles.priceSub, { marginTop: 2 }]}>Minimo prossimo rilancio (+20%): {minNext.toFixed(6)} {listing.currency}</Text>
          </>
        )}
      </View>

      {isAuction && (
        <View style={styles.auctionBox}>
          <Text style={styles.auctionTitle}>Partecipa all'asta</Text>
          <TextInput
            value={bidAmount}
            onChangeText={setBidAmount}
            placeholder={`>= ${minNext.toFixed(6)} ${listing.currency}`}
            placeholderTextColor="#7A7A7E"
            keyboardType="decimal-pad"
            style={styles.bidInput}
          />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Pressable onPress={() => setBidAmount(minNext.toFixed(6))} style={[styles.smallBtn, { backgroundColor: '#1F2937' }]}>
              <Text style={styles.smallBtnText}>Imposta Min Relancio</Text>
            </Pressable>
            <Pressable onPress={onPlaceBid} style={[styles.smallBtn, { backgroundColor: '#24A1DE' }]}>
              <Text style={[styles.smallBtnText, { color: 'white' }]}>Fai Offerta</Text>
            </Pressable>
            <Pressable onPress={onBuyNow} style={[styles.smallBtn, { backgroundColor: '#F59E0B' }]}>
              <Text style={[styles.smallBtnText, { color: '#0B0B0C' }]}>Compra Subito</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
        <Pressable onPress={onBuyTon} style={[styles.cta, { backgroundColor: '#24A1DE' }]}>
          <Text style={styles.ctaText}>Paga in TON</Text>
        </Pressable>
        <Pressable onPress={onBuyStars} style={[styles.cta, { backgroundColor: '#F59E0B' }]}>
          <Text style={styles.ctaText}>Paga in Stars</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Pressable onPress={onRemoveListing} style={[styles.secondary, { backgroundColor: '#18212F', borderColor: '#23324A' }]}>
          <Text style={[styles.secondaryText, { color: '#E3F2FF' }]}>Rimuovi annuncio</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={[styles.secondary, { backgroundColor: '#2A1720', borderColor: '#3C2330' }]}>
          <Text style={[styles.secondaryText, { color: '#FFEDEC' }]}>Cancella NFT</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate('Marketplace' as never)} style={[styles.secondary] }>
        <Text style={styles.secondaryText}>Torna al Marketplace</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14', padding: 16, alignItems: 'center' },
  image: { width: 240, height: 240, borderRadius: 18, backgroundColor: '#0E1218', marginTop: 8, borderWidth: 1, borderColor: '#1B2737' },
  title: { color: 'white', fontSize: 22, fontWeight: '800', marginTop: 12 },
  creator: { color: '#B4C6D9', marginTop: 4 },
  priceBox: { marginTop: 10, alignItems: 'center', backgroundColor: '#0E1622', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#1B2737' },
  priceTitle: { color: '#8FB9DD', fontSize: 12 },
  priceLine: { color: 'white', fontWeight: '800', marginTop: 4 },
  priceSub: { color: '#8AA2B6', marginTop: 2 },
  auctionBox: { marginTop: 12, width: '100%' },
  auctionTitle: { color: 'white', fontWeight: '800', marginBottom: 6 },
  bidInput: { backgroundColor: '#0B1320', color: 'white', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1B2737' },
  smallBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  smallBtnText: { color: '#E5E7EB', fontWeight: '800' },
  cta: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
  ctaText: { color: '#0B0B0C', fontWeight: '800' },
  secondary: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#0E1622', borderWidth: 1, borderColor: '#1B2737' },
  secondaryText: { color: 'white' },
});