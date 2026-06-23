import { getBtcCzkRate, getRateCacheInfo } from '@/lib/exchange'
import { json } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  let db: 'ok' | 'unreachable' = 'ok'
  let lnbits: 'reachable' | 'unconfigured' | 'unreachable' = 'unconfigured'
  let btcRateCZK: number | null = null
  let rateAge: number | null = null

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'unreachable'
  }

  try {
    btcRateCZK = await getBtcCzkRate()
    rateAge = getRateCacheInfo().rateAge
  } catch {
    const cache = getRateCacheInfo()
    btcRateCZK = cache.btcRateCZK
    rateAge = cache.rateAge
  }

  if (process.env.LNBITS_URL && process.env.LNBITS_API_KEY) {
    try {
      const res = await fetch(`${process.env.LNBITS_URL.replace(/\/$/, '')}/api/v1/wallet`, {
        headers: { 'X-Api-Key': process.env.LNBITS_API_KEY }
      })
      lnbits = res.ok ? 'reachable' : 'unreachable'
    } catch {
      lnbits = 'unreachable'
    }
  }

  return json({
    status: db === 'ok' ? 'ok' : 'degraded',
    lnbits,
    db,
    btcRateCZK,
    rateAge
  })
}
