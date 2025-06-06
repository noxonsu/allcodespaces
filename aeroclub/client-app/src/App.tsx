import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import ClientAppPage from './components/ClientAppPage';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<ClientAppPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
