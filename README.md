# ♛ NOchess

A full-featured chess platform built **entirely from scratch** — no chess libraries, no shortcuts.

## 🏗️ Architecture

```
nochess/
├── backend/           # Node.js + Express + Socket.io
│   └── src/
│       ├── chess/
│       │   └── engine.js    # Chess engine from scratch
│       ├── routes/          # REST API
│       ├── socket/          # Real-time WebSocket handlers
│       └── index.js         # Server entry point
├── frontend/          # React + Vite
│   └── src/
│       ├── chess/
│       │   └── engine.js    # Chess engine (ES module)
│       ├── components/      # Reusable UI components
│       ├── pages/           # Page views
│       └── context/         # Auth & Socket contexts
├── nginx/             # Reverse proxy config
└── docker-compose.yml # Full orchestration
```

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Proxy | Nginx |
| Container | Docker + Docker Compose |

## ✨ Features

### Chess Engine (from scratch)
- ✅ Full move validation for all pieces
- ✅ Castling (kingside & queenside)
- ✅ En passant captures
- ✅ Pawn promotion (Q/R/B/N)
- ✅ Check & checkmate detection
- ✅ Stalemate detection
- ✅ Insufficient material draw
- ✅ 50-move rule
- ✅ FEN notation parsing & generation
- ✅ Drag & drop piece movement

### Platform Features
- ✅ Real-time gameplay via WebSockets
- ✅ Matchmaking system with time control selection
- ✅ Multiple time controls: Bullet, Blitz, Rapid, Classical
- ✅ Live chess clocks with increment support
- ✅ Elo rating system (K=32)
- ✅ User authentication (JWT)
- ✅ Game chat
- ✅ Draw offer / resignation
- ✅ Move history
- ✅ Player profiles
- ✅ Leaderboard
- ✅ Guest play (no account required)
- ✅ Spectator mode

## 🚀 Quick Start

### Prerequisites
- Docker
- Docker Compose

### Run

```bash
# Clone / enter the directory
cd nochess

# Copy env template
cp .env.example .env

# Start everything
docker compose up --build

# Visit http://localhost
```

### Development mode

```bash
# Backend (hot reload)
cd backend && npm install && npm run dev

# Frontend (hot reload)
cd frontend && npm install && npm run dev
# Visit http://localhost:5173
```

## 📋 API Endpoints

```
POST   /api/auth/register     Register new user
POST   /api/auth/login        Login
GET    /api/auth/me           Get current user

GET    /api/games/:id         Get game by ID
GET    /api/games/user/:id    Get user's game history
GET    /api/games/leaderboard/top  Top players

GET    /api/users/:username   Get user profile
```

## 🔌 WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `matchmaking:join` | `{timeControl, increment}` | Join matchmaking queue |
| `matchmaking:cancel` | - | Cancel matchmaking |
| `game:move` | `{gameId, from, to, promotion}` | Make a move |
| `game:resign` | `{gameId}` | Resign |
| `game:drawOffer` | `{gameId}` | Offer draw |
| `game:drawAccept` | `{gameId}` | Accept draw |
| `game:chat` | `{gameId, message}` | Send chat message |
| `game:reconnect` | `{gameId}` | Reconnect to game |
| `game:spectate` | `{gameId}` | Spectate a game |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `game:start` | `{gameId, color, opponent, gameState}` | Game begins |
| `game:move` | `{from, to, fen, timeWhite, timeBlack, check}` | Move played |
| `game:over` | `{result, winnerColor}` | Game ended |
| `game:ratingChange` | `{white, black}` | ELO updated |
| `game:chat` | `{from, message}` | Chat message |

## 🧠 Chess Engine Details

The chess engine implements:

```
Board: 64-element array (index = rank * 8 + file)
Pieces: {type, color} objects
FEN: Full parsing and serialization

Move generation:
  - Pseudo-legal moves for each piece type
  - Legal move filtering (removes moves leaving king in check)
  - Attack detection for check/pin detection
  
Special moves:
  - Castling: checks empty squares + no squares attacked
  - En passant: tracked via FEN en passant target square
  - Promotion: returns all 4 options as separate moves

Game termination:
  - Checkmate: no legal moves + king in check
  - Stalemate: no legal moves + king not in check
  - Insufficient material: K vs K, K+N vs K, K+B vs K
  - 50-move rule: tracked via halfmove clock
```

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80 | Reverse proxy (main entry) |
| frontend | 80 (internal) | React app |
| backend | 3001 | API + WebSocket server |
| postgres | 5432 | Database |
| redis | 6379 | Cache + game state |

## 🔐 Security

- Passwords hashed with bcrypt (12 rounds)
- JWT authentication (7 day expiry)
- Move validation on server (clients cannot cheat)
- Input sanitization on all endpoints

## 📈 Scaling

For production at scale:
- Add multiple backend instances behind nginx load balancer
- Use Redis Pub/Sub for cross-instance socket communication (Socket.io Redis adapter)
- Add CDN for static assets
- Enable PostgreSQL connection pooling (PgBouncer)

---

Made with ♟ by NOchess
