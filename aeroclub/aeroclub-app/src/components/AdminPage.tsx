import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPage.css';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import SuccessModal from './SuccessModal';
import EditDrinkModal from './EditDrinkModal';
import OrderInfoModal from './OrderInfoModal'; // Will create this component next
import { UserIcon, EditMenuIcon, OrdersIcon, ScalingGridIcon } from './icons';
import { LogoIcon } from './LogoIcon';

// Helper function
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  const R = Math.max(0, Math.min(1, r));
  const G = Math.max(0, Math.min(1, g));
  const B = Math.max(0, Math.min(1, b));
  const A = Math.max(0, Math.min(1, a));
  return `rgba(${Math.round(R * 255)}, ${Math.round(G * 255)}, ${Math.round(B * 255)}, ${A})`;
};

type AdminTab = 'users' | 'editMenu' | 'orders' | 'scaling';

interface Product { name: string; imgFileName: string; }
interface User { id: string; login: string; password?: string; location: string; }
interface OrderItem { name: string; quantity: number; }
interface ScalingLocation { id: string; address: string; }
interface Order {
  id: string;
  dateTime: string;
  location: string;
  spot: string;
  items: OrderItem[];
  status?: string;
}

const AdminPage: React.FC = () => {
  const colors = {
    background: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
    textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
    textLight: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }),
    accentRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }),
    white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
    buttonDark: figmaColorToCss({ r: 0.3294117748737335, g: 0.35686275362968445, b: 0.3686274588108063}),
    orangeButton: figmaColorToCss({ r: 0.9803921580314636, g: 0.6901960968971252, b: 0.019607843831181526 }), // #FAB005
  };

  const getTabFromHash = (): AdminTab => {
    const hash = window.location.hash.replace('#', '');
    if (['users', 'editMenu', 'orders', 'scaling'].includes(hash)) {
      return hash as AdminTab;
    }
    return 'orders'; // Default tab
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getTabFromHash());

  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(getTabFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    // Set initial tab based on hash
    handleHashChange();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleTabClick = (tab: AdminTab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  const [selectedLocationUpload, setSelectedLocationUpload] = useState("taganrog_gorkogo_3");
  const [selectedLocationEdit, setSelectedLocationEdit] = useState("");
  const [newDrinkName, setNewDrinkName] = useState("");
  const [fileName, setFileName] = useState("");

  const [newUserLogin, setNewUserLogin] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserLocation, setNewUserLocation] = useState("");

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Product | User | ScalingLocation | null>(null);
  const [deleteItemType, setDeleteItemType] = useState<'drink' | 'user' | 'location' | null>(null);

  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Product | User | null>(null);
  const [editItemType, setEditItemType] = useState<'drink' | 'user' | null>(null);

  const [isOrderInfoModalOpen, setIsOrderInfoModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [newScalingLocationParent, setNewScalingLocationParent] = useState("");
  const [newScalingLocationName, setNewScalingLocationName] = useState("");

  const locations = [
    { value: "", label: "Выберите локацию" },
    { value: "taganrog_gorkogo_3", label: "г. Таганрог, Максима Горького, д. 3" },
    { value: "rostov_sadovaya_1", label: "г. Ростов-на-Дону, Садовая, д. 1" },
    { value: "moscow_tverskaya_12", label: "г. Москва, Тверская ул., д. 12" },
    { value: "spb_nevskiy_5", label: "г. Санкт-Петербург, Невский пр., д. 5" },
  ];

  const products: Product[] = [
    { name: 'Черный кофе', imgFileName: '2cd96672e2f5e16292666ec7a36d0b579a9dd662.png' },
    { name: 'Черный чай', imgFileName: '31b7a70c52a5896566545f27e523ca46d29663d6.png' },
    { name: 'Кофе с молоком', imgFileName: '8d89a25cc99599807fdb64a57bba2ccd79e35964.png' },
  ];
  
  const usersData: User[] = [
    { id: 'user1', login: 'Login-1', password: 'password-1', location: 'г. Таганрог, Максима Горького, д. 3' },
    { id: 'user2', login: 'Login-2', password: 'password-2', location: 'г. Москва, Тверская ул., д. 12' },
  ];

  const ordersData: Order[] = [
    { id: 'order1', dateTime: '07.05.2025 | 16:20', location: 'г. Таганрог, Максима Горького, д. 3', spot: 'место 124', items: [{name: 'Черный чай', quantity: 2}, {name: 'Вода без газа', quantity: 4}], status: 'pending' },
    { id: 'order2', dateTime: '07.05.2025 | 16:30', location: 'г. Москва, Тверская ул., д. 12', spot: 'место 123', items: [{name: 'Капучино', quantity: 1}], status: 'pending' },
    { id: 'order3', dateTime: '07.05.2025 | 16:45', location: 'г. Санкт-Петербург, Невский пр., д. 5', spot: 'место 125', items: [{name: 'Эспрессо', quantity:1}, {name: 'Латте', quantity:1}], status: 'pending' },
    { id: 'order4', dateTime: '07.05.2025 | 17:00', location: 'г. Казань, Баумана ул., д. 10', spot: 'место 126', items: [{name: 'Чай зеленый', quantity: 1}], status: 'pending' },
    { id: 'order5', dateTime: '07.05.2025 | 17:15', location: 'г. Екатеринбург, Ленина ул., д. 20', spot: 'место 127', items: [{name: 'Американо', quantity: 2}], status: 'pending' },
    { id: 'order6', dateTime: '07.05.2025 | 17:30', location: 'г. Новосибирск, Красный пр., д. 15', spot: 'место 128', items: [{name: 'Латте', quantity: 1}], status: 'pending' },
    { id: 'order7', dateTime: '07.05.2025 | 17:45', location: 'г. Ростов-на-Дону, Буденновский пр., д. 22', spot: 'место 129', items: [{name: 'Капучино', quantity: 1}], status: 'pending' },
    { id: 'order8', dateTime: '07.05.2025 | 18:00', location: 'г. Нижний Новгород, Горького ул., д. 7', spot: 'место 130', items: [{name: 'Эспрессо', quantity: 2}], status: 'pending' },
    { id: 'order9', dateTime: '07.05.2025 | 18:15', location: 'г. Челябинск, Тимирязева ул., д. 3', spot: 'место 131', items: [{name: 'Черный кофе', quantity: 1}], status: 'pending' },
    { id: 'order10', dateTime: '07.05.2025 | 18:30', location: 'г. Уфа, Проспект Октября, д. 11', spot: 'место 132', items: [{name: 'Вода без газа', quantity: 3}], status: 'pending' },
  ];

  const scalingLocationsData: ScalingLocation[] = [
    { id: 'loc1', address: 'г. Таганрог, Максима Горького, д. 3' },
    { id: 'loc2', address: 'г. Москва, Тверская ул., д. 12' },
    { id: 'loc3', address: 'г. Санкт-Петербург, Невский пр., д. 45' },
    { id: 'loc4', address: 'г. Казань, Баумана ул., д. 15' },
    { id: 'loc5', address: 'г. Екатеринбург, Ленина ул., д. 20' },
  ];

  const sidebarItemsDefinition: { name: string; id: AdminTab; IconComponent: React.FC<any> }[] = [
    { name: 'Пользователи', id: 'users', IconComponent: UserIcon },
    { name: 'Редактирование меню', id: 'editMenu', IconComponent: EditMenuIcon },
    { name: 'Текущие заказы', id: 'orders', IconComponent: OrdersIcon },
    { name: 'Масштабирование', id: 'scaling', IconComponent: ScalingGridIcon },
  ];

  const handleOpenDeleteDrinkModal = (product: Product) => { console.log("Delete drink:", product); setItemToDelete(product); setDeleteItemType('drink'); setIsDeleteModalOpen(true); };
  const handleOpenEditDrinkModal = (product: Product) => { console.log("Edit drink:", product); setItemToEdit(product); setEditItemType('drink'); setIsEditModalOpen(true); };
  const handleSaveEditedDrink = (data: {newName: string}) => { console.log('Saved drink:', data); setIsEditModalOpen(false); setItemToEdit(null); setEditItemType(null); setSuccessModalMessage(`Напиток "${data.newName}" успешно обновлен.`); setIsSuccessModalOpen(true);};
  
  const handleOpenOrderInfoModal = (order: Order) => { setSelectedOrder(order); setIsOrderInfoModalOpen(true); };

  const handleDownloadQrCode = (locationId: string) => {
    console.log(`Download QR code for location ${locationId}`);
    setSuccessModalMessage(`QR код для локации ${locationId} запрошен (логика загрузки не реализована).`);
    setIsSuccessModalOpen(true);
  };

  const handleDeleteLocation = (location: ScalingLocation) => {
    console.log(`Attempting to delete location ${location.id}`);
    setItemToDelete(location);
    setDeleteItemType('location');
    setIsDeleteModalOpen(true);
  };

  const handleGenerateQrCode = () => {
    if (!newScalingLocationName) {
      alert("Название локации не может быть пустым.");
      return;
    }
    console.log(`Generate QR code for new location: Parent - ${newScalingLocationParent || 'N/A'}, Name - ${newScalingLocationName}`);
    setSuccessModalMessage(`QR код для новой локации "${newScalingLocationName}" сгенерирован (логика не реализована).`);
    setIsSuccessModalOpen(true);
    setNewScalingLocationParent("");
    setNewScalingLocationName("");
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      let itemName = '';
      let itemTypeMessage = '';

      if (deleteItemType === 'drink' && 'name' in itemToDelete) {
        itemName = itemToDelete.name;
        itemTypeMessage = 'Напиток';
      } else if (deleteItemType === 'user' && 'login' in itemToDelete) {
        itemName = itemToDelete.login;
        itemTypeMessage = 'Пользователь';
      } else if (deleteItemType === 'location' && 'address' in itemToDelete) {
        itemName = itemToDelete.address;
        itemTypeMessage = 'Локация';
      }

      if (itemName && itemTypeMessage) {
        console.log(`${itemTypeMessage} "${itemName}" confirmed for deletion.`);
        setSuccessModalMessage(`${itemTypeMessage} "${itemName}" успешно удален.`);
        setIsSuccessModalOpen(true);
      } else {
        console.error("Item to delete or its properties are not correctly set.", itemToDelete, deleteItemType);
      }
    }
    setIsDeleteModalOpen(false); setItemToDelete(null); setDeleteItemType(null);
  };

  const handleSaveChangesForm = (formName: string) => {
    console.log(`Saving changes for ${formName}`);
    setSuccessModalMessage("Изменения успешно сохранены!");
    setIsSuccessModalOpen(true);
    if (formName === 'uploadDrinks') { setNewDrinkName(""); setFileName(""); }
  };

  return (
    <div className="admin-page" style={{ backgroundColor: colors.white }}>
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
                    backgroundColor: isActive ? colors.accentRed : colors.white, 
                    color: isActive ? colors.white : colors.textLight,
                    display: 'flex', 
                    alignItems: 'center',
                    padding: '12px 20px',
                  }} 
                  onClick={() => handleTabClick(item.id)}
                >
                  <item.IconComponent color={iconColor} size={24} style={{ marginRight: '12px' }} />
                  <span>{item.name}</span>
                </li>
              );
            })}
             <li 
              className="sidebar-item client-app-link"
              style={{
                backgroundColor: colors.white, 
                color: colors.textLight,
                display: 'flex', 
                alignItems: 'center',
                padding: '12px 20px',
                marginTop: '20px', // Add some space above the link
              }}
            >
              <Link to="/client" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', width: '100%' }}>
                {/* Optional: Add an icon for the client app link if desired */}
                <span style={{ fontSize: '12px' }}>Client App</span>
              </Link>
            </li>
          </ul>
        </nav>
        <div className="user-profile"><p style={{ color: colors.textDark, fontSize: '20px' }}>Иванов И.И.</p><button className="logout-button" style={{ backgroundColor: colors.textLight, color: colors.white }}>Выход</button></div>
      </aside>

      <main className="main-content" style={{ backgroundColor: colors.white }}>
        {activeTab === 'editMenu' && (
          <>
            <div className="content-section upload-drinks">
              <h2 style={{ color: colors.textDark }}>Загрузить новые напитки</h2>
              <div className="form-container" style={{ backgroundColor: colors.background }}>
                <div className="form-row">
                  <div className="form-group">
                    <label style={{ color: colors.textLight }}>Локация</label>
                    <div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white }}>
                      <select value={selectedLocationUpload} onChange={(e) => setSelectedLocationUpload(e.target.value)} style={{ color: colors.textDark }}>{locations.map(loc => (<option key={loc.value} value={loc.value}>{loc.label}</option>))}</select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label style={{ color: colors.textLight }}>Название нового напитка</label>
                    <div className="input-wrapper" style={{ backgroundColor: colors.white }}><input type="text" placeholder="Название" value={newDrinkName} onChange={(e) => setNewDrinkName(e.target.value)} style={{ color: colors.textDark }} /></div>
                  </div>
                  <div className="form-group">
                    <label style={{ color: colors.textLight }}>Изображение</label>
                    <div className="input-wrapper file-input-wrapper" style={{ backgroundColor: colors.white }}>
                      <label htmlFor="fileUpload" style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer', paddingLeft: 0, marginBottom: 0 }}>
                        <span className="icon-placeholder" style={{ color: colors.accentRed }}>📎</span><span style={{ color: colors.textDark, marginLeft: '8px' }}>{fileName || "Выберите файл"}</span>
                      </label>
                      <input type="file" style={{ display: 'none' }} id="fileUpload" onChange={(e) => setFileName(e.target.files && e.target.files.length > 0 ? e.target.files[0].name : "Выберите файл")} />
                    </div>
                  </div>
                </div>
                <div className="form-actions"><button className="save-button" style={{ backgroundColor: colors.accentRed, color: colors.white }} onClick={() => handleSaveChangesForm('uploadDrinks')}>Сохранить изменения</button><button className="cancel-button" style={{ backgroundColor: colors.textLight, color: colors.white }}>Отмена</button></div>
              </div>
            </div>
            <div className="content-section edit-menu">
              <h2 style={{ color: colors.textDark }}>Редактировать меню</h2>
              <div className="menu-container" style={{ backgroundColor: colors.background }}>
                <div className="form-group location-filter">
                  <label style={{ color: colors.textLight }}>Локация</label>
                  <div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white, width: '364px' }}>
                    <select value={selectedLocationEdit} onChange={(e) => setSelectedLocationEdit(e.target.value)} style={{ color: colors.textDark }}>{locations.map(loc => (<option key={loc.value} value={loc.value}>{loc.label}</option>))}</select>
                  </div>
                </div>
                {selectedLocationEdit ? (<div className="product-grid">{products.map((product) => (<div key={product.imgFileName} className="product-card" style={{ backgroundColor: colors.white }}><div className="product-card-image-name"><img src={`${process.env.PUBLIC_URL}/images/${product.imgFileName}`} alt={product.name} className="product-image" /><span className="product-name" style={{ color: colors.textDark }}>{product.name}</span></div><div className="product-card-actions"><button className="icon-button" style={{ backgroundColor: colors.background }} onClick={() => handleOpenEditDrinkModal(product)}><span className="icon-placeholder" style={{color: colors.textLight}}>✏️</span></button><button className="icon-button" style={{ backgroundColor: colors.background }} onClick={() => handleOpenDeleteDrinkModal(product)}><span className="icon-placeholder" style={{color: colors.accentRed}}>🗑️</span></button></div></div>))}</div>) : (<div className="product-grid-placeholder"></div>)}
                <div className="form-actions menu-actions"><button className="save-button" style={{ backgroundColor: colors.accentRed, color: colors.white }} onClick={() => handleSaveChangesForm('editMenu')}>Сохранить изменения</button><button className="cancel-button" style={{ backgroundColor: colors.textLight, color: colors.white }}>Отмена</button></div>
              </div>
            </div>
          </>
        )}
        {activeTab === 'users' && (
          <div className="content-section users-section">
            <h2 style={{ color: colors.textDark }}>Пользователи</h2>
            <div className="users-list-container">
              <div className="user-list-header"><span className="user-col-login">Логин</span><span className="user-col-password">Пароль</span><span className="user-col-location">Локация</span><span className="user-col-actions">Действия</span></div>
              {usersData.map(user => (<div key={user.id} className="user-list-row"><span className="user-col-login">{user.login}</span><span className="user-col-password">{user.password}</span> <span className="user-col-location">{user.location}</span><div className="user-col-actions user-actions"><button className="action-button edit">✏️ Редактировать</button><button className="action-button delete">🗑️ Удалить</button></div></div>))}
            </div>
            <h2 style={{ color: colors.textDark, marginTop: '40px' }}>Создать нового пользователя</h2>
            <div className="form-container create-user-form" style={{ backgroundColor: colors.background }}>
              <div className="form-row">
                <div className="form-group"><label style={{ color: colors.textLight }}>Логин</label><div className="input-wrapper" style={{ backgroundColor: colors.white }}><input type="text" placeholder="Логин" value={newUserLogin} onChange={(e) => setNewUserLogin(e.target.value)} style={{ color: colors.textDark }} /></div></div>
                <div className="form-group"><label style={{ color: colors.textLight }}>Пароль</label><div className="input-wrapper" style={{ backgroundColor: colors.white }}><input type="password" placeholder="Пароль" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} style={{ color: colors.textDark }} /></div></div>
                <div className="form-group"><label style={{ color: colors.textLight }}>Локация</label><div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white }}><select value={newUserLocation} onChange={(e) => setNewUserLocation(e.target.value)} style={{ color: colors.textDark }}>{locations.map(loc => (<option key={loc.value} value={loc.value}>{loc.label}</option>))}</select></div></div>
              </div>
              <div className="form-actions"><button className="save-button" style={{ backgroundColor: colors.accentRed, color: colors.white, opacity: 0.4 }}>Создать пользователя</button></div>
            </div>
            <div className="form-actions page-actions" style={{marginTop: '40px', justifyContent: 'flex-start'}}><button className="save-button" style={{ backgroundColor: colors.accentRed, color: colors.white }} onClick={() => handleSaveChangesForm('usersPage')}>Сохранить изменения</button><button className="cancel-button" style={{ backgroundColor: colors.textLight, color: colors.white }}>Отмена</button></div>
          </div>
        )}
        {activeTab === 'orders' && (
          <div className="content-section orders-section">
            <h2 style={{ color: colors.textDark }}>Текущие заказы</h2>
            <div className="orders-filters">
              <div className="form-group"><label style={{color: colors.textLight}}>Дата/время</label><div className="input-wrapper select-wrapper" style={{backgroundColor: colors.white}}><select style={{color: colors.textDark}}><option>Все время</option></select></div></div>
              <div className="form-group"><label style={{color: colors.textLight}}>Локация</label><div className="input-wrapper select-wrapper" style={{backgroundColor: colors.white}}><select style={{color: colors.textDark}}>{locations.map(loc => (<option key={loc.value} value={loc.value}>{loc.label}</option>))}</select></div></div>
            </div>
            <div className="orders-list-container">
              <div className="order-list-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', marginBottom: '10px' }}>
                <span style={{ flex: 1, textAlign: 'left', color: colors.textLight }}>Дата/время</span>
                <span style={{ flex: 2, textAlign: 'left', color: colors.textLight }}>Локация | место</span>
                <span style={{ flex: 1, textAlign: 'right', color: colors.textLight }}>Действия</span>
              </div>
              {ordersData.map(order => (
                <div key={order.id} className="order-list-row" style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '10px 20px', 
                  borderBottom: `1px solid ${figmaColorToCss({r: 0.9, g: 0.9, b: 0.9})}` 
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
                      onClick={() => handleOpenOrderInfoModal(order)}
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
                    >
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: colors.white, // Or a lighter shade of orange if preferred
                        marginRight: '8px',
                        border: `1px solid ${colors.orangeButton}` // To make it visible if white on white
                      }}></span> Сменить статус
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'scaling' && (
          <div className="content-section scaling-section">
            <h2 style={{ color: colors.textDark, marginBottom: '20px' }}>Список существующих локаций</h2>
            <div className="scaling-locations-list" style={{ backgroundColor: colors.background, padding: '20px', borderRadius: '8px', marginBottom: '40px' }}>
              {scalingLocationsData.map((loc) => (
                <div key={loc.id} className="scaling-location-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${figmaColorToCss({r: 0.9, g: 0.9, b: 0.9})}` }}>
                  <span style={{ color: colors.textDark }}>{loc.address}</span>
                  <div className="scaling-location-actions">
                    <button 
                      className="action-button qr-button" 
                      style={{ backgroundColor: colors.buttonDark, color: colors.white, marginRight: '10px', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => handleDownloadQrCode(loc.id)}
                    >
                      <ScalingGridIcon color={colors.white} size={20} style={{ marginRight: '8px' }} />
                      Скачать QR код
                    </button>
                    <button 
                      className="action-button delete-location-button" 
                      style={{ backgroundColor: colors.white, color: colors.accentRed, border: `1px solid ${colors.accentRed}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={() => handleDeleteLocation(loc)}
                    >
                      <span role="img" aria-label="delete" style={{ marginRight: '5px' }}>🗑️</span> Удалить
                    </button>
                  </div>
                </div>
              ))}
              {scalingLocationsData.length === 0 && <p style={{color: colors.textLight}}>Нет доступных локаций.</p>}
            </div>

            <h2 style={{ 
              color: colors.textDark, 
              fontSize: '40px', 
              fontFamily: '"Tilda Sans", sans-serif',
              fontWeight: '800',
              marginBottom: '24px',
              marginTop: '40px'
            }}>
              Создать новую локацию
            </h2>
            <div 
              className="form-container create-location-form" 
              style={{ 
                backgroundColor: colors.background, 
                padding: '24px', 
                borderRadius: '22px' 
              }}
            >
              <div className="form-row" style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '364px' }}>
                  <label style={{ 
                    color: colors.textLight, 
                    fontSize: '18px', 
                    fontFamily: '"Tilda Sans", sans-serif',
                    fontWeight: 500,
                    display: 'block', 
                    marginBottom: '8px',
                    paddingLeft: '20px'
                  }}>
                    Относится к существующей локации
                  </label>
                  <div className="input-wrapper select-wrapper" style={{ 
                    backgroundColor: colors.white, 
                    borderRadius: '10px', 
                    height: '54px',
                    display: 'flex',
                    alignItems: 'center',
                    paddingRight: '15px'
                  }}>
                    <select 
                      value={newScalingLocationParent} 
                      onChange={(e) => setNewScalingLocationParent(e.target.value)} 
                      style={{ 
                        color: newScalingLocationParent ? colors.textDark : figmaColorToCss({r: 0.105, g: 0.082, b: 0.082, a: 0.4}),
                        width: '100%', 
                        height: '100%',
                        padding: '0 20px', 
                        border: 'none', 
                        borderRadius: '10px',
                        backgroundColor: 'transparent',
                        fontSize: '18px',
                        fontFamily: '"Tilda Sans", sans-serif',
                        fontWeight: 500,
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5.83333 7.91666L10 12.0833L14.1667 7.91666' stroke='%23${colors.textDark.substring(5,11)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: `right 20px center`,
                      }}
                    >
                      {locations.map(loc => (<option key={loc.value} value={loc.value} style={{color: colors.textDark}}>{loc.label}</option>))}
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '364px' }}>
                  <label style={{ 
                    color: colors.textLight, 
                    fontSize: '18px', 
                    fontFamily: '"Tilda Sans", sans-serif',
                    fontWeight: 500,
                    display: 'block', 
                    marginBottom: '8px',
                    paddingLeft: '20px'
                  }}>
                    Название локации
                  </label>
                  <div className="input-wrapper" style={{ 
                    backgroundColor: colors.white, 
                    borderRadius: '10px', 
                    height: '54px' 
                  }}>
                    <input 
                      type="text" 
                      placeholder="Название" 
                      value={newScalingLocationName} 
                      onChange={(e) => setNewScalingLocationName(e.target.value)} 
                      style={{ 
                        color: colors.textDark, 
                        width: '100%', 
                        height: '100%',
                        padding: '0 20px', 
                        border: 'none', 
                        borderRadius: '10px',
                        backgroundColor: 'transparent',
                        fontSize: '18px',
                        fontFamily: '"Tilda Sans", sans-serif',
                        fontWeight: 500,
                      }}
                      className="custom-placeholder"
                    />
                  </div>
                </div>
              </div>
              <div className="form-actions" style={{ textAlign: 'left', marginTop: '24px' }}> 
                <button 
                  className="generate-qr-button" 
                  style={{ 
                    backgroundColor: colors.accentRed, 
                    color: colors.white, 
                    width: '256px',
                    height: '54px',
                    padding: '0 28px',
                    border: 'none', 
                    borderRadius: '10px', 
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontFamily: '"Tilda Sans", sans-serif',
                    fontWeight: 700,
                    opacity: 0.4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onClick={handleGenerateQrCode}
                >
                  Сгенерировать QR код
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {itemToDelete && deleteItemType === 'drink' && 'name' in itemToDelete && (
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          onClose={() => { setIsDeleteModalOpen(false); setItemToDelete(null); setDeleteItemType(null); }}
          onConfirm={handleConfirmDelete}
          itemName={itemToDelete.name}
        />
      )}
      {itemToDelete && deleteItemType === 'location' && 'address' in itemToDelete && (
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          onClose={() => { setIsDeleteModalOpen(false); setItemToDelete(null); setDeleteItemType(null); }}
          onConfirm={handleConfirmDelete}
          itemName={itemToDelete.address}
        />
      )}

      <SuccessModal isOpen={isSuccessModalOpen} onClose={() => setIsSuccessModalOpen(false)} message={successModalMessage} />

      {itemToEdit && editItemType === 'drink' && ( <EditDrinkModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setItemToEdit(null); setEditItemType(null); }} onSave={handleSaveEditedDrink} drink={itemToEdit as Product} /> )}
      
      {selectedOrder && ( <OrderInfoModal isOpen={isOrderInfoModalOpen} onClose={() => { setIsOrderInfoModalOpen(false); setSelectedOrder(null); }} order={selectedOrder} onCompleteOrder={() => console.log('Order completed', selectedOrder.id)} /> )}
    </div>
  );
};

export default AdminPage;
