import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PORT, CLIENT_URL } from './config.js';
import { mockTranslate } from './translation.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('Translator server is running!');
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('sendText', (text) => {
    // console.log(`Received text from ${socket.id}:`, text); // Optional: log received text
    try {
      const translatedText = mockTranslate(text);
      socket.emit('receiveTranslation', translatedText);
    } catch (error) {
      console.error('Translation error:', error);
      socket.emit('translationError', 'Failed to translate text.'); // Optional: send error to client
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error("Connection error:", err.message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
}); 