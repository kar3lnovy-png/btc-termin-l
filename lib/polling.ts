import { checkInvoicePaid } from '@/lib/lnbits'
import { prisma } from '@/lib/prisma'
import { getSocketServer } from '@/lib/socket'

const activePollers = new Map<string, NodeJS.Timeout>()

export function startPolling(invoiceId: string, paymentHash: string, terminalId: string) {
  if (activePollers.has(invoiceId)) {
    return
  }

  const interval = setInterval(async () => {
    try {
      const session = await prisma.session.findUnique({ where: { id: invoiceId } })

      if (!session || session.status !== 'PENDING') {
        stopPolling(invoiceId)
        return
      }

      const io = getSocketServer()

      if (new Date() > session.expiresAt) {
        await prisma.session.update({
          where: { id: invoiceId },
          data: { status: 'EXPIRED' }
        })
        io?.to(`invoice:${invoiceId}`).emit('payment:expired', { invoiceId })
        io?.to(`terminal:${terminalId}`).emit('payment:expired', { invoiceId })
        stopPolling(invoiceId)
        return
      }

      const paid = await checkInvoicePaid(paymentHash)
      if (paid) {
        const paidAt = new Date()
        await prisma.session.update({
          where: { id: invoiceId },
          data: { status: 'PAID', paidAt }
        })
        const payload = { invoiceId, paidAt: paidAt.toISOString(), amountSats: session.amountSats }
        io?.to(`invoice:${invoiceId}`).emit('payment:confirmed', payload)
        io?.to(`terminal:${terminalId}`).emit('payment:confirmed', payload)
        stopPolling(invoiceId)
      }
    } catch (error) {
      console.error(`Polling error for ${invoiceId}:`, error)
    }
  }, 2000)

  activePollers.set(invoiceId, interval)
}

export function stopPolling(invoiceId: string) {
  const interval = activePollers.get(invoiceId)
  if (interval) {
    clearInterval(interval)
    activePollers.delete(invoiceId)
  }
}

export function getActivePollerCount() {
  return activePollers.size
}
