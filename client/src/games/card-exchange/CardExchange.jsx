import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import './card-exchange.css'

const STORAGE_KEY = 'game-party-card-exchange-session'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined

function getSavedSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}

function saveSession(session) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)) } catch { /* private browsing */ }
}

function clearSession() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* private browsing */ }
}

function CardFace({ card, small = false, hidden = false }) {
  if (hidden || !card) return <div className={`playing-card card-back ${small ? 'card-small' : ''}`}><span>✳</span><i>GAME PARTY</i></div>
  return (
    <div className={`playing-card ${card.color === 'red' ? 'card-red' : 'card-black'} ${small ? 'card-small' : ''}`}>
      <div className="card-corner"><strong>{card.rank}</strong><span>{card.symbol}</span></div>
      <div className="card-center"><strong>{card.rank}</strong><span>{card.symbol}</span></div>
      <div className="card-corner card-corner-bottom"><strong>{card.rank}</strong><span>{card.symbol}</span></div>
    </div>
  )
}

function CardExchange({ onBack }) {
  const [socket, setSocket] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [screen, setScreen] = useState('entry')
  const [mode, setMode] = useState('create')
  const [roomIdInput, setRoomIdInput] = useState('')
  const [name, setName] = useState('')
  const [session, setSession] = useState(() => getSavedSession())
  const [room, setRoom] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState('')
  const [notice, setNotice] = useState('')
  const [incoming, setIncoming] = useState(null)
  const [showDrawConfirm, setShowDrawConfirm] = useState(false)

  useEffect(() => {
    const client = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnection: true })
    setSocket(client)
    client.on('connect', () => {
      setConnection('connected')
      const saved = getSavedSession()
      if (saved?.roomId && saved?.playerToken) {
        client.emit('room:rejoin', saved, (response) => {
          if (response?.ok) {
            setSession(saved)
            setScreen('lobby')
            setErrorMessage('')
          } else {
            clearSession()
            setSession(null)
          }
        })
      }
    })
    client.on('disconnect', () => setConnection('disconnected'))
    client.on('connect_error', () => setConnection('disconnected'))
    client.on('room:state', (state) => {
      setRoom(state)
      if (state.pendingExchange?.isIncoming) {
        const requester = state.players.find((player) => player.id === state.pendingExchange.fromId)
        if (requester) setIncoming({ fromId: requester.id, fromName: requester.name, expiresAt: state.pendingExchange.expiresAt })
      } else if (!state.pendingExchange?.isIncoming) setIncoming(null)
      if (state.status === 'playing') setScreen('game')
      if (state.status === 'finished') setScreen('results')
    })
    client.on('exchange:incoming', (request) => setIncoming(request))
    client.on('exchange:rejected', ({ targetName }) => setNotice(`${targetName} ปฏิเสธการแลกไพ่ ลองเลือกใหม่ได้เลย`))
    client.on('exchange:timeout', ({ message }) => { setIncoming(null); setNotice(message) })
    client.on('exchange:completed', () => { setIncoming(null); setNotice('แลกไพ่สำเร็จ!') })
    client.on('game:started', () => { setNotice('แจกไพ่เรียบร้อย เริ่มเกม!'); setScreen('game') })
    client.on('game:ended', () => setScreen('results'))
    client.on('game:error', ({ message }) => setErrorMessage(message))
    return () => client.disconnect()
  }, [])

  const emit = useCallback((event, payload = {}) => new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, message: 'ยังไม่ได้เชื่อมต่อ Server' })
    socket.emit(event, payload, resolve)
  }), [socket])

  const me = useMemo(() => room?.players.find((player) => player.id === room.you), [room])
  const isHost = room?.hostId === room?.you
  const isMyTurn = room?.currentTurn === room?.you
  const others = useMemo(() => room?.players.filter((player) => player.id !== room.you) || [], [room])
  const targetOptions = useMemo(() => others.filter((player) => player.connected), [others])

  const enterRoom = async () => {
    setBusy(true); setErrorMessage('')
    const response = mode === 'create'
      ? await emit('room:create', { name })
      : await emit('room:join', { roomId: roomIdInput, name })
    setBusy(false)
    if (!response?.ok) return setErrorMessage(response?.message || 'ไม่สามารถเข้าห้องได้')
    const nextSession = { roomId: response.roomId, playerToken: response.playerToken }
    setSession(nextSession); saveSession(nextSession); setScreen('lobby')
  }

  const confirmName = async () => {
    setBusy(true)
    const response = await emit('player:confirm')
    setBusy(false)
    if (!response?.ok) setErrorMessage(response?.message || 'ยืนยันชื่อไม่สำเร็จ')
    else setNotice('ยืนยันชื่อเรียบร้อย รอ Host เริ่มเกม')
  }

  const startGame = async () => {
    setBusy(true); setErrorMessage('')
    const response = await emit('game:start')
    setBusy(false)
    if (!response?.ok) setErrorMessage(response?.message || 'เริ่มเกมไม่สำเร็จ')
  }

  const drawCard = async () => {
    setBusy(true); setErrorMessage('')
    const response = await emit('turn:draw')
    setBusy(false); setShowDrawConfirm(false)
    if (!response?.ok) setErrorMessage(response?.message || 'จั่วไพ่ไม่สำเร็จ')
    else setNotice('คุณเปลี่ยนไพ่จากกองกลางแล้ว')
  }

  const requestExchange = async () => {
    if (!selectedTarget) return setErrorMessage('เลือกผู้เล่นที่ต้องการแลกไพ่ก่อน')
    setBusy(true); setErrorMessage('')
    const response = await emit('exchange:request', { targetId: selectedTarget })
    setBusy(false)
    if (!response?.ok) setErrorMessage(response?.message || 'ส่งคำขอไม่สำเร็จ')
    else setNotice('ส่งคำขอแล้ว กำลังรออีกฝ่ายยืนยัน')
  }

  const respondExchange = async (accept) => {
    setBusy(true); setErrorMessage('')
    const response = await emit('exchange:respond', { accept })
    setBusy(false); setIncoming(null)
    if (!response?.ok) setErrorMessage(response?.message || 'ส่งคำตอบไม่สำเร็จ')
    else setNotice(accept ? 'คุณยืนยันการแลกไพ่แล้ว' : 'คุณปฏิเสธการแลกไพ่แล้ว')
  }

  const leaveRoom = async () => {
    await emit('room:leave')
    clearSession(); setSession(null); setRoom(null); setIncoming(null); setScreen('entry'); setErrorMessage(''); setNotice('')
  }

  const copyRoomId = async () => {
    try { await navigator.clipboard.writeText(room?.roomId || '') ; setNotice('คัดลอกรหัสห้องแล้ว') }
    catch { setNotice(`รหัสห้อง: ${room?.roomId || ''}`) }
  }

  const renderHeader = (subtitle) => (
    <header className="card-game-header">
      <button className="card-back-button" onClick={onBack}>← <span>เกมทั้งหมด</span></button>
      <div className="card-brand"><span>♠</span> CARD <b>EXCHANGE</b></div>
      <div className={`connection-indicator ${connection}`}><i />{connection === 'connected' ? 'ONLINE' : connection === 'connecting' ? 'CONNECTING' : 'RECONNECTING'}</div>
    </header>
  )

  return (
    <main className="card-game-shell">
      {renderHeader()}
      <div className="card-game-content">
        {screen === 'entry' && (
          <section className="card-panel entry-panel">
            <p className="card-eyebrow">A LITTLE LUCK. A LITTLE STRATEGY.</p>
            <h1>เปลี่ยนไพ่<br /><span>วัดดวงกัน</span></h1>
            <p className="card-muted">รับไพ่ไว้หนึ่งใบ มองไพ่คนอื่น แล้วเลือกว่าจะเปลี่ยนกับใคร</p>
            <div className="entry-tabs">
              <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>สร้างห้อง</button>
              <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>เข้าร่วมห้อง</button>
            </div>
            <div className="card-form">
              {mode === 'join' && <label>เลขห้อง<input value={roomIdInput} onChange={(event) => setRoomIdInput(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="เช่น 482193" inputMode="numeric" maxLength={6} /></label>}
              <label>ชื่อของคุณ<input value={name} onChange={(event) => setName(event.target.value)} placeholder="ใส่ชื่อเล่น" maxLength={18} onKeyDown={(event) => event.key === 'Enter' && enterRoom()} /></label>
              <button className="card-primary-button" onClick={enterRoom} disabled={busy || connection !== 'connected' || !name.trim() || (mode === 'join' && roomIdInput.length !== 6)}>{busy ? 'กำลังดำเนินการ...' : mode === 'create' ? 'สร้างห้อง' : 'เข้าร่วมห้อง'} <span>→</span></button>
            </div>
            {errorMessage && <p className="card-error">{errorMessage}</p>}
            <div className="card-rule-note"><span>52 CARDS</span><span>ACE LOW · NO JOKER</span><span>2–12 PLAYERS</span></div>
          </section>
        )}

        {screen === 'lobby' && room && (
          <section className="card-panel lobby-panel">
            <p className="card-eyebrow">WAITING ROOM</p>
            <h1>ห้องของคุณ</h1>
            <button className="room-code-box" onClick={copyRoomId}><span>ROOM CODE</span><strong>{room.roomId}</strong><small>แตะเพื่อคัดลอกรหัส</small></button>
            <div className="lobby-summary"><strong>{room.players.length}<small> / 12 PLAYERS</small></strong><span>{me?.confirmed ? 'ยืนยันชื่อแล้ว' : 'กรุณายืนยันชื่อเพื่อเข้าร่วม'}</span></div>
            <div className="lobby-player-list">
              {room.players.map((player, index) => <div className="lobby-player" key={player.id}><span className="player-avatar">{player.name.slice(0, 1).toUpperCase()}</span><strong>{player.name}{player.id === room.hostId && <em>HOST</em>}{player.id === room.you && <small>YOU</small>}</strong><span className={player.connected ? 'player-online' : 'player-offline'}>{player.connected ? 'ONLINE' : 'OFFLINE'}</span><span className={player.confirmed ? 'confirm-check' : 'confirm-wait'}>{player.confirmed ? '✓' : '…'}</span></div>)}
            </div>
            {errorMessage && <p className="card-error">{errorMessage}</p>}
            {notice && <p className="card-notice">{notice}</p>}
            <div className="lobby-actions">
              {!me?.confirmed && <button className="card-primary-button" onClick={confirmName} disabled={busy}>ยืนยันชื่อของฉัน <span>✓</span></button>}
              {isHost && <button className="card-primary-button" onClick={startGame} disabled={busy || room.players.length < 2 || room.players.some((player) => !player.confirmed || !player.connected)}>เริ่มเกม <span>→</span></button>}
              {!isHost && <p className="card-muted">รอ Host กดเริ่มเกม...</p>}
              <button className="card-quiet-button" onClick={leaveRoom}>ออกจากห้อง</button>
            </div>
          </section>
        )}

        {screen === 'game' && room && (
          <section className="active-game">
            <div className="game-room-bar"><span>ROOM {room.roomId}</span><span>TURN {Math.min(room.turnNumber, room.totalTurns)} / {room.totalTurns}</span><span>{room.deckCount} CARDS LEFT</span></div>
            <div className="table-heading"><p className="card-eyebrow">LOOK AT EVERYONE ELSE</p><h1>{isMyTurn ? 'ถึงตาคุณแล้ว' : room.players.find((player) => player.id === room.currentTurn)?.name ? `ถึงตา ${room.players.find((player) => player.id === room.currentTurn).name}` : 'กำลังเล่น'}</h1><p className="card-muted">ไพ่ของคุณถูกซ่อนไว้ มีเพียงคนอื่นเท่านั้นที่เห็นไพ่ใบนี้</p></div>
            <div className="players-card-grid">
              {room.players.map((player) => <article className={`opponent-card ${player.id === room.currentTurn ? 'is-current' : ''} ${player.id === room.you ? 'is-you' : ''}`} key={player.id}>
                <div className="opponent-meta"><span>{player.id === room.you ? 'YOU' : player.id === room.hostId ? 'HOST' : 'PLAYER'}</span>{player.hasPlayed && <small>DONE</small>}</div>
                <CardFace card={player.card} hidden={player.id === room.you} />
                <strong>{player.name}</strong>
                {player.id === room.you && <small className="private-card-label">ไพ่ของคุณ (ซ่อนอยู่)</small>}
                {player.id === room.currentTurn && <small className="turn-label">CURRENT TURN</small>}
                {!player.connected && <small className="offline-label">OFFLINE</small>}
              </article>)}
            </div>

            {room.pendingExchange?.isOutgoing && <div className="waiting-exchange"><span className="waiting-spinner" />กำลังรออีกฝ่ายตอบรับคำขอแลกไพ่...</div>}
            {incoming && <div className="exchange-modal-backdrop"><div className="exchange-modal"><p className="card-eyebrow">EXCHANGE REQUEST</p><h2>{incoming.fromName}</h2><p>ต้องการแลกไพ่กับคุณ</p><div className="modal-actions"><button className="card-primary-button" onClick={() => respondExchange(true)} disabled={busy}>ยืนยันแลก <span>✓</span></button><button className="card-quiet-button" onClick={() => respondExchange(false)} disabled={busy}>ไม่เปลี่ยน</button></div></div></div>}

            {isMyTurn && !room.pendingExchange && <div className="turn-action-panel">
              <p className="card-eyebrow">YOUR MOVE</p><h2>คุณจะเปลี่ยนไพ่แบบไหน?</h2>
              <div className="turn-action-grid">
                <div className="action-option"><div className="deck-stack"><CardFace hidden /></div><strong>เปลี่ยนจากกองกลาง</strong><p>สุ่มรับไพ่ใบใหม่โดยไม่เห็นหน้าไพ่</p><button className="card-primary-button" onClick={() => setShowDrawConfirm(true)}>เลือกกองกลาง <span>→</span></button></div>
                <div className="action-option"><div className="swap-icon">⇄</div><strong>เปลี่ยนกับผู้เล่นอื่น</strong><p>เลือกคนที่ต้องการขอแลกไพ่</p><select value={selectedTarget} onChange={(event) => setSelectedTarget(event.target.value)}><option value="">เลือกผู้เล่น</option>{targetOptions.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><button className="card-outline-button" onClick={requestExchange} disabled={!selectedTarget || busy}>ส่งคำขอแลก <span>→</span></button></div>
              </div>
            </div>}
            {!isMyTurn && !room.pendingExchange && <p className="turn-waiting">รอให้ผู้เล่นปัจจุบันเลือกเปลี่ยนไพ่...</p>}
            {errorMessage && <p className="card-error">{errorMessage}</p>}
            {notice && <p className="card-notice">{notice}</p>}
            {showDrawConfirm && <div className="exchange-modal-backdrop"><div className="exchange-modal"><p className="card-eyebrow">DRAW FROM DECK</p><h2>ยืนยันเปลี่ยนไพ่?</h2><p>ไพ่ปัจจุบันของคุณจะถูกทิ้ง และรับไพ่ใบบนสุดจากกองกลาง โดยคุณจะไม่เห็นหน้าไพ่</p><div className="modal-actions"><button className="card-primary-button" onClick={drawCard} disabled={busy}>ยืนยัน <span>✓</span></button><button className="card-quiet-button" onClick={() => setShowDrawConfirm(false)}>ย้อนกลับ</button></div></div></div>}
          </section>
        )}

        {screen === 'results' && room && (
          <section className="card-panel results-panel">
            <p className="card-eyebrow">THE CARDS ARE REVEALED</p><h1>เปิดไพ่!</h1><p className="card-muted">A ต่ำสุด · K สูงสุด</p>
            <div className="result-columns">
              <div className="result-group lowest"><span>LOWEST CARD</span><h2>ไพ่ต่ำสุด</h2>{room.results?.lowest?.map((player) => <div className="result-player" key={player.id}><CardFace card={player.card} small /><div><strong>{player.name}</strong><small>{player.card.rank} {player.card.symbol}</small></div></div>)}</div>
              <div className="result-group highest"><span>HIGHEST CARD</span><h2>ไพ่สูงสุด</h2>{room.results?.highest?.map((player) => <div className="result-player" key={player.id}><CardFace card={player.card} small /><div><strong>{player.name}</strong><small>{player.card.rank} {player.card.symbol}</small></div></div>)}</div>
            </div>
            <div className="all-cards-reveal"><h3>ไพ่ของทุกคน</h3><div className="reveal-grid">{room.players.map((player) => <div key={player.id}><CardFace card={player.card} small /><strong>{player.name}</strong></div>)}</div></div>
            <button className="card-primary-button" onClick={leaveRoom}>กลับหน้าเกม <span>→</span></button>
          </section>
        )}
      </div>
      {notice && screen === 'entry' && <p className="card-notice floating-notice">{notice}</p>}
    </main>
  )
}

export default CardExchange
