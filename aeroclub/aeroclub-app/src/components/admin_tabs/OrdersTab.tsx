import React from 'react';
import { Order, ColorPalette, FigmaColorToCssFunc, ScalingLocation } from './types'; // Импорт общих типов

interface OrdersTabProps {
  orders: Order[];
  scalingLocations: ScalingLocation[]; // Добавлено для использования в фильтре
  onOpenOrderInfoModal: (orderId: string) => void;
  colors: ColorPalette;
  figmaColorToCss: FigmaColorToCssFunc;
}

const OrdersTab: React.FC<OrdersTabProps> = ({
  orders,
  scalingLocations, // Получаем реальные локации
  onOpenOrderInfoModal,
  colors,
  figmaColorToCss,
}) => {
  // Используем scalingLocations для фильтра, если они есть, иначе заглушку
  const locationOptions = scalingLocations.length > 0 
    ? [{ id: "", address: "Все локации" }, ...scalingLocations] 
    : [{ id: 'all', address: 'Все локации' }]; // Заглушка, если scalingLocations пуст

  // Состояние для выбранной локации в фильтре (пока не используется для фильтрации данных)
  const [selectedFilterLocation, setSelectedFilterLocation] = React.useState("");

  return (
    <div className="content-section orders-section">
      <h2 style={{ color: colors.textDark }}>Текущие заказы</h2>
      <div className="orders-filters">
        <div className="form-group">
          <label style={{ color: colors.textLight }}>Дата/время</label>
          <div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white }}>
            <select style={{ color: colors.textDark }}>
              <option>Все время</option>
              {/* TODO: Добавить варианты для фильтрации по дате/времени */}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label style={{ color: colors.textLight }}>Локация</label>
          <div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white }}>
            <select 
              value={selectedFilterLocation} 
              onChange={(e) => setSelectedFilterLocation(e.target.value)} 
              style={{ color: colors.textDark }}
            >
              {locationOptions.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.address}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="orders-list-container">
        <div className="order-list-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', marginBottom: '10px' }}>
          <span style={{ flex: 1, textAlign: 'left', color: colors.textLight }}>Дата/время</span>
          <span style={{ flex: 2, textAlign: 'left', color: colors.textLight }}>Локация | место</span>
          <span style={{ flex: 1, textAlign: 'right', color: colors.textLight }}>Действия</span>
        </div>
        {orders.length > 0 ? (
          orders.map(order => (
            <div key={order.id} className="order-list-row" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 20px',
              borderBottom: `1px solid ${figmaColorToCss({ r: 0.9, g: 0.9, b: 0.9 })}`
            }}>
              <span style={{ flex: 1, color: colors.textDark }}>{order.dateTime}</span>
              <span style={{ flex: 2, color: colors.textDark }}>{`${order.location} | ${order.spot}`}</span>
              <div className="order-actions" style={{ flex: 1, textAlign: 'right' }}>
                <button
                  className="action-button"
                  style={{
                    backgroundColor: colors.buttonDark,
                    color: colors.white,
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginRight: '10px'
                  }}
                  onClick={() => onOpenOrderInfoModal(order.id)}
                >
                  Показать заказ
                </button>
                <button
                  className="action-button status-button"
                  style={{
                    backgroundColor: colors.orangeButton,
                    color: colors.white,
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                  // TODO: Добавить обработчик для смены статуса, возможно через модальное окно
                  onClick={() => console.log("Change status for order:", order.id)}
                >
                  <span style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: colors.white,
                    marginRight: '8px',
                    border: `1px solid ${colors.orangeButton}`
                  }}></span> Сменить статус
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="order-list-row" style={{ textAlign: 'center', color: colors.textLight, padding: '20px' }}>
            Нет заказов для отображения.
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersTab;
