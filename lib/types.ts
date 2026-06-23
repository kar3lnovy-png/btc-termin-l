export const SESSION_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'] as const

export type SessionStatus = (typeof SESSION_STATUSES)[number]

export type InvoiceSessionResponse = {
  invoiceId: string
  paymentRequest: string
  amountSats: number
  amountCZK: number
  btcRateAtTime?: number
  expiresAt: string
  qrCodeBase64: string
  status: SessionStatus
}

export type PaymentConfirmedPayload = {
  invoiceId: string
  paidAt: string
  amountSats: number
}

export type PaymentExpiredPayload = {
  invoiceId: string
}

export type SessionCancelledPayload = {
  terminalId: string
}
