export const PORT = process.env.PORT || 3001;
export const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set. Translation will use mock function.');
}