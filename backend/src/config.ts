import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || '3001';
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Original OpenAI API Key (primarily for translation)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Lemonfox Configuration (for transcription)
export const LEMONFOX_API_KEY = process.env.LEMONFOX_API_KEY;
export const LEMONFOX_BASE_URL = "https://api.lemonfox.ai/v1"; // As specified

// Notation Service Configuration (for language mapping)
export const NOTATION_API_KEY = process.env.NOTATION_API_KEY || OPENAI_API_KEY;
export const NOTATION_API_BASE_URL = process.env.NOTATION_API_BASE_URL; // Optional

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