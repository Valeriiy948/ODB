'use client'

// Замінюємо старий компонент новим Web3 Forensics модулем
// Новий компонент читає/пише в таблицю crypto_wallets (migration 003)
// і підтримує: RiskBadge, OpenSanctions, граф транзакцій (Cytoscape)

import NewCryptoWalletsTab from '@/app/components/CryptoWalletsTab'

interface Props {
  personId:   string
  personName: string
}

export function CryptoWalletsTab({ personId }: Props) {
  return <NewCryptoWalletsTab personId={personId} />
}
