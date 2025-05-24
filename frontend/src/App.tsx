import Layout from './components/Layout';
import './App.css'; // App-specific styles, though most are in index.css

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Real-Time Translator</h1>
      </header>
      <main>
        <Layout />
      </main>
    </div>
  );
}

export default App;
