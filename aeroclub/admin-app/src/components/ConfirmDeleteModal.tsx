import React from 'react';
import './ConfirmDeleteModal.css';

// Helper function to convert Figma RGB to CSS rgba (can be imported from a shared util if available)
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType: 'drink' | 'user' | 'location' | null;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ isOpen, onClose, onConfirm, itemName, itemType }) => {
  if (!isOpen) {
    return null;
  }

  const colors = {
    background: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
    textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
    textLightGray: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }), // Figma's "textLight" is more of a gray here
    accentRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }),
    white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
  };

  // Placeholder for a proper trash icon SVG or component
  const TrashIcon = () => (
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M54.4052 16.825C54.4052 15.0375 52.9677 13.625 51.1552 13.625H39.9052V10.625C39.9052 7.00001 37.0302 4.37501 33.2802 4.37501H26.7302C22.9802 4.37501 20.1052 7.00001 20.1052 10.625V13.625H8.85518C7.04268 13.625 5.60518 15.0375 5.60518 16.825C5.60518 18.6125 7.04268 20.025 8.85518 20.025H11.0802V45.625C11.0802 51.2125 15.4177 55.625 21.0052 55.625H39.0052C44.5927 55.625 48.9302 51.2125 48.9302 45.625V20.025H51.1552C52.9677 20.025 54.4052 18.6125 54.4052 16.825ZM25.1052 10.625C25.1052 9.20001 25.8052 8.12501 26.7302 8.12501H33.2802C34.2052 8.12501 34.9052 9.20001 34.9052 10.625V13.625H25.1052V10.625ZM43.9302 45.625C43.9302 48.425 41.7427 50.625 39.0052 50.625H21.0052C18.2677 50.625 16.0802 48.425 16.0802 45.625V20.025H43.9302V45.625Z" fill={colors.accentRed}/>
      <path d="M23.2926 41.875C22.5176 41.875 21.8051 41.125 21.8051 40.375V28.125C21.8051 27.375 22.5176 26.625 23.2926 26.625C24.0676 26.625 24.7801 27.375 24.7801 28.125V40.375C24.7801 41.125 24.0676 41.875 23.2926 41.875Z" fill={colors.accentRed}/>
      <path d="M36.7302 41.875C35.9552 41.875 35.2427 41.125 35.2427 40.375V28.125C35.2427 27.375 35.9552 26.625 36.7302 26.625C37.5052 26.625 38.2177 27.375 38.2177 28.125V40.375C38.2177 41.125 37.5052 41.875 36.7302 41.875Z" fill={colors.accentRed}/>
    </svg>
  );


  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) { // Ensure click is on overlay itself, not on children
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" style={{ backgroundColor: colors.background }}>
        <div className="modal-icon">
          <TrashIcon />
        </div>
        <h2 className="modal-title" style={{ color: colors.textDark }}>
          Удалить {itemType === 'drink' ? 'напиток' : itemType === 'user' ? 'пользователя' : itemType === 'location' ? 'локацию' : 'элемент'}
        </h2>
        <p className="modal-item-name" style={{ color: colors.textLightGray }}>
          {itemName}
        </p>
        <div className="modal-actions">
          <button
            className="modal-button confirm"
            style={{ backgroundColor: colors.accentRed, color: colors.white }}
            onClick={onConfirm}
          >
            Удалить
          </button>
          <button
            className="modal-button cancel"
            style={{ backgroundColor: colors.textLightGray, color: colors.white }}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
