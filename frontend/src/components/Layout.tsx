import React, { useState, useEffect, useCallback } from 'react';
import InputColumn from './InputColumn';
import OutputColumn from './OutputColumn';
import { socket } from '../socket';
import './Layout.css';

const Layout: React.FC = () => {
  const [translatedText, setTranslatedText] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);
  const [_, setOutputLanguage] = useState<string>('en');

  const connectSocket = useCallback(() => {
    if (!socket.connected) {
      console.log('Layout: Attempting to connect socket...');
      socket.connect();
    }
  }, []);

  const handleTextChange = useCallback((text: string, languages: string[]) => {
    // This can be used for additional logic when text changes
    console.log('Text changed:', { text, languages });
  }, []);

  const handleLanguageChange = useCallback((language: string) => {
    setOutputLanguage(language);
    // Here you could emit to server to change translation target language
  }, []);

  useEffect(() => {
    connectSocket();

    const onConnect = () => {
      setIsConnected(true);
      console.log('Layout: Socket connected successfully', socket.id);
    };

    const onDisconnect = (reason: string) => {
      setIsConnected(false);
      console.log('Layout: Socket disconnected', reason);
    };

    const onReceiveTranslation = (text: string) => {
      setTranslatedText(text);
    };

    const onTranslationError = (errorMsg: string) => {
      console.error('Layout: Translation error from server:', errorMsg);
      setTranslatedText(`Error: ${errorMsg}`);
    };

    const onConnectError = (error: Error) => {
      console.error('Layout: Socket connection error:', error);
      setIsConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receiveTranslation', onReceiveTranslation);
    socket.on('translationError', onTranslationError);
    socket.on('connect_error', onConnectError);

    return () => {
      console.log('Layout: Cleaning up socket listeners');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receiveTranslation', onReceiveTranslation);
      socket.off('translationError', onTranslationError);
      socket.off('connect_error', onConnectError);
    };
  }, [connectSocket]);

  return (
    <>
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
      
      <div className="layout-container">
        <InputColumn onTextChange={handleTextChange} />
        <OutputColumn 
          translatedText={translatedText} 
          onLanguageChange={handleLanguageChange}
        />
      </div>
    </>
  );
};

export default Layout;