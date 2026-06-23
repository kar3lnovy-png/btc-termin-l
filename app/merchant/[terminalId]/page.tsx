'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

type MerchantState = 'IDLE' | 'PENDING' | 'PAID' | 'EXPIRED' | 'ERROR'

type InvoiceResponse = {
  invoiceId: string
  paymentRequest: string
  amountSats: number
  amountCZK: number
  btcRateAtTime: number
  expiresAt: string
  qrCodeBase64: string
}

type PaymentConfirmedPayload = {
  invoiceId: string
  paidAt: string
  amountSats: number
}

type PageProps = {
  params: {
    terminalId: string
  }
}

const keypad = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'back', '0', ',']

function formatCZK(value: number) {
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(value)
}

function formatSats(value: number) {
  return new Intl.NumberFormat('cs-CZ').format(value)
}

function secondsLeft(expiresAt: string | null) {
  if (!expiresAt) {
    return 0
  }
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

export default function MerchantPage({ params }: PageProps) {
  const { terminalId } = params
  const [amountInput, setAmountInput] = useState('')
  const [btcRate, setBtcRate] = useState<number | null>(null)
  const [state, setState] = useState<MerchantState>('IDLE')
  const [session, setSession] = useState<InvoiceResponse | null>(null)
  const [paidAt, setPaidAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(0)
  const socketRef = useRef<Socket | null>(null)

  const amountCZK = useMemo(() => {
    const normalized = amountInput.replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }, [amountInput])

  const liveSats = useMemo(() => {
    if (!btcRate || amountCZK <= 0) {
      return 0
    }
    const haler = Math.round(amountCZK * 100)
    const rateHaler = Math.round(btcRate * 100)
    return Math.ceil((haler * 100_000_000) / rateHaler)
  }, [amountCZK, btcRate])

  useEffect(() => {
    const socket = io({ path: '/socket.io' })
    socketRef.current = socket

    const subscribe = () => socket.emit('subscribe:terminal', { terminalId })
    socket.on('connect', subscribe)
    socket.on('reconnect', subscribe)
    socket.on('payment:confirmed', (payload: PaymentConfirmedPayload) => {
      setPaidAt(payload.paidAt)
      setState('PAID')
      window.setTimeout(() => resetToIdle(), 5000)
    })
    socket.on('payment:expired', () => {
      setState('EXPIRED')
      window.setTimeout(() => resetToIdle(), 3000)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [terminalId])

  useEffect(() => {
    async function loadRate() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        const data = (await res.json()) as { btcRateCZK?: number | null }
        if (typeof data.btcRateCZK === 'number') {
          setBtcRate(data.btcRateCZK)
        }
      } catch {
        setBtcRate(null)
      }
    }

    void loadRate()
    const interval = window.setInterval(loadRate, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [])

  function resetToIdle() {
    setState('IDLE')
    setSession(null)
    setPaidAt(null)
    setError(null)
    setAmountInput('')
  }

  function pressKey(key: string) {
    if (state !== 'IDLE') {
      return
    }

    setAmountInput((current) => {
      if (key === 'back') {
        return current.slice(0, -1)
      }
      if (key === ',') {
        return current.includes(',') || current.length === 0 ? current : `${current},`
      }
      if (current.includes(',')) {
        const decimals = current.split(',')[1] ?? ''
        if (decimals.length >= 2) {
          return current
        }
      }
      if (current === '0' && key !== ',') {
        return key
      }
      return `${current}${key}`
    })
  }

  async function requestPayment() {
    if (amountCZK <= 0) {
      setError('Zadejte castku')
      return
    }

    setState('PENDING')
    setError(null)

    try {
      const res = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId, amountCZK })
      })

      const data = (await res.json()) as InvoiceResponse | { error: string; existingInvoiceId?: string }

      if (!res.ok) {
        setState('ERROR')
        setError('error' in data && data.error === 'TERMINAL_BUSY' ? 'Terminal uz ceka na platbu' : 'Platbu nelze vytvorit')
        return
      }

      const invoice = data as InvoiceResponse
      setSession(invoice)
      socketRef.current?.emit('subscribe:terminal', { terminalId })
    } catch {
      setState('ERROR')
      setError('Server neni dostupny')
    }
  }

  async function cancelPayment() {
    await fetch('/api/invoice/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId })
    })
    resetToIdle()
  }

  const remaining = secondsLeft(session?.expiresAt ?? null)
  const progress = session ? Math.max(0, Math.min(100, (remaining / 600) * 100)) : 0
  void nowTick

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4 text-text">
      <section className="flex min-h-[680px] w-full max-w-[460px] flex-col border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="text-lg font-bold text-accent">Lightning POS</div>
          <div className="rounded border border-border px-3 py-1 text-sm text-muted">{terminalId}</div>
        </header>

        {state === 'IDLE' && (
          <div className="flex flex-1 flex-col px-6 py-8">
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="min-h-[82px] text-center font-mono text-[64px] font-bold leading-none">
                {amountInput ? formatCZK(amountCZK) : '0'} Kč
              </div>
              <div className="font-mono text-2xl text-muted">≈ {formatSats(liveSats)} sats</div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {keypad.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pressKey(key)}
                  className="h-20 border border-border bg-bg font-mono text-3xl font-semibold text-text active:border-accent"
                  aria-label={key === 'back' ? 'Smazat' : key}
                >
                  {key === 'back' ? '⌫' : key}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={requestPayment}
              className="mt-5 h-16 bg-accent text-lg font-bold uppercase tracking-wide text-black disabled:opacity-40"
              disabled={amountCZK <= 0}
            >
              Vyzadat platbu
            </button>
            <div className="mt-5 flex items-center justify-between text-sm text-muted">
              <span>Kurz: {btcRate ? `1 BTC = ${formatCZK(btcRate)} Kč` : 'nedostupny'}</span>
              <span className={btcRate ? 'text-confirmed' : 'text-error'}>{btcRate ? 'online' : 'offline'}</span>
            </div>
            {error && <div className="mt-3 text-center text-sm text-error">{error}</div>}
          </div>
        )}

        {state === 'PENDING' && session && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8 text-center">
            <div className="text-sm font-bold uppercase tracking-[0.24em] text-muted">Cekam na platbu</div>
            <div>
              <div className="text-5xl font-bold">{formatCZK(session.amountCZK)} Kč</div>
              <div className="mt-3 font-mono text-2xl text-muted">{formatSats(session.amountSats)} sats</div>
            </div>
            <div className="w-full">
              <div className="h-4 w-full overflow-hidden bg-bg">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-3 font-mono text-xl text-muted">{formatTimer(remaining)}</div>
            </div>
            <button type="button" onClick={cancelPayment} className="h-14 w-full border border-error text-lg font-bold text-error">
              Zrusit
            </button>
          </div>
        )}

        {state === 'PENDING' && !session && (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-muted">Vytvarim fakturu...</div>
        )}

        {state === 'PAID' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
            <div className="text-8xl font-bold text-confirmed">✓</div>
            <div className="text-4xl font-bold text-confirmed">ZAPLACENO</div>
            {session && (
              <div className="text-lg text-muted">
                {formatCZK(session.amountCZK)} Kč · {formatSats(session.amountSats)} sats
              </div>
            )}
            <div className="font-mono text-muted">{paidAt ? new Date(paidAt).toLocaleTimeString('cs-CZ') : ''}</div>
            <button type="button" onClick={resetToIdle} className="h-14 w-full bg-accent font-bold uppercase text-black">
              Nova platba
            </button>
            <div className="text-sm text-muted">Auto-reset za 5 sekund...</div>
          </div>
        )}

        {(state === 'EXPIRED' || state === 'ERROR') && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
            <div className="text-7xl font-bold text-error">×</div>
            <div className="text-3xl font-bold">{state === 'EXPIRED' ? 'Platba vyprsela' : 'Chyba'}</div>
            <div className="text-muted">{error ?? 'Zkuste vystavit novou platbu.'}</div>
            <button type="button" onClick={resetToIdle} className="h-14 w-full bg-accent font-bold uppercase text-black">
              Nova platba
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
