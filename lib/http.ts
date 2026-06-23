import { NextResponse } from 'next/server'

export function json<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init)
}

export function parsePositiveAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.round(value * 100) / 100
}

export function isExpired(expiresAt: Date) {
  return new Date() > expiresAt
}
