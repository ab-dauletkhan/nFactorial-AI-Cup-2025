import OpenAI from 'openai';
import { LEMONFOX_API_KEY, LEMONFOX_BASE_URL } from './config.js'; // Import Lemonfox specific config
import fs from 'fs'; // Needed for creating a temporary file for FormData
import os from 'os';
import path from 'path';

// Initialize OpenAI client for Lemonfox
const lemonfoxOpenai = LEMONFOX_API_KEY ? new OpenAI({
  apiKey: LEMONFOX_API_KEY,
  baseURL: LEMONFOX_BASE_URL,
}) : null;

/**
 * Transcribes audio using the Lemonfox Whisper API (via OpenAI compatible endpoint).
 * @param audioBuffer The audio data as a Buffer.
 * @param originalFilename Optional: The original filename to help Whisper determine the format.
 * @returns The transcribed text.
 */
export async function transcribeAudio(audioBuffer: Buffer, originalFilename?: string): Promise<string> {
  if (!lemonfoxOpenai) { // Check lemonfoxOpenai client
    console.warn('Lemonfox API key not configured. Returning mock transcription for audio.');
    await new Promise(resolve => setTimeout(resolve, 700));
    return "Mocked transcription (Lemonfox not configured): The quick brown fox jumps over the lazy dog.";
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Audio buffer is empty or undefined.");
  }

  // Whisper API expects a file. We need to convert buffer to a readable stream or save to a temp file to send with FormData.
  // Using a temporary file is often more straightforward with FormData for the `openai` library.
  const tempFileName = originalFilename || 'audio.webm'; // Default to webm if no name, Whisper can often infer
  const tempFilePath = path.join(os.tmpdir(), `lemonfox_temp_${Date.now()}_${tempFileName}`);
  
  try {
    fs.writeFileSync(tempFilePath, audioBuffer);

    console.log(`Sending audio to Lemonfox API. Temp file: ${tempFilePath}, size: ${audioBuffer.length} bytes`);

    const transcription = await lemonfoxOpenai.audio.transcriptions.create({ // Use lemonfoxOpenai client
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1", // Specify the model
      // language: 'en', // Optional: Specify language if known, otherwise Whisper auto-detects
      // response_format: 'json', // Default is json, which gives just text. Other options: text, srt, verbose_json, vtt
    });

    console.log('Lemonfox API response received.');
    return transcription.text;

  } catch (error) {
    console.error('Error transcribing audio with Lemonfox:', error);
    // Attempt to cast to OpenAIError to access more specific error details if available
    if (error instanceof OpenAI.APIError) {
        console.error('Lemonfox API Error Details:', {
            status: error.status,
            headers: error.headers,
            errorName: error.name,
            errorMessage: error.message,
            errorType: error.type,
        });
        throw new Error(`Lemonfox API error: ${error.message} (Status: ${error.status})`);
    } else if (error instanceof Error) {
        throw new Error(`Lemonfox transcription failed: ${error.message}`);
    } else {
        throw new Error('Lemonfox transcription failed due to an unknown error.');
    }
  } finally {
    // Clean up the temporary file
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('Temporary audio file (Lemonfox) deleted:', tempFilePath);
      } catch (cleanupError) {
        console.error('Error deleting temporary audio file (Lemonfox):', cleanupError);
      }
    }
  }
} 