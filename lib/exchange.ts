type RateCache = {
  value: number
  fetchedAt: number
}

let rateCache: RateCache | null = null

export async function getBtcCzkRate(): Promise<number> {
  const ttl = Number.parseInt(process.env.RATE_CACHE_TTL_SECONDS ?? '60', 10) * 1000

  if (rateCache && Date.now() - rateCache.fetchedAt < ttl) {
    return rateCache.value
  }

  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=czk', {
    next: { revalidate: 0 }
  })

  if (!res.ok) {
    if (rateCache) {
      return rateCache.value
    }
    throw new Error('RATE_UNAVAILABLE')
  }

  const data = (await res.json()) as { bitcoin?: { czk?: number } }
  const value = data.bitcoin?.czk

  if (!value || !Number.isFinite(value) || value <= 0) {
    if (rateCache) {
      return rateCache.value
    }
    throw new Error('RATE_UNAVAILABLE')
  }

  rateCache = { value, fetchedAt: Date.now() }
  return value
}

export function czkToSats(amountCZK: number, btcRateCZK: number): number {
  const haler = Math.round(amountCZK * 100)
  const rateHaler = Math.round(btcRateCZK * 100)
  return Math.ceil((haler * 100_000_000) / rateHaler)
}

export function getRateCacheInfo() {
  return {
    btcRateCZK: rateCache?.value ?? null,
    rateAge: rateCache ? Math.floor((Date.now() - rateCache.fetchedAt) / 1000) : null
  }
}
