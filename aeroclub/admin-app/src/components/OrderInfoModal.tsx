import React from 'react';
import './OrderInfoModal.css'; // To be created

// Helper function
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface OrderItem {
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  dateTime?: string; // dateTime might not be shown in modal as per screenshot
  location: string;
  spot: string;
  items: OrderItem[];
  status?: string;
}

interface OrderInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onUpdateStatus: (orderId: string, newStatus: string) => void; 
}

const OrderInfoModal: React.FC<OrderInfoModalProps> = ({ isOpen, onClose, order, onUpdateStatus }) => {
  if (!isOpen || !order) {
    return null;
  }

  const colors = {
    background: figmaColorToCss({ r: 1, g: 1, b: 1 }), // Modal background is white from screenshot
    textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }), // For title
    textSlightlyLighter: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }), // For location/spot text
    tableHeader: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }), // For table headers "Наименование", "Кол-во"
    tableCell: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }), // For item names and quantities
    buttonRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }), // "Выполнено" button
    buttonGray: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }), // "Закрыть" button
    white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
    borderColor: figmaColorToCss({r: 0.878, g: 0.878, b: 0.878}), // For table lines (approx)
  };
  
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="order-info-modal-content" style={{ backgroundColor: colors.background }}>
        <h2 className="order-info-modal-title" style={{ color: colors.textDark, fontFamily: '"Tilda Sans-ExtraBold", sans-serif' }}>
          Информация по заказу
        </h2>
        <p className="order-location-spot" style={{ color: colors.textSlightlyLighter, fontFamily: '"Tilda Sans-Medium", sans-serif' }}>
          {`${order.location} | ${order.spot}`}
        </p>
        
        <div className="order-details-section">
          <h3 className="order-details-subtitle" style={{ color: colors.textDark, fontFamily: '"Tilda Sans-Bold", sans-serif' }}>Состав заказа:</h3>
          <table className="order-items-table">
            <thead>
              <tr>
                <th style={{color: colors.tableHeader, fontFamily: '"Tilda Sans-Medium", sans-serif'}}>Наименование</th>
                <th style={{color: colors.tableHeader, fontFamily: '"Tilda Sans-Medium", sans-serif'}}>Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={index}>
                  <td style={{color: colors.tableCell, fontFamily: '"Tilda Sans-Medium", sans-serif'}}>{item.name}</td>
                  <td style={{color: colors.tableCell, fontFamily: '"Tilda Sans-Medium", sans-serif'}}>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="order-info-modal-actions">
          <button
            className="modal-button completed"
            style={{ backgroundColor: colors.buttonRed, color: colors.white, fontFamily: '"Tilda Sans-Bold", sans-serif' }}
            onClick={() => onUpdateStatus(order.id, 'completed')}
          >
            Выполнено
          </button>
          <button
            className="modal-button cancel"
            style={{ backgroundColor: colors.buttonGray, color: colors.white, fontFamily: '"Tilda Sans-Bold", sans-serif' }}
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderInfoModal;
