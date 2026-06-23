import type { Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { prisma } from '@/lib/prisma'

export type PosSocketServer = SocketIOServer

const globalForSocket = globalThis as unknown as {
  io?: PosSocketServer
}

export function initializeSocket(httpServer: HttpServer): PosSocketServer {
  if (globalForSocket.io) {
    return globalForSocket.io
  }

  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: process.env.NEXT_PUBLIC_BASE_URL ?? '*',
      methods: ['GET', 'POST']
    }
  })

  io.on('connection', (socket) => {
    socket.on('subscribe:terminal', async (payload: { terminalId?: string }) => {
      if (!payload.terminalId) {
        return
      }

      socket.join(`terminal:${payload.terminalId}`)
      const session = await prisma.session.findFirst({
        where: { terminalId: payload.terminalId, status: { in: ['PENDING', 'PAID', 'EXPIRED'] } },
        orderBy: { createdAt: 'desc' }
      })

      if (session?.status === 'PAID' && session.paidAt) {
        socket.emit('payment:confirmed', {
          invoiceId: session.id,
          paidAt: session.paidAt.toISOString(),
          amountSats: session.amountSats
        })
      } else if (session?.status === 'EXPIRED') {
        socket.emit('payment:expired', { invoiceId: session.id })
      }
    })

    socket.on('subscribe:invoice', async (payload: { invoiceId?: string }) => {
      if (!payload.invoiceId) {
        return
      }

      socket.join(`invoice:${payload.invoiceId}`)
      const session = await prisma.session.findUnique({ where: { id: payload.invoiceId } })

      if (session?.status === 'PAID' && session.paidAt) {
        socket.emit('payment:confirmed', {
          invoiceId: session.id,
          paidAt: session.paidAt.toISOString(),
          amountSats: session.amountSats
        })
      } else if (session?.status === 'EXPIRED') {
        socket.emit('payment:expired', { invoiceId: session.id })
      } else if (session?.status === 'CANCELLED') {
        socket.emit('session:cancelled', { terminalId: session.terminalId })
      }
    })
  })

  globalForSocket.io = io
  return io
}

export function getSocketServer(): PosSocketServer | null {
  return globalForSocket.io ?? null
}
