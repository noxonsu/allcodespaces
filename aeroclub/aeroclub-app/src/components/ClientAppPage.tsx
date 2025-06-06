import React, { useState } from 'react';
import './ClientAppPage.css';
import ScanQrModal from './ScanQrModal'; // Import the modal

// Helper function to convert Figma RGB to CSS rgba
const figmaColorToCss = (colorObj: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = colorObj; // Changed 'color' to 'colorObj' to avoid conflict
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface Product {
  id: string;
  name: string;
  imageSrc: string;
  initialQuantity: number;
}

const productsData: Product[] = [
  {
    id: 'prod1',
    name: 'Черный кофе',
    imageSrc: '/client_app_images/2cd96672e2f5e16292666ec7a36d0b579a9dd662.png',
    initialQuantity: 0,
  },
  {
    id: 'prod2',
    name: 'Кофе с молоком',
    imageSrc: '/client_app_images/8d89a25cc99599807fdb64a57bba2ccd79e35964.png',
    initialQuantity: 0,
  },
  {
    id: 'prod3',
    name: 'Вода без газа',
    imageSrc: '/client_app_images/e79a1bd3244e28b093e8ce1173afc9178750b295.png',
    initialQuantity: 3, // Based on the "3" in the JSON for this item
  },
  // Add more products if needed, e.g., Черный чай
  {
    id: 'prod4',
    name: 'Черный чай',
    imageSrc: '/client_app_images/31b7a70c52a5896566545f27e523ca46d29663d6.png',
    initialQuantity: 0,
  }
];

const ClientAppPage: React.FC = () => {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    productsData.reduce((acc, product) => {
      acc[product.id] = product.initialQuantity;
      return acc;
    }, {} as Record<string, number>)
  );
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  const handleQuantityChange = (productId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(0, (prev[productId] || 0) + delta),
    }));
  };

  const cardStyle = {
    backgroundColor: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
    borderRadius: '16px',
    padding: '0', // Image takes full width of its container part
    // margin: '10px', // Removed, grid gap will handle spacing
    width: '100%', // Let the grid control the width, minmax(170px, 1fr)
    maxWidth: '174px', // Max width from Figma
    overflow: 'hidden', // To respect border radius of children
    boxSizing: 'border-box' as 'border-box', // Ensure padding/border don't add to width
  };

  const imageContainerStyle = {
    width: '174px', // Explicitly set to maintain square aspect with height
    height: '174px', // From Figma JSON
    position: 'relative' as 'relative',
    borderRadius: '16px 16px 0 0', // Rounded top corners
    overflow: 'hidden',
  };
  
  const imageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as 'cover',
  };

  const titleStyle = {
    position: 'absolute' as 'absolute',
    bottom: '12px', // y:142, image frame height 174. 174-142-20 (height of text) is approx 12 from bottom.
    left: '0',
    width: '100%',
    textAlign: 'center' as 'center',
    color: figmaColorToCss({ r: 1, g: 1, b: 1 }),
    fontSize: '17px',
    fontFamily: 'Tilda Sans, sans-serif',
    padding: '0 12px', // Ensure text doesn't touch edges
    boxSizing: 'border-box' as 'border-box',
  };
  
  const controlsStyle = {
    display: 'flex',
    justifyContent: 'center', // Changed from space-between
    alignItems: 'center',
    padding: '12px', // Matches Figma's x:12 for Frame 83
    gap: '8px', // Added gap for spacing between control elements
  };

  const buttonStyle = {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: figmaColorToCss({ r: 1, g: 1, b: 1 }),
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '20px',
    color: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
  };
  
  const quantityInputStyle = {
    width: '62px', // From Figma JSON
    height: '36px',
    textAlign: 'center' as 'center',
    border: `1px solid ${figmaColorToCss({ r: 0.1058, g: 0.0823, b: 0.0823, a: 0.12 })}`,
    borderRadius: '8px',
    fontSize: '17px',
    fontFamily: 'Tilda Sans, sans-serif',
    color: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
  };


  return (
    <div className="client-app-page">
      <h1>Меню</h1>
      <div className="product-list-container"> {/* Added wrapper */}
        <div className="product-list">
          {productsData.map(product => (
            <div key={product.id} className="product-card" style={cardStyle}>
              <div className="product-image-container" style={imageContainerStyle}>
              <img src={product.imageSrc} alt={product.name} style={imageStyle} />
              {/* Gradient overlay from Figma JSON - can be done with ::after pseudo-element in CSS if preferred */}
              <div className="image-gradient-overlay"></div>
              <div className="product-name" style={titleStyle}>{product.name}</div>
            </div>
            <div className="product-controls" style={controlsStyle}>
              <button 
                style={{...buttonStyle, opacity: quantities[product.id] === 0 ? 0.4 : 1}} 
                onClick={() => handleQuantityChange(product.id, -1)}
                disabled={quantities[product.id] === 0}
              >
                -
              </button>
              <input 
                type="text" 
                value={quantities[product.id]} 
                readOnly 
                style={quantityInputStyle}
              />
              <button style={buttonStyle} onClick={() => handleQuantityChange(product.id, 1)}>+</button>
            </div>
          </div>
          ))}
        </div>
      </div> {/* Closing product-list-container */}
      <div className="client-app-footer">
        <button className="order-button" onClick={() => setIsScanModalOpen(true)}>Заказать</button>
      </div>
      <ScanQrModal isOpen={isScanModalOpen} onClose={() => setIsScanModalOpen(false)} />
    </div>
  );
};

export default ClientAppPage;
