import React from 'react';

interface IconProps {
  color?: string;
  size?: string | number;
  className?: string;
  style?: React.CSSProperties; // Added style prop
}

const defaultSize = 20; // Default icon size

// Icon for "Пользователи" (Users) - Hexagon with person
export const UserIcon: React.FC<IconProps> = ({ color, size = defaultSize, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 87 24 24" // Adjusted viewBox to frame the icon
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={style} // Apply style prop
  >
    <path
      d="M19.51 91.85L13.57 88.42C12.6 87.86 11.4 87.86 10.42 88.42L4.49004 91.85C3.52004 92.41 2.92004 93.45 2.92004 94.58V101.42C2.92004 102.54 3.52004 103.58 4.49004 104.15L10.43 107.58C11.4 108.14 12.6 108.14 13.58 107.58L19.52 104.15C20.49 103.59 21.09 102.55 21.09 101.42V94.58C21.08 93.45 20.48 92.42 19.51 91.85ZM12 93.34C13.29 93.34 14.33 94.38 14.33 95.67C14.33 96.96 13.29 98 12 98C10.71 98 9.67004 96.96 9.67004 95.67C9.67004 94.39 10.71 93.34 12 93.34ZM14.68 102.66H9.32004C8.51004 102.66 8.04004 101.76 8.49004 101.09C9.17004 100.08 10.49 99.4 12 99.4C13.51 99.4 14.83 100.08 15.51 101.09C15.96 101.75 15.48 102.66 14.68 102.66Z"
      fill={color || "#545B5E"} // Default color from SVG sprite
    />
  </svg>
);

// Icon for "Редактирование меню" (Edit Menu) - Hexagon with circle
export const EditMenuIcon: React.FC<IconProps> = ({ color, size = defaultSize, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="35 44 22 22" // Adjusted viewBox
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={style} // Apply style prop
  >
    <path
      d="M51.94 48.42L46.77 45.43C45.78 44.86 44.23 44.86 43.24 45.43L38.02 48.44C35.95 49.84 35.83 50.05 35.83 52.28V57.71C35.83 59.94 35.95 60.16 38.06 61.58L43.23 64.57C43.73 64.86 44.37 65 45 65C45.63 65 46.27 64.86 46.76 64.57L51.98 61.56C54.05 60.16 54.17 59.95 54.17 57.72V52.28C54.17 50.05 54.05 49.84 51.94 48.42ZM45 58.25C43.21 58.25 41.75 56.79 41.75 55C41.75 53.21 43.21 51.75 45 51.75C46.79 51.75 48.25 53.21 48.25 55C48.25 56.79 46.79 58.25 45 58.25Z"
      fill={color || "#545B5E"}
    />
  </svg>
);

// Icon for "Текущие заказы" (Orders) - Receipt icon
export const OrdersIcon: React.FC<IconProps> = ({ color, size = defaultSize, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="67 44 20 22" // Adjusted viewBox
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={style} // Apply style prop
  >
    <path
      d="M73 45H72C69 45 68 46.79 68 49V50V64C68 64.83 68.94 65.3 69.6 64.8L71.31 63.52C71.71 63.22 72.27 63.26 72.63 63.62L74.29 65.29C74.68 65.68 75.32 65.68 75.71 65.29L77.39 63.61C77.74 63.26 78.3 63.22 78.69 63.52L80.4 64.8C81.06 65.29 82 64.82 82 64V47C82 45.9 82.9 45 84 45H73ZM71.97 57.01C71.42 57.01 70.97 56.56 70.97 56.01C70.97 55.46 71.42 55.01 71.97 55.01C72.52 55.01 72.97 55.46 72.97 56.01C72.97 56.56 72.52 57.01 71.97 57.01ZM71.97 53.01C71.42 53.01 70.97 52.56 70.97 52.01C70.97 51.46 71.42 51.01 71.97 51.01C72.52 51.01 72.97 51.46 72.97 52.01C72.97 52.56 72.52 53.01 71.97 53.01ZM78 56.76H75C74.59 56.76 74.25 56.42 74.25 56.01C74.25 55.6 74.59 55.26 75 55.26H78C78.41 55.26 78.75 55.6 78.75 56.01C78.75 56.42 78.41 56.76 78 56.76ZM78 52.76H75C74.59 52.76 74.25 52.42 74.25 52.01C74.25 51.6 74.59 51.26 75 51.26H78C78.41 51.26 78.75 51.6 78.75 52.01C78.75 52.42 78.41 52.76 78 52.76Z"
      fill={color || "#545B5E"}
    />
  </svg>
);

// Icon for "Масштабирование" (Scaling) and "Скачать QR код" - Grid/QR-like icon
export const ScalingGridIcon: React.FC<IconProps> = ({ color, size = defaultSize, className, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 44 24 24" // Adjusted viewBox
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={style} // Apply style prop
  >
    <path
      d="M2 50V49.8C2 48.1198 2 47.2798 2.32698 46.638C2.6146 46.0735 3.07354 45.6146 3.63803 45.327C4.27976 45 5.11984 45 6.8 45H7M2 60V60.2C2 61.8802 2 62.7202 2.32698 63.362C2.6146 63.9265 3.07354 64.3854 3.63803 64.673C4.27976 65 5.11984 65 6.8 65H7M22 50V49.8C22 48.1198 22 47.2798 21.673 46.638C21.3854 46.0735 20.9265 45.6146 20.362 45.327C19.7202 45 18.8802 45 17.2 45H17M22 60V60.2C22 61.8802 22 62.7202 21.673 63.362C21.3854 63.9265 20.9265 64.3854 20.362 64.673C19.7202 65 18.8802 65 17.2 65H17M13.9996 57H15V61H18M18 57V57.0099M10 53H6V49H10V53ZM10 61H6V57H10V61ZM18 53H14V49H18V53Z"
      stroke={color || "#131316"} // This icon uses stroke
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Icon for Attachment (example, if needed from sprite)
export const AttachmentIcon: React.FC<IconProps> = ({ color, size = defaultSize, className, style }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="35 0 22 24" // Adjusted for this specific icon
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    style={style} // Apply style prop
  >
    <path 
      d="M49.2426 7.75736L43.2322 13.7678C42.2559 14.7441 42.2559 16.327 43.2322 17.3033C44.2085 18.2796 45.7914 18.2796 46.7677 17.3033L52.071 12C54.0236 10.0474 54.0236 6.88155 52.071 4.92893C50.1184 2.97631 46.9526 2.97631 45 4.92893L39.3431 10.5858C36.6094 13.3195 36.6094 17.7516 39.3431 20.4853" 
      stroke={color || "#131316"} 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Add other icons as needed following the pattern above
