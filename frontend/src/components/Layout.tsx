import React, { useState, useEffect } from 'react';
import InputColumn from './InputColumn';
import OutputColumn from './OutputColumn';
import { socket } from '../socket'; // Import the socket instance
// import '../styles/Layout.css'; // We can create this later if needed

const Layout: React.FC = () => {
  const [translatedText, setTranslatedText] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);

  useEffect(() => {
    function connectSocket() {
      if (!socket.connected) {
        console.log('Layout: Attempting to connect socket...');
        socket.connect();
      }
    }

    connectSocket();

    function onConnect() {
      setIsConnected(true);
      console.log('Layout: Socket connected successfully', socket.id);
    }

    function onDisconnect(reason: string) {
      setIsConnected(false);
      console.log('Layout: Socket disconnected', reason);
      if (reason === 'io server disconnect') {
        // socket.connect(); // Or implement a more robust reconnection strategy
      }
    }

    function onReceiveTranslation(text: string) {
      setTranslatedText(text);
    }

    function onTranslationError(errorMsg: string) {
      console.error('Layout: Translation error from server:', errorMsg);
      setTranslatedText(`Error: ${errorMsg}`);
    }

    function onConnectError(error: Error) {
      console.error('Layout: Socket connection error:', error);
      setIsConnected(false);
    }

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
  }, []);

  return (
    <div className="layout-container" style={{ display: 'flex', gap: '20px', padding: '20px' }}>
      <InputColumn />
      <OutputColumn translatedText={translatedText} />
    </div>
  );
};

export default Layout; 