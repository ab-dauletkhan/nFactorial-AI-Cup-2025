import { io, type Socket } from 'socket.io-client';

// Determine server URL based on environment
const SERVER_URL = import.meta.env.PROD 
  ? "https://n-factorial-ai-cup-2025-mi1c.vercel.app"
  : "http://localhost:3001";

export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'] as const,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
});

// Socket event logging
socket.on('connect', () => {
  console.log('Connected to WebSocket server with id:', socket.id);
});

socket.on('disconnect', (reason: string) => {
  console.log('Disconnected from WebSocket server:', reason);
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, try reconnecting
    socket.connect();
  }
});

socket.on('connect_error', (error: Error) => {
  console.error('WebSocket connection error:', error);
  // Attempt to reconnect with polling if websocket fails
  const manager = socket.io;
  if (manager?.opts.transports) {
    const transports = manager.opts.transports as ('websocket' | 'polling')[];
    if (transports.includes('websocket')) {
      console.log('Retrying with polling transport...');
      manager.opts.transports = ['polling'] as const;
    }
  }
}); 