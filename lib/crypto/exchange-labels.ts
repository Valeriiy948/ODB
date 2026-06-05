// lib/crypto/exchange-labels.ts
// Known exchange / entity address database
// Sources: Etherscan labels, Blockchair labels, public OSINT reports, OFAC SDN crypto annexes

export interface ExchangeLabel {
  name:        string   // "Binance"
  type:        'exchange' | 'mixer' | 'sanctioned' | 'darknet' | 'gambling' | 'defi' | 'bridge'
  kyc:         boolean  // exchanges with KYC — subpoena target
  country?:    string
  note?:       string
}

// ─── Known labeled addresses ───────────────────────────────────────────────────
// ETH/EVM + BTC + TRON hot/cold wallets of major exchanges
// Useful for: "funds went to Binance" → Binance has KYC → subpoena possible
export const KNOWN_ADDRESSES: Record<string, ExchangeLabel> = {
  // ── Binance ──────────────────────────────────────────────────────────────────
  '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be': { name: 'Binance',      type: 'exchange', kyc: true,  country: 'Cayman Islands' },
  '0xd551234ae421e3bcba99a0da6d736074f22192ff': { name: 'Binance',      type: 'exchange', kyc: true },
  '0x564286362092d8e7936f0549571a803b203aaced': { name: 'Binance',      type: 'exchange', kyc: true },
  '0x0681d8db095565fe8a346fa0277bffde9c0edbbf': { name: 'Binance',      type: 'exchange', kyc: true },
  '0xfe9e8709d3215310075d67e3ed32a380ccf451c8': { name: 'Binance',      type: 'exchange', kyc: true },
  '0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67': { name: 'Binance',      type: 'exchange', kyc: true },
  '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': { name: 'Binance Cold', type: 'exchange', kyc: true },
  '1ndyjtntjmwk5xpnhjgamu4hdhigtobu1s':         { name: 'Binance BTC', type: 'exchange', kyc: true },

  // ── Bybit ────────────────────────────────────────────────────────────────────
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': { name: 'Bybit',        type: 'exchange', kyc: true,  country: 'UAE' },
  '0xf977814e90da44bfa03b6295a0616a897441acec': { name: 'Bybit',        type: 'exchange', kyc: true },
  '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': { name: 'Bybit',        type: 'exchange', kyc: true },
  'TNXoiAJ3dct8Fg3SbgQgRczFJQnynBX4bq':         { name: 'Bybit TRON',  type: 'exchange', kyc: true },

  // ── OKX ──────────────────────────────────────────────────────────────────────
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { name: 'OKX',          type: 'exchange', kyc: true,  country: 'Seychelles' },
  '0x236f9f97e0e62388479bf9e5ba4889e46b0273c3': { name: 'OKX',          type: 'exchange', kyc: true },
  '0xa7efae728d2936e78bda97dc267687568dd593f3': { name: 'OKX',          type: 'exchange', kyc: true },
  'TLyhntZcpmFADdCehwHKEWuE5xMvBiKJzB':         { name: 'OKX TRON',    type: 'exchange', kyc: true },

  // ── Huobi / HTX ──────────────────────────────────────────────────────────────
  '0xadb2b42f6bd96f5c65920b9ac88619dce4166f94': { name: 'Huobi/HTX',   type: 'exchange', kyc: true,  country: 'Seychelles' },
  '0xdc76cd25977e0a5ae17155770273ad58648900d3': { name: 'Huobi/HTX',   type: 'exchange', kyc: true },
  '0xfdb16996831753d5331ff813c29a93c76834a0ad': { name: 'Huobi/HTX',   type: 'exchange', kyc: true },

  // ── KuCoin ───────────────────────────────────────────────────────────────────
  '0x2b5634c42055806a59e9107ed44d43c426e58258': { name: 'KuCoin',       type: 'exchange', kyc: true,  country: 'Seychelles' },
  '0xa1d8d972560c2f8144af871db508f0b0b10a3fbf': { name: 'KuCoin',       type: 'exchange', kyc: true },
  'TVcn8hCHXLbOCcnBpTH7rM5aFkJlCqLMN2':         { name: 'KuCoin TRON', type: 'exchange', kyc: true },

  // ── Gate.io ──────────────────────────────────────────────────────────────────
  '0x0d0707963952f2fba59dd06f2b425ace40b492fe': { name: 'Gate.io',      type: 'exchange', kyc: true },
  '0xe93381fb4c4f14bda253907b18fad305d799241a': { name: 'Gate.io',      type: 'exchange', kyc: true },

  // ── Kraken ───────────────────────────────────────────────────────────────────
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': { name: 'Kraken',       type: 'exchange', kyc: true,  country: 'USA' },
  '0xe853c56864a2ebe4576a807d26fdc4a0ada51919': { name: 'Kraken',       type: 'exchange', kyc: true },
  '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0': { name: 'Kraken',       type: 'exchange', kyc: true },

  // ── Coinbase ─────────────────────────────────────────────────────────────────
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': { name: 'Coinbase',     type: 'exchange', kyc: true,  country: 'USA' },
  '0x503828976d22510aad0201ac7ec88293211d23da': { name: 'Coinbase',     type: 'exchange', kyc: true },
  '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': { name: 'Coinbase',     type: 'exchange', kyc: true },
  '0x3cd751e6b0078be393132286c442345e5dc49699': { name: 'Coinbase',     type: 'exchange', kyc: true },

  // ── Garantex (Russia, SANCTIONED by OFAC 2022) ───────────────────────────────
  '0x6be0ae71e6c41f2f9d0d1a3b8d0f93d08aab7a07': { name: 'Garantex',    type: 'sanctioned', kyc: false, country: 'Russia', note: 'OFAC sanctioned RU exchange' },
  'TLnuEC56aoyScPFQFJTz4TepruAYzZa7R8':          { name: 'Garantex',    type: 'sanctioned', kyc: false, country: 'Russia', note: 'OFAC sanctioned RU exchange' },

  // ── SUEX (Russia, SANCTIONED by OFAC 2021) ───────────────────────────────────
  '0xa7e5d5a720f06526557c513402f2e6b5fa20b008': { name: 'SUEX',         type: 'sanctioned', kyc: false, country: 'Russia', note: 'First RU exchange sanctioned by OFAC' },

  // ── Chatex (Russia, SANCTIONED) ──────────────────────────────────────────────
  '0x7758e507850da48cd47df1fb5f875c23e3340c50': { name: 'Chatex',       type: 'sanctioned', kyc: false, country: 'Russia' },

  // ── Tornado Cash (SANCTIONED mixer) ──────────────────────────────────────────
  '0x722122df12d4e14e13ac3b6895a86e84145b6967': { name: 'Tornado Cash', type: 'mixer',      kyc: false, note: 'OFAC sanctioned ETH mixer' },
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b': { name: 'Tornado Cash', type: 'mixer',      kyc: false },
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf': { name: 'Tornado Cash', type: 'mixer',      kyc: false },
  '0xa160cdab225685da1d56aa342ad8841c3b53f291': { name: 'Tornado Cash', type: 'mixer',      kyc: false },

  // ── ChipMixer (BTC mixer, seized 2023) ───────────────────────────────────────
  '1kunmhd2hq7xflkj2mhkrm2g7rqy7smjl':           { name: 'ChipMixer BTC', type: 'mixer',    kyc: false, note: 'Seized by Europol/FBI 2023' },

  // ── FixedFloat ────────────────────────────────────────────────────────────────
  '0x4e5b2e1dc63f6b91cb6cd759936495434c7e972f': { name: 'FixedFloat',   type: 'exchange', kyc: false, note: 'No KYC instant swap' },

  // ── Hydra market (darknet, Russia) ───────────────────────────────────────────
  '12KMGNi5VVGR4RUmBMRbL1m5UTWaZNKnVL':          { name: 'Hydra Market', type: 'darknet',  kyc: false, country: 'Russia', note: 'Largest darknet market, seized 2022' },
}

// ─── Exchange pattern prefixes for TRON ────────────────────────────────────────
// TRON addresses starting with these belong to known exchanges (heuristic)
const TRON_EXCHANGE_PREFIXES: Array<{ prefix: string; name: string }> = [
  { prefix: 'TNXoiAJ3dct8Fg3', name: 'Bybit' },
  { prefix: 'TLyhntZcpmFADdCe', name: 'OKX' },
  { prefix: 'TVcn8hCHXLbOCcnB', name: 'KuCoin' },
]

// ─── Lookup function ───────────────────────────────────────────────────────────
export function lookupAddress(address: string): ExchangeLabel | null {
  const normalized = address.toLowerCase().trim()
  return KNOWN_ADDRESSES[normalized] || KNOWN_ADDRESSES[address.trim()] || null
}

// Check a list of addresses (counterparties) for known entities
export function labelCounterparties(addresses: string[]): Array<{ address: string; label: ExchangeLabel }> {
  const results: Array<{ address: string; label: ExchangeLabel }> = []
  for (const addr of addresses) {
    const label = lookupAddress(addr)
    if (label) results.push({ address: addr, label })
  }
  return results
}
