// Отримуємо курс USD/UAH з кількох джерел (fallback chain)
// 1. PrivatBank API — доступний з будь-яких IP
// 2. НБУ — офіційний, але може блокувати не-UA IP

export async function fetchUAHRate(): Promise<{ rate: number; source: string } | null> {
  // PrivatBank (primary — найнадійніший з не-UA серверів)
  try {
    const res  = await fetch('https://api.privatbank.ua/p24api/pubinfo?exchange&json&coursid=5', {
      signal: AbortSignal.timeout(6_000), cache: 'no-store',
    })
    const data = await res.json() as Array<{ ccy: string; base_ccy: string; buy: string; sale: string }>
    const usd  = data.find(r => r.ccy === 'USD' && r.base_ccy === 'UAH')
    if (usd?.sale) return { rate: parseFloat(usd.sale), source: 'PrivatBank' }
  } catch {}

  // НБУ (fallback)
  try {
    const res  = await fetch('https://bank.gov.ua/NBUStatWeb/v1/statdirectory/exchange?valcode=usd&json', {
      signal: AbortSignal.timeout(6_000), cache: 'no-store',
    })
    const data = await res.json() as Array<{ rate: number }>
    if (data[0]?.rate) return { rate: data[0].rate, source: 'НБУ' }
  } catch {}

  return null
}
