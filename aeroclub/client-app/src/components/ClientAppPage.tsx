import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './ClientAppPage.css';
import ScanQrModal from './ScanQrModal';

const API_BASE_URL_RAW = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1';
const API_BASE_URL = API_BASE_URL_RAW.endsWith('/') ? API_BASE_URL_RAW.slice(0, -1) : API_BASE_URL_RAW;


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
  const [rawStartParam, setRawStartParam] = useState<string | null>(null); // New state for raw start param

  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const locIdFromUrlStartApp = searchParams.get('startapp');
    const locIdFromUrlStart = searchParams.get('start'); // Fallback

    let effectiveStartParam: string | null = null;
    let source: string = "No start parameter found";

    // Priority 1: Telegram Mini App's start_param
    if (window.Telegram?.WebApp?.initDataUnsafe?.start_param) {
      effectiveStartParam = window.Telegram.WebApp.initDataUnsafe.start_param;
      source = "Telegram Mini App start_param";
    }
    // Priority 2: URL's 'startapp' parameter (for browser testing)
    else if (locIdFromUrlStartApp) {
      effectiveStartParam = locIdFromUrlStartApp;
      source = "URL 'startapp' parameter";
    }
    // Priority 3: URL's 'start' parameter (fallback for old links or direct testing)
    else if (locIdFromUrlStart) {
        effectiveStartParam = locIdFromUrlStart;
        source = "URL 'start' parameter (fallback)";
    }
    
    setRawStartParam(effectiveStartParam);

    if (effectiveStartParam) {
      console.log(`Processing startParam: '${effectiveStartParam}' from ${source}`);
      const parts = effectiveStartParam.split('__');
      // Assume the location ID is the last part after splitting by '__'
      // If no '__', it's the whole string.
      const idStrToParse = parts.length > 0 ? parts[parts.length - 1] : null;

      if (idStrToParse) {
        const parsedId = parseInt(idStrToParse, 10);
        if (!isNaN(parsedId)) {
          setLocationId(parsedId);
          console.log(`Successfully parsed locationId: ${parsedId} from segment '${idStrToParse}' (Source: ${source})`);
        } else {
          console.error(`Failed to parse numeric ID from segment: '${idStrToParse}' (Original startParam: '${effectiveStartParam}', Source: ${source})`);
          setLocationId(null);
        }
      } else {
        console.error(`Could not extract ID segment from startParam: '${effectiveStartParam}' (Source: ${source})`);
        setLocationId(null);
      }
    } else {
      console.log("No startParam found in Telegram context or URL ('startapp' or 'start').");
      setLocationId(null);
    }
  }, [location]);

  useEffect(() => {
    if (locationId && !isNaN(locationId)) {
      // Fetch location details to get number_id
      fetch(`${API_BASE_URL}/locations/${locationId}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data && typeof data.numeric_id !== 'undefined') {
            setLocationNumberId(data.numeric_id);
          } else {
            console.error('Error: numeric_id not found in location data:', data);
          }
        })
        .catch(error => console.error('Error fetching location details:', error));

      // Fetch menu for the location
      fetch(`${API_BASE_URL}/menu-items/locations/${locationId}/menu`)
        .then(response => {
          if (!response.ok) {
            console.error(`Error fetching menu items: ${response.status} ${response.statusText}`);
            return [];
          }
          return response.json();
        })
        .then((data: MenuItem[] | any) => {
          if (Array.isArray(data)) {
            const validMenuItems = data.filter(
              item => item && typeof item.id === 'number' && !isNaN(item.id)
            );
            setMenuItems(validMenuItems);
            const initialQuantities = validMenuItems.reduce((acc, item) => {
              acc[item.id] = 0; // item.id is now guaranteed to be a valid number
              return acc;
            }, {} as Record<number, number>);
            setQuantities(initialQuantities);
            if (data.length !== validMenuItems.length) {
              console.warn("Filtered out some invalid menu items from API response. Original data:", data);
            }
          } else {
            console.error('Received non-array data for menu items, setting to empty. Data:', data);
            setMenuItems([]);
          }
        })
        .catch(error => {
          console.error('Error fetching or parsing menu items:', error);
          setMenuItems([]);
        });
    }
  }, [locationId]);

  const handleQuantityChange = (itemId: number, delta: number) => {
    setQuantities((prev: Record<number, number>) => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta),
    }));
  };

  const handleOrder = () => {
    if (!locationId || isNaN(locationId)) {
      alert("Location ID is missing or invalid!");
      return;
    }

    const itemsToOrder = Object.entries(quantities)
      .filter(([_, quantity]) => (quantity as number) > 0)
      .map(([itemIdStr, quantity]) => {
        console.log(`Processing itemIdStr: '${itemIdStr}' for order.`);
        const itemId = parseInt(itemIdStr, 10);

        if (isNaN(itemId)) {
          console.error(`Failed to parse itemId from string: '${itemIdStr}'. Skipping this item.`);
          return null;
        }

        const menuItem = menuItems.find(item => item.id === itemId);
        if (!menuItem) {
          console.error(`Menu item with id ${itemId} (from key '${itemIdStr}') not found in current menuItems state.`);
          console.log("Current menuItems (IDs only):", JSON.stringify(menuItems.map(mi => mi.id)));
          console.log("Current quantities:", JSON.stringify(quantities));
          return null;
        }
        return {
          menu_item_id: itemId,
          name_snapshot: menuItem.name,
          quantity: quantity as number,
          price_snapshot: menuItem.price,
        };
      })
      .filter(item => item !== null) as { menu_item_id: number; name_snapshot: string; quantity: number; price_snapshot: number }[];

    if (itemsToOrder.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    const totalAmount = itemsToOrder.reduce((sum, item) => {
      return sum + item.price_snapshot * item.quantity;
    }, 0);

    const orderPayload = {
      location_id: locationId,
      items: itemsToOrder,
      total_amount: totalAmount,
    };

    fetch(`${API_BASE_URL}/orders/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })
    .then(async response => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to parse error response" }));
        console.error('Error placing order:', errorData);
        const errorMessage = errorData.detail || `Failed to place order. Status: ${response.status}`;
        alert(errorMessage);
        throw new Error(errorMessage);
      }
      return response.json();
    })
    .then(data => {
      console.log("Order successful:", data);
      setIsScanModalOpen(true); // Открываем модалку QR
    })
    .catch(error => {
      console.error('Caught error in order promise chain:', error);
      // Alert уже должен был быть показан в .then(async response => ...)
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

  if (locationId === null || isNaN(locationId)) {
    const message = rawStartParam === null || typeof rawStartParam === 'undefined' || rawStartParam.trim() === ''
      ? "Location ID is missing. Please ensure 'start' parameter is provided in the URL (e.g., ?start=123) or via Telegram Mini App start_param."
      : `Invalid or missing Location ID. Received: '${rawStartParam}'. Please provide a valid numeric ID.`;
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        {message}
      </div>
    );
  }

  return (
    <div className="client-app-page">
      <h1>Меню (Локация #{locationNumberId})</h1>
      <div className="product-list-container">
        <div className="product-list">
          {menuItems.map((item: MenuItem) => (
            <div key={item.id} className="product-card">
              <div className="product-image-container">
                {item.image_url && <img src={`${API_BASE_URL}${item.image_url.startsWith('/') ? item.image_url : `/${item.image_url}`}`} alt={item.name} className="product-image" />}
                {!item.image_url && <div className="product-image-placeholder">Image not available</div>}
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
