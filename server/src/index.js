import 'dotenv/config'
import { createServer } from 'node:http'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT) || 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
})

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)
  socket.emit('server:welcome', {
    message: 'Connected to Game Party server',
    socketId: socket.id,
  })
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Game Party Socket.IO server listening on port ${PORT}`)
})
