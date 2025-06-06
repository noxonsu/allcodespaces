import React from 'react';
import './ScanQrModal.css';

// Helper function from other components
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface ScanQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Simple placeholder Scanner Icon
const ScannerIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4H8V8H4V4Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 4H20V8H16V4Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 16H8V20H4V16Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 16H20V20H16V16Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 12H22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);


const ScanQrModal: React.FC<ScanQrModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  const colors = {
    overlayBackground: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083, a: 0.4 }), // From Rectangle 6
    modalBackground: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }), // From Frame 85
    iconColor: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }), // accentRed
    titleColor: figmaColorToCss({ r: 0.1058, g: 0.0823, b: 0.0823 }), // textDark
    textColor: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }), // textLight
    buttonBackground: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }), // textDark
    buttonText: figmaColorToCss({ r: 1, g: 1, b: 1 }), // white
  };

  return (
    <div className="scan-qr-modal-overlay" style={{ backgroundColor: colors.overlayBackground }}>
      <div className="scan-qr-modal-content" style={{ backgroundColor: colors.modalBackground }}>
        <div className="scan-qr-modal-icon-container">
          <ScannerIcon color={colors.iconColor} size={52} />
        </div>
        <h2 className="scan-qr-modal-title" style={{ color: colors.titleColor }}>
          Отсканируйте QR-код
        </h2>
        <p className="scan-qr-modal-text" style={{ color: colors.textColor }}>
          Для подтверждения заказа отсканируйте QR-код повторно. Благодарим за&nbsp;понимание!
        </p>
        <button
          className="scan-qr-modal-button"
          style={{ backgroundColor: colors.buttonBackground, color: colors.buttonText }}
          onClick={onClose}
        >
          Хорошо
        </button>
      </div>
    </div>
  );
};

export default ScanQrModal;

export {}; // Add this to make it a module
