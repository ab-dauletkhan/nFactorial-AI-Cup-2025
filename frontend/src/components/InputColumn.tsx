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
    <circle cx="12" cy="12" r="4" fill="white"></circle>
  </svg>
);

const ProcessingIcon = () => (
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
const DEBOUNCE_DELAY = 1000; // 1 second

// Helper functions
const stripLanguageTags = (text: string): string => {
  return text.replace(/\[\[([A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/gi, '').trim();
};

const standardizeLanguageTags = (text: string): string => {
  return text.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/gi, (_, langCode) => {
    return `[[${langCode.toUpperCase()}]]`;
  });
};

const parseLanguageTags = (text: string): string[] => {
  const languages: string[] = [];
  const standardizedText = standardizeLanguageTags(text);
  const regex = /\[\[([A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g;
  let match;
  
  while ((match = regex.exec(standardizedText)) !== null) {
    const lang = match[1];
    if (!languages.includes(lang)) {
      languages.push(lang);
    }
  }
  return languages;
};

const preprocessTextForBackend = (text: string, isVerbose: boolean): { processedText: string; hasMeaningfulContent: boolean } => {
  // Keep original text if it already has language tags and we're in verbose mode
  if (isVerbose && text.includes('[[') && text.includes(']]')) {
    const standardized = standardizeLanguageTags(text);
    return {
      processedText: standardized,
      hasMeaningfulContent: stripLanguageTags(standardized).trim() !== ''
    };
  }

  // For non-verbose mode or text without tags, strip all tags
  const cleanText = stripLanguageTags(text);
  return {
    processedText: cleanText,
    hasMeaningfulContent: cleanText.trim() !== ''
  };
};

interface TextBuffer {
  text: string;
  sentText: string | null;
  pendingText: string | null;
}

const InputColumn: React.FC<InputColumnProps> = ({ 
  onTextChange, 
  targetLanguage, 
  onLoadingChange, 
  annotatedTextData, 
  onClearAnnotatedText 
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [inputLanguages, setInputLanguages] = useState<string[]>([DEFAULT_INPUT_LANGUAGE]);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const [verboseMode, setVerboseMode] = useState<boolean>(false);
  const [languageColorMap, setLanguageColorMap] = useState<Record<string, string>>({});
  const [detectedLanguages, setDetectedLanguages] = useState<string[]>([]);
  const debounceTimeoutRef = useRef<number | null>(null);
  const [textBuffer, setTextBuffer] = useState<TextBuffer>({
    text: '',
    sentText: null,
    pendingText: null
  });

  // Voice recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Assign colors to detected languages
  const assignLanguageColors = useCallback((languages: string[]) => {
    const newColorMap: Record<string, string> = { ...languageColorMap };
    let hasChanges = false;
    
    languages.forEach((lang) => {
      if (!newColorMap[lang]) {
        const usedColors = Object.values(newColorMap);
        let colorIndex = 0;
        while (usedColors.includes(HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]) && colorIndex < HIGHLIGHT_COLORS.length * 2) {
          colorIndex++;
        }
        newColorMap[lang] = HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length];
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      setLanguageColorMap(newColorMap);
    }
    return newColorMap;
  }, [languageColorMap]);

  // Update text buffer when annotated text is received
  useEffect(() => {
    if (annotatedTextData?.text && textBuffer.sentText) {
      const cleanAnnotatedText = verboseMode ? annotatedTextData.text : stripLanguageTags(annotatedTextData.text);
      const newText = textBuffer.pendingText 
        ? cleanAnnotatedText + textBuffer.pendingText
        : cleanAnnotatedText;
      
      setInputText(newText);
      setTextBuffer(prev => ({
        text: newText,
        sentText: cleanAnnotatedText,
        pendingText: prev.pendingText
      }));

      // Clear annotated text after processing
      onClearAnnotatedText?.();
    }
  }, [annotatedTextData, verboseMode, textBuffer.sentText, textBuffer.pendingText, onClearAnnotatedText]);

  // Handle text input changes with buffering
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    const cursorPosition = event.target.selectionStart;
    
    // Process text based on verbose mode
    const { processedText } = preprocessTextForBackend(newText, verboseMode);
    setInputText(processedText);
    
    // Update text buffer
    setTextBuffer(prev => ({
      text: processedText,
      sentText: prev.sentText,
      pendingText: prev.sentText 
        ? processedText.slice(prev.sentText.length) 
        : processedText
    }));
    
    // Restore cursor position
    if (event.target === document.activeElement) {
      setTimeout(() => {
        event.target.setSelectionRange(cursorPosition, cursorPosition);
      }, 0);
    }

    // Clear any existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new debounce timeout
    debounceTimeoutRef.current = window.setTimeout(() => {
      if (!socket.connected) {
        console.warn("Socket not connected. Text not sent.");
        onLoadingChange?.(false);
        return;
      }

      const { processedText: textToSend, hasMeaningfulContent } = preprocessTextForBackend(newText, false);
      
      if (!hasMeaningfulContent) {
        onLoadingChange?.(false);
        return;
      }

      // Update sent text in buffer
      setTextBuffer(prev => ({
        ...prev,
        sentText: textToSend
      }));

      onLoadingChange?.(true);
      socket.emit('sendText', {
        text: textToSend,
        languages: inputLanguages.length > 0 && !inputLanguages.includes(DEFAULT_INPUT_LANGUAGE)
          ? inputLanguages
          : ['auto'],
        targetLanguage: targetLanguage || DEFAULT_OUTPUT_LANGUAGE
      });
    }, DEBOUNCE_DELAY);
  }, [verboseMode, socket.connected, onLoadingChange, targetLanguage, inputLanguages]);

  // Handle verbose mode toggle with buffer consideration
  const handleVerboseModeToggle = useCallback(() => {
    const newVerboseMode = !verboseMode;
    setVerboseMode(newVerboseMode);
    
    if (newVerboseMode && annotatedTextData?.text) {
      const standardizedText = standardizeLanguageTags(annotatedTextData.text);
      setInputText(standardizedText);
      const languages = parseLanguageTags(standardizedText);
      setDetectedLanguages(languages);
      assignLanguageColors(languages);
      
      // Update buffer for verbose mode
      setTextBuffer(prev => ({
        text: standardizedText,
        sentText: prev.sentText ? standardizeLanguageTags(prev.sentText) : null,
        pendingText: prev.pendingText ? standardizeLanguageTags(prev.pendingText) : null
      }));
    } else if (!newVerboseMode) {
      const cleanText = stripLanguageTags(inputText);
      setInputText(cleanText);
      
      // Update buffer for non-verbose mode
      setTextBuffer(prev => ({
        text: cleanText,
        sentText: prev.sentText ? stripLanguageTags(prev.sentText) : null,
        pendingText: prev.pendingText ? stripLanguageTags(prev.pendingText) : null
      }));
    }
  }, [verboseMode, inputText, annotatedTextData, assignLanguageColors]);

  // Render highlighted text for verbose mode
  const renderHighlightedText = useCallback((text: string) => {
    if (!verboseMode) return <>{text}</>;

    const parts: React.ReactNode[] = [];
    let key = 0;
    
    const standardizedText = standardizeLanguageTags(text);
    const segments = standardizedText.split(/(\[\[[A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?\]\])/g);
    let currentLang: string | null = null;
    
    const currentColorMap = assignLanguageColors(parseLanguageTags(standardizedText));

    segments.forEach(segment => {
      const langTagMatch = segment.match(/\[\[([A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/);
      if (langTagMatch) {
        currentLang = langTagMatch[1];
      } else if (segment) {
        if (currentLang) {
          const color = currentColorMap[currentLang] || '#f0f0f0';
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
          parts.push(<span key={key++}>{segment}</span>);
        }
      }
    });
    
    return parts.length > 0 ? <>{parts}</> : <>{text}</>;
  }, [verboseMode, assignLanguageColors]);

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

  const sendAudioToBackend = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    onLoadingChange?.(true);

    const formData = new FormData();
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
        
        const { processedText, hasMeaningfulContent } = preprocessTextForBackend(result.transcribedText, verboseMode);
        if (hasMeaningfulContent) {
          const languagesForBackend = verboseMode && detectedLanguages.length > 0 
            ? detectedLanguages 
            : [DEFAULT_INPUT_LANGUAGE];
            
          if (socket.connected) {
            socket.emit('sendText', { 
              text: processedText, 
              languages: languagesForBackend,
              targetLanguage: targetLanguage || DEFAULT_OUTPUT_LANGUAGE
            });
          } else {
            console.warn("Socket not connected. Text not sent for translation after transcription.");
            onLoadingChange?.(false);
          }
          onTextChange?.(processedText, languagesForBackend);
        } else {
          onTextChange?.(processedText, [DEFAULT_INPUT_LANGUAGE]);
          onLoadingChange?.(false);
        }
      } else {
        throw new Error("Transcription successful, but no text received.");
      }
    } catch (error) {
      console.error("Error sending audio to backend or processing transcription:", error);
      alert(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
      onLoadingChange?.(false);
    } finally {
      setIsTranscribing(false);
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
      audioChunksRef.current = [];

      const MimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/webm',
      ];
      const supportedMimeType = MimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        alert("No suitable audio recording format is supported by your browser.");
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        return;
      }

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

        setIsRecording(false);
        sendAudioToBackend(audioBlob);
      };

      recorder.start();
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Could not start recording. Please ensure microphone permission is granted.");
      setIsRecording(false);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleMicButtonClick = () => {
    if (isTranscribing) return;

    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  // Cleanup effects
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

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

  const availableLanguages = LANGUAGES.filter(lang => !inputLanguages.includes(lang.code));

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