import React, { useState, useEffect, useCallback } from 'react';
import './AdminPage.css';
import { API_BASE_URL } from '../apiConfig';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import SuccessModal from './SuccessModal';
import EditDrinkModal from './EditDrinkModal';
import OrderInfoModal from './OrderInfoModal';
import ConfirmStatusChangeModal from './ConfirmStatusChangeModal';
import EditUserModal from './EditUserModal';

import AdminSidebar from './admin_tabs/AdminSidebar';
import UsersTab from './admin_tabs/UsersTab';
import EditMenuTab from './admin_tabs/EditMenuTab';
import OrdersTab from './admin_tabs/OrdersTab';
import ScalingTab from './admin_tabs/ScalingTab';

import {
  FrontendMenuItem,
  User,
  Order,
  ScalingLocation,
  ColorPalette,
  FigmaColorToCssFunc,
  AdminTabId
} from './admin_tabs/types';


const figmaColorToCss: FigmaColorToCssFunc = (color) => {
  const { r, g, b, a = 1 } = color;
  const R = Math.max(0, Math.min(1, r));
  const G = Math.max(0, Math.min(1, g));
  const B = Math.max(0, Math.min(1, b));
  const A = Math.max(0, Math.min(1, a));
  return `rgba(${Math.round(R * 255)}, ${Math.round(G * 255)}, ${Math.round(B * 255)}, ${A})`;
};


const AdminPage: React.FC = () => {
  const colors: ColorPalette = {
    background: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
    textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
    textLight: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }),
    accentRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }),
    white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
    buttonDark: figmaColorToCss({ r: 0.3294117748737335, g: 0.35686275362968445, b: 0.3686274588108063 }),
    orangeButton: figmaColorToCss({ r: 0.9803921580314636, g: 0.6901960968971252, b: 0.019607843831181526 }),
  };

  const getTabFromHash = (): AdminTabId => {
    const hash = window.location.hash.replace('#', '');
    if (['users', 'editMenu', 'orders', 'scaling'].includes(hash)) {
      return hash as AdminTabId;
    }
    return 'orders'; // Default tab
  };

  const [activeTab, setActiveTab] = useState<AdminTabId>(getTabFromHash());
  const [users, setUsers] = useState<User[]>([]);
  const [menuItems, setMenuItems] = useState<FrontendMenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [scalingLocations, setScalingLocations] = useState<ScalingLocation[]>([]);
  
  const [selectedLocationEdit, /* setSelectedLocationEdit */] = useState<string>(""); // setSelectedLocationEdit закомментирован


  // States for modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FrontendMenuItem | User | ScalingLocation | null>(null);
  const [deleteItemType, setDeleteItemType] = useState<'drink' | 'user' | 'location' | null>(null);

  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<FrontendMenuItem | null>(null);

  const [isOrderInfoModalOpen, setIsOrderInfoModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [isConfirmStatusChangeModalOpen, setIsConfirmStatusChangeModalOpen] = useState(false);
  const [orderIdToChangeStatus, setOrderIdToChangeStatus] = useState<string | null>(null);

  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);

  const openSuccessModal = (message: string) => {
    setSuccessModalMessage(message);
    setIsSuccessModalOpen(true);
  };

  const fetchUsers = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { console.error("No access token found"); return; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setUsers(await response.json());
      else { console.error("Failed to fetch users:", response.statusText); setUsers([]); }
    } catch (error) { console.error("Error fetching users:", error); setUsers([]); }
  }, []);

  const fetchOrders = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { console.error("No access token found for fetching orders."); setOrders([]); return; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/orders/`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        const formattedOrders = data.map((order: any) => ({
          id: order.id,
          dateTime: new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' |'),
          location: order.location_name || 'Не указана',
          spot: order.spot_name || 'Не указано',
          items: order.items.map((item: any) => ({ name: item.menu_item_name, quantity: item.quantity })),
          status: order.status || 'pending',
          createdAt: new Date(order.created_at), // Добавляем поле для сортировки
        })).sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime()); // Сортируем по убыванию даты создания
        setOrders(formattedOrders);
      } else { console.error("Failed to fetch orders:", response.statusText); setOrders([]); }
    } catch (error) { console.error("Error fetching orders:", error); setOrders([]); }
  }, []);

  const fetchScalingLocations = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/locations/`, { headers: { ...(token && { 'Authorization': `Bearer ${token}` }) } });
      if (response.ok) {
        const data = await response.json();
        setScalingLocations(data.map((loc: any) => ({ id: loc.id, address: loc.name || loc.address || `Локация ${loc.id}` })));
      } else { console.error("Failed to fetch scaling locations:", response.statusText); setScalingLocations([]); }
    } catch (error) { console.error("Error fetching scaling locations:", error); setScalingLocations([]); }
  }, []);

  const fetchMenuItems = useCallback(async (locationId?: string | null) => {
    const token = localStorage.getItem('accessToken');
    let url = `${API_BASE_URL}/api/v1/menu-items/`;
    if (locationId) url += `?location_id=${locationId}`;
    try {
      const response = await fetch(url, { headers: { ...(token && { 'Authorization': `Bearer ${token}` }) } });
      if (response.ok) setMenuItems(await response.json());
      else { console.error("Failed to fetch menu items:", response.statusText); setMenuItems([]); }
    } catch (error) { console.error("Error fetching menu items:", error); setMenuItems([]); }
  }, []);

  useEffect(() => {
    const handleHashChange = () => setActiveTab(getTabFromHash());
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); 

    fetchUsers();
    fetchOrders();
    fetchScalingLocations();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [fetchUsers, fetchOrders, fetchScalingLocations]);
  
  useEffect(() => {
    if (activeTab === 'editMenu') {
      fetchMenuItems(selectedLocationEdit || undefined);
    }
  }, [activeTab, selectedLocationEdit, fetchMenuItems]);


  const handleTabClick = (tab: AdminTabId) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
  };

  const handleOpenDeleteDrinkModal = (item: FrontendMenuItem) => { setItemToDelete(item); setDeleteItemType('drink'); setIsDeleteModalOpen(true); };
  const handleOpenEditDrinkModal = (item: FrontendMenuItem) => { setItemToEdit(item); setIsEditModalOpen(true); };
  const handleOpenDeleteUserModal = (user: User) => { setItemToDelete(user); setDeleteItemType('user'); setIsDeleteModalOpen(true); };
  const handleOpenEditUserModal = (user: User) => { setUserToEdit(user); setIsEditUserModalOpen(true); };
  const handleOpenDeleteLocationModal = (location: ScalingLocation) => { setItemToDelete(location); setDeleteItemType('location'); setIsDeleteModalOpen(true); };
  const handleOpenConfirmStatusChangeModal = (orderId: string) => { setOrderIdToChangeStatus(orderId); setIsConfirmStatusChangeModalOpen(true); };


  const handleSaveEditedDrink = async (updatedData: { id: string; name: string; /* price: number; */ newImageFile?: File; currentImageFilename: string | null; }) => {
    const token = localStorage.getItem('accessToken');
    if (!token) { alert("Ошибка авторизации."); return; }
    const formData = new FormData();
    formData.append('name', updatedData.name);
    // formData.append('price', updatedData.price.toString()); // Цена удалена
    if (updatedData.newImageFile) formData.append('image', updatedData.newImageFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/menu-items/${updatedData.id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      if (response.ok) {
        const updatedItem = await response.json();
        openSuccessModal(`Напиток "${updatedItem.name}" успешно обновлен.`);
        fetchMenuItems(selectedLocationEdit || undefined);
      } else {
        const errData = await response.json().catch(() => ({ detail: `Failed to update menu item. Status: ${response.status}` }));
        throw new Error(errData.detail);
      }
    } catch (error: any) {
      console.error("Error updating menu item:", error);
      alert(`Ошибка обновления напитка: ${error.message}`);
    } finally {
      setIsEditModalOpen(false); setItemToEdit(null);
    }
  };

  const handleOpenOrderInfoModal = async (orderId: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) { alert("Ошибка авторизации."); return; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/orders/${orderId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const orderData = await response.json();
        const formattedOrder: Order = {
          id: orderData.id,
          dateTime: new Date(orderData.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' |'),
          location: orderData.location_name || 'Не указана',
          spot: orderData.spot_name || 'Не указано',
          items: orderData.items.map((item: any) => ({ name: item.menu_item_name, quantity: item.quantity })),
          status: orderData.status,
        };
        setSelectedOrder(formattedOrder);
        setIsOrderInfoModalOpen(true);
      } else {
        const errorData = await response.json();
        alert(`Ошибка загрузки данных заказа: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error("Error fetching order details:", error);
      alert("Произошла ошибка при загрузке деталей заказа.");
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) { alert("Ошибка авторизации."); return; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/orders/${orderId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ status: newStatus }) });
      if (response.ok) {
        setIsConfirmStatusChangeModalOpen(false); // Закрыть модальное окно подтверждения
        openSuccessModal(`Статус заказа #${orderId} успешно обновлен на "${newStatus}".`);
        setIsOrderInfoModalOpen(false);
        fetchOrders();
      } else {
        const errorData = await response.json();
        alert(`Ошибка обновления статуса заказа: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      alert("Произошла ошибка при обновлении статуса заказа.");
    }
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete || !deleteItemType) return;
    const token = localStorage.getItem('accessToken');
    if (!token) { alert("Ошибка авторизации."); setIsDeleteModalOpen(false); return; }

    let url = '';
    let itemName = '';

    if (deleteItemType === 'drink' && 'id' in itemToDelete && 'name' in itemToDelete) {
      url = `${API_BASE_URL}/api/v1/menu-items/${itemToDelete.id}`;
      itemName = itemToDelete.name;
    } else if (deleteItemType === 'user' && 'id' in itemToDelete && 'login' in itemToDelete) {
      url = `${API_BASE_URL}/api/v1/users/${itemToDelete.id}`;
      itemName = itemToDelete.login;
    } else if (deleteItemType === 'location' && 'id' in itemToDelete && 'address' in itemToDelete) {
      url = `${API_BASE_URL}/api/v1/locations/${itemToDelete.id}`;
      itemName = itemToDelete.address;
    } else {
      console.error("Invalid item or type for deletion", itemToDelete, deleteItemType);
      setIsDeleteModalOpen(false);
      return;
    }

    try {
      const response = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (response.status === 204) {
        openSuccessModal(`${deleteItemType.charAt(0).toUpperCase() + deleteItemType.slice(1)} "${itemName}" успешно удален(а).`);
        if (deleteItemType === 'drink') fetchMenuItems(selectedLocationEdit || undefined);
        else if (deleteItemType === 'user') fetchUsers();
        else if (deleteItemType === 'location') fetchScalingLocations();
      } else {
        const errData = await response.json().catch(() => ({ detail: `Failed to delete. Status: ${response.status}` }));
        throw new Error(errData.detail);
      }
    } catch (error: any) {
      console.error(`Error deleting ${deleteItemType}:`, error);
      alert(`Ошибка удаления: ${error.message}`);
    } finally {
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      setDeleteItemType(null);
    }
  };

  const handleSaveEditedUser = async (userId: string, newLogin: string, newPassword?: string, newLocationId?: string | null) => {
    const token = localStorage.getItem('accessToken');
    if (!token) { alert("Ошибка авторизации."); return; }

    const payload: { login: string; password?: string; location_id?: string | null } = { login: newLogin };
    if (newPassword) {
      payload.password = newPassword;
    }
    payload.location_id = newLocationId; // Can be null to unset location

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        openSuccessModal(`Пользователь "${newLogin}" успешно обновлен.`);
        fetchUsers();
      } else {
        const errData = await response.json().catch(() => ({ detail: `Failed to update user. Status: ${response.status}` }));
        throw new Error(errData.detail);
      }
    } catch (error: any) {
      console.error("Error updating user:", error);
      alert(`Ошибка обновления пользователя: ${error.message}`);
    } finally {
      setIsEditUserModalOpen(false);
      setUserToEdit(null);
    }
  };
  
  return (
    <div className="admin-page" style={{ backgroundColor: colors.white }}>
      <AdminSidebar
        activeTab={activeTab}
        onTabClick={handleTabClick}
        onLogout={handleLogout}
        colors={colors}
      />

      <main className="main-content" style={{ backgroundColor: colors.white }}>
        {activeTab === 'users' && (
          <UsersTab
            users={users}
            scalingLocations={scalingLocations}
            fetchUsers={fetchUsers}
            onOpenDeleteUserModal={handleOpenDeleteUserModal}
            onOpenEditUserModal={handleOpenEditUserModal}
            openSuccessModal={openSuccessModal}
            colors={colors}
          />
        )}
        {activeTab === 'editMenu' && (
          <EditMenuTab
            menuItems={menuItems}
            scalingLocations={scalingLocations}
            fetchMenuItems={fetchMenuItems}
            onOpenDeleteDrinkModal={handleOpenDeleteDrinkModal}
            onOpenEditDrinkModal={handleOpenEditDrinkModal}
            openSuccessModal={openSuccessModal}
            colors={colors}
          />
        )}
        {activeTab === 'orders' && (
          <OrdersTab
            orders={orders}
            scalingLocations={scalingLocations} 
            onOpenOrderInfoModal={handleOpenOrderInfoModal}
            onOpenConfirmStatusChangeModal={handleOpenConfirmStatusChangeModal}
          />
        )}
        {activeTab === 'scaling' && (
          <ScalingTab
            scalingLocations={scalingLocations}
            fetchScalingLocations={fetchScalingLocations}
            onDeleteLocation={handleOpenDeleteLocationModal}
            openSuccessModal={openSuccessModal}
            colors={colors}
            figmaColorToCss={figmaColorToCss}
          />
        )}
      </main>

      {itemToDelete && (deleteItemType === 'drink' || deleteItemType === 'user' || deleteItemType === 'location') && (
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          onClose={() => { setIsDeleteModalOpen(false); setItemToDelete(null); setDeleteItemType(null); }}
          onConfirm={confirmDeleteItem}
          itemName={
            (itemToDelete as any)?.name || (itemToDelete as any)?.login || (itemToDelete as any)?.address || 'элемент'
          }
          itemType={deleteItemType}
        />
      )}

      <SuccessModal 
        isOpen={isSuccessModalOpen} 
        onClose={() => setIsSuccessModalOpen(false)} 
        message={successModalMessage} 
      />

      {itemToEdit && ( 
        <EditDrinkModal 
          isOpen={isEditModalOpen} 
          onClose={() => { setIsEditModalOpen(false); setItemToEdit(null); }} 
          onSave={handleSaveEditedDrink} 
          drink={itemToEdit} 
        /> 
      )}
      
      {selectedOrder && ( 
        <OrderInfoModal 
          isOpen={isOrderInfoModalOpen} 
          onClose={() => { setIsOrderInfoModalOpen(false); setSelectedOrder(null); }} 
          order={selectedOrder} 
          onUpdateStatus={handleUpdateOrderStatus} 
        /> 
      )}

      {orderIdToChangeStatus && (
        <ConfirmStatusChangeModal
          isOpen={isConfirmStatusChangeModalOpen}
          onClose={() => { setIsConfirmStatusChangeModalOpen(false); setOrderIdToChangeStatus(null); }}
          onConfirm={handleUpdateOrderStatus}
          orderId={orderIdToChangeStatus}
        />
      )}

      {userToEdit && (
        <EditUserModal
          isOpen={isEditUserModalOpen}
          onClose={() => { setIsEditUserModalOpen(false); setUserToEdit(null); }}
          user={userToEdit}
          scalingLocations={scalingLocations}
          onSave={handleSaveEditedUser}
        />
      )}
    </div>
  );
};

export default AdminPage;
