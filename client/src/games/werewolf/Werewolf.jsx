import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import './werewolf.css'

const KEY = 'game-party-werewolf-session'
const URL = import.meta.env.VITE_SOCKET_URL || undefined
const saved = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { return null } }
const persist = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)) } catch {} }
const clear = () => { try { sessionStorage.removeItem(KEY) } catch {} }

export default function Werewolf({ onBack }) {
  const [socket, setSocket] = useState(null), [connected, setConnected] = useState(false)
  const [screen, setScreen] = useState('entry'), [mode, setMode] = useState('host')
  const [name, setName] = useState(''), [code, setCode] = useState('')
  const [room, setRoom] = useState(null), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [roleCardDismissed, setRoleCardDismissed] = useState(false)
  useEffect(() => {
    const s = io(URL, { transports: ['websocket', 'polling'], reconnection: true }); setSocket(s)
    s.on('connect', () => { setConnected(true); const old = saved(); if (old?.roomId && old?.token) s.emit('werewolf:session:rejoin', old, (r) => { if (r?.ok) setScreen('room'); else clear() }) })
    s.on('disconnect', () => setConnected(false))
    s.on('werewolf:state', (r) => { setRoom(r); setScreen(previous => { if (previous === 'room' && r.status === 'playing') setRoleCardDismissed(false); return r.status === 'lobby' ? 'room' : 'game' }) })
    s.on('werewolf:room:closed', () => { clear(); setRoom(null); setScreen('entry'); setError('หัวห้องปิดห้องแล้ว') })
    s.on('werewolf:host:offline', () => setNotice('หัวห้องหลุดการเชื่อมต่อ'))
    return () => s.disconnect()
  }, [])
  const emit = useCallback((event, payload = {}) => new Promise(resolve => {
    if (!socket?.connected) return resolve({ ok: false, message: 'ยังไม่ได้เชื่อมต่อ Server' })
    socket.emit(event, payload, resolve)
  }), [socket])
  const players = room?.players || []
  const living = useMemo(() => players.filter(p => p.alive), [players])
  const host = room?.isHost
  const run = async (event, payload = {}) => {
    setBusy(true); setError('')
    const result = await emit(event, payload)
    setBusy(false)
    if (!result?.ok) setError(result?.message || 'ดำเนินการไม่สำเร็จ')
    return result?.ok
  }
  const enter = async () => {
    setBusy(true); setError('')
    const result = mode === 'host' ? await emit('werewolf:host:create', { name }) : await emit('werewolf:player:join', { roomId: code, name })
    setBusy(false)
    if (!result?.ok) return setError(result?.message || 'เข้าห้องไม่สำเร็จ')
    const session = { roomId: result.roomId, token: result.token, kind: result.kind }
    persist(session); setScreen('room')
  }
  const leave = async () => { await emit('werewolf:room:leave'); clear(); setRoom(null); setScreen('entry') }
  const step = room?.nightSteps?.[room.nightStep]
  const stepName = { werewolf: 'หมาป่าตื่น เลือกเหยื่อ', seer: 'ผู้หยั่งรู้ตรวจสอบ', bodyguard: 'บอดี้การ์ดเลือกคนปกป้อง' }
  const stepIcon = { werewolf: '🐺', seer: '🔮', bodyguard: '🛡️' }
  return <main className="werewolf-shell">
    <header className="werewolf-header"><button className="back-button" onClick={onBack}>← เกมทั้งหมด</button><h2>🌙 WERE<span>WOLF</span></h2><small>{connected ? 'ONLINE' : 'OFFLINE'}</small></header>
    {screen === 'entry' && <section className="werewolf-panel">
      <p className="ww-phase">SOCIAL DEDUCTION GAME</p><h1>ใครคือ <span>หมาป่า?</span></h1><p className="ww-muted">หัวห้องเป็นผู้ดำเนินเกม ไม่ได้รับบทบาทและไม่นับเป็นผู้เล่น</p>
      <div className="ww-tabs"><button className={mode === 'host' ? 'active' : ''} onClick={() => setMode('host')}>สร้างห้อง · หัวห้อง</button><button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>เข้าร่วมห้อง</button></div>
      <div className="ww-form">{mode === 'join' && <label>รหัสห้อง<input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="รหัส 6 หลัก" inputMode="numeric" /> </label>}<label>{mode === 'host' ? 'ชื่อหัวห้อง' : 'ชื่อผู้เล่น'}<input value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder="ใส่ชื่อเล่น" /></label><button className="ww-primary" disabled={!connected || busy || !name.trim() || (mode === 'join' && code.length !== 6)} onClick={enter}>{mode === 'host' ? 'สร้างห้อง' : 'เข้าร่วมห้อง'} →</button></div>
      {error && <p className="ww-error">{error}</p>}
    </section>}
    {screen === 'room' && room && <section className="werewolf-panel">
      <p className="ww-phase">WAITING ROOM</p><h1>{host ? 'ห้องของคุณ' : 'รอเริ่มเกม'}</h1><p className="ww-muted">ส่งรหัสนี้ให้เพื่อนเพื่อเข้าร่วม</p><button className="ww-room-code" onClick={() => navigator.clipboard?.writeText(room.roomId)}>{room.roomId}</button>
      <p className="ww-muted">{players.length} / 12 ผู้เล่น · หัวห้อง {room.hostName}</p>
      <div className="ww-player-list">{players.map(p => <div className="ww-player" key={p.id}><span className="ww-avatar">{p.name.slice(0, 1)}</span><strong>{p.name}</strong><small>{p.connected ? 'ONLINE' : 'OFFLINE'}</small></div>)}</div>
      {host ? <p className="ww-muted">หัวห้องไม่รับบทบาท · เริ่มได้เมื่อมีผู้เล่นอย่างน้อย 4 คน</p> : <p className="ww-muted">รอหัวห้องเริ่มเกม...</p>}
      {error && <p className="ww-error">{error}</p>}
      <div className="ww-actions">{host && <button className="ww-primary" disabled={busy || players.length < 4 || players.some(p => !p.connected)} onClick={() => run('werewolf:game:start')}>เริ่มเกม →</button>}<button className="ww-action" onClick={leave}>ออกจากห้อง</button></div>
    </section>}
    {screen === 'game' && room && <section className={`werewolf-panel ${room.phase === 'night' ? 'ww-night' : ''}`}>
      <p className="ww-phase">{room.phase === 'night' ? 'NIGHT PHASE' : room.phase === 'morning' ? 'MORNING' : room.phase === 'discussion' ? 'DISCUSSION' : 'GAME OVER'}</p>
      {host ? <>
        <h1>{room.phase === 'night' ? 'กลางคืน' : room.phase === 'morning' ? 'สรุปยามเช้า' : room.phase === 'discussion' ? 'พูดคุยและตัดสิน' : 'จบเกม'}</h1>
        <p className="ww-muted">ผู้เล่นที่ยังมีชีวิต {living.length} คน · คุณเป็นผู้ดำเนินเกม</p>
        {room.phase === 'night' && <><span className="ww-step">ขั้นตอน {Math.min((room.nightStep || 0) + 1, room.nightSteps.length)} / {room.nightSteps.length}</span><h2>{step ? <>{stepIcon[step]} {stepName[step]}</> : 'ครบทุกบทบาทแล้ว'}</h2>
          {step && <div className="ww-targets">{living.filter(p => step !== 'werewolf' || p.role?.name !== 'หมาป่า').map(p => <button className="ww-target" key={p.id} disabled={busy} onClick={() => run('werewolf:night:choose', { targetId: p.id })}>{p.name}</button>)}</div>}
          {!step && <><p className="ww-muted">ดำเนินบทบาทกลางคืนครบแล้ว</p><button className="ww-primary" disabled={busy} onClick={() => run('werewolf:night:finish')}>เริ่มเช้า →</button></>}
        </>}
        {room.voteResult && <p className="ww-notice">ผลการตัดสินก่อนหน้า: {room.voteResult.text}</p>}
        {room.phase === 'morning' && <div className="ww-summary"><strong>{room.morningSummary?.text}</strong><p className="ww-secret">บทบาทผู้เสียชีวิตเป็นความลับ</p>{room.investigation && <p>ผลตรวจสอบ (เฉพาะหัวห้อง): {room.investigation.playerName} คือ {room.investigation.role.name}</p>}<button className="ww-primary" disabled={busy} onClick={() => run('werewolf:day:discussion')}>เริ่มพูดคุย →</button></div>}
        {room.phase === 'discussion' && <><p className="ww-muted">ให้ทุกคนพูดคุยกัน แล้วเลือกผู้ถูกเผา หรือไม่มีการโหวต</p><div className="ww-targets">{living.map(p => <button className="ww-target" key={p.id} disabled={busy} onClick={() => run('werewolf:day:vote', { targetId: p.id })}>🔥 {p.name}</button>)}</div><button className="ww-action" disabled={busy} onClick={() => run('werewolf:day:vote', { targetId: null })}>ไม่มีการโหวต</button></>}
        {room.phase === 'finished' && <div className="ww-summary"><div className="ww-role-art">{room.winner === 'หมาป่า' ? '🐺' : '🏡'}</div><h2>ฝ่าย{room.winner}ชนะ!</h2><div className="ww-role-grid">{room.allRoles?.map(p => <div className="ww-role-item" key={p.id}><span>{p.role.emoji}</span><strong>{p.name} · {p.role.name}</strong></div>)}</div><button className="ww-primary" onClick={leave}>กลับหน้าเกม</button></div>}
        {room.phase !== 'finished' && <div className="ww-role-grid">{room.allRoles?.map(p => <div className={`ww-role-item ${p.alive ? '' : 'ww-dead'}`} key={p.id}><span>{p.role.emoji}</span><div><strong>{p.name}</strong><p>{p.role.name}</p></div></div>)}</div>}
      </> : <>
        {room.ownRole && !roleCardDismissed && <div className="ww-role-reveal"><div className="ww-role-card"><div className="ww-role-art">{room.ownRole.emoji}</div><p className="ww-phase">YOUR SECRET ROLE</p><h2>{room.ownRole.name}</h2><p>{room.ownRole.description}</p><small>เก็บบทบาทนี้เป็นความลับ</small><button className="ww-primary" onClick={() => setRoleCardDismissed(true)}>เข้าใจแล้ว · เริ่มเกม</button></div></div>}
        {room.voteResult && <p className="ww-notice">ผลการตัดสิน: {room.voteResult.text}</p>}
        <h1>{room.phase === 'night' ? 'หลับตา... 🌙' : room.phase === 'morning' ? 'รุ่งเช้าแล้ว ☀️' : room.phase === 'discussion' ? 'ช่วงพูดคุย' : 'จบเกม'}</h1>
        {room.ownRole && <div className="ww-role-card"><div className="ww-role-art">{room.ownRole.emoji}</div><p className="ww-phase">YOUR SECRET ROLE</p><h2>{room.ownRole.name}</h2><p>{room.ownRole.description}</p><small>เก็บบทบาทนี้เป็นความลับ</small></div>}
        {room.phase === 'morning' && <div className="ww-summary"><strong>{room.morningSummary?.text}</strong><p className="ww-secret">ไม่มีการเปิดเผยบทบาทของผู้เสียชีวิต</p></div>}
        {room.phase === 'discussion' && <p className="ww-muted">พูดคุยและหาคนที่น่าสงสัย รอหัวห้องประกาศผล</p>}
        {room.phase === 'finished' && <div className="ww-summary"><h2>ฝ่าย{room.winner}ชนะ!</h2><p>บทบาทของผู้เล่นยังเป็นความลับสำหรับผู้เล่น</p></div>}
        <div className="ww-player-list">{players.map(p => <div className={`ww-player ${p.alive ? '' : 'ww-dead'}`} key={p.id}><span className="ww-avatar">{p.name.slice(0, 1)}</span><strong>{p.name}</strong><small>{p.alive ? 'ALIVE' : 'OUT'}</small></div>)}</div>
      </>}
      {error && <p className="ww-error">{error}</p>}{notice && <p className="ww-notice">{notice}</p>}
    </section>}
  </main>
}
