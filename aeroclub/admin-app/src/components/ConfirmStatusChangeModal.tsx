import React from 'react';
import './ConfirmStatusChangeModal.css'; // To be created

// Helper function
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface ConfirmStatusChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (orderId: string, newStatus: string) => void;
  orderId: string;
}

const ConfirmStatusChangeModal: React.FC<ConfirmStatusChangeModalProps> = ({ isOpen, onClose, onConfirm, orderId }) => {
  if (!isOpen) {
    return null;
  }

  const colors = {
    background: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }), // black-haze
    textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }), // black
    accentRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }), // red
    gray: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }), // gray
    white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
  };

  // Placeholder for a proper icon SVG or component (vuesaxboldarchive-tick)
  const ArchiveTickIcon = () => (
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M29.9999 55.0001C43.8071 55.0001 54.9999 43.8073 54.9999 30.0001C54.9999 16.1929 43.8071 5.00012 29.9999 5.00012C16.1927 5.00012 5.00001 16.1929 5.00001 30.0001C5.00001 43.8073 16.1927 55.0001 29.9999 55.0001Z" fill="#FAB005"/>
      <path d="M20.0001 30.0001L26.2501 36.2501L40.0001 22.5001" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="confirm-status-change-modal-content" style={{ backgroundColor: colors.background }}>
        <div className="modal-icon">
          <ArchiveTickIcon />
        </div>
        <div className="frame-39">
          <h2 className="modal-title" style={{ color: colors.textDark }}>
            Сменить статус заказа<br />на «выполнено»
          </h2>
          <div className="modal-actions">
            <button
              className="modal-button confirm"
              style={{ backgroundColor: colors.accentRed, color: colors.white }}
              onClick={() => onConfirm(orderId, 'completed')}
            >
              Сменить
            </button>
            <button
              className="modal-button cancel"
              style={{ backgroundColor: colors.gray, color: colors.white }}
              onClick={onClose}
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmStatusChangeModal;
