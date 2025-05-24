import React, { useState, useCallback, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { LANGUAGES, DEFAULT_INPUT_LANGUAGE } from '../constants/languages';
import './InputColumn.css';

interface InputColumnProps {
  onTextChange?: (text: string, languages: string[]) => void;
  targetLanguage?: string;
}

const InputColumn: React.FC<InputColumnProps> = ({ onTextChange, targetLanguage }) => {
  const [inputText, setInputText] = useState<string>('');
  const [inputLanguages, setInputLanguages] = useState<string[]>([DEFAULT_INPUT_LANGUAGE]);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const debounceTimeoutRef = useRef<number | null>(null);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setInputText(newText);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (socket.connected) {
        socket.emit('sendText', { 
          text: newText, 
          languages: inputLanguages,
          targetLanguage: targetLanguage || 'en'
        });
      } else {
        console.warn("Socket not connected. Text not sent.");
      }
      onTextChange?.(newText, inputLanguages);
    }, 1000);

  }, [inputLanguages, onTextChange]);

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

  return (
    <div className="column input-column">
      <h2>Input</h2>
      
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

      <textarea
        className="input-textarea"
        value={inputText}
        onChange={handleInputChange}
        placeholder="Type text to translate..."
        aria-label="Text to translate"
      />
    </div>
  );
};

export default InputColumn;