import { randomInt, randomUUID } from 'node:crypto'
import { createDeck, shuffle } from './deck.js'

const rooms = new Map()
const MAX_PLAYERS = 12
const EXCHANGE_TIMEOUT_MS = 15_000
const DISCONNECT_GRACE_MS = 60_000

function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 18) : ''
}

function createRoomId() {
  let id
  do { id = String(randomInt(100000, 1000000)) } while (rooms.has(id))
  return id
}

function findPlayer(room, socketId) {
  return room.players.find((player) => player.id === socketId)
}

function clearPending(room) {
  if (room.pendingExchange?.timer) clearTimeout(room.pendingExchange.timer)
  room.pendingExchange = null
}

function publicState(room, viewerId) {
  const reveal = room.status === 'finished'
  return {
    roomId: room.id,
    status: room.status,
    hostId: room.hostId,
    you: viewerId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      hasPlayed: player.hasPlayed,
      card: reveal || player.id !== viewerId ? player.card : null,
    })),
    currentTurn: room.currentTurn,
    turnNumber: room.turnIndex + 1,
    totalTurns: room.turnOrder.length,
    deckCount: room.deck.length,
    pendingExchange: room.pendingExchange ? {
      fromId: room.pendingExchange.fromId,
      toId: room.pendingExchange.toId,
      expiresAt: room.pendingExchange.expiresAt,
      isIncoming: room.pendingExchange.toId === viewerId,
      isOutgoing: room.pendingExchange.fromId === viewerId,
    } : null,
    results: room.results,
    youReturned: Boolean(room.returnedPlayers?.includes(viewerId)),
    returnedPlayers: room.returnedPlayers?.length || 0,
    connectedPlayers: room.players.filter((player) => player.connected).length,
  }
}

function broadcastRoom(io, room) {
  for (const player of room.players) {
    if (player.connected) io.to(player.id).emit('room:state', publicState(room, player.id))
  }
}

function error(socket, message, code = 'GAME_ERROR') {
  socket.emit('game:error', { message, code })
}

function finishGame(io, room) {
  room.currentTurn = null
  room.status = 'finished'
  const cards = room.players.filter((player) => player.card)
  const lowest = cards.length ? Math.min(...cards.map((player) => player.card.value)) : null
  const highest = cards.length ? Math.max(...cards.map((player) => player.card.value)) : null
  room.results = {
    lowest: cards.filter((player) => player.card.value === lowest).map(({ id, name, card }) => ({ id, name, card })),
    highest: cards.filter((player) => player.card.value === highest).map(({ id, name, card }) => ({ id, name, card })),
  }
  broadcastRoom(io, room)
  io.to(room.id).emit('game:ended', room.results)
}

function advanceTurn(io, room) {
  clearPending(room)
  const current = room.players.find((player) => player.id === room.currentTurn)
  if (current) current.hasPlayed = true

  while (room.turnIndex + 1 < room.turnOrder.length) {
    room.turnIndex += 1
    const nextId = room.turnOrder[room.turnIndex]
    const next = room.players.find((player) => player.id === nextId)
    if (next && next.connected && !next.hasPlayed) {
      room.currentTurn = next.id
      broadcastRoom(io, room)
      io.to(room.id).emit('turn:changed', { playerId: room.currentTurn })
      return
    }
    if (next) next.hasPlayed = true
  }

  finishGame(io, room)
}

function removePlayer(io, room, player) {
  const wasCurrent = room.currentTurn === player.id
  const wasTarget = room.pendingExchange?.toId === player.id
  const wasRequester = room.pendingExchange?.fromId === player.id
  clearPending(room)
  room.players = room.players.filter((entry) => entry.id !== player.id)
  room.turnOrder = room.turnOrder.filter((id) => id !== player.id)
  if (room.hostId === player.id) room.hostId = room.players.find((entry) => entry.connected)?.id || room.players[0]?.id || null

  if (room.status === 'playing' && wasCurrent) {
    room.turnIndex = room.turnOrder.indexOf(player.id) - 1
    const next = room.turnOrder.find((id) => {
      const candidate = room.players.find((entry) => entry.id === id)
      return candidate?.connected && !candidate.hasPlayed
    })
    if (next) {
      room.currentTurn = next
      room.turnIndex = room.turnOrder.indexOf(next)
    } else {
      room.currentTurn = null
      room.status = 'finished'
    }
  } else if ((wasTarget || wasRequester) && room.status === 'playing') {
    room.currentTurn = room.pendingExchange?.fromId || room.currentTurn
  }

  if (room.players.length === 0) {
    clearTimeout(room.cleanupTimer)
    rooms.delete(room.id)
  } else if (room.status === 'playing' && (room.players.length === 1 || (wasCurrent && !room.turnOrder.some((id) => room.players.some((entry) => entry.id === id && entry.connected && !entry.hasPlayed))))) {
    finishGame(io, room)
  } else {
    broadcastRoom(io, room)
  }
}

export function registerRoomHandlers(io, socket) {
  socket.on('room:create', ({ name } = {}, ack = () => {}) => {
    const playerName = cleanName(name)
    if (!playerName) return ack({ ok: false, message: 'กรุณาใส่ชื่อผู้เล่น' })
    const id = createRoomId()
    const player = { id: socket.id, token: randomUUID(), name: playerName, card: null, connected: true, hasPlayed: false }
    const room = {
      id, hostId: socket.id, players: [player], status: 'lobby',
      deck: [], discardPile: [], turnOrder: [], turnIndex: -1,
      currentTurn: null, pendingExchange: null, results: null, returnedPlayers: [], cleanupTimer: null,
    }
    rooms.set(id, room)
    socket.join(id)
    ack({ ok: true, roomId: id, playerToken: player.token })
    broadcastRoom(io, room)
  })

  socket.on('room:join', ({ roomId, name } = {}, ack = () => {}) => {
    const id = String(roomId || '').trim()
    const playerName = cleanName(name)
    const room = rooms.get(id)
    if (!room) return ack({ ok: false, message: 'ไม่พบห้องนี้ กรุณาตรวจสอบเลขห้อง' })
    if (room.status !== 'lobby') return ack({ ok: false, message: 'เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้' })
    if (!playerName) return ack({ ok: false, message: 'กรุณาใส่ชื่อผู้เล่น' })
    if (room.players.length >= MAX_PLAYERS) return ack({ ok: false, message: `ห้องเต็มแล้ว (สูงสุด ${MAX_PLAYERS} คน)` })
    if (room.players.some((player) => player.name.toLowerCase() === playerName.toLowerCase())) return ack({ ok: false, message: 'ชื่อนี้มีคนใช้แล้วในห้อง' })
    const player = { id: socket.id, token: randomUUID(), name: playerName, card: null, connected: true, hasPlayed: false }
    room.players.push(player)
    socket.join(id)
    ack({ ok: true, roomId: id, playerToken: player.token })
    broadcastRoom(io, room)
  })

  socket.on('room:rejoin', ({ roomId, playerToken } = {}, ack = () => {}) => {
    const room = rooms.get(String(roomId || ''))
    const player = room?.players.find((entry) => entry.token === playerToken)
    if (!room || !player) return ack({ ok: false, message: 'ไม่พบข้อมูลผู้เล่นเดิม ห้องอาจถูกปิดแล้ว' })
    const previousId = player.id
    player.id = socket.id
    player.connected = true
    if (room.hostId === previousId) room.hostId = socket.id
    if (room.currentTurn === previousId) room.currentTurn = socket.id
    if (room.pendingExchange) {
      if (room.pendingExchange.fromId === previousId) room.pendingExchange.fromId = socket.id
      if (room.pendingExchange.toId === previousId) room.pendingExchange.toId = socket.id
    }
    room.turnOrder = room.turnOrder.map((id) => id === previousId ? socket.id : id)
    socket.join(room.id)
    ack({ ok: true, roomId: room.id, playerToken: player.token })
    broadcastRoom(io, room)
  })

  socket.on('room:kick', ({ targetId } = {}, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    const target = room?.players.find((player) => player.id === targetId)
    if (!room || room.hostId !== socket.id) return ack({ ok: false, message: 'เฉพาะ Host เท่านั้นที่เตะผู้เล่นได้' })
    if (room.status !== 'lobby') return ack({ ok: false, message: 'สามารถเตะผู้เล่นได้เฉพาะตอนอยู่ในห้องรอ' })
    if (!target || target.id === socket.id) return ack({ ok: false, message: 'ไม่สามารถเลือกผู้เล่นคนนี้ได้' })
    io.to(target.id).emit('room:kicked')
    io.in(target.id).socketsLeave(room.id)
    removePlayer(io, room, target)
    ack({ ok: true })
  })

  socket.on('game:start', (_payload, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    if (!room || room.hostId !== socket.id) return ack({ ok: false, message: 'เฉพาะ Host เท่านั้นที่เริ่มเกมได้' })
    if (room.status !== 'lobby') return ack({ ok: false, message: 'เกมเริ่มไปแล้ว' })
    if (room.players.length < 2) return ack({ ok: false, message: 'ต้องมีผู้เล่นอย่างน้อย 2 คน' })
    if (room.players.some((player) => !player.connected)) return ack({ ok: false, message: 'ผู้เล่นทุกคนต้องออนไลน์อยู่' })

    const deck = shuffle(createDeck())
    room.players.forEach((player) => { player.card = deck.pop(); player.hasPlayed = false })
    room.deck = deck
    room.discardPile = []
    room.turnOrder = shuffle(room.players.map((player) => player.id))
    room.turnIndex = 0
    room.currentTurn = room.turnOrder[0]
    room.status = 'playing'
    room.results = null
    room.returnedPlayers = []
    ack({ ok: true })
    io.to(room.id).emit('game:started')
    broadcastRoom(io, room)
    io.to(room.id).emit('turn:changed', { playerId: room.currentTurn })
  })

  socket.on('turn:skip', (_payload, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    if (!room || room.status !== 'playing' || room.currentTurn !== socket.id || room.pendingExchange) return ack({ ok: false, message: 'ยังไม่ใช่เทิร์นของคุณ' })
    ack({ ok: true })
    advanceTurn(io, room)
  })

  socket.on('turn:draw', (_payload, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    if (!room || room.status !== 'playing' || room.currentTurn !== socket.id || room.pendingExchange) return ack({ ok: false, message: 'ยังไม่ใช่เทิร์นของคุณ' })
    if (room.deck.length === 0 && room.discardPile.length > 0) {
      room.deck = shuffle(room.discardPile)
      room.discardPile = []
    }
    if (room.deck.length === 0) return ack({ ok: false, message: 'กองกลางหมดแล้ว ไม่สามารถจั่วได้' })
    const player = findPlayer(room, socket.id)
    room.discardPile.push(player.card)
    player.card = room.deck.pop()
    ack({ ok: true })
    advanceTurn(io, room)
  })

  socket.on('exchange:request', ({ targetId } = {}, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    const target = room?.players.find((player) => player.id === targetId)
    if (!room || room.status !== 'playing' || room.currentTurn !== socket.id || room.pendingExchange) return ack({ ok: false, message: 'ยังไม่ใช่เทิร์นของคุณ' })
    if (!target || !target.connected || target.id === socket.id) return ack({ ok: false, message: 'ไม่สามารถเลือกผู้เล่นคนนี้ได้' })
    room.pendingExchange = { fromId: socket.id, toId: target.id, expiresAt: Date.now() + EXCHANGE_TIMEOUT_MS, timer: null }
    room.pendingExchange.timer = setTimeout(() => {
      if (room.pendingExchange?.fromId !== socket.id || room.pendingExchange?.toId !== target.id) return
      clearPending(room)
      io.to(socket.id).emit('exchange:timeout', { message: 'หมดเวลารอการตอบรับ ลองเลือกใหม่ได้เลย' })
      broadcastRoom(io, room)
    }, EXCHANGE_TIMEOUT_MS)
    ack({ ok: true })
    io.to(target.id).emit('exchange:incoming', { fromId: socket.id, fromName: findPlayer(room, socket.id)?.name, expiresAt: room.pendingExchange.expiresAt })
    broadcastRoom(io, room)
  })

  socket.on('exchange:respond', ({ accept } = {}, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    const pending = room?.pendingExchange
    if (!room || room.status !== 'playing' || !pending || pending.toId !== socket.id) return ack({ ok: false, message: 'ไม่มีคำขอแลกไพ่ที่รอคุณอยู่' })
    const requester = room.players.find((player) => player.id === pending.fromId)
    const target = findPlayer(room, socket.id)
    if (!requester || !target) return ack({ ok: false, message: 'ผู้เล่นไม่อยู่ในห้องแล้ว' })
    clearPending(room)
    if (accept === true) {
      ;[requester.card, target.card] = [target.card, requester.card]
      ack({ ok: true, accepted: true })
      io.to(room.id).emit('exchange:completed', { fromId: requester.id, toId: target.id })
      advanceTurn(io, room)
    } else {
      ack({ ok: true, accepted: false })
      io.to(requester.id).emit('exchange:rejected', { targetName: target.name })
      broadcastRoom(io, room)
    }
  })

  socket.on('room:return-lobby', (_payload, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    if (!room || room.status !== 'finished') return ack({ ok: false, message: 'เกมยังไม่จบ' })
    if (!room.returnedPlayers.includes(socket.id)) room.returnedPlayers.push(socket.id)
    const connectedPlayers = room.players.filter((player) => player.connected)
    if (connectedPlayers.every((player) => room.returnedPlayers.includes(player.id))) {
      room.status = 'lobby'
      room.players.forEach((player) => {
        player.card = null
        player.hasPlayed = false
      })
      room.deck = []
      room.discardPile = []
      room.turnOrder = []
      room.turnIndex = -1
      room.currentTurn = null
      room.pendingExchange = null
      room.results = null
      room.returnedPlayers = []
    }
    ack({ ok: true })
    broadcastRoom(io, room)
  })

  socket.on('room:leave', (_payload, ack = () => {}) => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    const player = room && findPlayer(room, socket.id)
    if (!room || !player) return ack({ ok: true })
    socket.leave(room.id)
    removePlayer(io, room, player)
    ack({ ok: true })
  })

  socket.on('disconnect', () => {
    const room = [...rooms.values()].find((entry) => findPlayer(entry, socket.id))
    const player = room && findPlayer(room, socket.id)
    if (!room || !player) return
    player.connected = false
    if (room.hostId === player.id) {
      room.hostId = room.players.find((entry) => entry.connected && entry.id !== player.id)?.id || player.id
    }
    if (room.pendingExchange && (room.pendingExchange.fromId === player.id || room.pendingExchange.toId === player.id)) {
      const requesterId = room.pendingExchange.fromId
      clearPending(room)
      io.to(requesterId).emit('exchange:timeout', { message: 'ผู้เล่นหลุดการเชื่อมต่อ ลองเลือกใหม่ได้เลย' })
    }
    if (room.status === 'playing' && room.currentTurn === player.id) {
      player.hasPlayed = true
      const nextIndex = room.turnOrder.indexOf(player.id) + 1
      const nextId = room.turnOrder.slice(nextIndex).find((id) => {
        const next = room.players.find((entry) => entry.id === id)
        return next?.connected && !next.hasPlayed
      })
      if (nextId) {
        room.currentTurn = nextId
        room.turnIndex = room.turnOrder.indexOf(nextId)
        io.to(room.id).emit('turn:changed', { playerId: nextId })
      } else if (room.players.every((entry) => entry.hasPlayed || !entry.connected)) {
        room.turnIndex = room.turnOrder.length - 1
        advanceTurn(io, room)
      }
    }
    broadcastRoom(io, room)
    clearTimeout(room.cleanupTimer)
    room.cleanupTimer = setTimeout(() => {
      const current = room.players.find((entry) => entry.token === player.token)
      if (current && !current.connected) removePlayer(io, room, current)
    }, DISCONNECT_GRACE_MS)
  })
}
