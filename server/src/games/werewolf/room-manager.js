import { randomInt, randomUUID } from 'node:crypto'

const rooms = new Map()
const roles = {
  werewolf: { name: 'หมาป่า', emoji: '🐺', description: 'เลือกเหยื่อหนึ่งคนในแต่ละคืน' },
  seer: { name: 'ผู้หยั่งรู้', emoji: '🔮', description: 'ตรวจสอบตัวตนของผู้เล่นหนึ่งคน' },
  bodyguard: { name: 'บอดี้การ์ด', emoji: '🛡️', description: 'ปกป้องผู้เล่นหนึ่งคนจากหมาป่า' },
  villager: { name: 'ชาวบ้าน', emoji: '🧑‍🌾', description: 'ร่วมพูดคุยเพื่อค้นหาหมาป่า' },
}
const clean = (s) => typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, 18) : ''
const code = () => { let n; do { n = String(randomInt(100000, 1000000)) } while (rooms.has(n)); return n }
const find = (id) => [...rooms.values()].find(r => r.hostId === id || r.players.some(p => p.id === id))
const player = (r, id) => r.players.find(p => p.id === id)
const alive = (r) => r.players.filter(p => p.alive)
const steps = (r) => ['werewolf', 'seer', 'bodyguard'].filter(role => r.players.some(p => p.alive && p.role === role))
const winner = (r) => { const w = alive(r).filter(p => p.role === 'werewolf').length; return !w ? 'ชาวบ้าน' : w >= alive(r).length - w ? 'หมาป่า' : null }
function state(r, id) {
  const host = r.hostId === id, me = player(r, id)
  return {
    roomId: r.id, status: r.status, phase: r.phase, isHost: host, you: id, hostName: r.hostName,
    players: r.players.map(p => ({ id: p.id, name: p.name, alive: p.alive, connected: p.connected, role: host ? roles[p.role] : null })),
    ownRole: host || !me ? null : roles[me.role],
    allRoles: host ? r.players.map(p => ({ id: p.id, name: p.name, role: roles[p.role], alive: p.alive })) : null,
    nightStep: r.nightStep, nightSteps: steps(r), morningSummary: r.morningSummary,
    investigation: host ? r.investigation : null, voteResult: r.voteResult, winner: r.winner,
  }
}
function broadcast(io, r) {
  if (r.hostId) io.to(r.hostId).emit('werewolf:state', state(r, r.hostId))
  r.players.filter(p => p.connected).forEach(p => io.to(p.id).emit('werewolf:state', state(r, p.id)))
}
function fail(ack, message) { ack({ ok: false, message }) }
function startNight(r) {
  r.status = 'playing'; r.phase = 'night'; r.nightStep = 0
  r.actions = { werewolf: null, seer: null, bodyguard: null }
  r.morningSummary = null; r.investigation = null
}
function assign(r) {
  const shuffled = [...r.players].sort(() => Math.random() - .5)
  const wolfCount = r.players.length >= 9 ? 3 : r.players.length >= 7 ? 2 : 1
  const list = [...Array(wolfCount).fill('werewolf'), 'seer', 'bodyguard', ...Array(r.players.length - wolfCount - 2).fill('villager')]
  shuffled.forEach((p, i) => { p.role = list[i]; p.alive = true })
}
export function registerWerewolfHandlers(io, socket) {
  socket.on('werewolf:host:create', ({ name } = {}, ack = () => {}) => {
    const hostName = clean(name); if (!hostName) return fail(ack, 'กรุณาใส่ชื่อหัวห้อง')
    const id = code(), r = { id, hostId: socket.id, hostToken: randomUUID(), hostName, players: [], status: 'lobby', phase: 'lobby' }
    rooms.set(id, r); socket.join(id); ack({ ok: true, roomId: id, token: r.hostToken, kind: 'host' }); broadcast(io, r)
  })
  socket.on('werewolf:player:join', ({ roomId, name } = {}, ack = () => {}) => {
    const r = rooms.get(String(roomId || '').trim()), n = clean(name)
    if (!r) return fail(ack, 'ไม่พบห้องนี้')
    if (r.status !== 'lobby') return fail(ack, 'เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้')
    if (!n) return fail(ack, 'กรุณาใส่ชื่อผู้เล่น')
    if (r.players.length >= 12) return fail(ack, 'ห้องเต็มแล้ว')
    if (r.players.some(p => p.name.toLowerCase() === n.toLowerCase())) return fail(ack, 'ชื่อนี้มีคนใช้แล้ว')
    const p = { id: socket.id, token: randomUUID(), name: n, connected: true, alive: true, role: null }
    r.players.push(p); socket.join(r.id); ack({ ok: true, roomId: r.id, token: p.token, kind: 'player' }); broadcast(io, r)
  })
  socket.on('werewolf:session:rejoin', ({ roomId, token, kind } = {}, ack = () => {}) => {
    const r = rooms.get(String(roomId || '')); if (!r) return fail(ack, 'ไม่พบห้องเดิม')
    if (kind === 'host' && r.hostToken === token) { const old = r.hostId; r.hostId = socket.id; if (old) io.in(old).socketsLeave(r.id); socket.join(r.id); ack({ ok: true }); broadcast(io, r); return }
    const p = r.players.find(x => x.token === token); if (!p) return fail(ack, 'ไม่พบข้อมูลผู้เล่น')
    const old = p.id; p.id = socket.id; p.connected = true; if (old) io.in(old).socketsLeave(r.id)
    socket.join(r.id); ack({ ok: true }); broadcast(io, r)
  })
  socket.on('werewolf:game:start', (_, ack = () => {}) => {
    const r = find(socket.id); if (!r || r.hostId !== socket.id) return fail(ack, 'เฉพาะหัวห้องเท่านั้น')
    if (r.status !== 'lobby') return fail(ack, 'เกมเริ่มแล้ว')
    if (r.players.length < 4) return fail(ack, 'ต้องมีผู้เล่นอย่างน้อย 4 คน (ไม่รวมหัวห้อง)')
    if (r.players.some(p => !p.connected)) return fail(ack, 'รอผู้เล่นทุกคนออนไลน์ก่อน')
    assign(r); startNight(r); ack({ ok: true }); broadcast(io, r)
  })
  socket.on('werewolf:night:choose', ({ targetId } = {}, ack = () => {}) => {
    const r = find(socket.id); if (!r || r.hostId !== socket.id || r.phase !== 'night') return fail(ack, 'ไม่สามารถเลือกเป้าหมายตอนนี้ได้')
    const role = steps(r)[r.nightStep], target = player(r, targetId)
    if (!role || !target?.alive) return fail(ack, 'เลือกผู้เล่นที่ยังมีชีวิตอยู่')
    if (role === 'werewolf' && target.role === 'werewolf') return fail(ack, 'หมาป่าเลือกพวกเดียวกันไม่ได้')
    r.actions[role] = targetId; r.nightStep++; ack({ ok: true }); broadcast(io, r)
  })
  socket.on('werewolf:night:finish', (_, ack = () => {}) => {
    const r = find(socket.id); if (!r || r.hostId !== socket.id || r.phase !== 'night') return fail(ack, 'ไม่ใช่ช่วงกลางคืน')
    if (r.nightStep < steps(r).length) return fail(ack, 'ดำเนินบทบาทกลางคืนให้ครบก่อน')
    const victim = player(r, r.actions.werewolf), saved = victim && victim.id === r.actions.bodyguard
    if (victim && !saved) victim.alive = false
    r.morningSummary = victim && !saved ? { text: 'เมื่อคืน ' + victim.name + ' เสียชีวิต', deadPlayer: victim.name } : { text: 'เมื่อคืนไม่มีผู้เสียชีวิต', deadPlayer: null }
    const seen = player(r, r.actions.seer); r.investigation = seen ? { playerName: seen.name, role: roles[seen.role] } : null
    r.phase = 'morning'; r.nightStep = null; r.winner = winner(r)
    if (r.winner) { r.phase = 'finished'; r.status = 'finished' }
    ack({ ok: true }); broadcast(io, r)
  })
  socket.on('werewolf:day:discussion', (_, ack = () => {}) => {
    const r = find(socket.id); if (!r || r.hostId !== socket.id || r.phase !== 'morning') return fail(ack, 'ยังเริ่มพูดคุยไม่ได้')
    r.phase = 'discussion'; ack({ ok: true }); broadcast(io, r)
  })
  socket.on('werewolf:day:vote', ({ targetId = null } = {}, ack = () => {}) => {
    const r = find(socket.id); if (!r || r.hostId !== socket.id || r.phase !== 'discussion') return fail(ack, 'ยังไม่อยู่ในช่วงโหวต')
    const target = targetId ? player(r, targetId) : null
    if (targetId && (!target || !target.alive)) return fail(ack, 'เลือกผู้เล่นที่ยังมีชีวิตอยู่')
    if (target) target.alive = false
    r.voteResult = target ? { text: target.name + ' ถูกโหวตเผา' } : { text: 'วันนี้ไม่มีการโหวตประหาร' }
    r.winner = winner(r)
    if (r.winner) { r.phase = 'finished'; r.status = 'finished' } else startNight(r)
    ack({ ok: true }); broadcast(io, r)
  })
  socket.on('werewolf:room:leave', (_, ack = () => {}) => {
    const r = find(socket.id); if (!r) return ack({ ok: true })
    if (r.hostId === socket.id) { r.players.forEach(p => io.to(p.id).emit('werewolf:room:closed')); rooms.delete(r.id); io.in(r.id).socketsLeave(r.id); ack({ ok: true }); return }
    r.players = r.players.filter(p => p.id !== socket.id); socket.leave(r.id)
    if (!r.players.length) rooms.delete(r.id); else broadcast(io, r)
    ack({ ok: true })
  })
  socket.on('disconnect', () => {
    const r = find(socket.id); if (!r) return
    if (r.hostId === socket.id) { r.hostId = null; r.players.forEach(p => io.to(p.id).emit('werewolf:host:offline')) }
    else { const p = player(r, socket.id); if (p) p.connected = false }
    broadcast(io, r)
  })
}
