import dotenv from 'dotenv';

dotenv.config();

// Server configuration
export const PORT = process.env.PORT || '3001';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';

// Allow multiple client URLs for different environments
export const CLIENT_URLS = IS_PROD 
  ? [
      'https://n-factorial-ai-cup-2025-wheat.vercel.app',
      'https://n-factorial-ai-cup-2025-wheat.vercel.app:443'
    ]
  : [
      'http://localhost:3000',
      'http://localhost:5173', // Vite default dev port
      'http://localhost:5174'  // Vite fallback port
    ];

// Original OpenAI API Key (primarily for translation)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Lemonfox Configuration (for transcription)
export const LEMONFOX_API_KEY = process.env.LEMONFOX_API_KEY;
export const LEMONFOX_BASE_URL = "https://api.lemonfox.ai/v1"; // As specified

// Notation Service Configuration (for language mapping)
export const NOTATION_API_KEY = process.env.GROQ_API_KEY || OPENAI_API_KEY;
export const NOTATION_API_BASE_URL = process.env.GROQ_API_BASE_URL; // Optional

// You can add a check here to ensure critical keys are present if needed
if (!OPENAI_API_KEY) {
  console.warn("Warning: OPENAI_API_KEY is not set. Translation functionality might be limited or use mocks.");
}
if (!LEMONFOX_API_KEY) {
  console.warn("Warning: LEMONFOX_API_KEY is not set. Transcription will use mocks.");
}
if (!NOTATION_API_KEY) {
  console.warn("Warning: NOTATION_API_KEY is not set. Language notation might fall back or use mocks.");
}

// Log configuration on startup
console.log('Server configuration:', {
  NODE_ENV,
  IS_PROD,
  PORT,
  CLIENT_URLS,
  hasOpenAI: !!OPENAI_API_KEY,
  hasLemonFox: !!LEMONFOX_API_KEY,
  hasNotation: !!NOTATION_API_KEY
});