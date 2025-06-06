import React from 'react';
import { Order, ScalingLocation } from './types'; // Импорт общих типов
import './OrdersTab.css'; // Импорт стилей

// Предполагаем, что иконка chevron-down будет импортирована или доступна как SVG-компонент
// import ChevronDownIcon from './path-to-chevron-down.svg'; 

interface OrdersTabProps {
  orders: Order[];
  scalingLocations: ScalingLocation[];
  onOpenOrderInfoModal: (orderId: string) => void;
  // TODO: Добавить проп для обработчика смены статуса, если он будет отличаться от console.log
  // onChangeOrderStatus: (orderId: string, newStatus: string) => void; 
}

const OrdersTab: React.FC<OrdersTabProps> = ({
  orders,
  scalingLocations,
  onOpenOrderInfoModal,
}) => {
  // Используем scalingLocations для фильтра, если они есть, иначе заглушку
  const locationOptions = scalingLocations.length > 0
    ? [{ id: "", address: "Все локации" }, ...scalingLocations.map(loc => ({ id: loc.id, address: loc.address }))]
    : [{ id: 'all', address: 'Все локации' }];

  // Состояние для выбранной локации в фильтре
  const [selectedFilterLocation, setSelectedFilterLocation] = React.useState("");
  // TODO: Добавить состояние и обработчик для фильтра по дате/времени, если необходимо

  // TODO: Реализовать фильтрацию заказов на основе selectedFilterLocation и других фильтров
  const filteredOrders = orders; // Пока что отображаем все заказы

  return (
    <div className="orders-tab-container"> {/* Используем обертку для применения стилей */}
      <div className="frame-153-hCCJHX"> {/* Этот класс из CSS */}
        <h1 className="title-mUl0Lc title">Текущие заказы</h1>
        <div className="frame-141-mUl0Lc">
          <div className="frame-139-Mvawx2">
            <div className="frame-160-e9KnCy">
              <div className="title-JxeMua title">Дата/время</div>
              {/* <img className="icon-chevron-down" src={ChevronDownIcon} alt="icon / chevron-down" /> */}
              {/* Заглушка для иконки, если SVG не импортирован */}
              <img className="icon-chevron-down" alt="icon / chevron-down" src="https://cdn.animaapp.com/projects/67d17e7b307c8641d34b3d03/releases/68435e892d15ce502a9dbc98/img/icon---chevron-down-1.svg" />
            </div>
            <div className="frame-161-e9KnCy">
              <div className="title-rIZb6T title">Локация</div>
               {/* <img className="icon-chevron-down" src={ChevronDownIcon} alt="icon / chevron-down" /> */}
               <img className="icon-chevron-down" alt="icon / chevron-down" src="https://cdn.animaapp.com/projects/67d17e7b307c8641d34b3d03/releases/68435e892d15ce502a9dbc98/img/icon---chevron-down-1.svg" />
            </div>
            {/* TODO: Добавить элементы управления для фильтров, если они нужны здесь */}
            {/* Пример для фильтра локаций, если он должен быть здесь, а не в AdminPage */}
            {/* 
            <div className="form-group" style={{ marginLeft: 'auto' }}>
              <select 
                value={selectedFilterLocation} 
                onChange={(e) => setSelectedFilterLocation(e.target.value)}
                style={{ padding: '8px', borderRadius: '4px' }} 
              >
                {locationOptions.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.address}</option>
                ))}
              </select>
            </div>
            */}
          </div>
          <div className="frame-142-Mvawx2">
            {filteredOrders.length > 0 ? (
              filteredOrders.map(order => (
                // Используем общий класс для строк заказа, если он есть в CSS, или frame-140-QJHgXe и т.д.
                // В HTML каждая строка имела свой уникальный класс (frame-140-QJHgXe, frame-145-QJHgXe, ...), 
                // что не подходит для динамического рендеринга. Используем один общий класс.
                <div key={order.id} className="frame-140-QJHgXe"> {/* Общий класс для строки заказа */}
                  <div className="title order-row-text-date tildasans-medium-scarpa-flow-18px">{order.dateTime}</div>
                  <p className="title order-row-text-location tildasans-medium-scarpa-flow-18px">
                    {`${order.location} | место ${order.spot}`}
                  </p>
                  <div className="frame-138"> {/* Контейнер для кнопок */}
                    <div 
                      className="btn-admin btn-admin-show-order" // Классы для кнопки "Показать заказ"
                      onClick={() => onOpenOrderInfoModal(order.id)}
                    >
                      <div className="title tildasans-bold-white-18px">Показать заказ</div>
                    </div>
                    <div 
                      className="btn-admin btn-admin-change-status" // Классы для кнопки "Сменить статус"
                      onClick={() => console.log("Change status for order:", order.id)} // TODO: Заменить на реальный обработчик
                    >
                      <div className="ellipse-1"></div>
                      <div className="title tildasans-bold-eerie-black-18px">Сменить статус</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-orders-message"> {/* Класс для сообщения об отсутствии заказов */}
                Нет заказов для отображения.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrdersTab;
