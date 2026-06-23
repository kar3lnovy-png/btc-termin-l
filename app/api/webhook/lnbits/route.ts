import { json } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { getSocketServer } from '@/lib/socket'
import { stopPolling } from '@/lib/polling'

export const dynamic = 'force-dynamic'

type LnbitsWebhook = {
  payment_hash?: unknown
  payment_request?: unknown
}

export async function POST(request: Request) {
  let body: LnbitsWebhook

  try {
    body = (await request.json()) as LnbitsWebhook
  } catch {
    return json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const paymentHash = typeof body.payment_hash === 'string' ? body.payment_hash : ''
  if (!paymentHash) {
    return json({ error: 'INVALID_REQUEST' }, { status: 400 })
  }

  const session = await prisma.session.findUnique({ where: { paymentHash } })
  if (!session) {
    return json({ success: true })
  }

  if (session.status === 'PAID') {
    return json({ success: true })
  }

  const paidAt = new Date()
  await prisma.session.update({
    where: { id: session.id },
    data: { status: 'PAID', paidAt }
  })

  stopPolling(session.id)

  const payload = {
    invoiceId: session.id,
    paidAt: paidAt.toISOString(),
    amountSats: session.amountSats
  }
  const io = getSocketServer()
  io?.to(`invoice:${session.id}`).emit('payment:confirmed', payload)
  io?.to(`terminal:${session.terminalId}`).emit('payment:confirmed', payload)

  return json({ success: true })
}
