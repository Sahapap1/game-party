import { useEffect, useRef, useState } from 'react'
import CardExchange from './games/card-exchange/CardExchange.jsx'
import Werewolf from './games/werewolf/Werewolf.jsx'

const COLORS = ['#a3e635', '#38bdf8', '#fb7185', '#fbbf24', '#c084fc', '#2dd4bf', '#fb923c', '#f472b6']

function App() {
  const [screen, setScreen] = useState('home')
  const [players, setPlayers] = useState([])
  const [phase, setPhase] = useState('ready')
  const [countdown, setCountdown] = useState(5)
  const [targetId, setTargetId] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  const audioContextRef = useRef(null)
  const winnerSoundPlayedRef = useRef(false)

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (AudioContextClass) audioContextRef.current = new AudioContextClass()
    }
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume()
    return audioContextRef.current
  }

  const playEliminationSound = () => {
    const audio = getAudioContext()
    if (!audio) return
    const now = audio.currentTime
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(620, now)
    oscillator.frequency.exponentialRampToValueAtTime(210, now + 0.22)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.26)
  }

  const playWinnerSound = () => {
    const audio = getAudioContext()
    if (!audio) return
    const now = audio.currentTime
    ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      const start = now + index * 0.13
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42)
      oscillator.connect(gain)
      gain.connect(audio.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.44)
    })
  }

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
    getAudioContext()
    winnerSoundPlayedRef.current = false
    setPlayers([])
    setTargetId(null)
    setRemovingId(null)
    setCountdown(5)
    setPhase('collecting')
  }

  const resetRound = () => {
    winnerSoundPlayedRef.current = false
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
    if (targetId || removingId) return
    const delay = 800 + Math.random() * 2700
    const timeout = window.setTimeout(() => {
      const selected = players[Math.floor(Math.random() * players.length)]
      if (selected) setTargetId(selected.id)
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [phase, players, targetId, removingId])

  useEffect(() => {
    if (phase !== 'eliminating' || !targetId || removingId) return
    const timeout = window.setTimeout(() => setRemovingId(targetId), 950)
    return () => window.clearTimeout(timeout)
  }, [phase, targetId, removingId])

  useEffect(() => {
    if (phase !== 'eliminating' || !removingId) return
    const timeout = window.setTimeout(() => {
      playEliminationSound()
      setPlayers((current) => current.filter((player) => player.id !== removingId))
      setRemovingId(null)
      setTargetId(null)
    }, 720)
    return () => window.clearTimeout(timeout)
  }, [phase, removingId])

  useEffect(() => {
    if (phase === 'winner' && !winnerSoundPlayedRef.current) {
      winnerSoundPlayedRef.current = true
      playWinnerSound()
    }
  }, [phase])

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
              <button className="game-card card-exchange-home-card" onClick={() => setScreen('card-exchange')}><div className="card-game-art"><span>♠</span><b>♥</b><i>♦</i><em>♣</em></div><div className="game-card-info"><div><span className="game-category">MULTIPLAYER · SOCKET.IO</span><h2>Card Exchange</h2><p>แลกไพ่กับเพื่อน แล้วมาลุ้นว่าใครต่ำสุด</p></div><span className="play-arrow">↗</span></div></button>
              <button className="game-card werewolf-home-card" onClick={() => setScreen('werewolf')}><div className="werewolf-game-art"><span>🐺</span><i>🌙</i><b>✦</b></div><div className="game-card-info"><div><span className="game-category">SOCIAL DEDUCTION · MULTIPLAYER</span><h2>Werewolf</h2><p>ตามหาหมาป่าก่อนที่ทุกคนจะกลายเป็นเหยื่อ</p></div><span className="play-arrow">↗</span></div></button>
            </div>
          </section>
          <footer className="footer"><span>GAME PARTY</span><span>Made for playing together.</span></footer>
        </>
      ) : screen === 'last-dot' ? (
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
      ) : screen === 'card-exchange' ? (
        <CardExchange onBack={() => setScreen('home')} />
      ) : (
        <Werewolf onBack={() => setScreen('home')} />
      )}
    </main>
  )
}

export default App
