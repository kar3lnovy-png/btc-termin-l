import { createServer } from 'node:http'
import next from 'next'
import { initializeSocket } from './lib/socket'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME ?? '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    void handle(req, res)
  })

  initializeSocket(httpServer)

  httpServer.listen(port, hostname, () => {
    console.log(`Lightning POS ready on http://${hostname}:${port}`)
  })
})
