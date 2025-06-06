import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './ClientAppPage.css';
import ScanQrModal from './ScanQrModal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1';


interface MenuItem {
  id: number;
  name: string;
  image_url: string;
  price: number;
}

const ClientAppPage: React.FC = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locationNumberId, setLocationNumberId] = useState<number | null>(null);

  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const locId = searchParams.get('location_id');

    // Fallback for Telegram Mini App
    if (!locId && window.Telegram?.WebApp?.initDataUnsafe?.start_param) {
      const startParam = window.Telegram.WebApp.initDataUnsafe.start_param;
      // Assuming the start_param is the location_id
      setLocationId(parseInt(startParam, 10));
    } else if (locId) {
      setLocationId(parseInt(locId, 10));
    }

  }, [location]);

  useEffect(() => {
    if (locationId) {
      // Fetch location details to get number_id
      fetch(`${API_BASE_URL}/locations/${locationId}`)
        .then(response => response.json())
        .then(data => {
          setLocationNumberId(data.number_id);
        })
        .catch(error => console.error('Error fetching location details:', error));

      // Fetch menu for the location
      fetch(`${API_BASE_URL}/locations/${locationId}/menu_items`)
        .then(response => response.json())
        .then((data: MenuItem[]) => {
          setMenuItems(data);
          const initialQuantities = data.reduce((acc, item) => {
            acc[item.id] = 0;
            return acc;
          }, {} as Record<number, number>);
          setQuantities(initialQuantities);
        })
        .catch(error => console.error('Error fetching menu items:', error));
    }
  }, [locationId]);

  const handleQuantityChange = (itemId: number, delta: number) => {
    setQuantities((prev: Record<number, number>) => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta),
    }));
  };

  const handleOrder = () => {
    if (!locationId) {
      alert("Location ID is missing!");
      return;
    }

    const orderItems = Object.entries(quantities)
      .filter(([_, quantity]) => (quantity as number) > 0)
      .map(([itemId, quantity]) => ({
        menu_item_id: parseInt(itemId, 10),
        quantity: quantity as number,
      }));

    if (orderItems.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    fetch(`${API_BASE_URL}/orders/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_id: locationId,
        items: orderItems,
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.id) {
        // Order successful
        setIsScanModalOpen(true);
      } else {
        // Handle error
        alert("Failed to place order.");
      }
    })
    .catch(error => {
      console.error('Error placing order:', error);
      alert("An error occurred while placing the order.");
    });
  };
  
  const handleQrScan = (scannedData: string | null) => {
    if (scannedData) {
      const scannedNumberId = parseInt(scannedData, 10);
      if (scannedNumberId === locationNumberId) {
        alert("QR Code matched! Order confirmed.");
        setIsScanModalOpen(false);
        // Reset quantities or navigate away
        const resetQuantities = menuItems.reduce((acc: Record<number, number>, item: MenuItem) => {
            acc[item.id] = 0;
            return acc;
          }, {} as Record<number, number>);
        setQuantities(resetQuantities);
      } else {
        alert(`QR Code mismatch. Expected ${locationNumberId}, but got ${scannedNumberId}.`);
      }
    }
  };

  if (!locationId) {
    return <div>Loading or Invalid Location...</div>;
  }

  return (
    <div className="client-app-page">
      <h1>Меню (Локация #{locationNumberId})</h1>
      <div className="product-list-container">
        <div className="product-list">
          {menuItems.map((item: MenuItem) => (
            <div key={item.id} className="product-card">
              <div className="product-image-container">
                <img src={`${API_BASE_URL}${item.image_url}`} alt={item.name} className="product-image" />
                <div className="image-gradient-overlay"></div>
                <div className="product-name">{item.name}</div>
              </div>
              <div className="product-controls">
                <button 
                  onClick={() => handleQuantityChange(item.id, -1)}
                  disabled={(quantities[item.id] || 0) === 0}
                >
                  -
                </button>
                <input 
                  type="text" 
                  value={quantities[item.id] || 0} 
                  readOnly 
                />
                <button onClick={() => handleQuantityChange(item.id, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="client-app-footer">
        <button className="order-button" onClick={handleOrder}>Заказать</button>
      </div>
      <ScanQrModal 
        isOpen={isScanModalOpen} 
        onClose={() => setIsScanModalOpen(false)}
        onScan={handleQrScan}
      />
    </div>
  );
};

export default ClientAppPage;
