import React, { useState, useEffect } from 'react';
import './EditDrinkModal.css';
import { API_BASE_URL } from '../apiConfig'; // Import API_BASE_URL

// Helper function (can be shared)
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

// Align with FrontendMenuItem from AdminPage.tsx
interface FrontendMenuItem {
  id: string;
  name: string;
  price: number;
  image_filename: string | null;
}

interface EditDrinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedData: { 
    id: string; 
    name: string; 
    // price: number; // Цена удалена по запросу
    newImageFile?: File; 
    currentImageFilename: string | null;
  }) => void;
  drink: FrontendMenuItem | null; // Use FrontendMenuItem
}

const EditDrinkModal: React.FC<EditDrinkModalProps> = ({ isOpen, onClose, onSave, drink }) => {
  const [editedName, setEditedName] = useState('');
  // const [editedPrice, setEditedPrice] = useState<number | string>(''); // Цена удалена
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (drink && isOpen) {
      setEditedName(drink.name);
      // setEditedPrice(drink.price); // Цена удалена
      if (drink.image_filename) {
        setCurrentImagePreview(`${API_BASE_URL}/uploads/menu_images/${drink.image_filename}`);
      } else {
        // Use a generic placeholder if no image_filename exists
        setCurrentImagePreview(`${process.env.PUBLIC_URL}/images/placeholder.png`); 
      }
      setNewImageFile(null);
      setNewImagePreview(null);
    } else if (!isOpen) {
      // Optionally reset fields when modal is closed, if desired
      setEditedName('');
      // setEditedPrice(''); // Цена удалена
      setNewImageFile(null);
      setNewImagePreview(null);
      setCurrentImagePreview(null);
    }
  }, [drink, isOpen]);

  if (!isOpen || !drink) {
    return null;
  }

  // const colors = { // Удалено, так как стили теперь в CSS
  //   background: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
  //   textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
  //   textLightGray: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }),
  //   inputPlaceholder: figmaColorToCss({ r: 0.1058, g: 0.0823, b: 0.0823, a: 0.4 }),
  //   accentRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }),
  //   white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
  // };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setNewImageFile(file);
      setNewImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSave = () => {
    if (!drink) return; // Should not happen if modal is open

    const finalName = editedName.trim() === '' ? drink.name : editedName.trim();
    // const finalPrice = typeof editedPrice === 'string' ? parseFloat(editedPrice) : editedPrice; // Цена удалена

    // if (isNaN(finalPrice) || finalPrice < 0) { // Проверка цены удалена
    //   alert("Цена должна быть положительным числом.");
    //   return;
    // }

    onSave({
      id: drink.id,
      name: finalName,
      // price: finalPrice, // Цена удалена
      newImageFile: newImageFile || undefined,
      currentImageFilename: drink.image_filename 
    });
  };
  
  // Figma shows save button opacity 0.4, implying disabled state.
  // For now, let's make it always enabled for simplicity or enable based on actual changes.
  const isSaveDisabled = false; // newDrinkName.trim() === '' && !newImageFile;


  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      {/* Corresponds to frame-155-xfkOEd */}
      <div className="edit-drink-modal-content"> 
        {/* Corresponds to title-7m0Nq5 */}
        <h2 className="edit-drink-modal-title">
          Редактирование напитка
        </h2>
        
        {/* Corresponds to frame-164-7m0Nq5 */}
        <div className="edit-form-section-container">
          {/* Corresponds to frame-151-QUsxCt */}
          <div className="edit-form-section">
            {/* Corresponds to frame-151-qYHIl2 */}
            <div className="edit-form-section-label-container">
              {/* Corresponds to title-BkqjB9 */}
              <label>Название</label>
            </div>
            {/* Corresponds to frame-162-qYHIl2 */}
            <div className="name-inputs-container">
              {/* Corresponds to input-x7sxMB - current name, hidden or read-only */}
              <input 
                type="text" 
                className="drink-name-input current" 
                defaultValue={drink.name}
                readOnly 
                style={{ display: 'none' }} // Keeping it hidden as per previous logic, can be changed
              />
              {/* Corresponds to input-9KvOgI - new name */}
              <input 
                type="text" 
                className="drink-name-input new" 
                placeholder="Новое название" 
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
              />
            </div>
          </div>

          {/* Блок цены удален по запросу */}

          {/* Corresponds to frame-153-QUsxCt */}
          <div className="edit-form-section">
            {/* Label for image section, corresponds to title-Il7Dy3 */}
            <div className="edit-form-section-label-container" style={{ justifyContent: 'center', paddingLeft: 0 }}> {/* Centered label */}
              <label>Изображение</label>
            </div>
            {/* Corresponds to frame-162-Il7Dy3 */}
            <div className="image-edit-container">
              {/* Corresponds to rectangle-19-1LJJ98 */}
              <img 
                src={newImagePreview || currentImagePreview || undefined} 
                alt={drink.name} 
                className="drink-image-preview" 
              />
              {/* Corresponds to input-1LJJ98 */}
              <label htmlFor="editImageUpload" className="file-input-label">
                {/* Corresponds to icon-attachment */}
                <span className="icon-placeholder">📎</span>
                {/* Corresponds to title-6GNvJ1 */}
                {newImageFile ? newImageFile.name : "Заменить файл"} 
              </label>
              <input 
                type="file" 
                id="editImageUpload" 
                style={{ display: 'none' }} 
                accept="image/*"
                onChange={handleImageChange}
              />
            </div>
          </div>
        </div>

        {/* Corresponds to frame-163-7m0Nq5 */}
        <div className="edit-drink-modal-actions">
          {/* Corresponds to btn-admin-by5otq */}
          <button
            className="modal-button save"
            style={{ opacity: isSaveDisabled ? 0.4 : 1 }}
            onClick={handleSave}
            disabled={isSaveDisabled}
          >
            Сохранить изменения
          </button>
          {/* Corresponds to btn-admin-skSndU */}
          <button
            className="modal-button cancel"
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditDrinkModal;
