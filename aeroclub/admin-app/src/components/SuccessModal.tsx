import React from 'react';
import './SuccessModal.css'; // Will create this CSS file next

// Helper function (can be shared)
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string; // Optional custom message
}

const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, message }) => {
  if (!isOpen) {
    return null;
  }

  const colors = {
    background: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
    textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
    textLightGray: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }),
    accentRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }), // For the tick icon
    white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
  };

  // Placeholder for a tick-square icon (vuesax/bold/tick-square from Figma)
  const TickSquareIcon = () => (
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M29.9999 7.5C16.1924 7.5 7.49991 16.1925 7.49991 30C7.49991 43.8075 16.1924 52.5 29.9999 52.5C43.8074 52.5 52.4999 43.8075 52.4999 30C52.4999 16.1925 43.8074 7.5 29.9999 7.5ZM5.00009 30C5.00009 14.805 14.8051 5 30.0001 5C45.1951 5 55.0001 14.805 55.0001 30C55.0001 45.195 45.1951 55 30.0001 55C14.8051 55 5.00009 45.195 5.00009 30Z" fill={colors.accentRed}/>
      <path d="M25.025 38.1001L19.425 32.5001C18.825 31.9001 18.825 30.9251 19.425 30.3251C20.025 29.7251 21 29.7251 21.6 30.3251L25.625 34.3501L38.425 21.5751C39.025 20.9751 40 20.9751 40.6 21.5751C41.2 22.1751 41.2 23.1501 40.6 23.7501L26.225 38.1001C25.925 38.4001 25.525 38.5251 25.15 38.5251C25.1 38.5251 25.075 38.5251 25.025 38.5001V38.1001Z" fill={colors.accentRed}/>
    </svg>
  );

  const displayMessage = message || "Напиток успешно добавлен в меню"; // Default from Frame 133

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="success-modal-content" style={{ backgroundColor: colors.background }}>
        <div className="success-modal-icon">
          <TickSquareIcon />
        </div>
        <h2 className="success-modal-title" style={{ color: colors.textDark }}>
          {displayMessage}
        </h2>
        <div className="success-modal-actions">
          <button
            className="success-modal-button okay"
            style={{ backgroundColor: colors.textLightGray, color: colors.white }}
            onClick={onClose}
          >
            Хорошо
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuccessModal;
