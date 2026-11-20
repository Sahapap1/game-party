import 'dotenv/config'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { registerRoomHandlers } from './games/card-exchange/room-manager.js'

const PORT = Number(process.env.PORT) || 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url))
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const httpServer = createServer(async (req, res) => {
  if (req.url?.startsWith('/socket.io/')) return
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
    const safePath = normalize(pathname).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/, '')
    let filePath = join(CLIENT_DIST, safePath || 'index.html')
    try {
      if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html')
    } catch {
      filePath = join(CLIENT_DIST, 'index.html')
    }
    const body = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN ? CLIENT_ORIGIN.split(',').map((value) => value.trim()) : true,
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout: 20000,
})

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)
  registerRoomHandlers(io, socket)
  socket.on('disconnect', (reason) => console.log(`[socket] disconnected: ${socket.id} (${reason})`))
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Game Party server listening on port ${PORT}`)
})
