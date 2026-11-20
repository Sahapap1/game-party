import { useEffect, useState } from 'react'

const COLORS = ['#a3e635', '#38bdf8', '#fb7185', '#fbbf24', '#c084fc', '#2dd4bf', '#fb923c', '#f472b6']

function App() {
  const [screen, setScreen] = useState('home')
  const [players, setPlayers] = useState([])
  const [phase, setPhase] = useState('ready')
  const [countdown, setCountdown] = useState(5)
  const [removingId, setRemovingId] = useState(null)

  const addPlayer = (event) => {
    if (phase !== 'collecting' && phase !== 'countdown') return
    if (players.some((player) => player.pointerId === event.pointerId)) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const id = `player-${event.pointerId}-${Date.now()}-${Math.random()}`
    const position = {
      id,
      pointerId: event.pointerId,
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    }

    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPlayers((current) => {
      const nextNumber = current.reduce((max, player) => Math.max(max, player.number), 0) + 1
      return [...current, {
        ...position,
        color: COLORS[current.length % COLORS.length],
        number: nextNumber,
      }]
    })
  }

  const releasePlayer = (event) => {
    if (phase !== 'collecting' && phase !== 'countdown') return
    setPlayers((current) => current.filter((player) => player.pointerId !== event.pointerId))
  }

  const startRound = () => {
    setPlayers([])
    setRemovingId(null)
    setCountdown(5)
    setPhase('collecting')
  }

  const resetRound = () => {
    setPlayers([])
    setRemovingId(null)
    setCountdown(5)
    setPhase('ready')
  }

  useEffect(() => {
    if (phase === 'collecting' && players.length >= 2) {
      setCountdown(5)
      setPhase('countdown')
    } else if (phase === 'countdown' && players.length < 2) {
      setPhase('collecting')
      setCountdown(5)
    }
  }, [phase, players.length])

  useEffect(() => {
    if (phase !== 'countdown') return
    const interval = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [phase])

  useEffect(() => {
    if (phase === 'countdown' && countdown === 0 && players.length >= 2) {
      setPhase('eliminating')
    }
  }, [phase, countdown, players.length])

  useEffect(() => {
    if (phase !== 'eliminating') return
    if (players.length <= 1) {
      if (players.length === 1) setPhase('winner')
      return
    }
    if (removingId) return
    const delay = 800 + Math.random() * 2700
    const timeout = window.setTimeout(() => {
      const candidates = players.filter((player) => player.id !== (players[0]?.id && null))
      const selected = candidates[Math.floor(Math.random() * candidates.length)]
      if (selected) setRemovingId(selected.id)
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [phase, players, removingId])

  useEffect(() => {
    if (phase !== 'eliminating' || !removingId) return
    const timeout = window.setTimeout(() => {
      setPlayers((current) => current.filter((player) => player.id !== removingId))
      setRemovingId(null)
    }, 720)
    return () => window.clearTimeout(timeout)
  }, [phase, removingId])

  const winner = phase === 'winner' ? players[0] : null

  return (
    <main className={screen === 'last-dot' ? 'party-shell game-mode' : 'party-shell'}>
      {screen === 'home' ? (
        <>
          <header className="topbar">
            <a className="brand" href="/" onClick={(event) => { event.preventDefault(); setScreen('home'); resetRound() }}>
              <span className="brand-mark">✳</span>
              <span>game<span className="brand-accent">party</span></span>
            </a>
            <span className="local-pill"><span /> FRONTEND GAME</span>
          </header>
          <section className="home-content">
            <p className="eyebrow">GOOD TIMES START HERE</p>
            <h1>Pick a game.<br /><span>Make a memory.</span></h1>
            <p className="hero-copy">รวมตัวกันรอบจอ แล้วมาเลือกเกมเล่นกับเพื่อน ๆ</p>
            <div className="game-grid">
              <button className="game-card" onClick={() => { resetRound(); setScreen('last-dot') }}>
                <div className="game-art"><span className="art-dot dot-one" /><span className="art-dot dot-two" /><span className="art-dot dot-three" /><span className="art-dot dot-four" /><span className="art-dot dot-five" /></div>
                <div className="game-card-info">
                  <div><span className="game-category">QUICK PARTY GAME</span><h2>Last Dot</h2><p>จิ้มค้างไว้ ใครเหลือจุดสุดท้ายต้องดื่ม</p></div>
                  <span className="play-arrow">↗</span>
                </div>
              </button>
              <div className="empty-game-card"><span>✦</span><strong>More games coming soon</strong><p>เกมใหม่ ๆ จะเพิ่มเข้ามาที่นี่</p></div>
            </div>
          </section>
          <footer className="footer"><span>GAME PARTY</span><span>Made for playing together.</span></footer>
        </>
      ) : (
        <section className="last-dot-screen">
          <div className="last-dot-top">
            <button className="back-button" onClick={() => { setScreen('home'); resetRound() }}>← กลับหน้าเกม</button>
            <div className="last-dot-title"><span className="eyebrow">QUICK PARTY GAME</span><strong>LAST <span>DOT.</span></strong></div>
            <div className="live-count"><strong>{players.length}</strong><span>PLAYERS</span></div>
          </div>

          <div className={`play-area fullscreen-play-area phase-${phase}`}
            onPointerDown={addPlayer}
            onPointerUp={releasePlayer}
            onPointerCancel={releasePlayer}
            onLostPointerCapture={releasePlayer}
            onContextMenu={(event) => event.preventDefault()}>
            {players.map((player) => (
              <div key={player.id} className={`player-dot ${removingId === player.id ? 'is-eliminating' : ''} ${winner?.id === player.id ? 'is-winner' : ''}`}
                style={{ left: `${player.x}%`, top: `${player.y}%`, '--dot-color': player.color }}>
                <span>{player.number}</span>
              </div>
            ))}

            {phase === 'ready' && <div className="center-prompt"><span className="prompt-icon">✳</span><strong>พร้อมแล้วกดเริ่มเกม</strong><small>ทุกคนเตรียมนิ้วไว้บนหน้าจอ</small></div>}
            {phase === 'collecting' && <div className="center-prompt"><strong>ทุกคนแตะหน้าจอค้างไว้</strong><small>ต้องมีผู้เล่นอย่างน้อย 2 คน</small></div>}
            {phase === 'countdown' && <div className="countdown-overlay"><span>เริ่มใน</span><strong key={countdown}>{countdown}</strong><small>อย่าปล่อยนิ้วนะ!</small></div>}
            {phase === 'eliminating' && <div className="round-message">กำลังสุ่มคัดออก…</div>}
            {winner && <div className="winner-banner"><span>🏆</span><strong>PLAYER {winner.number} ต้องดื่ม!</strong><small>คนที่เหลืออยู่ต้องดื่ม</small></div>}
          </div>

          <div className="last-dot-bottom">
            <span className="bottom-status">
              {phase === 'ready' && 'เริ่มเกมเพื่อให้ทุกคนเข้ามาวางจุด'}
              {phase === 'collecting' && `มี ${players.length} คนแล้ว · รอผู้เล่นเพิ่ม`}
              {phase === 'countdown' && 'กำลังนับถอยหลัง'}
              {phase === 'eliminating' && 'กำลังลุ้นว่าใครจะต้องดื่ม'}
              {phase === 'winner' && 'จบเกมแล้ว!'}
            </span>
            {phase === 'ready' && <button className="primary-button" onClick={startRound}>เริ่มเกม <span>→</span></button>}
            {phase === 'collecting' && <button className="primary-button secondary-button" onClick={resetRound}>ยกเลิก</button>}
            {phase === 'winner' && <button className="primary-button" onClick={resetRound}>เล่นอีกครั้ง <span>↻</span></button>}
          </div>
        </section>
      )}
    </main>
  )
}

export default App
