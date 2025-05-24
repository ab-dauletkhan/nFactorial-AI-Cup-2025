import React, { useState, useCallback } from 'react';
import { DEFAULT_OUTPUT_LANGUAGE, LANGUAGES } from '../constants/languages';
import './OutputColumn.css';

interface OutputColumnProps {
  translatedText: string;
  onLanguageChange?: (language: string) => void;
}

const OutputColumn: React.FC<OutputColumnProps> = ({ 
  translatedText, 
  onLanguageChange 
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
      <h2>Output</h2>
      
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
        {translatedText || "Translation will appear here..."}
      </div>
    </div>
  );
};

export default OutputColumn;