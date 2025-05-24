import OpenAI from 'openai';
import { OPENAI_API_KEY, NOTATION_API_KEY, NOTATION_API_BASE_URL } from './config.js';

// Client for general translation tasks
const translateOpenai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Client for language notation (mapping) tasks
const notationOpenai = NOTATION_API_KEY ? new OpenAI({
  apiKey: NOTATION_API_KEY,
  baseURL: NOTATION_API_BASE_URL, // If NOTATION_API_BASE_URL is undefined, OpenAI client defaults to official one
}) : null;

const DEFAULT_LANGUAGE_MODEL = 'gpt-3.5-turbo';
const MAPPING_MODEL = 'gpt-3.5-turbo'; // Or could be a different model if notation service prefers

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
export async function mapLanguages(text: string, languages: string[]): Promise<string> {
  if (!notationOpenai) {
    console.warn('Notation API key not set. Using mock language mapping.');
    if (text.includes('[[') && text.includes(']]S')) return text; // Already tagged
    return `[[EN]]${text}`; // Simple mock: tag everything as English
  }

  const systemPrompt = `You are a language mapping expert. Your task is to identify all languages present in the given text and enclose each segment in tags like [[XX]] where XX is the uppercase ISO 639-1 language code (e.g., [[EN]], [[ES]], [[ZH]]) or ISO 639-1 code followed by a region/dialect if applicable (e.g., [[EN:GB]], [[PT:BR]]). If a language is specified in the languages array, prioritize it for ambiguous segments. If languages array is ['auto'], perform auto-detection for all segments. Do not translate the text. Only add the language tags. If the text is already correctly and fully tagged, return it as is. If parts are tagged and parts are not, tag only the untagged parts. If multiple languages are clearly present, use tags for each. For very short, ambiguous, or proper nouns that could belong to multiple requested languages, use the first language in the provided list, or [[UND]] if truly undeterminable. Output ONLY the tagged text.`;
  
  const userPrompt = `Text to map:
"${text}"

Languages to prioritize (or 'auto' for full detection): ${JSON.stringify(languages)}

Return only the text with language tags.`;

  try {
    const response = await notationOpenai.chat.completions.create({
      model: MAPPING_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: text.length + languages.length * 10 + 50, // Estimate tokens
    });
    // Use optional chaining and nullish coalescing for safer access
    return response.choices?.[0]?.message?.content ?? text;
  } catch (error) {
    console.error("Error mapping languages with notation service:", error);
    // Fallback to simple mock if API fails
    if (text.includes('[[') && text.includes(']]S')) return text;
    return `[[EN]]${text} [[ERROR_LANG_MAP]]`; 
  }
}

/**
 * Translates the mapped text to target language using LLM
 * @param mappedText - Text with language tags
 * @param targetLanguage - Target language code
 * @returns Translated text
 */
export async function translateText(text: string, targetLanguage: string, sourceLanguages: string[] = ['auto']): Promise<string> {
  if (!translateOpenai) {
    console.warn('OpenAI API key for translation not set. Using mock translation.');
    return `[MOCK TRANSLATION TO ${targetLanguage.toUpperCase()}] ${mockTranslate(text)}`;
  }

  const systemPrompt = `You are a an expert polyglot translator. Your task is to translate the given text accurately into the specified target language. The input text may contain segments in different languages, clearly demarcated by tags like [[XX]] or [[XX:YY]] (e.g., [[EN]] for English, [[ES:MX]] for Mexican Spanish). Translate each segment into the target language, preserving the overall meaning and flow. Maintain the original structure as much as possible. If specific source languages are hinted by the [[LANG_CODE]] tags, use them to resolve ambiguities if any. If the input already contains [[${targetLanguage.toUpperCase()}]] tags, ensure those segments are correctly in the target language or translate them if they are not. Output ONLY the translated text, without any tags unless they were part of the original untranslatable content (e.g. code snippets, proper nouns that should not be translated AND were tagged). Remove all language identification tags like [[XX]] from your final output.`;
  
  const userPrompt = `Source text (mixed languages, pay attention to tags):
"${text}"

Target language: ${targetLanguage}
Source languages hint: ${sourceLanguages.join(', ')}

Return only the translated text.`;

  try {
    const response = await translateOpenai.chat.completions.create({
      model: DEFAULT_LANGUAGE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: Math.floor(text.length * 2.5) + 50, // Adjusted token estimation
    });
    // Use optional chaining and nullish coalescing for safer access
    return response.choices?.[0]?.message?.content ?? `[TRANSLATION_ERROR_EMPTY_RESPONSE: ${targetLanguage.toUpperCase()}] ${mockTranslate(text)}`;
  } catch (error) {
    console.error("Error translating text with OpenAI:", error);
    return `[TRANSLATION_ERROR: ${targetLanguage.toUpperCase()}] ${mockTranslate(text)}`;
  }
}

/**
 * Main translation function that handles the complete process
 * @param request - Translation request object
 * @returns An object containing the mapped (annotated) text and the translated text
 */
export async function processTranslation(data: { text: string; languages: string[]; targetLanguage: string; }): Promise<{ mappedText: string; translatedText: string; detectedSourceLanguages: string[]; }> {
  const { text, languages, targetLanguage } = data;

  let mappedText = text;
  if (!text.includes('[[') || !text.includes(']]S')) { 
    mappedText = await mapLanguages(text, languages.length > 0 && languages[0] !== 'auto' ? languages : ['auto']);
  } else {
    mappedText = text.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (matchFull: string, langCode: string) => {
      return `[[${langCode.toUpperCase()}]]`;
    });
  }
  
  const detectedSourceLanguages = parseLanguagesFromMappedText(mappedText);

  // Use the new translateText function with its own client
  const translatedText = await translateText(mappedText, targetLanguage, detectedSourceLanguages);

  return {
    mappedText,
    translatedText,
    detectedSourceLanguages
  };
}

/**
 * Parses language codes from a text string containing [[LANG]] tags.
 * @param mappedText Text with language tags (e.g., "[[EN]]Hello [[ES]]mundo")
 * @returns An array of unique language codes found (e.g., ["EN", "ES"])
 */
export function parseLanguagesFromMappedText(mappedText: string): string[] {
  const regex = /\[\[([A-Z]{2,3}(?::[A-Z0-9_-]+)?)\]\]/g;
  const languages = new Set<string>();
  let match;
  while ((match = regex.exec(mappedText)) !== null) {
    if (match[1]) {
      languages.add(match[1]);
    }
  }
  return Array.from(languages);
}

/**
 * Mock translation function for development/testing
 * @param text - The text to translate
 * @returns Mock translated text
 */
export function mockTranslate(text: string): string {
  return `Mocked: ${text.substring(0, 50)}...`;
}