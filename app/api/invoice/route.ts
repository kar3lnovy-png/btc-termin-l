import QRCode from 'qrcode'
import { getBtcCzkRate, czkToSats } from '@/lib/exchange'
import { createInvoice } from '@/lib/lnbits'
import { json, parsePositiveAmount, isExpired } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { startPolling } from '@/lib/polling'

export const dynamic = 'force-dynamic'

type InvoiceRequest = {
  terminalId?: unknown
  amountCZK?: unknown
}

export async function POST(request: Request) {
  let body: InvoiceRequest

  try {
    body = (await request.json()) as InvoiceRequest
  } catch {
    return json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const terminalId = typeof body.terminalId === 'string' ? body.terminalId.trim() : ''
  const amountCZK = parsePositiveAmount(body.amountCZK)

  if (!terminalId || amountCZK === null) {
    return json({ error: 'INVALID_REQUEST' }, { status: 400 })
  }

  const terminal = await prisma.terminal.findUnique({ where: { id: terminalId } })
  if (!terminal) {
    return json({ error: 'TERMINAL_NOT_FOUND' }, { status: 404 })
  }

  const existing = await prisma.session.findFirst({
    where: { terminalId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  })

  if (existing) {
    if (isExpired(existing.expiresAt)) {
      await prisma.session.update({ where: { id: existing.id }, data: { status: 'EXPIRED' } })
    } else {
      return json({ error: 'TERMINAL_BUSY', existingInvoiceId: existing.id }, { status: 409 })
    }
  }

  let btcRateAtTime: number
  try {
    btcRateAtTime = await getBtcCzkRate()
  } catch {
    return json({ error: 'RATE_UNAVAILABLE' }, { status: 503 })
  }

  const amountSats = czkToSats(amountCZK, btcRateAtTime)

  let invoice: { payment_hash: string; payment_request: string }
  try {
    invoice = await createInvoice(amountSats, `${terminal.label}: ${amountCZK} CZK`)
  } catch {
    return json({ error: 'LIGHTNING_NODE_UNAVAILABLE' }, { status: 503 })
  }

  const expiresAt = new Date(Date.now() + 600_000)
  const session = await prisma.session.create({
    data: {
      terminalId,
      amountCZK,
      amountSats,
      btcRateAtTime,
      paymentRequest: invoice.payment_request,
      paymentHash: invoice.payment_hash,
      expiresAt
    }
  })

  const qrCodeBase64 = await QRCode.toDataURL(session.paymentRequest, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320
  })

  startPolling(session.id, session.paymentHash, terminalId)

  return json({
    invoiceId: session.id,
    paymentRequest: session.paymentRequest,
    amountSats: session.amountSats,
    amountCZK: session.amountCZK,
    btcRateAtTime: session.btcRateAtTime,
    expiresAt: session.expiresAt.toISOString(),
    qrCodeBase64
  })
}
