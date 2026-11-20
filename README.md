# Game Party

A browser-based party game hub built with React, Vite, Tailwind CSS, and Socket.IO.

## Project structure

- `client/` — React + Vite + Tailwind CSS frontend
- `server/` — Node.js + Socket.IO backend scaffold for games that need realtime networking

## Current game

### Last Dot

A local, single-screen party game:
1. Everyone touches and holds the screen to place their own colored dot.
2. Start the round when all players are ready.
3. Dots are randomly eliminated with an animation until one remains.
4. The last remaining dot wins.

This game runs entirely in the frontend. It does not require the Socket.IO server.

## Getting started

Install dependencies from the repository root:

```bash
npm install
```

Start the frontend:

```bash
npm run dev:client
```

Open http://localhost:5173 on a touchscreen device or display.

To start the Socket.IO backend scaffold for future games:

```bash
npm run dev:server
```

Client: http://localhost:5173  
Socket.IO server: http://localhost:3001
