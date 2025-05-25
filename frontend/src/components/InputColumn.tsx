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
  return text.replace(/\[\[([a-zA-Z]{2,3}(?::[a-zA-Z0-9_-]+)?)\]\]/g, (_, langCode) => {
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

const preprocessTextForBackend = (text: string, verboseMode: boolean): { processedText: string, hasMeaningfulContent: boolean } => {
  let processed = verboseMode ? standardizeLanguageTags(text) : stripLanguageTags(text);
  
  // Remove trailing empty tags in verbose mode
  if (verboseMode) {
    processed = processed.replace(/(\[\[[A-Z]{2,3}(?::[a-zA-Z0-9_-]+)?\]\]\s*)$/, (match, tag) => {
      const textBeforeTag = processed.substring(0, processed.length - tag.length);
      return stripLanguageTags(textBeforeTag) !== "" ? "" : tag;
    });
  }
  
  const effectiveContent = stripLanguageTags(processed);
  const hasMeaningfulContent = effectiveContent.trim() !== '';
  
  return { processedText: processed, hasMeaningfulContent };
};

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

  // Handle incoming annotated text data from server
  useEffect(() => {
    if (annotatedTextData?.text) {
      console.log('InputColumn: Processing annotated text data:', annotatedTextData);
      
      if (verboseMode) {
        // In verbose mode, replace input with annotated text
        setInputText(annotatedTextData.text);
        const languages = annotatedTextData.languages?.map(lang => lang.toUpperCase()) || [];
        setDetectedLanguages(languages);
        assignLanguageColors(languages);
      } else {
        // In default mode, strip tags and keep clean text
        const cleanText = stripLanguageTags(annotatedTextData.text);
        setInputText(cleanText);
      }
      
      onClearAnnotatedText?.();
    }
  }, [annotatedTextData, verboseMode, assignLanguageColors, onClearAnnotatedText]);

  // Auto-detect languages in verbose mode
  const autoDetectLanguages = useCallback(async (text: string) => {
    if (!verboseMode || !socket.connected) {
      onLoadingChange?.(false);
      return;
    }

    const { processedText, hasMeaningfulContent } = preprocessTextForBackend(text, verboseMode);
    if (!hasMeaningfulContent) {
      onLoadingChange?.(false);
      return;
    }
    
    // If text already has tags, parse them locally
    if (processedText.includes('[[') && processedText.includes(']]')) {
      const languages = parseLanguageTags(processedText);
      setDetectedLanguages(languages);
      assignLanguageColors(languages);
      onLoadingChange?.(false);
      return;
    }

    try {
      onLoadingChange?.(true);
      socket.emit('detectLanguages', { text: processedText });
      
      const handleLanguageDetection = (data: { taggedText: string }) => {
        const standardizedText = standardizeLanguageTags(data.taggedText);
        setInputText(standardizedText);
        const languages = parseLanguageTags(standardizedText);
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
      console.error('Language detection error:', error);
      onLoadingChange?.(false);
    }
  }, [verboseMode, assignLanguageColors, onLoadingChange]);

  // Handle text input changes
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setInputText(newText);

    // Update detected languages immediately in verbose mode for UI feedback
    if (verboseMode) {
      const standardizedText = standardizeLanguageTags(newText);
      const languages = parseLanguageTags(standardizedText);
      setDetectedLanguages(languages);
      assignLanguageColors(languages);
    }

    // Clear existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounced processing for backend communication
    debounceTimeoutRef.current = setTimeout(() => {
      const { processedText, hasMeaningfulContent } = preprocessTextForBackend(newText, verboseMode);

      if (!hasMeaningfulContent) {
        onTextChange?.(processedText, [DEFAULT_INPUT_LANGUAGE]);
        onLoadingChange?.(false);
        return;
      }
      
      const languagesForBackend = verboseMode && detectedLanguages.length > 0 
        ? detectedLanguages 
        : [DEFAULT_INPUT_LANGUAGE];

      if (socket.connected) {
        onLoadingChange?.(true);
        socket.emit('sendText', { 
          text: processedText, 
          languages: languagesForBackend,
          targetLanguage: targetLanguage || DEFAULT_OUTPUT_LANGUAGE
        });
      } else {
        console.warn("Socket not connected. Text not sent.");
        onLoadingChange?.(false);
      }
      
      onTextChange?.(processedText, languagesForBackend);
    }, DEBOUNCE_DELAY);

  }, [verboseMode, detectedLanguages, assignLanguageColors, onTextChange, targetLanguage, onLoadingChange]);

  // Handle verbose mode toggle
  const handleVerboseModeToggle = useCallback(() => {
    const newVerboseMode = !verboseMode;
    setVerboseMode(newVerboseMode);
    
    if (newVerboseMode) {
      // Switching to verbose mode - detect languages if text exists
      if (inputText.trim()) {
        const { processedText } = preprocessTextForBackend(inputText, true);
        if (processedText.includes('[[') && processedText.includes(']]')) {
          const languages = parseLanguageTags(processedText);
          setDetectedLanguages(languages);
          assignLanguageColors(languages);
          setInputText(processedText);
        } else {
          autoDetectLanguages(inputText);
        }
      }
    } else {
      // Switching to default mode - strip language tags
      const cleanText = stripLanguageTags(inputText);
      setInputText(cleanText);
      setDetectedLanguages([]);
    }
  }, [verboseMode, inputText, autoDetectLanguages, assignLanguageColors]);

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

// Remove duplicate declaration since it's already declared at the end of the file

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