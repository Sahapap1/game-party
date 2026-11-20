import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

export default function App() {
  const [connection, setConnection] = useState('connecting')

  useEffect(() => {
    const socket = io(socketUrl)
    const onConnect = () => setConnection('connected')
    const onDisconnect = () => setConnection('disconnected')
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.disconnect()
    }
  }, [])

  return (
    <main className="party-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">✳</span><span>game<span className="brand-accent">party</span></span></a>
        <div className="connection"><span className={`connection-dot ${connection}`} /><span>{connection === 'connected' ? 'Server online' : connection === 'connecting' ? 'Connecting…' : 'Server offline'}</span></div>
      </header>
      <section className="hero">
        <p className="eyebrow">GOOD TIMES START HERE</p>
        <h1>One place.<br /><span>Endless fun.</span></h1>
        <p className="hero-copy">Gather your people, pick a game, and let the good times roll.</p>
        <div className="coming-soon"><span className="sparkle">✦</span><div><strong>The party is getting ready</strong><p>Game selection and room features are coming next.</p></div></div>
      </section>
      <footer className="footer"><span>GAME PARTY</span><span>Made for playing together.</span></footer>
    </main>
  )
}
