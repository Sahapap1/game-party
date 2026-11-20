# Game Party

A browser-based party game hub built with React, Vite, Tailwind CSS, Node.js, and Socket.IO.

## Games

### Last Dot
A local, single-screen party game:
1. Everyone touches and holds the screen to place their own colored dot.
2. Start the round when all players are ready.
3. Dots are randomly eliminated with an animation until one remains.
4. The last remaining dot wins.

### Card Exchange
A real-time multiplayer card game:
1. Create a room or join with a six-digit room code.
2. Every player confirms their display name; the host starts the game.
3. The server shuffles a standard 52-card deck (no Jokers) and deals one card to each player.
4. Players can see everyone else's card, but never their own card.
5. On their turn, a player can draw from the central deck or request an exchange with another player. The recipient has 15 seconds to accept or reject.
6. Once every connected player has taken a turn, all cards are revealed. A is lowest and K is highest; ties share the result.

The server is authoritative: cards, turns, exchange decisions, and results are controlled by the Socket.IO server.

## Project structure

- `client/` — React + Vite + Tailwind frontend
- `server/` — Node.js + Socket.IO backend
- `server/src/games/card-exchange/` — deck and room/game logic

## Local development

Install dependencies from the repository root:

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Socket.IO server: http://localhost:3001

The Vite development server proxies Socket.IO requests to port 3001. For a separate frontend/backend deployment, set `VITE_SOCKET_URL` in the client build environment and `CLIENT_ORIGIN` on the server.

## Deploy to Railway (Docker)

Deploy the repository root as one Railway service using the included Dockerfile:

1. Select this GitHub repository in Railway.
2. Keep Root Directory as `/`.
3. Use the Dockerfile builder.
4. Railway will build the Vite frontend and run the Node.js server, which serves the frontend and Socket.IO from the same origin.
5. Generate a public domain in Railway Networking.

No separate Socket.IO service is required. The service listens on Railway's injected `PORT`.
