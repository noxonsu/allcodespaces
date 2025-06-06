import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { LogoIcon } from './LogoIcon';
import LoginErrorModal from './LoginErrorModal'; // Import the error modal
import { API_BASE_URL } from '../apiConfig'; // Import the API base URL

// Helper function (can be shared or moved to a utils file)
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

const LoginPage: React.FC = () => {
  const [login, setLogin] = useState(''); // Default from Figma
  const [password, setPassword] = useState('');
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      setIsErrorModalOpen(true);
      return;
    }

    const details = {
      username: login,
      password: password,
    };

    const formBody = Object.keys(details)
      // @ts-ignore
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(details[key]))
      .join('&');

    fetch(`${API_BASE_URL}/api/v1/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: formBody,
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('Login failed');
        }
      })
      .then(data => {
        console.log('Login successful, token:', data.access_token);
        localStorage.setItem('accessToken', data.access_token); // Store the token
        navigate('/admin');
      })
      .catch(error => {
        console.error('Login error:', error);
        setIsErrorModalOpen(true);
      });
  };

  const colors = {
    pageBackground: figmaColorToCss({ r: 1, g: 1, b: 1 }),
    titleColor: figmaColorToCss({ r: 0.1057, g: 0.0828, b: 0.0808 }),
    inputBackground: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
    inputText: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
    inputPlaceholder: figmaColorToCss({ r: 0.1058, g: 0.0823, b: 0.0823, a: 0.4 }),
    buttonBackground: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }), // accentRed
    buttonText: figmaColorToCss({ r: 1, g: 1, b: 1 }),
  };

  return (
    <div className="login-page-container" style={{ backgroundColor: colors.pageBackground }}>
      <div className="login-logo-container">
        <LogoIcon width={191} height={74} /> {/* Dimensions from Frame 134 */}
      </div>
      <div className="login-form-container">
        <h1 className="login-title" style={{ color: colors.titleColor }}>
          Авторизация
        </h1>
        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <input
              type="text"
              placeholder="Логин"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              style={{ backgroundColor: colors.inputBackground, color: colors.inputText }}
              className="login-input"
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ backgroundColor: colors.inputBackground, color: password ? colors.inputText : colors.inputPlaceholder }}
              className="login-input"
            />
          </div>
          <button type="submit" className="login-button" style={{ backgroundColor: colors.buttonBackground, color: colors.buttonText }}>
            Войти
          </button>
        </form>
      </div>
      <LoginErrorModal isOpen={isErrorModalOpen} onClose={() => setIsErrorModalOpen(false)} />
    </div>
  );
};

export default LoginPage;
