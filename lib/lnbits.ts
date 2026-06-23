const LNBITS_URL = process.env.LNBITS_URL
const LNBITS_API_KEY = process.env.LNBITS_API_KEY

type LnbitsInvoice = {
  payment_hash: string
  payment_request: string
}

type LnbitsPaymentStatus = {
  paid?: boolean
}

function getLnbitsConfig() {
  if (!LNBITS_URL || !LNBITS_API_KEY) {
    throw new Error('LNBITS_CONFIG_MISSING')
  }

  return {
    url: LNBITS_URL.replace(/\/$/, ''),
    apiKey: LNBITS_API_KEY
  }
}

export async function createInvoice(amountSats: number, memo: string): Promise<LnbitsInvoice> {
  const { url, apiKey } = getLnbitsConfig()
  const webhookBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '')

  const res = await fetchWithRetry(`${url}/api/v1/payments`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      out: false,
      amount: amountSats,
      memo,
      expiry: 600,
      ...(webhookBaseUrl ? { webhook: `${webhookBaseUrl}/api/webhook/lnbits` } : {})
    })
  })

  if (!res.ok) {
    throw new Error('LNBITS_CREATE_FAILED')
  }

  const data = (await res.json()) as Partial<LnbitsInvoice>
  if (!data.payment_hash || !data.payment_request) {
    throw new Error('LNBITS_CREATE_INVALID_RESPONSE')
  }

  return {
    payment_hash: data.payment_hash,
    payment_request: data.payment_request
  }
}

export async function checkInvoicePaid(paymentHash: string): Promise<boolean> {
  const { url, apiKey } = getLnbitsConfig()
  const res = await fetch(`${url}/api/v1/payments/${paymentHash}`, {
    headers: { 'X-Api-Key': apiKey }
  })

  if (!res.ok) {
    return false
  }

  const data = (await res.json()) as LnbitsPaymentStatus
  return data.paid === true
}

async function fetchWithRetry(url: string, options: RequestInit, attempts = 3): Promise<Response> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url, options)
    } catch (error) {
      if (i === attempts - 1) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** i))
    }
  }

  throw new Error('FETCH_RETRY_EXHAUSTED')
}
