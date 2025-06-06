// Общие типы для AdminPage и его вкладок

export type AdminTabId = 'users' | 'editMenu' | 'orders' | 'scaling';

export interface FrontendMenuItem {
  id: string; // uuid.UUID from backend, will be string in JSON
  name: string;
  price: number;
  image_filename: string | null; // Optional image
}

export interface User {
  id: string; // uuid.UUID from backend, will be string in JSON
  login: string;
  password?: string; // Not provided by GET /api/v1/users/
  location_id?: string | null; // Added from backend
  location_name?: string | null; // Added from backend
  location?: string; // Kept for potential mock data or other uses, but prioritize location_name
}

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface Order {
  id: string;
  dateTime: string; // Уже отформатированная строка даты и времени
  location: string; // Название локации
  spot: string; // Название места (точки)
  items: OrderItem[];
  status?: string; // Статус заказа, например 'pending', 'completed'
}

export interface ScalingLocation {
  id: string; // uuid.UUID from backend
  address: string; // Название или адрес локации
  // qr_code_link?: string; // Опционально, если бэкенд возвращает ссылку на QR
}

// Тип для объекта с цветами, используемого в AdminPage и вкладках
export interface ColorPalette {
  background: string;
  textDark: string;
  textLight: string;
  accentRed: string;
  white: string;
  buttonDark: string;
  orangeButton: string; // Добавлен для OrdersTab
}

// Тип для функции преобразования цвета из Figma
export type FigmaColorToCssFunc = (color: { r: number; g: number; b: number; a?: number }) => string;
