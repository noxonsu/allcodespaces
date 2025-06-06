import React from 'react';
import { API_BASE_URL } from '../../apiConfig';
import { FrontendMenuItem, ScalingLocation, ColorPalette } from './types'; // Импорт общих типов

interface EditMenuTabProps {
  menuItems: FrontendMenuItem[];
  scalingLocations: ScalingLocation[];
  fetchMenuItems: (locationId?: string) => Promise<void>;
  onOpenDeleteDrinkModal: (item: FrontendMenuItem) => void;
  onOpenEditDrinkModal: (item: FrontendMenuItem) => void;
  openSuccessModal: (message: string) => void;
  colors: ColorPalette; // Используем импортированный тип
  // selectedLocationEdit и setSelectedLocationEdit могут быть переданы из AdminPage, если они там управляются
  // selectedLocationEdit: string; 
  // setSelectedLocationEdit: (id: string) => void;
}

const EditMenuTab: React.FC<EditMenuTabProps> = ({
  menuItems,
  scalingLocations,
  fetchMenuItems,
  onOpenDeleteDrinkModal,
  onOpenEditDrinkModal,
  openSuccessModal,
  colors,
  // selectedLocationEdit, // Раскомментировать, если передается
  // setSelectedLocationEdit, // Раскомментировать, если передается
}) => {
  const [selectedLocationUpload, setSelectedLocationUpload] = React.useState("");
  // Если selectedLocationEdit не передается из AdminPage, управляем им здесь
  const [currentSelectedLocationEdit, setCurrentSelectedLocationEdit] = React.useState("");


  const [newDrinkName, setNewDrinkName] = React.useState("");
  const [newDrinkPrice, setNewDrinkPrice] = React.useState<number | string>("");
  const [newDrinkImageFile, setNewDrinkImageFile] = React.useState<File | null>(null);
  const [fileName, setFileName] = React.useState("");

  React.useEffect(() => {
    // Если selectedLocationEdit управляется здесь, используем currentSelectedLocationEdit
    // Иначе, если selectedLocationEdit передается как prop, используем его
    const locationToFetch = /*selectedLocationEdit !== undefined ? selectedLocationEdit :*/ currentSelectedLocationEdit;
    fetchMenuItems(locationToFetch || undefined);
  }, [/*selectedLocationEdit,*/ currentSelectedLocationEdit, fetchMenuItems]);

  const locationOptionsForFilter = [
    { id: "", address: "Все локации" },
    ...scalingLocations,
  ];

  const locationOptionsForUpload = [
    { id: "", address: "Выберите локацию" },
    ...scalingLocations,
  ];

  const handleCreateMenuItem = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { alert("Ошибка авторизации. Пожалуйста, войдите снова."); return; }
    if (!newDrinkName.trim() || newDrinkPrice === "" || isNaN(parseFloat(String(newDrinkPrice))) || parseFloat(String(newDrinkPrice)) < 0) {
      alert("Название напитка не может быть пустым, а цена должна быть положительным числом.");
      return;
    }
    const formData = new FormData();
    formData.append('name', newDrinkName.trim());
    formData.append('price', String(newDrinkPrice));
    if (newDrinkImageFile) formData.append('image', newDrinkImageFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/menu-items/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (response.status === 201) {
        const newItem = await response.json();
        openSuccessModal(`Напиток "${newItem.name}" успешно создан.`);
        setNewDrinkName(""); setNewDrinkPrice(""); setNewDrinkImageFile(null); setFileName("");

        if (selectedLocationUpload && newItem.id) {
          try {
            const assocResponse = await fetch(`${API_BASE_URL}/api/v1/locations/${selectedLocationUpload}/menu-items/${newItem.id}/associate`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!assocResponse.ok) {
              const assocErrorData = await assocResponse.json().catch(() => null);
              console.error("Failed to associate menu item with location:", assocErrorData?.detail || assocResponse.statusText);
              alert(`Напиток создан, но не удалось привязать к локации: ${assocErrorData?.detail || assocResponse.statusText}`);
            } else {
              console.log(`Menu item ${newItem.id} associated with location ${selectedLocationUpload}`);
            }
          } catch (assocError) {
            console.error("Error associating menu item with location:", assocError);
            alert("Напиток создан, но произошла ошибка при привязке к локации.");
          }
        }
        // Обновляем список меню для текущей выбранной локации (или всех, если не выбрана)
        const locationToRefresh = /*selectedLocationEdit !== undefined ? selectedLocationEdit :*/ currentSelectedLocationEdit;
        fetchMenuItems(locationToRefresh || undefined);
      } else {
        const errorData = await response.json();
        alert(`Ошибка создания напитка: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error("Error creating menu item:", error);
      alert("Произошла ошибка при создании напитка.");
    }
  };
  
  const handleLocationEditChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocationId = e.target.value;
    // if (setSelectedLocationEdit) { // Если функция передана из AdminPage
    //   setSelectedLocationEdit(newLocationId);
    // } else { // Иначе управляем состоянием здесь
      setCurrentSelectedLocationEdit(newLocationId);
    // }
  };


  return (
    <>
      <div className="content-section upload-drinks">
        <h2 style={{ color: colors.textDark }}>Загрузить новые напитки</h2>
        <div className="form-container" style={{ backgroundColor: colors.background }}>
          <div className="form-row">
            <div className="form-group">
              <label style={{ color: colors.textLight }}>Локация</label>
              <div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white }}>
                <select value={selectedLocationUpload} onChange={(e) => setSelectedLocationUpload(e.target.value)} style={{ color: colors.textDark }}>
                  {locationOptionsForUpload.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.address}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label style={{ color: colors.textLight }}>Название нового напитка</label>
              <div className="input-wrapper" style={{ backgroundColor: colors.white }}>
                <input type="text" placeholder="Название" value={newDrinkName} onChange={(e) => setNewDrinkName(e.target.value)} style={{ color: colors.textDark }} />
              </div>
            </div>
            <div className="form-group">
              <label style={{ color: colors.textLight }}>Цена</label>
              <div className="input-wrapper" style={{ backgroundColor: colors.white }}>
                <input type="number" placeholder="Цена" value={newDrinkPrice} onChange={(e) => setNewDrinkPrice(e.target.value)} style={{ color: colors.textDark }} className="price-input" />
              </div>
            </div>
            <div className="form-group">
              <label style={{ color: colors.textLight }}>Изображение</label>
              <div className="input-wrapper file-input-wrapper" style={{ backgroundColor: colors.white }}>
                <label htmlFor="fileUploadMenu" style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer', paddingLeft: 0, marginBottom: 0 }}>
                  <span className="icon-placeholder" style={{ color: colors.accentRed }}>📎</span>
                  <span style={{ color: colors.textDark, marginLeft: '8px' }}>{fileName || "Выберите файл"}</span>
                </label>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  id="fileUploadMenu"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setFileName(e.target.files[0].name);
                      setNewDrinkImageFile(e.target.files[0]);
                    } else {
                      setFileName("Выберите файл");
                      setNewDrinkImageFile(null);
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button className="save-button" style={{ backgroundColor: colors.accentRed, color: colors.white }} onClick={handleCreateMenuItem}>Создать напиток</button>
            <button className="cancel-button" style={{ backgroundColor: colors.textLight, color: colors.white }}>Отмена</button>
          </div>
        </div>
      </div>
      <div className="content-section edit-menu">
        <h2 style={{ color: colors.textDark }}>Редактировать меню</h2>
        <div className="menu-container" style={{ backgroundColor: colors.background }}>
          <div className="form-group location-filter">
            <label style={{ color: colors.textLight }}>Локация</label>
            <div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white, width: '364px' }}>
              <select 
                value={/*selectedLocationEdit !== undefined ? selectedLocationEdit :*/ currentSelectedLocationEdit} 
                onChange={handleLocationEditChange} 
                style={{ color: colors.textDark }}
              >
                {locationOptionsForFilter.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.address}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="product-grid">
            {menuItems.length > 0 ? menuItems.map((item) => (
              <div key={item.id} className="product-card" style={{ backgroundColor: colors.white }}>
                <div className="product-card-image-name">
                  <img
                    src={item.image_filename ? `${API_BASE_URL}/uploads/menu_images/${item.image_filename}` : `${process.env.PUBLIC_URL}/images/placeholder.png`}
                    alt={item.name}
                    className="product-image"
                    onError={(e) => (e.currentTarget.src = `${process.env.PUBLIC_URL}/images/placeholder.png`)}
                  />
                  <span className="product-name" style={{ color: colors.textDark }}>{item.name}</span>
                  <span className="product-price" style={{ color: colors.textLight, fontSize: '14px', marginTop: '4px' }}>{item.price} руб.</span>
                </div>
                <div className="product-card-actions">
                  <button className="icon-button" style={{ backgroundColor: colors.background }} onClick={() => onOpenEditDrinkModal(item)}>
                    <span className="icon-placeholder" style={{ color: colors.textLight }}>✏️</span>
                  </button>
                  <button className="icon-button" style={{ backgroundColor: colors.background }} onClick={() => onOpenDeleteDrinkModal(item)}>
                    <span className="icon-placeholder" style={{ color: colors.accentRed }}>🗑️</span>
                  </button>
                </div>
              </div>
            )) : (
              <p style={{ color: colors.textLight, textAlign: 'center', width: '100%' }}>Нет доступных напитков. Добавьте новый выше.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default EditMenuTab;
