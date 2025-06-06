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
    price: number; 
    newImageFile?: File; 
    currentImageFilename: string | null;
  }) => void;
  drink: FrontendMenuItem | null; // Use FrontendMenuItem
}

const EditDrinkModal: React.FC<EditDrinkModalProps> = ({ isOpen, onClose, onSave, drink }) => {
  const [editedName, setEditedName] = useState('');
  const [editedPrice, setEditedPrice] = useState<number | string>('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (drink && isOpen) {
      setEditedName(drink.name);
      setEditedPrice(drink.price);
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
      setEditedPrice('');
      setNewImageFile(null);
      setNewImagePreview(null);
      setCurrentImagePreview(null);
    }
  }, [drink, isOpen]);

  if (!isOpen || !drink) {
    return null;
  }

  const colors = {
    background: figmaColorToCss({ r: 0.97, g: 0.97, b: 0.97 }),
    textDark: figmaColorToCss({ r: 0.0965, g: 0.1044, b: 0.1083 }),
    textLightGray: figmaColorToCss({ r: 0.3294, g: 0.3568, b: 0.3686 }),
    inputPlaceholder: figmaColorToCss({ r: 0.1058, g: 0.0823, b: 0.0823, a: 0.4 }),
    accentRed: figmaColorToCss({ r: 1, g: 0.3215, b: 0.2823 }),
    white: figmaColorToCss({ r: 1, g: 1, b: 1 }),
  };

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
    const finalPrice = typeof editedPrice === 'string' ? parseFloat(editedPrice) : editedPrice;

    if (isNaN(finalPrice) || finalPrice < 0) {
      alert("Цена должна быть положительным числом.");
      return;
    }

    onSave({
      id: drink.id,
      name: finalName,
      price: finalPrice,
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
      <div className="edit-drink-modal-content" style={{ backgroundColor: colors.background }}>
        <h2 className="edit-drink-modal-title" style={{ color: colors.textDark }}>
          Редактирование напитка
        </h2>
        
        <div className="edit-form-section">
          <label style={{ color: colors.textLightGray }}>Название</label>
          <div className="name-inputs-container">
            <input 
              type="text" 
              className="drink-name-input current" 
              defaultValue={drink.name} // Shows initial name, but editedName is the state for the input below
              readOnly 
              style={{ backgroundColor: colors.white, color: colors.textDark, display: 'none' }} // Hide if not needed, or show as 'Old Name'
            />
            <input 
              type="text" 
              className="drink-name-input new" 
              placeholder="Новое название" 
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              style={{ backgroundColor: colors.white, color: colors.textDark, '--placeholder-color': colors.inputPlaceholder } as React.CSSProperties}
            />
          </div>
        </div>

        <div className="edit-form-section">
          <label style={{ color: colors.textLightGray }}>Цена</label>
          <input
            type="number"
            className="drink-price-input new"
            placeholder="Новая цена"
            value={editedPrice}
            onChange={(e) => setEditedPrice(e.target.value)}
            style={{ backgroundColor: colors.white, color: colors.textDark, width: '100%', padding: '10px', borderRadius: '5px', border: `1px solid ${colors.textLightGray}` }}
          />
        </div>

        <div className="edit-form-section">
          <label style={{ color: colors.textLightGray }}>Изображение</label>
          <div className="image-edit-container">
            <img 
              src={newImagePreview || currentImagePreview || undefined} 
              alt={drink.name} 
              className="drink-image-preview" 
            />
            <label htmlFor="editImageUpload" className="file-input-label" style={{ backgroundColor: colors.white, color: colors.textDark }}>
              <span className="icon-placeholder" style={{ color: colors.accentRed }}>📎</span>
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

        <div className="edit-drink-modal-actions">
          <button
            className="modal-button save"
            style={{ 
              backgroundColor: colors.accentRed, 
              color: colors.white,
              opacity: isSaveDisabled ? 0.4 : 1
            }}
            onClick={handleSave}
            disabled={isSaveDisabled}
          >
            Сохранить изменения
          </button>
          <button
            className="modal-button cancel"
            style={{ backgroundColor: colors.textLightGray, color: colors.white }}
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
