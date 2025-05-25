import { io, type Socket } from 'socket.io-client';

// Determine server URL based on environment
const SERVER_URL = import.meta.env.PROD 
  ? "https://n-factorial-ai-cup-2025-mi1c.vercel.app"
  : "http://localhost:3001";

export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'] as const,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  forceNew: true,
  withCredentials: true
});

// Socket event logging
socket.on('connect', () => {
  console.log('Connected to WebSocket server with id:', socket.id);
});

socket.on('disconnect', (reason: string) => {
  console.log('Disconnected from WebSocket server:', reason);
  if (reason === 'io server disconnect' || reason === 'transport close') {
    // Server initiated disconnect or transport closed, try reconnecting
    console.log('Attempting to reconnect...');
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
      socket.connect(); // Explicitly try to reconnect
    }
  }
}); 