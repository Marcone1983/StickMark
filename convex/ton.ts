import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

// Safe dynamic import that avoids static analysis by the bundler
const dynImport = async (mod: string) => {
  // eslint-disable-next-line no-new-func
  const importer = new Function("m", "return import(m)");
  return importer(mod);
};

export const mintAndRecord = action({
  args: {
    stickerId: v.id("stickers"),
    ownerIdentity: v.string(),
    ownerTonAddress: v.string(),
    name: v.string(),
    description: v.string(),
    imageUrl: v.string(),
    amountTonForItem: v.optional(v.string()),
    extraValueTonForFees: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    nftAddress: v.optional(v.string()),
    itemIndex: v.optional(v.number()),
    txHash: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    let core: any, ton: any, crypto: any, access: any;
    try {
      [core, ton, crypto, access] = await Promise.all([
        dynImport("@ton/core"),
        dynImport("@ton/ton"),
        dynImport("@ton/crypto"),
        dynImport("@orbs-network/ton-access"),
      ]);
    } catch (e: any) {
      return { ok: false, reason: `Moduli TON non disponibili: ${String(e?.message || e)}` } as const;
    }

    const { Address, beginCell, internal, SendMode, toNano } = core;
    const { TonClient, WalletContractV4 } = ton;
    const { mnemonicToPrivateKey } = crypto;
    const { getHttpEndpoint } = access;

    const getClient = async (network: "mainnet" | "testnet") => {
      const endpoint = await getHttpEndpoint({ network });
      return new TonClient({ endpoint });
    };
    const openWallet = async (client: any, mnemonic24: string[]) => {
      const keypair = await mnemonicToPrivateKey(mnemonic24);
      const wallet = WalletContractV4.create({ workchain: 0, publicKey: keypair.publicKey });
      const opened = client.open(wallet);
      return { keypair, wallet, opened };
    };
    const buildMintBody = (params: { itemIndex: number; owner: any; amountTonForItem: string; itemMetadataUrl: string; queryId?: bigint; }) => {
      const body = beginCell();
      body.storeUint(1, 32);
      body.storeUint(params.queryId ?? 0n, 64);
      body.storeUint(params.itemIndex, 64);
      body.storeCoins(toNano(params.amountTonForItem));
      const itemContent = beginCell();
      itemContent.storeAddress(params.owner);
      const uri = beginCell();
      uri.storeBuffer(Buffer.from(params.itemMetadataUrl));
      itemContent.storeRef(uri.endCell());
      body.storeRef(itemContent.endCell());
      return body.endCell();
    };

    // --- Settings & env ---
    const s = await ctx.runQuery(api.payments.getSettings, {});
    const network = (s as any)?.tonNetwork ?? "mainnet";
    const collection = (s as any)?.tonCollectionAddress;
    const appBase = (s as any)?.appBaseUrl;
    const apiBase = (s as any)?.apiBaseUrl || appBase;
    if (!collection) return { ok: false, reason: "tonCollectionAddress non configurato in settings" } as const;
    if (!apiBase)     return { ok: false, reason: "apiBaseUrl/appBaseUrl non configurato in settings" } as const;
    const MNEMONIC = (process.env.TON_MNEMONIC_24W || "").trim();
    if (!MNEMONIC) return { ok: false, reason: "TON_MNEMONIC_24W non impostato su Convex" } as const;

    const client = await getClient(network);
    const { keypair, wallet, opened } = await openWallet(client, MNEMONIC.split(/\s+/));

    // 1) Draft
    const nftId = await ctx.runMutation(api.listings.createNftDraft, {
      owner: args.ownerIdentity,
      stickerId: args.stickerId,
      name: args.name,
      description: args.description,
      imageUrl: args.imageUrl,
    });
    const metadataUrl = `${String(apiBase).replace(/\/$/, "")}/nft/metadata?id=${nftId}`;

    // 2) next_item_index
    const collAddr = Address.parse(collection);
    const r = await client.runMethod(collAddr, "get_collection_data");
    const nextIndex = r.stack.readNumber();

    // 3) body + send
    const amountItem = args.amountTonForItem ?? "0.05";
    const extraFees  = args.extraValueTonForFees ?? "0.15";
    const valueTotal = (Number(amountItem) + Number(extraFees)).toFixed(3);
    const body = buildMintBody({ itemIndex: nextIndex, owner: Address.parse(args.ownerTonAddress), amountTonForItem: amountItem, itemMetadataUrl: metadataUrl });

    const seqno = await opened.getSeqno();
    await wallet.sendTransfer(opened, {
      secretKey: keypair.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      seqno,
      messages: [internal({ to: collAddr, value: toNano(valueTotal), bounce: true, body })],
    });

    for (let i = 0; i < 12; i++) {
      await sleep(2000);
      const s2 = await opened.getSeqno();
      if (s2 === seqno + 1) break;
      if (i === 11) return { ok: false, reason: "Timeout attesa conferma seqno" } as const;
    }

    // 5) get_nft_address_by_index
    const r2 = await client.runMethod(collAddr, "get_nft_address_by_index", [{ type: "int", value: BigInt(nextIndex) }]);
    const nftAddress = r2.stack.readAddress().toString();

    // 6) persist
    const txHash = "";
    await ctx.runMutation(api.listings.finalizeMint, { nftId, network, collectionAddress: collAddr.toString(), nftAddress, itemIndex: nextIndex, txHash });

    return { ok: true, nftAddress, itemIndex: nextIndex, txHash } as const;
  },
});