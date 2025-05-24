import React, { useState, useCallback } from 'react';
import { DEFAULT_OUTPUT_LANGUAGE, LANGUAGES } from '../constants/languages';
import './OutputColumn.css';

interface OutputColumnProps {
  translatedText: string;
  onLanguageChange?: (language: string) => void;
  isLoading?: boolean;
}

const LoadingDots: React.FC = () => {
  return (
    <div className="loading-dots">
      <span className="dot"></span>
      <span className="dot"></span>
      <span className="dot"></span>
    </div>
  );
};

const OutputColumn: React.FC<OutputColumnProps> = ({ 
  translatedText, 
  onLanguageChange,
  isLoading = false
}) => {
  const [outputLanguage, setOutputLanguage] = useState<string>(DEFAULT_OUTPUT_LANGUAGE);

  const handleLanguageChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = event.target.value;
    setOutputLanguage(newLanguage);
    onLanguageChange?.(newLanguage);
    console.log("Output language changed to:", newLanguage);
  }, [onLanguageChange]);

  return (
    <div className="column output-column">
      <div className="output-header">
        <h2>Output</h2>
        {isLoading && <LoadingDots />}
      </div>
      
      <div className="output-language-selector">
        <label htmlFor="output-lang">Output Language:</label>
        <select 
          id="output-lang" 
          value={outputLanguage} 
          onChange={handleLanguageChange}
          className="output-language-select"
        >
          {LANGUAGES.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
      
      <div className="output-display">
        {isLoading ? (
          <div className="loading-message">
            <span>Translating...</span>
          </div>
        ) : (
          translatedText || "Translation will appear here..."
        )}
      </div>
    </div>
  );
};

export default OutputColumn;