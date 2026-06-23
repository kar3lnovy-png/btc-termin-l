-- CreateTable
CREATE TABLE "Terminal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "terminalId" TEXT NOT NULL,
    "amountCZK" REAL NOT NULL,
    "amountSats" INTEGER NOT NULL,
    "btcRateAtTime" REAL NOT NULL,
    "paymentRequest" TEXT NOT NULL,
    "paymentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "paidAt" DATETIME,
    CONSTRAINT "Session_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_paymentHash_key" ON "Session"("paymentHash");

-- CreateIndex
CREATE INDEX "Session_terminalId_status_idx" ON "Session"("terminalId", "status");
