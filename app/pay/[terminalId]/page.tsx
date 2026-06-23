'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { io, type Socket } from 'socket.io-client'

type CustomerState = 'LOADING' | 'PENDING' | 'PAID' | 'EXPIRED' | 'NO_ACTIVE_SESSION'

type PendingSession = {
  status: 'PENDING'
  invoiceId: string
  paymentRequest: string
  amountSats: number
  amountCZK: number
  expiresAt: string
  qrCodeBase64: string
}

type FinishedSession = {
  status: 'PAID' | 'EXPIRED'
  invoiceId?: string
  paidAt?: string | null
  amountSats?: number
  amountCZK?: number
}

type PageProps = {
  params: {
    terminalId: string
  }
}

declare global {
  interface Window {
    webln?: any
  }
}

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

export default function PayPage({ params }: PageProps) {
  const { terminalId } = params
  const [state, setState] = useState<CustomerState>('LOADING')
  const [session, setSession] = useState<PendingSession | FinishedSession | null>(null)
  const [nowTick, setNowTick] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const webLnAttemptedRef = useRef<string | null>(null)

  const subscribe = useCallback((invoiceId: string) => {
    socketRef.current?.emit('subscribe:invoice', { invoiceId })
  }, [])

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/terminal/${encodeURIComponent(terminalId)}`, { cache: 'no-store' })

      if (res.status === 404) {
        setState('NO_ACTIVE_SESSION')
        setSession(null)
        return
      }

      const data = (await res.json()) as PendingSession | FinishedSession | { error: string }

      if ('status' in data && data.status === 'PENDING') {
        setSession(data)
        setState('PENDING')
        subscribe(data.invoiceId)
      } else if ('status' in data && data.status === 'PAID') {
        setSession(data)
        setState('PAID')
      } else if ('status' in data && data.status === 'EXPIRED') {
        setSession(data)
        setState('EXPIRED')
      } else {
        setState('NO_ACTIVE_SESSION')
      }
    } catch {
      setState('NO_ACTIVE_SESSION')
      setSession(null)
    }
  }, [subscribe, terminalId])

  useEffect(() => {
    const socket = io({ path: '/socket.io' })
    socketRef.current = socket

    socket.on('connect', () => {
      if (session?.invoiceId) {
        subscribe(session.invoiceId)
      }
    })
    socket.io.on('reconnect', () => {
      if (session?.invoiceId) {
        subscribe(session.invoiceId)
      }
      void loadSession()
    })
    socket.on('payment:confirmed', () => {
      setState('PAID')
    })
    socket.on('payment:expired', () => {
      setState('EXPIRED')
    })
    socket.on('session:cancelled', () => {
      setState('NO_ACTIVE_SESSION')
      setSession(null)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [loadSession, session?.invoiceId, subscribe])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (state !== 'PENDING' || !session || session.status !== 'PENDING') {
      return
    }

    if (webLnAttemptedRef.current === session.invoiceId) {
      return
    }

    webLnAttemptedRef.current = session.invoiceId

    async function tryWebLn() {
      if (!window.webln || !session || session.status !== 'PENDING') {
        return
      }

      try {
        await window.webln.enable()
        await window.webln.sendPayment(session.paymentRequest)
      } catch {
        webLnAttemptedRef.current = session.invoiceId
      }
    }

    void tryWebLn()
  }, [session, state])

  const pending = session?.status === 'PENDING' ? session : null
  const amountCZK = session && 'amountCZK' in session && typeof session.amountCZK === 'number' ? session.amountCZK : null
  const amountSats = session && 'amountSats' in session && typeof session.amountSats === 'number' ? session.amountSats : null
  const remaining = secondsLeft(pending?.expiresAt ?? null)
  void nowTick

  return (
    <main className="flex min-h-screen bg-bg px-6 py-7 text-text">
      <section className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col">
        {state === 'LOADING' && (
          <div className="flex flex-1 items-center justify-center text-center text-muted">Nacitam platbu...</div>
        )}

        {state === 'PENDING' && pending && (
          <div className="flex flex-1 flex-col">
            <div className="text-4xl font-bold text-accent">⚡</div>
            <div className="mt-10">
              <div className="text-3xl font-semibold">Zaplatte</div>
              <div className="mt-2 text-6xl font-bold leading-none">{formatCZK(pending.amountCZK)} Kč</div>
              <div className="mt-4 font-mono text-xl text-muted">{formatSats(pending.amountSats)} sats</div>
            </div>

            <div className="my-8 flex justify-center">
              <Image
                src={pending.qrCodeBase64}
                alt="Lightning QR kod"
                width={256}
                height={256}
                unoptimized
                className="h-64 w-64 border-8 border-white bg-white object-contain"
              />
            </div>

            <a
              href={`lightning:${pending.paymentRequest}`}
              className="flex h-14 items-center justify-center bg-accent text-center text-lg font-bold text-black"
            >
              Otevrit penezenku
            </a>

            <div className="mt-5 text-center text-sm text-muted">vyprsi za {formatTimer(remaining)}</div>
          </div>
        )}

        {state === 'PAID' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="text-8xl font-bold text-confirmed">✓</div>
            <div className="mt-8 text-4xl font-bold leading-tight">Dekujeme</div>
            <div className="text-4xl font-bold leading-tight">za platbu!</div>
            {amountCZK !== null && amountSats !== null && (
              <div className="mt-8 text-base text-muted">
                {formatCZK(amountCZK)} Kč · {formatSats(amountSats)} sats
              </div>
            )}
          </div>
        )}

        {state === 'EXPIRED' && (
          <div className="flex flex-1 flex-col">
            <div className="text-4xl font-bold text-accent">⚡</div>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="text-7xl font-bold text-error">×</div>
              <div className="mt-8 text-2xl font-bold">Platba vyprsela</div>
              <div className="mt-5 text-base leading-7 text-muted">
                Kontaktujte
                <br />
                obsluhu.
              </div>
            </div>
          </div>
        )}

        {state === 'NO_ACTIVE_SESSION' && (
          <div className="flex flex-1 flex-col">
            <div className="text-4xl font-bold text-accent">⚡</div>
            <div className="flex flex-1 flex-col justify-center">
              <div className="text-3xl font-bold leading-tight">
                Terminal neni
                <br />
                aktivni.
              </div>
              <div className="mt-6 text-lg leading-8 text-muted">
                Pozadejte obsluhu
                <br />o vystaveni uctu.
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
