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

  socket.on('sendText', (data) => {
    console.log(`Received data from ${socket.id}:`, data);
    try {
      // Extract text from the data object
      const textToTranslate = typeof data === 'string' ? data : data.text;
      const languages = typeof data === 'object' ? data.languages : [];
      
      if (!textToTranslate) {
        socket.emit('receiveTranslation', '');
        return;
      }
      
      const translatedText = mockTranslate(textToTranslate);
      socket.emit('receiveTranslation', translatedText);
    } catch (error) {
      console.error('Translation error:', error);
      socket.emit('translationError', 'Failed to translate text.');
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