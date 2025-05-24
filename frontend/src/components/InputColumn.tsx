import React, { useState, useEffect } from 'react';
import { socket } from '../socket';

const InputColumn: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  // const [inputLanguage, setInputLanguage] = useState<string>('en'); // For future use

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setInputText(newText);
    if (socket.connected) {
      socket.emit('sendText', newText);
    } else {
      console.warn("Socket not connected. Text not sent.");
    }
  };

  // Optional: Language selector handler - can be expanded later
  // const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
  //   const newLanguage = event.target.value;
  //   setInputLanguage(newLanguage);
  //   if (socket.connected && inputText) {
  //     socket.emit('sendText', { text: inputText, language: newLanguage }); 
  //   }
  // };

  useEffect(() => {
    // Ensure socket is connected (Layout should primarily handle this)
    if (!socket.connected) {
      // console.log("InputColumn: Attempting to connect socket if not already handled by Layout.");
      // socket.connect(); // Layout.tsx should manage the main connection logic
    }
  }, []);

  return (
    <div className="column input-column" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <h2>Input</h2>
      <div className="language-selector" style={{ marginBottom: '15px' }}>
        <label htmlFor="input-lang" style={{ marginRight: '8px', fontWeight: 'bold' }}>Input Language: </label>
        <select id="input-lang" defaultValue="en" /* onChange={handleLanguageChange} */ style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem' }}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="it">Italian</option>
        </select>
      </div>
      <textarea
        className="column-textarea"
        value={inputText}
        onChange={handleInputChange}
        placeholder="Type text to translate..."
        style={{ flexGrow: 1, width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem', resize: 'none' }}
      />
    </div>
  );
};

export default InputColumn; 