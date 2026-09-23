import http from 'node:http';
import { Server } from 'socket.io';

// Render automatically assigns process.env.PORT
const PORT = process.env.PORT || 5182;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health-check endpoint for Render / Uptime monitors
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Pickleball Sync Server</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #06090e; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #0e1524; border: 1px solid #1e2d42; border-radius: 12px; padding: 32px 48px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.7); }
          h2 { color: #00f0ff; margin-top: 0; }
          .status { display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; font-weight: 800; padding: 4px 12px; border-radius: 999px; font-size: 13px; }
          p { color: #94a3b8; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>PICKLEBALL CLOUD SYNC SERVER</h2>
          <div class="status">● ONLINE</div>
          <p>Listening on 0.0.0.0:${PORT} with active WebSockets enabled.</p>
        </div>
      </body>
    </html>
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
let latestTrackerStatus = { active: false, cameraIndex: 0 };
let connectedClients = 0;

io.on('connection', (socket) => {
  connectedClients++;
  console.log(`[Sync Server] Client connected: ${socket.id} (Total:${connectedClients})`);
  io.emit('pickleball:operators-count', connectedClients);

  // Send current AI tracker status to newly joined client
  socket.emit('pickleball:tracker-status', latestTrackerStatus);

  // Send active match snapshot immediately to newly connecting operator/overlay
  if (latestMultiSnapshot) {
    socket.emit('pickleball:current-multi', latestMultiSnapshot);
  }

  // Relay AI tracker start/stop/camera change commands between WebApp and Python script
  socket.on('pickleball:tracker-command', (data) => {
    console.log(`[AI Tracker] Command received:`, data);
    io.emit('pickleball:tracker-command', data);
  });

  // Track & cache whether Python AI Tracker is actively streaming
  socket.on('pickleball:tracker-status', (status) => {
    latestTrackerStatus = { ...latestTrackerStatus, ...status };
    io.emit('pickleball:tracker-status', latestTrackerStatus);
  });

  // Initial state claim from lead operator
  socket.on('pickleball:claim-multi', (data) => {
    latestMultiSnapshot = data;
    socket.broadcast.emit('pickleball:current-multi', data);
  });

  // Live match mutations (points, timeouts, formats, locks)
  socket.on('pickleball:update-multi', (data) => {
    latestMultiSnapshot = data;
    socket.broadcast.emit('pickleball:current-multi', data);
  });

  // Manual on-demand snapshot request
  socket.on('pickleball:request-state', () => {
    if (latestMultiSnapshot) {
      socket.emit('pickleball:current-multi', latestMultiSnapshot);
    }
  });

  // Python AI Tracker auto-stat event relay to all connected scoreboards
  socket.on('pickleball:auto-stat', (event) => {
    io.emit('pickleball:auto-stat', event);
  });

  socket.on('disconnect', () => {
    connectedClients = Math.max(0, connectedClients - 1);
    console.log(`[Sync Server] Client disconnected: ${socket.id} (Total:${connectedClients})`);
    io.emit('pickleball:operators-count', connectedClients);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Sync Server] Ready and listening on 0.0.0.0:${PORT}`);
});