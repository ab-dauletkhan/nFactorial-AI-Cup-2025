import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PORT, CLIENT_URL } from './config.js';
import { processTranslation, mockTranslate, mapLanguages, parseLanguagesFromMappedText } from './translation.js';
import { transcribeAudio } from './transcription.js';
import multer from 'multer';

const app = express();

// Middleware for JSON body parsing (if not already present for other routes)
app.use(express.json());

// Multer setup for handling file uploads (in-memory storage for this example)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
} as any);

app.get('/', (req: Request, res: Response) => {
  res.send('Mixed-Language Translator Server is running!');
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

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

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
        // Simulate a delay for mock translation to allow frontend to process annotation first
        translatedText = `[MOCK TRANSLATION TO ${targetLanguage.toUpperCase()}] ${mockTranslate(text)}`;
      }
      
      // Emit annotated text first
      socket.emit('receiveAnnotatedText', {
        annotatedText: mappedTextForClient,
        detectedLanguages: detectedLanguagesForClient
      });

      // Then emit translated text (add a small delay for mock to simulate separate processing)
      if (!process.env.OPENAI_API_KEY) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for mock
      }
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
      // For auto-detection, languages array can be empty or ['auto']
      const mappedText = await mapLanguages(text, ['auto']);
      socket.emit('languageDetected', { taggedText: mappedText });
    } catch (error) {
      console.error('Language detection error:', error);
      // Optionally emit an error event to the client
      socket.emit('languageDetectionError', 'Failed to detect languages.');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('connect_error', (err: Error) => {
    console.error("Connection error:", err.message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Mixed-Language Translator Server listening on *:${PORT}`);
  console.log(`CORS enabled for: ${CLIENT_URL}`);
  console.log(`OpenAI integration: ${process.env.OPENAI_API_KEY ? 'ENABLED' : 'DISABLED (using mock)'}`);
});