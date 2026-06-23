import { json } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { stopPolling } from '@/lib/polling'
import { getSocketServer } from '@/lib/socket'

export const dynamic = 'force-dynamic'

type CancelRequest = {
  terminalId?: unknown
}

export async function POST(request: Request) {
  let body: CancelRequest

  try {
    body = (await request.json()) as CancelRequest
  } catch {
    return json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const terminalId = typeof body.terminalId === 'string' ? body.terminalId.trim() : ''
  if (!terminalId) {
    return json({ error: 'INVALID_REQUEST' }, { status: 400 })
  }

  const session = await prisma.session.findFirst({
    where: { terminalId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  })

  if (session) {
    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'CANCELLED' }
    })
    stopPolling(session.id)
    getSocketServer()?.to(`invoice:${session.id}`).emit('session:cancelled', { terminalId })
  }

  return json({ success: true })
}
