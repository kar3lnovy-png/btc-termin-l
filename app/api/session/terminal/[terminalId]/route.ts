import QRCode from 'qrcode'
import { json, isExpired } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { getSocketServer } from '@/lib/socket'
import { stopPolling } from '@/lib/polling'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: {
    terminalId: string
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const terminalId = params.terminalId
  const session = await prisma.session.findFirst({
    where: {
      terminalId,
      status: { in: ['PENDING', 'PAID', 'EXPIRED'] }
    },
    orderBy: { createdAt: 'desc' }
  })

  if (!session) {
    return json({ error: 'NO_ACTIVE_SESSION' }, { status: 404 })
  }

  if (session.status === 'PENDING' && isExpired(session.expiresAt)) {
    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'EXPIRED' }
    })
    stopPolling(session.id)
    getSocketServer()?.to(`invoice:${session.id}`).emit('payment:expired', { invoiceId: session.id })
    getSocketServer()?.to(`terminal:${terminalId}`).emit('payment:expired', { invoiceId: session.id })

    return json({
      status: 'EXPIRED',
      invoiceId: session.id,
      amountCZK: session.amountCZK,
      amountSats: session.amountSats
    })
  }

  if (session.status === 'PAID') {
    return json({
      status: 'PAID',
      invoiceId: session.id,
      paidAt: session.paidAt?.toISOString() ?? null,
      amountCZK: session.amountCZK,
      amountSats: session.amountSats
    })
  }

  if (session.status === 'EXPIRED') {
    return json({
      status: 'EXPIRED',
      invoiceId: session.id,
      amountCZK: session.amountCZK,
      amountSats: session.amountSats
    })
  }

  const qrCodeBase64 = await QRCode.toDataURL(session.paymentRequest, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320
  })

  return json({
    invoiceId: session.id,
    paymentRequest: session.paymentRequest,
    amountSats: session.amountSats,
    amountCZK: session.amountCZK,
    expiresAt: session.expiresAt.toISOString(),
    qrCodeBase64,
    status: 'PENDING'
  })
}
