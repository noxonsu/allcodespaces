import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './ClientAppPage.css';
import ScanQrModal from './ScanQrModal';

const API_BASE_URL_RAW = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1';
const API_BASE_URL = API_BASE_URL_RAW.endsWith('/') ? API_BASE_URL_RAW.slice(0, -1) : API_BASE_URL_RAW;


interface MenuItem {
  id: string; // Changed from number
  name: string;
  image_filename: string | null; // Changed from image_url, added null
  price: number;
}

const ClientAppPage: React.FC = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({}); // Changed key type from number to string
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
        .then((data: any[] | any) => { // Changed MenuItem[] to any[] as API data structure differs initially
          if (Array.isArray(data)) {
            const validMenuItems = data.filter(
              (item): item is { id: string; name: string; image_filename: string | null; price: number } => // Type guard
                item && typeof item.id === 'string' && item.id.length > 0 && // Validate string ID
                typeof item.name === 'string' &&
                (typeof item.image_filename === 'string' || item.image_filename === null) &&
                typeof item.price === 'number' && !isNaN(item.price)
            ).map(item => ({ // Ensure structure matches MenuItem
                id: item.id,
                name: item.name,
                image_filename: item.image_filename,
                price: item.price
            })) as MenuItem[];

            setMenuItems(validMenuItems);
            const initialQuantities = validMenuItems.reduce((acc, item) => {
              acc[item.id] = 0; // item.id is now a string
              return acc;
            }, {} as Record<string, number>); // Key type is string
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

  const handleQuantityChange = (itemId: string, delta: number) => { // itemId is now string
    setQuantities((prev: Record<string, number>) => ({ // Record key type is string
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
      .map(([itemId, quantity]) => { // itemIdStr renamed to itemId, it's already a string (UUID)
        // console.log(`Processing itemId: '${itemId}' for order.`); // No longer need parseInt
        // const itemIdNum = parseInt(itemIdStr, 10); // REMOVED: No longer parsing UUID to int

        // if (isNaN(itemIdNum)) { // REMOVED
        //   console.error(`Failed to parse itemId from string: '${itemIdStr}'. Skipping this item.`);
        //   return null;
        // }

        const menuItem = menuItems.find(item => item.id === itemId); // Direct string comparison
        if (!menuItem) {
          console.error(`Menu item with id ${itemId} not found in current menuItems state.`);
          console.log("Current menuItems (IDs only):", JSON.stringify(menuItems.map(mi => mi.id)));
          console.log("Current quantities:", JSON.stringify(quantities));
          return null;
        }
        return {
          menu_item_id: itemId, // itemId is now a string (UUID)
          name_snapshot: menuItem.name,
          quantity: quantity as number,
          price_snapshot: menuItem.price,
        };
      })
      .filter(item => item !== null) as { menu_item_id: string; name_snapshot: string; quantity: number; price_snapshot: number }[]; // menu_item_id is string

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
        const resetQuantities = menuItems.reduce((acc: Record<string, number>, item: MenuItem) => { // Record key type is string
            acc[item.id] = 0; // item.id is string
            return acc;
          }, {} as Record<string, number>); // Record key type is string
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
                {item.image_filename && <img src={`${API_BASE_URL}${item.image_filename.startsWith('/') ? item.image_filename : `/${item.image_filename}`}`} alt={item.name} className="product-image" />}
                {!item.image_filename && <div className="product-image-placeholder">Image not available</div>}
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
