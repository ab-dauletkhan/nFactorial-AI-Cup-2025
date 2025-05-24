import React from 'react';

interface OutputColumnProps {
  translatedText: string;
}

const OutputColumn: React.FC<OutputColumnProps> = ({ translatedText }) => {
  // const [outputLanguage, setOutputLanguage] = useState<string>('es'); // For future use

  // const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
  //   setOutputLanguage(event.target.value);
  //   // Potentially notify backend or re-request translation if language change affects output directly
  // };

  return (
    <div className="column output-column" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <h2>Output</h2>
      <div className="language-selector" style={{ marginBottom: '15px' }}>
        <label htmlFor="output-lang" style={{ marginRight: '8px', fontWeight: 'bold' }}>Output Language: </label>
        <select id="output-lang" defaultValue="es" /* onChange={handleLanguageChange} */ style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem' }}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="it">Italian</option>
        </select>
      </div>
      <div 
        className="column-output" 
        style={{ flexGrow: 1, whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '1rem', border: '1px solid #eee', padding: '10px', borderRadius: '4px', backgroundColor: '#f9f9f9' }}
      >
        {translatedText || "Translation will appear here..."}
      </div>
    </div>
  );
};

export default OutputColumn; 