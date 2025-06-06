import React from 'react';
import { API_BASE_URL } from '../../apiConfig';
import { User, ScalingLocation, ColorPalette } from './types'; // Импорт общих типов

interface UsersTabProps {
  users: User[];
  scalingLocations: ScalingLocation[];
  fetchUsers: () => Promise<void>;
  onOpenDeleteUserModal: (user: User) => void;
  openSuccessModal: (message: string) => void;
  colors: ColorPalette; // Используем импортированный тип ColorPalette
}

const UsersTab: React.FC<UsersTabProps> = ({
  users,
  scalingLocations,
  fetchUsers,
  onOpenDeleteUserModal,
  openSuccessModal,
  colors,
}) => {
  const [newUserLogin, setNewUserLogin] = React.useState("");
  const [newUserPassword, setNewUserPassword] = React.useState("");
  const [newUserLocationId, setNewUserLocationId] = React.useState<string | null>(null);

  const displayUsers = users.map(user => ({
    ...user,
    location: user.location_name || user.location || 'N/A',
  }));

  const handleCreateUser = async () => {
    if (!newUserLogin.trim() || !newUserPassword.trim()) {
      alert("Логин и пароль не могут быть пустыми.");
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) {
      alert("Ошибка авторизации. Пожалуйста, войдите снова.");
      return;
    }
    const userPayload: { login: string; password: string; location_id?: string | null } = {
      login: newUserLogin,
      password: newUserPassword,
    };
    if (newUserLocationId) {
      userPayload.location_id = newUserLocationId;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(userPayload),
      });
      if (response.status === 201) {
        openSuccessModal(`Пользователь "${newUserLogin}" успешно создан.`);
        setNewUserLogin("");
        setNewUserPassword("");
        setNewUserLocationId(null);
        fetchUsers();
      } else {
        const errorData = await response.json();
        alert(`Ошибка создания пользователя: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error("Error creating user:", error);
      alert("Произошла ошибка при создании пользователя.");
    }
  };

  return (
    <div className="content-section users-section">
      <h2 style={{ color: colors.textDark }}>Пользователи</h2>
      <div className="users-list-container">
        <div className="user-list-header">
          <span className="user-col-login">Логин</span>
          <span className="user-col-password">Пароль</span>
          <span className="user-col-location">Локация</span>
          <span className="user-col-actions">Действия</span>
        </div>
        {displayUsers.length > 0 ? (
          displayUsers.map(user => (
            <div key={user.id} className="user-list-row">
              <span className="user-col-login">{user.login}</span>
              <span className="user-col-password">{user.password || '******'}</span>
              <span className="user-col-location">{user.location || 'N/A'}</span>
              <div className="user-col-actions user-actions">
                <button className="action-button edit">✏️ Редактировать</button>
                <button className="action-button delete" onClick={() => onOpenDeleteUserModal(user)}>🗑️ Удалить</button>
              </div>
            </div>
          ))
        ) : (
          <div className="user-list-row" style={{ textAlign: 'center', color: colors.textLight, padding: '20px' }}>
            Нет пользователей для отображения.
          </div>
        )}
      </div>
      <h2 style={{ color: colors.textDark, marginTop: '40px' }}>Создать нового пользователя</h2>
      <div className="form-container create-user-form" style={{ backgroundColor: colors.background }}>
        <div className="form-row">
          <div className="form-group">
            <label style={{ color: colors.textLight }}>Логин</label>
            <div className="input-wrapper" style={{ backgroundColor: colors.white }}>
              <input type="text" placeholder="Логин" value={newUserLogin} onChange={(e) => setNewUserLogin(e.target.value)} style={{ color: colors.textDark }} />
            </div>
          </div>
          <div className="form-group">
            <label style={{ color: colors.textLight }}>Пароль</label>
            <div className="input-wrapper" style={{ backgroundColor: colors.white }}>
              <input type="password" placeholder="Пароль" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} style={{ color: colors.textDark }} />
            </div>
          </div>
          <div className="form-group">
            <label style={{ color: colors.textLight }}>Локация (необязательно)</label>
            <div className="input-wrapper select-wrapper" style={{ backgroundColor: colors.white }}>
              <select
                value={newUserLocationId || ""}
                onChange={(e) => setNewUserLocationId(e.target.value || null)}
                style={{ color: colors.textDark }}
              >
                <option value="">Без локации</option>
                {scalingLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.address}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="form-actions">
          <button className="save-button" style={{ backgroundColor: colors.accentRed, color: colors.white }} onClick={handleCreateUser}>Создать пользователя</button>
        </div>
      </div>
    </div>
  );
};

export default UsersTab;
