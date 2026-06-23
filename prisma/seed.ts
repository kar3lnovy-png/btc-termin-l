import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function parseEnvList(value: string | undefined, fallback: string[]): string[] {
  const parsed = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return parsed && parsed.length > 0 ? parsed : fallback
}

async function main() {
  const terminalIds = parseEnvList(process.env.TERMINAL_IDS, ['terminal-1', 'terminal-2']).slice(0, 5)
  const labels = parseEnvList(process.env.TERMINAL_LABELS, ['Hlavni pokladna', 'Bar'])

  await Promise.all(
    terminalIds.map((id, index) =>
      prisma.terminal.upsert({
        where: { id },
        create: {
          id,
          label: labels[index] ?? id
        },
        update: {
          label: labels[index] ?? id
        }
      })
    )
  )
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
