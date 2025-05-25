import { io } from 'socket.io-client';

const SERVER_URL = "https://n-factorial-ai-cup-2025-mi1c.vercel.app/";

export const socket = io(SERVER_URL, {
  autoConnect: false, // Explicitly connect when needed
  transports: ['websocket'], // Prefer websockets
});

// Optional: Log socket events for debugging
socket.on('connect', () => {
  console.log('Connected to WebSocket server with id:', socket.id);
});

socket.on('disconnect', (reason: string) => {
  console.log('Disconnected from WebSocket server:', reason);
});

socket.on('connect_error', (error: Error) => {
  console.error('WebSocket connection error:', error);
}); 