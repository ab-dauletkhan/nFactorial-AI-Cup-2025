import { io, type Socket } from 'socket.io-client';

// Determine server URL based on environment
const BACKEND_URL = "https://n-factorial-ai-cup-2025-mi1c.vercel.app";

console.log('Connecting to backend:', { BACKEND_URL });

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['polling', 'websocket'] as const,
  path: '/socket.io',  // Removed trailing slash
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  forceNew: true,
  withCredentials: false,
  secure: true, // Always use secure connection in production
  rejectUnauthorized: false
});

// Socket event logging
socket.on('connect', () => {
  console.log('Connected to WebSocket server with id:', socket.id);
  console.log('Socket connection details:', {
    connected: socket.connected,
    disconnected: socket.disconnected,
    transport: socket.io.engine?.transport?.name,
    url: BACKEND_URL
  });
});

socket.on('disconnect', (reason: string) => {
  console.log('Disconnected from WebSocket server:', reason, {
    lastTransport: socket.io.engine?.transport?.name
  });
  if (reason === 'io server disconnect' || reason === 'transport close') {
    console.log('Attempting to reconnect...');
    socket.connect();
  }
});

socket.on('connect_error', (error: Error) => {
  console.error('WebSocket connection error:', error, {
    transport: socket.io.engine?.transport?.name,
    url: BACKEND_URL
  });
  
  // Attempt to reconnect with polling if websocket fails
  const manager = socket.io;
  if (manager?.opts.transports) {
    const transports = manager.opts.transports as ('websocket' | 'polling')[];
    if (transports.includes('websocket')) {
      console.log('Retrying with polling transport...');
      manager.opts.transports = ['polling'] as const;
      socket.connect();
    }
  }
}); 