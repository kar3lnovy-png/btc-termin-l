# Lightning POS MVP

Web-based Bitcoin Lightning point of sale for brick-and-mortar terminals. Staff create a CZK-denominated invoice on `/merchant/[terminalId]`; customers scan or tap an NFC tag that opens `/pay/[terminalId]` and pay the active Lightning invoice.

## Stack

- Next.js 14 App Router with strict TypeScript
- Custom Node server with Socket.io 4
- SQLite via Prisma ORM
- LNbits REST API using an invoice key
- CoinGecko BTC/CZK rate cache
- Server-generated QR codes
- Tailwind CSS v3

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and fill in `LNBITS_URL` plus `LNBITS_API_KEY`.

3. Create the local SQLite database:

   ```bash
   npx prisma generate
   sqlite3 prisma/pos.db < prisma/migrations/20260623133100_init/migration.sql
   npx prisma db seed
   ```

   The schema stores session status as a string because Prisma's SQLite connector does not support enum fields. The application uses the same four values from the spec: `PENDING`, `PAID`, `EXPIRED`, and `CANCELLED`.

4. Start the custom server:

   ```bash
   npm run dev
   ```

5. Open:

   - Merchant tablet: `http://localhost:3000/merchant/terminal-1`
   - Customer NFC URL: `http://localhost:3000/pay/terminal-1`
   - Health: `http://localhost:3000/api/health`

## LNbits

Use an invoice key, not an admin key. `POST /api/invoice` creates an invoice with a 600 second expiry and registers `/api/webhook/lnbits` as the webhook when `NEXT_PUBLIC_BASE_URL` is set.

The server also polls LNbits every two seconds for each active invoice, so webhook delivery is not the only confirmation path.

## Deployment Notes

- Run behind HTTPS for real NFC/WebLN usage.
- Set `NEXT_PUBLIC_BASE_URL` to the public origin, for example `https://pos.example.com`.
- Back up `prisma/pos.db` regularly.
- Configure NFC tags to open `/pay/[terminalId]`.
- Run exactly one app instance for this MVP because active pollers are in process memory.

## API

- `POST /api/invoice`
- `POST /api/invoice/cancel`
- `GET /api/session/terminal/[terminalId]`
- `POST /api/webhook/lnbits`
- `GET /api/health`
