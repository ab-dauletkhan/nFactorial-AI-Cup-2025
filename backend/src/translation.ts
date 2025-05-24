import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config.js';

const openai = OPENAI_API_KEY ? new OpenAI({
  apiKey: OPENAI_API_KEY,
}) : null;

interface TranslationRequest {
  text: string;
  languages: string[];
  targetLanguage: string;
}

/**
 * Maps languages in the input text using LLM
 * @param text - The input text
 * @param userLanguages - User-specified languages or ['auto']
 * @returns Language-mapped text with [[LANG]] tags
 */
export async function mapLanguages(text: string, userLanguages: string[]): Promise<string> {
  if (!openai) {
    // Mock language mapping for development
    return `[[EN]]${text}`;
  }

  const isAutoDetect = userLanguages.includes('auto') || userLanguages.length === 0;
  
  let prompt: string;
  
  if (isAutoDetect) {
    prompt = `Analyze the following text and tag each language segment with [[LANG]] where LANG is the ISO 639-1 two-letter code. Use these rules:
- Tag before each segment where language changes
- Group largest possible segments (phrases/clauses) of same language
- Use [[UNK]] for unidentifiable segments
- Use [[AMB:lang1/lang2]] for ambiguous segments

Text: "${text}"

Return only the tagged text:`;
  } else {
    const langList = userLanguages.join(', ');
    prompt = `Analyze the following text and tag each language segment with [[LANG]] where LANG is the ISO 639-1 two-letter code. The user specified these languages: ${langList}. Prioritize these languages when resolving ambiguities.

Use these rules:
- Tag before each segment where language changes
- Group largest possible segments (phrases/clauses) of same language
- Prioritize user-specified languages: ${langList}
- Use [[UNK]] for unidentifiable segments

Text: "${text}"

Return only the tagged text:`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.1,
    });

    return response.choices[0]?.message?.content?.trim() || text;
  } catch (error) {
    console.error('Language mapping error:', error);
    return `[[EN]]${text}`; // Fallback
  }
}

/**
 * Translates the mapped text to target language using LLM
 * @param mappedText - Text with language tags
 * @param targetLanguage - Target language code
 * @returns Translated text
 */
export async function translateText(mappedText: string, targetLanguage: string): Promise<string> {
  if (!openai) {
    // Mock translation for development
    return `[MOCK TRANSLATION TO ${targetLanguage.toUpperCase()}] ${mappedText}`;
  }

  const prompt = `Translate the following language-tagged text to ${targetLanguage}. The text contains language tags in [[LANG]] format. Translate each segment according to its language tag and provide a natural, fluent translation in ${targetLanguage}.

Tagged text: "${mappedText}"

Return only the translated text in ${targetLanguage}:`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() || mappedText;
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error('Translation failed');
  }
}

/**
 * Main translation function that handles the complete process
 * @param request - Translation request object
 * @returns Translated text
 */
export async function processTranslation(request: TranslationRequest): Promise<string> {
  const { text, languages, targetLanguage } = request;
  
  if (!text || text.trim() === '') {
    return '';
  }

  try {
    // Step 1: Map languages in the text
    const mappedText = await mapLanguages(text, languages);
    console.log('Mapped text:', mappedText);
    
    // Step 2: Translate to target language
    const translatedText = await translateText(mappedText, targetLanguage);
    console.log('Translated text:', translatedText);
    
    return translatedText;
  } catch (error) {
    console.error('Translation process error:', error);
    throw error;
  }
}

/**
 * Mock translation function for development/testing
 * @param text - The text to translate
 * @returns Mock translated text
 */
export const mockTranslate = (text: string): string => {
  if (typeof text !== 'string') {
    return '';
  }
  return `[MOCK] ${text.split('').reverse().join('')}`;
};