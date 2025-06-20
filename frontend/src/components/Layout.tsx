import React, { useState, useEffect, useCallback, useRef } from 'react';
import InputColumn from './InputColumn';
import OutputColumn from './OutputColumn';
import { socket } from '../socket';
import './Layout.css';
import { DEFAULT_INPUT_LANGUAGE, DEFAULT_OUTPUT_LANGUAGE } from '../constants/languages';

const Layout: React.FC = () => {
  const [translatedText, setTranslatedText] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);
  const [outputLanguage, setOutputLanguage] = useState<string>(DEFAULT_OUTPUT_LANGUAGE);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [annotatedInputText, setAnnotatedInputText] = useState<{ text: string; languages: string[] } | null>(null);
  const [currentSourceText, setCurrentSourceText] = useState<string>('');
  const [currentSourceLanguages, setCurrentSourceLanguages] = useState<string[]>([DEFAULT_INPUT_LANGUAGE]);
  const previousOutputLanguageRef = useRef<string>(outputLanguage);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connectSocket = useCallback(() => {
    if (!socket.connected) {
      console.log('Layout: Attempting to connect socket...');
      socket.connect();

      // Set up a reconnection timeout
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (!socket.connected) {
          console.log('Layout: Connection timeout, retrying...');
          socket.disconnect().connect(); // Force a fresh connection
        }
      }, 5000);
    }
  }, []);

  const handleTextChange = useCallback((text: string, languages: string[]) => {
    console.log('Layout: Text changed in InputColumn:', { text, languages });
    setCurrentSourceText(text);
    setCurrentSourceLanguages(languages);
  }, []);

  const handleLanguageChange = useCallback((newTargetLanguage: string) => {
    setOutputLanguage(newTargetLanguage);
  }, []);

  // Initial connection attempt
  useEffect(() => {
    connectSocket();
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectSocket]);

  // Socket event handlers
  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      console.log('Layout: Socket connected successfully', socket.id);
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const onDisconnect = (reason: string) => {
      setIsConnected(false);
      console.log('Layout: Socket disconnected', reason);
      connectSocket(); // Try to reconnect immediately
    };

    const onReceiveTranslation = (text: string) => {
      setTranslatedText(text);
      setIsLoading(false);
      setAnnotatedInputText(null);
    };

    const onTranslationError = (errorMsg: string) => {
      console.error('Layout: Translation error from server:', errorMsg);
      setTranslatedText(`Error: ${errorMsg}`);
      setIsLoading(false);
      setAnnotatedInputText(null);
    };

    const onReceiveAnnotatedText = (data: { annotatedText: string; detectedLanguages: string[] }) => {
      console.log('Layout: Received annotated text from server:', data);
      setAnnotatedInputText({ text: data.annotatedText, languages: data.detectedLanguages });
    };

    const onConnectError = (error: Error) => {
      console.error('Layout: Socket connection error:', error);
      setIsConnected(false);
      setIsLoading(false);
      connectSocket(); // Try to reconnect on error
    };

    // Set up event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receiveTranslation', onReceiveTranslation);
    socket.on('translationError', onTranslationError);
    socket.on('connect_error', onConnectError);
    socket.on('receiveAnnotatedText', onReceiveAnnotatedText);

    // Cleanup event listeners
    return () => {
      console.log('Layout: Cleaning up socket listeners');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receiveTranslation', onReceiveTranslation);
      socket.off('translationError', onTranslationError);
      socket.off('connect_error', onConnectError);
      socket.off('receiveAnnotatedText', onReceiveAnnotatedText);
    };
  }, [connectSocket]);

  // Handle language changes
  useEffect(() => {
    if (previousOutputLanguageRef.current !== outputLanguage && currentSourceText.trim() && socket.connected) {
      if (translatedText || isLoading) {
        console.log(`Layout: Output language changed from ${previousOutputLanguageRef.current} to ${outputLanguage}. Re-translating: '${currentSourceText}'`);
        setIsLoading(true);
        
        const languagesToSend = currentSourceLanguages.length > 0 && !currentSourceLanguages.includes(DEFAULT_INPUT_LANGUAGE) 
                                ? currentSourceLanguages 
                                : [DEFAULT_INPUT_LANGUAGE];

        socket.emit('sendText', {
          text: currentSourceText,
          languages: languagesToSend, 
          targetLanguage: outputLanguage 
        });
      }
    }
    previousOutputLanguageRef.current = outputLanguage;
  }, [outputLanguage, currentSourceText, currentSourceLanguages, translatedText, isLoading]);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  return (
    <>
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        {!isConnected && (
          <button 
            onClick={connectSocket}
            className="reconnect-button"
          >
            Reconnect
          </button>
        )}
      </div>
      
      <div className="layout-container">
        <InputColumn 
          onTextChange={handleTextChange} 
          targetLanguage={outputLanguage}
          onLoadingChange={handleLoadingChange}
          annotatedTextData={annotatedInputText}
          onClearAnnotatedText={() => setAnnotatedInputText(null)}
        />
        <OutputColumn 
          translatedText={translatedText} 
          onLanguageChange={handleLanguageChange}
          isLoading={isLoading}
        />
      </div>
    </>
  );
};

export default Layout;