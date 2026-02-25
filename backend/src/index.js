const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const userRoutes = require('./routes/users');
const setupSocketHandlers = require('./socket/gameHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://nochess:nochess@postgres:5432/nochess'
});

// Redis
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.connect().catch(console.error);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Auth middleware for socket
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    // Allow guest connections with a temp ID
    socket.userId = `guest_${socket.id}`;
    socket.username = `Guest_${socket.id.substring(0, 6)}`;
    socket.isGuest = true;
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nochess_secret_key');
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    socket.isGuest = false;
    next();
  } catch (err) {
    socket.userId = `guest_${socket.id}`;
    socket.username = `Guest_${socket.id.substring(0, 6)}`;
    socket.isGuest = true;
    next();
  }
});

// Routes
app.use('/api/auth', authRoutes(pool));
app.use('/api/games', gameRoutes(pool, redisClient));
app.use('/api/users', userRoutes(pool));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'NOchess API' }));

// Socket handlers
setupSocketHandlers(io, pool, redisClient);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 NOchess server running on port ${PORT}`);
});

// Init DB
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        rating INTEGER DEFAULT 1200,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        games_drawn INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        white_player_id VARCHAR(255),
        black_player_id VARCHAR(255),
        white_username VARCHAR(100),
        black_username VARCHAR(100),
        white_rating INTEGER DEFAULT 1200,
        black_rating INTEGER DEFAULT 1200,
        time_control INTEGER DEFAULT 600,
        increment INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'waiting',
        result VARCHAR(20),
        winner_color VARCHAR(10),
        pgn TEXT DEFAULT '',
        moves JSONB DEFAULT '[]',
        initial_fen TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        current_fen TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS game_moves (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id UUID REFERENCES games(id),
        move_number INTEGER,
        color VARCHAR(10),
        from_sq VARCHAR(3),
        to_sq VARCHAR(3),
        promotion VARCHAR(2),
        notation VARCHAR(20),
        fen_after TEXT,
        time_remaining_white INTEGER,
        time_remaining_black INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_player_id);
      CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_player_id);
      CREATE INDEX IF NOT EXISTS idx_game_moves_game ON game_moves(game_id);
    `);
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
    setTimeout(initDB, 3000);
  }
}

initDB();
