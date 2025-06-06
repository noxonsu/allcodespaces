import React, { useState, useEffect } from 'react';
import './EditDrinkModal.css'; // Will create this CSS file next

// Helper function (can be shared)
const figmaColorToCss = (color: { r: number; g: number; b: number; a?: number }): string => {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
};

interface DrinkToEdit {
  name: string;
  imgFileName: string;
  // Add other properties if needed, e.g., id
}

interface EditDrinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedDrinkData: { currentName: string; newName: string; newImageFile?: File }) => void;
  drink: DrinkToEdit | null;
}

const EditDrinkModal: React.FC<EditDrinkModalProps> = ({ isOpen, onClose, onSave, drink }) => {
  const [newDrinkName, setNewDrinkName] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (drink) {
      setNewDrinkName(''); // Start with empty field for new name
      setCurrentImagePreview(`${process.env.PUBLIC_URL}/images/${drink.imgFileName}`);
      setNewImageFile(null);
      setNewImagePreview(null);
    }
  }, [drink, isOpen]); // Reset form when drink or isOpen changes

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
    onSave({
      currentName: drink.name,
      newName: newDrinkName.trim() === '' ? drink.name : newDrinkName.trim(), // Keep old name if new is empty
      newImageFile: newImageFile || undefined,
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
              defaultValue={drink.name} 
              readOnly 
              style={{ backgroundColor: colors.white, color: colors.textDark }} 
            />
            <input 
              type="text" 
              className="drink-name-input new" 
              placeholder="Новое название" 
              value={newDrinkName}
              onChange={(e) => setNewDrinkName(e.target.value)}
              style={{ backgroundColor: colors.white, color: colors.textDark, '--placeholder-color': colors.inputPlaceholder } as React.CSSProperties}
            />
          </div>
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
