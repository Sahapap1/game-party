import { useEffect, useState } from 'react'

const COLORS = ['#a3e635', '#38bdf8', '#fb7185', '#fbbf24', '#c084fc', '#2dd4bf', '#fb923c', '#f472b6']

function App() {
  const [screen, setScreen] = useState('home')
  const [players, setPlayers] = useState([])
  const [phase, setPhase] = useState('waiting')
  const [wave, setWave] = useState(null)

  const addPlayer = (event) => {
    if (phase !== 'waiting') return
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
    setPlayers((current) => current.filter((player) => player.pointerId !== event.pointerId))
  }

  const startRound = () => {
    if (players.length < 2) return
    setPhase('eliminating')
  }

  const resetRound = () => {
    setPlayers([])
    setWave(null)
    setPhase('waiting')
  }

  useEffect(() => {
    if (phase !== 'eliminating' || players.length < 2 || wave) return
    const winner = players[Math.floor(Math.random() * players.length)]
    setWave({ x: 15 + Math.random() * 70, y: 15 + Math.random() * 70, winnerId: winner.id })
  }, [phase, players, wave])

  useEffect(() => {
    if (phase !== 'eliminating' || !wave) return
    const timeout = window.setTimeout(() => {
      setPlayers((current) => current.filter((player) => player.id === wave.winnerId))
      setPhase('winner')
      setWave(null)
    }, 3300)
    return () => window.clearTimeout(timeout)
  }, [phase, wave])

  const winner = phase === 'winner' ? players[0] : null
  const waveTargets = wave ? players.filter((player) => player.id !== wave.winnerId) : []
  const maxWaveDistance = waveTargets.length ? Math.max(...waveTargets.map((player) => Math.hypot(player.x - wave.x, player.y - wave.y))) || 1 : 1

  return (
    <main className="party-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); setScreen('home'); resetRound() }}>
          <span className="brand-mark">✳</span>
          <span>game<span className="brand-accent">party</span></span>
        </a>
        <span className="local-pill"><span /> FRONTEND GAME</span>
      </header>

      {screen === 'home' ? (
        <section className="home-content">
          <p className="eyebrow">GOOD TIMES START HERE</p>
          <h1>Pick a game.<br /><span>Make a memory.</span></h1>
          <p className="hero-copy">รวมตัวกันรอบจอ แล้วมาเลือกเกมเล่นกับเพื่อน ๆ</p>
          <div className="game-grid">
            <button className="game-card" onClick={() => setScreen('last-dot')}>
              <div className="game-art"><span className="art-dot dot-one" /><span className="art-dot dot-two" /><span className="art-dot dot-three" /><span className="art-dot dot-four" /><span className="art-dot dot-five" /></div>
              <div className="game-card-info">
                <div><span className="game-category">QUICK PARTY GAME</span><h2>Last Dot</h2><p>จิ้มค้างไว้ ใครเหลือจุดสุดท้ายเป็นผู้ชนะ</p></div>
                <span className="play-arrow">↗</span>
              </div>
            </button>
            <div className="empty-game-card"><span>✦</span><strong>More games coming soon</strong><p>เกมใหม่ ๆ จะเพิ่มเข้ามาที่นี่</p></div>
          </div>
        </section>
      ) : (
        <section className="game-content">
          <div className="game-heading">
            <button className="back-button" onClick={() => { setScreen('home'); resetRound() }}>← กลับหน้าเกม</button>
            <p className="eyebrow">QUICK PARTY GAME</p>
            <h1>Last <span>Dot.</span></h1>
            <p className="game-instruction">
              {phase === 'waiting' && 'ทุกคนแตะหน้าจอและกดค้างไว้ เพื่อวางจุดของตัวเอง'}
              {phase === 'eliminating' && 'คลื่นพลังงานกำลังแผ่ขยาย! ระวังให้ดี'}
              {phase === 'winner' && 'เรามีผู้ชนะแล้ว!'}
            </p>
          </div>

          <div className={`play-area ${phase !== 'waiting' ? 'is-running' : ''}`}
            onPointerDown={addPlayer}
            onPointerUp={releasePlayer}
            onPointerCancel={releasePlayer}
            onContextMenu={(event) => event.preventDefault()}>
            <div className="play-area-top"><span>{phase === 'waiting' ? 'HOLD YOUR SPOT' : phase === 'eliminating' ? 'SHOCKWAVE INCOMING' : 'WINNER'}</span><strong>{players.length} <small>PLAYERS LEFT</small></strong></div>
            {wave && <div className="shockwave" style={{ left: `${wave.x}%`, top: `${wave.y}%` }} />}
            {players.map((player) => (
              <div key={player.id} className={`player-dot ${wave && player.id !== wave.winnerId ? 'wave-target' : ''} ${winner?.id === player.id ? 'is-winner' : ''}`}
                style={{ left: `${player.x}%`, top: `${player.y}%`, '--dot-color': player.color, '--wave-delay': wave && player.id !== wave.winnerId ? `${(Math.hypot(player.x - wave.x, player.y - wave.y) / maxWaveDistance) * 2.1}s` : '0s' }}>
                <span>{player.number}</span>
              </div>
            ))}
            {players.length === 0 && <div className="play-hint"><span>＋</span><strong>แตะค้างไว้ตรงไหนก็ได้</strong><small>แต่ละจุดแทนผู้เล่นหนึ่งคน</small></div>}
            {winner && <div className="winner-banner"><span>🏆</span><strong>PLAYER {winner.number} WINS!</strong><small>จุดสุดท้ายที่เหลืออยู่</small></div>}
          </div>

          <div className="game-controls">
            <div className="player-count"><strong>{players.length}</strong><span>{players.length === 1 ? 'player holding' : 'players holding'}</span></div>
            {phase === 'waiting' && <button className="primary-button" disabled={players.length < 2} onClick={startRound}>เริ่มสุ่มผู้ชนะ <span>→</span></button>}
            {phase === 'eliminating' && <div className="status-message"><span className="loading-pulse" /> คลื่นกำลังเคลื่อนที่…</div>}
            {phase === 'winner' && <button className="primary-button" onClick={resetRound}>เล่นอีกครั้ง <span>↻</span></button>}
          </div>
          {phase === 'waiting' && <p className="helper-note">ต้องมีอย่างน้อย 2 คน · ทุกคนต้องกดค้างไว้จนกว่าจะเริ่มสุ่ม</p>}
        </section>
      )}

      <footer className="footer"><span>GAME PARTY</span><span>Made for playing together.</span></footer>
    </main>
  )
}

export default App
