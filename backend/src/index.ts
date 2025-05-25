import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PORT, CLIENT_URLS } from './config.js';
import { processTranslation, mockTranslate, mapLanguages, parseLanguagesFromMappedText } from './translation.js';
import { transcribeAudio } from './transcription.js';
import multer from 'multer';
import cors from 'cors';

const app = express();

// Enable CORS for all routes with no restrictions
app.use(cors({
  origin: '*',
  credentials: true
}));

// Middleware for JSON body parsing
app.use(express.json());

// Multer setup for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const httpServer = createServer(app);

// Configure Socket.IO with no CORS restrictions
const io = new Server(httpServer, {
  path: '/socket.io',
  cors: {
    origin: '*',
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('Mixed-Language Translator Server is running!');
});

// Socket connection status endpoint
app.get('/status', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    connections: io.engine.clientsCount,
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// New endpoint for audio transcription
app.post('/api/transcribe', upload.single('audioFile'), async (req: Request, res: Response) => {
  console.log("-----> /api/transcribe endpoint hit <-----");
  const uploadedFile = (req as any).file;
  if (!uploadedFile) {
    res.status(400).json({ error: 'No audio file uploaded.' });
    return;
  }
  
  try {
    console.log('Received audio file for transcription:', uploadedFile.originalname, 'Size:', uploadedFile.size);
    // Pass the buffer and originalname to the transcription service
    const transcribedText = await transcribeAudio(uploadedFile.buffer, uploadedFile.originalname);
    res.json({ transcribedText });
  } catch (error) {
    console.error('Transcription endpoint error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to transcribe audio.' });
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', {
    id: socket.id,
    transport: socket.conn.transport.name,
    remoteAddress: socket.handshake.address,
    headers: socket.handshake.headers
  });

  socket.on('sendText', async (data: any) => {
    console.log(`Received data from ${socket.id}:`, data);
    
    try {
      // Extract data from the request
      const text = typeof data === 'string' ? data : data.text;
      const languages = typeof data === 'object' && data.languages ? data.languages : ['auto'];
      const targetLanguage = typeof data === 'object' && data.targetLanguage ? data.targetLanguage : 'en';
      
      if (!text || text.trim() === '') {
        socket.emit('receiveAnnotatedText', { annotatedText: '', detectedLanguages: [] });
        socket.emit('receiveTranslation', '');
        return;
      }
      
      console.log('Processing translation:', { text, languages, targetLanguage });
      
      // Use real translation if OpenAI is configured, otherwise use mock
      let translatedText: string;
      let mappedTextForClient: string;
      let detectedLanguagesForClient: string[];
      
      if (process.env.OPENAI_API_KEY) {
        const result = await processTranslation({
          text,
          languages,
          targetLanguage
        });
        mappedTextForClient = result.mappedText;
        translatedText = result.translatedText;
        detectedLanguagesForClient = parseLanguagesFromMappedText(mappedTextForClient);
      } else {
        // Mock logic for annotation and translation
        mappedTextForClient = text.includes('[[') ? text.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (_m: string, lc: string) => `[[${lc.toUpperCase()}]]`) : `[[EN]]${text}`;
        detectedLanguagesForClient = parseLanguagesFromMappedText(mappedTextForClient);
        translatedText = `[MOCK TRANSLATION TO ${targetLanguage.toUpperCase()}] ${mockTranslate(text)}`;
      }
      
      // Emit annotated text first
      socket.emit('receiveAnnotatedText', {
        annotatedText: mappedTextForClient,
        detectedLanguages: detectedLanguagesForClient
      });

      // Then emit translated text
      socket.emit('receiveTranslation', translatedText);
      
    } catch (error) {
      console.error('Translation error:', error);
      socket.emit('translationError', 'Failed to translate text. Please try again.');
    }
  });

  socket.on('detectLanguages', async (data: any) => {
    console.log(`Received detectLanguages request from ${socket.id}:`, data);
    try {
      const text = typeof data === 'string' ? data : data.text;
      if (!text || text.trim() === '') {
        socket.emit('languageDetected', { taggedText: '' });
        return;
      }
      const mappedText = await mapLanguages(text, ['auto']);
      socket.emit('languageDetected', { taggedText: mappedText });
    } catch (error) {
      console.error('Language detection error:', error);
      socket.emit('languageDetectionError', 'Failed to detect languages.');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', {
      id: socket.id,
      transport: socket.conn.transport.name
    });
  });

  socket.on('connect_error', (err: Error) => {
    console.error("Connection error:", {
      id: socket.id,
      error: err.message,
      transport: socket.conn.transport?.name
    });
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Mixed-Language Translator Server listening on *:${PORT}`);
  console.log(`CORS enabled for:`, CLIENT_URLS);
  console.log(`OpenAI integration: ${process.env.OPENAI_API_KEY ? 'ENABLED' : 'DISABLED (using mock)'}`);
});