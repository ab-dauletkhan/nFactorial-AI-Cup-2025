import React, { useState, useCallback, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { LANGUAGES, DEFAULT_INPUT_LANGUAGE, DEFAULT_OUTPUT_LANGUAGE } from '../constants/languages';
import './InputColumn.css';

// Simple Mic icon (can be replaced with an SVG or icon library later)
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="22"></line>
  </svg>
);

const RecordingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="red" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="4" fill="white"></circle> {/* Optional inner dot to show activity */}
  </svg>
);

const ProcessingIcon = () => ( // Simple spinner
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke="currentColor">
    <style>{`.spinner_V8m1{transform-origin:center;animation:spinner_zKVK .75s linear infinite}@keyframes spinner_zKVK{100%{transform:rotate(360deg)}}`}</style>
    <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
    <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0-1.48-1.75A5,5,0,0,0,12,7Z" className="spinner_V8m1"/>
  </svg>
);

interface InputColumnProps {
  onTextChange?: (text: string, languages: string[]) => void;
  targetLanguage?: string;
  onLoadingChange?: (isLoading: boolean) => void;
  annotatedTextData?: { text: string; languages: string[] } | null;
  onClearAnnotatedText?: () => void;
}

const HIGHLIGHT_COLORS = ['#FFD1DC', '#BFEFFF', '#98FB98', '#E6E6FA', '#FFFACD', '#FFE4E1', '#F0FFF0'];

// Helper to get effective content by stripping tags
const getEffectiveContent = (text: string): string => {
  return text.replace(/\[\[([A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/gi, '').trim();
};

// New preprocessing function
const preprocessInputForBackend = (text: string): { processedText: string, hasMeaningfulContent: boolean } => {
  let processed = text;

  // 1. Standardize tag casing to uppercase for consistency [[en]] -> [[EN]]
  processed = processed.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (_match, langCode) => {
    return `[[${langCode.toUpperCase()}]]`;
  });

  // 2. Trim trailing tags that have no content after them
  // Matches a tag at the end of the string, possibly preceded by whitespace.
  const trailingTagRegex = /(\[\[[A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?\]\]\s*)$/;
  let matchTrailing;
  while ((matchTrailing = processed.match(trailingTagRegex)) && matchTrailing[0]) {
      // Check if the content before this tag is non-empty or if there are other tags
      const contentBeforeTrailing = processed.substring(0, matchTrailing.index);
      if (getEffectiveContent(contentBeforeTrailing) || contentBeforeTrailing.includes('[[')) { // if there's meaningful content or other tags before
         // If the tag itself is like [[EN]] with no content following it directly in the original string structure
         // This regex specifically looks for a tag at the very end.
         const potentialContentAfterLastRealTag = text.substring(text.lastIndexOf(']]') + 2).trim();
         if(potentialContentAfterLastRealTag === '') {
             processed = contentBeforeTrailing; // Trim the tag
         } else {
            break; // Tag has content, or it's not truly at the end in terms of structure
         }
      } else {
         // If content before is also empty/whitespace, potentially trim this too, or stop.
         // For now, only trim if it's a clear trailing tag with no meaningful predecessor text.
         // This part is tricky; focusing on clearly empty trailing tags.
         // A simpler rule: if a tag is the ABSOLUTE last non-whitespace part, and has no new content after it.
         const tempProcessed = processed.replace(trailingTagRegex, '');
         if (getEffectiveContent(tempProcessed) === '' && !tempProcessed.includes('[[')) {
            // Avoid stripping last tag if it makes everything empty unless it's the *only* thing
         } else {
            const lastTagMatch = processed.match(/.*\]\](.*)/);
            if (lastTagMatch && lastTagMatch[1].trim() === '') {
                 processed = processed.substring(0, processed.lastIndexOf('[['))
            } else {
                break;
            }
         }
         // Fallback for simple end trim
         if (processed.endsWith(matchTrailing[0])) {
            processed = processed.substring(0, processed.length - matchTrailing[0].length);
         } else {
            break;
         }

      }
  }
   // Re-evaluate trailing tag specifically for no content: [[TAG]] at string end
    processed = processed.replace(/(\[\[[A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?\]\])$/, (_, tag) => {
        const textBeforeTag = processed.substring(0, processed.length - tag.length);
        // If text before tag is just whitespace or other empty tags, it's complex.
        // Simple: if tag is at end, and no character follows it, it might be removable.
        // This part is tricky. Let's be conservative:
        // Only remove if text before it is NOT empty, to avoid [[EN]] -> ""
        if (getEffectiveContent(textBeforeTag) !== "") return ""; // Remove tag
        return tag; // Keep tag
    });


  // 3. Check for meaningful content (after stripping all tags for this check)
  const effectiveContent = getEffectiveContent(processed);
  const hasMeaningfulContent = effectiveContent !== '';

  return { processedText: processed, hasMeaningfulContent };
};

const InputColumn: React.FC<InputColumnProps> = ({ onTextChange, targetLanguage, onLoadingChange, annotatedTextData, onClearAnnotatedText }) => {
  const [inputText, setInputText] = useState<string>('');
  const [inputLanguages, setInputLanguages] = useState<string[]>([DEFAULT_INPUT_LANGUAGE]);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const [verboseMode, setVerboseMode] = useState<boolean>(false);
  const [languageColorMap, setLanguageColorMap] = useState<Record<string, string>>({});
  const [detectedLanguages, setDetectedLanguages] = useState<string[]>([]);
  const debounceTimeoutRef = useRef<number | null>(null);

  // States for voice input
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Parse [[LANG]] tags from text
  const parseLanguageTags = useCallback((text: string) => {
    // const _regex = /\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g; // Unused, remove_
    const languages: string[] = [];
    let match_capture; // Renamed to avoid conflict with outer scope 'match' if any, though not strictly necessary here
    
    // Standardize casing during parsing for internal consistency (e.g., for color map keys)
    const standardizedText = text.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (_m, langCode) => `[[${langCode.toUpperCase()}]]`); // _m unused

    const upperCaseRegex = /\[\[([A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g;
    while ((match_capture = upperCaseRegex.exec(standardizedText)) !== null) {
      const lang = match_capture[1]; // Already uppercased
      if (!languages.includes(lang)) {
        languages.push(lang);
      }
    }
    return languages;
  }, []);

  // Assign colors to languages
  const assignLanguageColors = useCallback((languages: string[]) => {
    const newColorMap: Record<string, string> = { ...languageColorMap };
    let newLanguagesAdded = false;
    
    languages.forEach((lang) => { // lang is already uppercased from parseLanguageTags
      if (!newColorMap[lang]) {
        // Find the next available color
        const usedColors = Object.values(newColorMap);
        let colorIndex = 0;
        while(usedColors.includes(HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]) && colorIndex < HIGHLIGHT_COLORS.length * 2) { // Check more than once to cycle
          colorIndex++;
        }
        newColorMap[lang] = HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length];
        newLanguagesAdded = true;
      }
    });
    
    if (newLanguagesAdded || Object.keys(newColorMap).length !== Object.keys(languageColorMap).length) {
      setLanguageColorMap(newColorMap);
    }
    return newColorMap; // Return the map whether it was set or not for immediate use
  }, [languageColorMap]);

  // useEffect to handle incoming annotated text data from Layout
  useEffect(() => {
    if (annotatedTextData && annotatedTextData.text) {
      console.log('InputColumn: Processing annotated text data from props:', annotatedTextData);
      setInputText(annotatedTextData.text);
      const languagesFromServer = annotatedTextData.languages || [];
      const standardizedLanguages = languagesFromServer.map(lang => lang.toUpperCase());
      setDetectedLanguages(standardizedLanguages);
      // Call assignLanguageColors which itself calls setLanguageColorMap
      assignLanguageColors(standardizedLanguages);
      onClearAnnotatedText?.();
    }
  }, [annotatedTextData, assignLanguageColors, onClearAnnotatedText]); // Removed parseLanguageTags, as it's not directly used here, assignLanguageColors depends on it if needed but not this effect directly

  // Render highlighted text
  const renderHighlightedText = useCallback((text: string) => {
    if (!verboseMode) return <>{text}</>;

    const parts: React.ReactNode[] = [];
    let key = 0;
    
    const textWithUpperTags = text.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (_match, langCode) => {
        return `[[${langCode.toUpperCase()}]]`;
    });

    const segments = textWithUpperTags.split(/(\[\[[A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?\]\])/g);
    let currentLang: string | null = null; // Declare currentLang here to persist across segments
    
    const currentLanguageColorMap = assignLanguageColors(parseLanguageTags(textWithUpperTags));

    segments.forEach(segment => {
      const langTagMatch = segment.match(/\[\[([A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/);
      if (langTagMatch) {
        currentLang = langTagMatch[1]; // Update currentLang when a tag is found
      } else if (segment) { 
        if (currentLang) { // If there's an active language
          const color = currentLanguageColorMap[currentLang] || '#f0f0f0';
          parts.push(
            <span 
              key={key++} 
              style={{ backgroundColor: color, padding: '1px 3px', borderRadius: '3px', margin: '0 1px' }}
              title={`Language: ${currentLang}`}
            >
              {segment}
            </span>
          );
        } else {
          // Text before any language tag
          parts.push(<span key={key++}>{segment}</span>);
        }
      }
    });
    
    return parts.length > 0 ? <>{parts}</> : <>{text}</>;
  }, [verboseMode, languageColorMap, assignLanguageColors, parseLanguageTags]);

  // Auto-detect and tag languages when verbose mode is enabled
  const autoTagLanguages = useCallback(async (text: string) => {
    const { processedText, hasMeaningfulContent } = preprocessInputForBackend(text);
    if (!hasMeaningfulContent || !socket.connected) {
        onLoadingChange?.(false);
        return;
    }
    
    // If processed text (after standardization) already contains tags, parse them locally.
    if (processedText.includes('[[') && processedText.includes(']]')) {
        const initialLanguages = parseLanguageTags(processedText); // Use standardized text
        setDetectedLanguages(initialLanguages);
        assignLanguageColors(initialLanguages);
        onLoadingChange?.(false);
        setInputText(processedText); // Update input field with standardized tags
        return;
    }

    try {
      onLoadingChange?.(true);
      socket.emit('detectLanguages', { text: processedText }); // Send preprocessed text
      
      const handleLanguageDetection = (data: { taggedText: string }) => {
        // The backend should also ideally return standardized tags.
        // For safety, preprocess again or ensure parseLanguageTags normalizes.
        const backendProcessedText = data.taggedText.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (_m, lc) => `[[${lc.toUpperCase()}]]`); // _m unused
        setInputText(backendProcessedText);
        const languages = parseLanguageTags(backendProcessedText);
        setDetectedLanguages(languages);
        assignLanguageColors(languages);
        socket.off('languageDetected', handleLanguageDetection);
        onLoadingChange?.(false);
      };
      
      socket.on('languageDetected', handleLanguageDetection);
      
      // Timeout fallback
      setTimeout(() => {
        socket.off('languageDetected', handleLanguageDetection);
        onLoadingChange?.(false);
      }, 5000);
      
    } catch (error) {
      console.error('Auto-tagging error:', error);
      onLoadingChange?.(false);
    }
  }, [parseLanguageTags, assignLanguageColors, onLoadingChange]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newRawText = event.target.value;
    setInputText(newRawText); // Keep raw input for textarea display

    if (verboseMode) {
      // For highlighting and local parsing, standardize tags immediately
      const standardizedTextForDisplay = newRawText.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (_m, langCode) => `[[${langCode.toUpperCase()}]]`); // _m unused
      const languages = parseLanguageTags(standardizedTextForDisplay); 
      setDetectedLanguages(languages);
      assignLanguageColors(languages);
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const { processedText, hasMeaningfulContent } = preprocessInputForBackend(newRawText);

      if (!hasMeaningfulContent) {
        onTextChange?.(processedText, [DEFAULT_INPUT_LANGUAGE]); // Pass empty processed text and default/auto lang
        onLoadingChange?.(false); 
        return;
      }
      
      // Determine languages to send to backend and to report via onTextChange
      const languagesForBackend = verboseMode && detectedLanguages.length > 0 
                                  ? detectedLanguages 
                                  : [DEFAULT_INPUT_LANGUAGE];

      if (socket.connected) {
        onLoadingChange?.(true);
        socket.emit('sendText', { 
          text: processedText, 
          languages: languagesForBackend,
          targetLanguage: targetLanguage || DEFAULT_OUTPUT_LANGUAGE // Ensure default output lang if not specified
        });
      } else {
        console.warn("Socket not connected. Text not sent.");
        onLoadingChange?.(false);
      }
      // Report the processed text and the languages that would be used for translation
      onTextChange?.(processedText, languagesForBackend);

    }, 1000);

  }, [inputLanguages, onTextChange, targetLanguage, verboseMode, detectedLanguages, parseLanguageTags, assignLanguageColors, onLoadingChange, DEFAULT_INPUT_LANGUAGE, DEFAULT_OUTPUT_LANGUAGE]);

  const handleVerboseModeToggle = useCallback(() => {
    const newVerboseMode = !verboseMode;
    setVerboseMode(newVerboseMode);
    
    if (newVerboseMode && inputText.trim()) {
      const { processedText } = preprocessInputForBackend(inputText); // Standardize before parsing
      if (processedText.includes('[[') && processedText.includes(']]')) {
        const languages = parseLanguageTags(processedText);
        setDetectedLanguages(languages);
        assignLanguageColors(languages);
        setInputText(processedText); // Update input field if tags were standardized
      } else {
        autoTagLanguages(inputText); // autoTagLanguages now preprocesses
      }
    } else if (newVerboseMode) {
        const { processedText } = preprocessInputForBackend(inputText);
        const languages = parseLanguageTags(processedText);
        setDetectedLanguages(languages);
        assignLanguageColors(languages);
        if(inputText !== processedText) setInputText(processedText);
    } else { 
      setDetectedLanguages([]);
    }
  }, [verboseMode, inputText, autoTagLanguages, parseLanguageTags, assignLanguageColors]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const addLanguage = useCallback((langCode: string) => {
    setInputLanguages(prev => {
      if (prev.includes(DEFAULT_INPUT_LANGUAGE)) {
        return [langCode];
      } else if (!prev.includes(langCode)) {
        return [...prev, langCode];
      }
      return prev;
    });
    setShowLanguageModal(false);
  }, []);

  const removeLanguage = useCallback((langCode: string) => {
    setInputLanguages(prev => {
      const updatedLanguages = prev.filter(lang => lang !== langCode);
      return updatedLanguages.length === 0 ? [DEFAULT_INPUT_LANGUAGE] : updatedLanguages;
    });
  }, []);

  const getLanguageName = useCallback((langCode: string) => {
    if (langCode === DEFAULT_INPUT_LANGUAGE) return 'Auto';
    return LANGUAGES.find(l => l.code === langCode)?.name || langCode;
  }, []);

  const availableLanguages = LANGUAGES.filter(lang => !inputLanguages.includes(lang.code));

  const sendAudioToBackend = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    onLoadingChange?.(true); // Indicate general loading for the voice-to-translate process

    const formData = new FormData();
    // Try to get a reasonable filename, helps Whisper determine format if headers are not enough
    const fileExtension = audioBlob.type.split('/')[1]?.split(';')[0] || 'bin';
    const filename = `recording.${fileExtension}`;
    formData.append('audioFile', audioBlob, filename);

    try {
      const response = await fetch('/api/transcribe', { 
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to transcribe audio. Server returned an error.' }));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const result = await response.json();
      if (result.transcribedText) {
        setInputText(result.transcribedText);
        // Existing handleInputChange logic will be triggered by setInputText via its own effect or direct call if inputText is a dependency
        // For directness, we can manually trigger parts of what handleInputChange's timeout does:
        const { processedText, hasMeaningfulContent } = preprocessInputForBackend(result.transcribedText);
        if (hasMeaningfulContent) {
            const languagesForBackend = verboseMode && detectedLanguages.length > 0 
                                        ? detectedLanguages 
                                        : [DEFAULT_INPUT_LANGUAGE];
            if (socket.connected) {
                // onLoadingChange(true) was already called
                socket.emit('sendText', { 
                  text: processedText, 
                  languages: languagesForBackend,
                  targetLanguage: targetLanguage || DEFAULT_OUTPUT_LANGUAGE
                });
            } else {
                console.warn("Socket not connected. Text not sent for translation after transcription.");
                onLoadingChange?.(false); // Reset loading if socket is not connected for the next step
            }
            onTextChange?.(processedText, languagesForBackend); // Update Layout's state
        } else {
            onTextChange?.(processedText, [DEFAULT_INPUT_LANGUAGE]);
            onLoadingChange?.(false); // No meaningful content, stop loading indicator
        }

      } else {
        throw new Error("Transcription successful, but no text received.");
      }
    } catch (error) {
      console.error("Error sending audio to backend or processing transcription:", error);
      alert(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
      onLoadingChange?.(false); // Stop loading on error
    } finally {
      setIsTranscribing(false);
      // onLoadingChange(false) is handled by receiveTranslation/Error or above error cases
    }
  };

  const handleStartRecording = async () => {
    if (isRecording) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Media Devices API not supported in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setIsRecording(true);
      audioChunksRef.current = []; // Clear previous chunks

      // Determine a supported MIME type
      const MimeTypes = [
        'audio/webm;codecs=opus', // Preferred for quality and compatibility
        'audio/ogg;codecs=opus',
        'audio/mp4', // Often AAC
        'audio/webm', // Generic WebM
      ];
      const supportedMimeType = MimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        alert("No suitable audio recording format is supported by your browser.");
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop()); // Clean up stream
        audioStreamRef.current = null;
        return;
      }
      console.log("Using MIME type:", supportedMimeType);

      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: supportedMimeType });
        audioChunksRef.current = []; 
        
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
        mediaRecorderRef.current = null; 

        console.log("Recording stopped, audio blob created:", audioBlob);
        setIsRecording(false);
        sendAudioToBackend(audioBlob); // Call the new function here
      };

      recorder.start();
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Could not start recording. Please ensure microphone permission is granted.");
      setIsRecording(false);
      if (audioStreamRef.current) { // Clean up if stream was acquired but something else failed
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); // This will trigger onstop
      // Stream tracks are stopped in onstop after blob creation or in error handling
    }
  };

  const handleMicButtonClick = () => {
    if (isTranscribing) return; // Do nothing if already transcribing

    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  // Cleanup effect for microphone stream if component unmounts while recording
  useEffect(() => {
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="column input-column">
      <h2>Input</h2>
      
      <div className="input-controls">
        <div className="language-selector">
          <span className="language-selector-label">Input Languages:</span>
          
          {inputLanguages.map(langCode => (
            <span key={langCode} className="language-tag">
              {getLanguageName(langCode)}
              {langCode !== DEFAULT_INPUT_LANGUAGE && (
                <button 
                  onClick={() => removeLanguage(langCode)} 
                  className="language-tag-remove"
                  aria-label={`Remove ${getLanguageName(langCode)}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          
          <button 
            onClick={() => setShowLanguageModal(true)} 
            className="add-language-btn"
            aria-label="Add language"
          >
            +
          </button>
        </div>
        
        <div className="input-actions">
          <button 
            onClick={handleMicButtonClick}
            className={`mic-button ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
            title={isRecording ? "Stop Recording" : isTranscribing ? "Transcribing..." : "Start Recording"}
            disabled={isTranscribing}
          >
            {isTranscribing ? <ProcessingIcon /> : isRecording ? <RecordingIcon /> : <MicIcon />}
          </button>
          <div className="verbose-mode-toggle">
            <label>
              <input
                type="checkbox"
                checked={verboseMode}
                onChange={handleVerboseModeToggle}
              />
              <span className="toggle-label">Verbose Mode</span>
            </label>
          </div>
        </div>
      </div>

      {showLanguageModal && (
        <div className="language-modal">
          <h3>Select Language</h3>
          <ul>
            {availableLanguages.map(lang => (
              <li key={lang.code} onClick={() => addLanguage(lang.code)}>
                {lang.name}
              </li>
            ))}
          </ul>
          <button 
            onClick={() => setShowLanguageModal(false)} 
            className="close-modal-btn"
          >
            Close
          </button>
        </div>
      )}

      <div className="input-area">
        <textarea
          className="input-textarea"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Type text to translate..."
          aria-label="Text to translate"
        />
        
        {verboseMode && (
          <div className="highlighted-preview">
            <div className="preview-label">Language Preview:</div>
            <div className="preview-content">
              {renderHighlightedText(inputText)}
            </div>
          </div>
        )}
      </div>
      
      {verboseMode && detectedLanguages.length > 0 && (
        <div className="language-list">
          <div className="language-list-label">Detected Languages:</div>
          <div className="language-items">
            {detectedLanguages.map(lang => (
              <div key={lang} className="language-item">
                <div 
                  className="language-color-swatch"
                  style={{ backgroundColor: languageColorMap[lang] }}
                ></div>
                <span className="language-code">{lang}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InputColumn;