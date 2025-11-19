import React, { useState, useEffect } from 'react';
import { User, ScalingLocation } from './admin_tabs/types';
import { API_BASE_URL } from '../apiConfig';
import './ConfirmDeleteModal.css'; // Reusing modal styles

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  scalingLocations: ScalingLocation[];
  onSave: (userId: string, newLogin: string, newPassword?: string, newLocationId?: string | null) => Promise<void>;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, scalingLocations, onSave }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setLogin(user.login);
      setPassword(''); // Password is not pre-filled for security
      setNewPassword('');
      setLocationId(user.location_id || null);
    }
  }, [user]);

  if (!isOpen || !user) {
    return null;
  }

  const handleSave = async () => {
    if (!login.trim()) {
      alert("Логин не может быть пустым.");
      return;
    }
    await onSave(user.id, login, newPassword || undefined, locationId);
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" style={{ backgroundColor: '#f7f7f7' }}>
        <h2 className="modal-title" style={{ fontFamily: '"Tilda Sans-ExtraBold", sans-serif', fontSize: '34px', marginBottom: '32px', color: '#181a1b' }}>Редактирование пользователя</h2>
        <div className="modal-body" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
            <label style={{ fontFamily: '"Tilda Sans-Medium", sans-serif', fontSize: '18px', color: '#545b5e', marginBottom: '8px' }}>Текущий логин:</label>
            <input 
              type="text" 
              value={login} 
              onChange={(e) => setLogin(e.target.value)} 
              style={{ 
                width: '100%', 
                height: '54px', 
                padding: '0 20px', 
                borderRadius: '10px', 
                border: 'none', 
                backgroundColor: '#ffffff', 
                fontSize: '18px', 
                fontFamily: '"Tilda Sans-Medium", sans-serif', 
                color: '#181a1b' 
              }} 
            />
          </div>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
            <label style={{ fontFamily: '"Tilda Sans-Medium", sans-serif', fontSize: '18px', color: '#545b5e', marginBottom: '8px' }}>Новый пароль (оставьте пустым, если не меняете):</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              style={{ 
                width: '100%', 
                height: '54px', 
                padding: '0 20px', 
                borderRadius: '10px', 
                border: 'none', 
                backgroundColor: '#ffffff', 
                fontSize: '18px', 
                fontFamily: '"Tilda Sans-Medium", sans-serif', 
                color: '#181a1b' 
              }} 
            />
          </div>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
            <label style={{ fontFamily: '"Tilda Sans-Medium", sans-serif', fontSize: '18px', color: '#545b5e', marginBottom: '8px' }}>Локация:</label>
            <select 
              value={locationId || ''} 
              onChange={(e) => setLocationId(e.target.value || null)}
              style={{ 
                width: '100%', 
                height: '54px', 
                padding: '0 20px', 
                borderRadius: '10px', 
                border: 'none', 
                backgroundColor: '#ffffff', 
                fontSize: '18px', 
                fontFamily: '"Tilda Sans-Medium", sans-serif', 
                color: '#181a1b',
                appearance: 'none', /* Remove default arrow */
                WebkitAppearance: 'none', /* For Safari */
                MozAppearance: 'none', /* For Firefox */
                cursor: 'pointer'
              }}
            >
              <option value="">Без локации</option>
              {scalingLocations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.address}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: '32px' }}>
          <button 
            className="modal-button confirm" 
            onClick={handleSave} 
            style={{ backgroundColor: '#ff5248', color: '#ffffff', fontFamily: '"Tilda Sans-Bold", sans-serif' }}
          >
            Сохранить
          </button>
          <button 
            className="modal-button cancel" 
            onClick={onClose} 
            style={{ backgroundColor: '#f7f7f7', color: '#181a1b', fontFamily: '"Tilda Sans-Bold", sans-serif' }}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditUserModal;
