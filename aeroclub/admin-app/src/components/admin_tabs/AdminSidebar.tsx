import React from 'react';
import { Link } from 'react-router-dom';
import { UserIcon, EditMenuIcon, OrdersIcon, ScalingGridIcon } from '../icons'; // Убедитесь, что путь к иконкам верный
import { LogoIcon } from '../LogoIcon'; // Убедитесь, что путь к LogoIcon верный

export type AdminTabId = 'users' | 'editMenu' | 'orders' | 'scaling';

interface SidebarItem {
  id: AdminTabId;
  name: string;
  IconComponent: React.FC<any>; // Уточните тип пропсов для иконок, если необходимо
}

export const sidebarItemsDefinition: SidebarItem[] = [
  { id: 'orders', name: 'Текущие заказы', IconComponent: OrdersIcon },
  { id: 'editMenu', name: 'Редактировать меню', IconComponent: EditMenuIcon },
  { id: 'users', name: 'Пользователи', IconComponent: UserIcon },
  { id: 'scaling', name: 'Масштабирование', IconComponent: ScalingGridIcon },
];

interface AdminSidebarProps {
  activeTab: AdminTabId;
  onTabClick: (tab: AdminTabId) => void;
  onLogout: () => void;
  colors: {
    background: string;
    textDark: string;
    textLight: string;
    accentRed: string;
    white: string;
  };
  userName?: string; // Имя пользователя, например "Иванов И.И."
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  onTabClick,
  onLogout,
  colors,
  userName = "Иванов И.И.", // Значение по умолчанию
}) => {
  return (
    <aside className="sidebar" style={{ backgroundColor: colors.background }}>
      <div className="logo-container" style={{ margin: '32px auto', textAlign: 'center' }}>
        <LogoIcon width={155} height={60} />
      </div>
      <nav className="sidebar-nav">
        <ul>
          {sidebarItemsDefinition.map((item) => {
            const isActive = activeTab === item.id;
            const iconColor = isActive ? colors.white : colors.textLight;
            return (
              <li
                key={item.id}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                style={{
                  backgroundColor: isActive ? colors.accentRed : colors.white, // Или colors.background если неактивный элемент должен иметь фон сайдбара
                  color: isActive ? colors.white : colors.textLight,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 20px',
                  cursor: 'pointer',
                }}
                onClick={() => onTabClick(item.id)}
              >
                <item.IconComponent color={iconColor} size={24} style={{ marginRight: '12px' }} />
                <span>{item.name}</span>
              </li>
            );
          })}
          <li
            className="sidebar-item client-app-link"
            style={{
              backgroundColor: colors.white, // Или colors.background
              color: colors.textLight,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 20px',
              marginTop: '20px',
            }}
          >
            <Link to="/client" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', width: '100%' }}>
              <span style={{ fontSize: '12px' }}>Client App</span>
            </Link>
          </li>
        </ul>
      </nav>
      <div className="user-profile">
        <p style={{ color: colors.textDark, fontSize: '20px' }}>{userName}</p>
        <button className="logout-button" style={{ backgroundColor: colors.textLight, color: colors.white }} onClick={onLogout}>
          Выход
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
