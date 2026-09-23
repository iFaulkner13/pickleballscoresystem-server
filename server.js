import http from 'node:http';
import { Server } from 'socket.io';

// Render automatically assigns process.env.PORT
const PORT = process.env.PORT || 5182;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health-check endpoint for Render keep-alive
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <div style="font-family: Arial; padding: 40px; background: #0b0f19; color: #fff; text-align: center;">
      <h2 style="color: #00f0ff;">Pickleball Cloud Multi-Ribbon Sync Server</h2>
      <p>Status: <b style="color: #10b981;">ONLINE</b></p>
      <p style="color: #94a3b8;">Listening on dynamic port ${PORT} with active WebSockets enabled.</p>
    </div>
  `);
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7 // 50MB buffer to comfortably support team media/logos
});

let latestMultiSnapshot = null;
let connectedClients = 0;

io.on('connection', (socket) => {
  connectedClients++;
  console.log(`[Sync Server] Client connected: ${socket.id} (Total: ${connectedClients})`);
  io.emit('pickleball:operators-count', connectedClients);

  // 1. Send active match snapshot immediately to the connecting client
  if (latestMultiSnapshot) {
    socket.emit('pickleball:current-multi', latestMultiSnapshot);
  }

  // 2. Initial claim from an operator
  socket.on('pickleball:claim-multi', (data) => {
    latestMultiSnapshot = data;
    socket.broadcast.emit('pickleball:current-multi', data);
  });

  // 3. Live match mutations (points, timeouts, formats, locks)
  socket.on('pickleball:update-multi', (data) => {
    latestMultiSnapshot = data;
    socket.broadcast.emit('pickleball:current-multi', data);
  });

  // 4. Manual on-demand snapshot request
  socket.on('pickleball:request-state', () => {
    if (latestMultiSnapshot) {
      socket.emit('pickleball:current-multi', latestMultiSnapshot);
    }
  });

  // 5. Python AI Tracker relay
  socket.on('pickleball:auto-stat', (event) => {
    io.emit('pickleball:auto-stat', event);
  });

  socket.on('disconnect', () => {
    connectedClients = Math.max(0, connectedClients - 1);
    console.log(`[Sync Server] Client disconnected: ${socket.id} (Total: ${connectedClients})`);
    io.emit('pickleball:operators-count', connectedClients);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sync server listening on 0.0.0.0:${PORT}`);
});