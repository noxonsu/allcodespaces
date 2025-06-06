import React from 'react';
import './LoginErrorModal.css';

// Helper function
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface LoginErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Simple placeholder for close-square icon
const CloseSquareIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} />
    <path d="M9 9L15 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15 9L9 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LoginErrorModal: React.FC<LoginErrorModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  const colors = {
    overlayBackground: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083, a: 0.4 }), // From other modals
    modalBackground: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }), // Frame 133 fill
    iconColor: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }), // icon / close-square fill
    titleColor: figmaColorToCss({ r: 0.1058, g: 0.0823, b: 0.0823 }), // Title text fill
    textColor: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }), // Body text fill
  };
  
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="login-error-modal-overlay" style={{ backgroundColor: colors.overlayBackground }} onClick={handleOverlayClick}>
      <div className="login-error-modal-content" style={{ backgroundColor: colors.modalBackground }}>
        <div className="login-error-modal-icon-container">
          <CloseSquareIcon color={colors.iconColor} size={60} />
        </div>
        <h2 className="login-error-modal-title" style={{ color: colors.titleColor }}>
          Данные не верные
        </h2>
        <div className="login-error-modal-text-container">
          <p className="login-error-modal-text" style={{ color: colors.textColor }}>
            Повторите попытку или обратитесь к&nbsp;администратору системы
          </p>
          <p className="login-error-modal-text-secondary" style={{ color: colors.textColor }}>
            (контакт отвественного)
          </p>
        </div>
        {/* The design doesn't show a button, assuming close on overlay click or an implicit "Okay" */}
        {/* If a button is needed, it can be added here, similar to SuccessModal */}
         <button
            className="login-error-modal-button"
            onClick={onClose}
          >
            Хорошо
          </button>
      </div>
    </div>
  );
};

export default LoginErrorModal;
export {}; // Ensure it's a module
