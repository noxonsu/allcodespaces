import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import AdminPage from './components/AdminPage';
import LoginPage from './components/LoginPage'; // Import the LoginPage component

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/" element={<Navigate replace to="/login" />} /> {/* Default to login */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;
