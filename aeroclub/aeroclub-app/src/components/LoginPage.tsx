import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { LogoIcon } from './LogoIcon';
import LoginErrorModal from './LoginErrorModal'; // Import the error modal

// Helper function (can be shared or moved to a utils file)
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

const LoginPage: React.FC = () => {
  const [login, setLogin] = useState('Dmitry_MDA'); // Default from Figma
  const [password, setPassword] = useState('');
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login check
    // In a real app, this would involve API calls and proper authentication
    if (login.trim() === 'Dmitry_MDA' && password.trim() === 'password') { // Example correct credentials
      console.log('Login successful with:', { login, password });
      navigate('/admin');
    } else if (login.trim() !== '' && password.trim() !== '') {
      console.log('Login failed with:', { login, password });
      setIsErrorModalOpen(true);
    }
     else {
      // alert('Пожалуйста, введите логин и пароль.'); // Replaced with modal for consistency
      setIsErrorModalOpen(true); // Show error modal if fields are empty too
    }
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
