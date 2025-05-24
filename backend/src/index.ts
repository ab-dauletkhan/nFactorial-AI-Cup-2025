import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PORT, CLIENT_URL } from './config.js';
import { processTranslation, mockTranslate } from './translation.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('Mixed-Language Translator Server is running!');
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('sendText', async (data) => {
    console.log(`Received data from ${socket.id}:`, data);
    
    try {
      // Extract data from the request
      const text = typeof data === 'string' ? data : data.text;
      const languages = typeof data === 'object' ? (data.languages || ['auto']) : ['auto'];
      const targetLanguage = typeof data === 'object' ? (data.targetLanguage || 'en') : 'en';
      
      if (!text || text.trim() === '') {
        socket.emit('receiveTranslation', '');
        return;
      }
      
      console.log('Processing translation:', { text, languages, targetLanguage });
      
      // Use real translation if OpenAI is configured, otherwise use mock
      let translatedText: string;
      
      if (process.env.OPENAI_API_KEY) {
        translatedText = await processTranslation({
          text,
          languages,
          targetLanguage
        });
      } else {
        // Use mock translation for development
        translatedText = `[MOCK TRANSLATION TO ${targetLanguage.toUpperCase()}] ${mockTranslate(text)}`;
      }
      
      socket.emit('receiveTranslation', translatedText);
      
    } catch (error) {
      console.error('Translation error:', error);
      socket.emit('translationError', 'Failed to translate text. Please try again.');
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
  console.log(`Mixed-Language Translator Server listening on *:${PORT}`);
  console.log(`CORS enabled for: ${CLIENT_URL}`);
  console.log(`OpenAI integration: ${process.env.OPENAI_API_KEY ? 'ENABLED' : 'DISABLED (using mock)'}`);
});