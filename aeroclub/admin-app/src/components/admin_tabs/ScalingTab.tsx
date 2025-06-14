import React from 'react';
import { API_BASE_URL } from '../../apiConfig';
import { ScalingGridIcon } from '../icons'; // Предполагается, что иконка доступна
import { ScalingLocation, ColorPalette, FigmaColorToCssFunc } from './types'; // Импорт общих типов

interface ScalingTabProps {
  scalingLocations: ScalingLocation[];
  fetchScalingLocations: () => Promise<void>;
  onDeleteLocation: (location: ScalingLocation) => void;
  openSuccessModal: (message: string) => void;
  colors: ColorPalette; // Используем импортированный тип
  figmaColorToCss: FigmaColorToCssFunc;
}

const ScalingTab: React.FC<ScalingTabProps> = ({
  scalingLocations,
  fetchScalingLocations,
  onDeleteLocation,
  openSuccessModal,
  colors,
  figmaColorToCss,
}) => {
  const [newScalingLocationName, setNewScalingLocationName] = React.useState("");

  const handleDownloadQrCode = async (locationId: string, locationAddress: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      alert("Ошибка авторизации. Пожалуйста, войдите снова.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/locations/${locationId}/qr-code`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `Ошибка загрузки QR-кода. Статус: ${response.status}` }));
        throw new Error(errorData.detail || `HTTP error ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Sanitize locationAddress for filename
      const sanitizedAddress = locationAddress.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
      a.download = `qr_code_location_${locationId}_${sanitizedAddress || 'location'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      openSuccessModal(`QR-код для локации "${locationAddress}" успешно скачан.`);

    } catch (error: any) {
      console.error("Error downloading QR code:", error);
      alert(`Не удалось скачать QR-код: ${error.message}`);
    }
  };

  const handleCreateLocation = async () => {
    if (!newScalingLocationName.trim()) {
      alert("Название локации не может быть пустым.");
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) {
      alert("Ошибка авторизации. Пожалуйста, войдите снова.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/locations/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ address: newScalingLocationName }), // Используем 'address' как ключ
      });
      if (response.status === 201) {
        const newLoc = await response.json();
        const successMessage = `Локация "${newLoc.address || newScalingLocationName}" успешно создана.`;
        openSuccessModal(successMessage);
        setNewScalingLocationName("");
        fetchScalingLocations();
      } else {
        const errorData = await response.json();
        alert(`Ошибка создания локации: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error("Error creating location:", error);
      alert("Произошла ошибка при создании локации.");
    }
  };

  return (
    <div className="content-section scaling-section">
      <h2 style={{ color: colors.textDark, marginBottom: '20px' }}>Список существующих локаций</h2>
      <div className="scaling-locations-list" style={{ backgroundColor: colors.background, padding: '20px', borderRadius: '8px', marginBottom: '40px' }}>
        {scalingLocations.length > 0 ? scalingLocations.map((loc) => (
          <div key={loc.id} className="scaling-location-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${figmaColorToCss({ r: 0.9, g: 0.9, b: 0.9 })}` }}>
            <span style={{ color: colors.textDark }}>({loc.id}) {loc.address}</span>
            <div className="scaling-location-actions" style={{ display: 'flex', gap: '12px' }}>
              <a
                href={`/admin#editMenu?location_id=${loc.id}`} // Изменено на внутренний маршрут
                className="action-button"
                style={{ backgroundColor: '#4CAF50', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', textDecoration: 'none' }}
              >
                Открыть меню
              </a>
              <button
                className="action-button qr-button"
                style={{ backgroundColor: colors.buttonDark, color: colors.white, padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => handleDownloadQrCode(loc.id, loc.address)}
              >
                <ScalingGridIcon color={colors.white} size={20} style={{ marginRight: '8px' }} />
                Скачать QR код
              </button>
              <button
                className="action-button delete-location-button"
                style={{ backgroundColor: colors.white, color: colors.accentRed, border: `1px solid ${colors.accentRed}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                onClick={() => onDeleteLocation(loc)}
              >
                <span role="img" aria-label="delete" style={{ marginRight: '5px' }}>🗑️</span> Удалить
              </button>
            </div>
          </div>
        )) : (
          <p style={{ color: colors.textLight, textAlign: 'center' }}>Нет доступных локаций. Создайте новую ниже.</p>
        )}
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
              opacity: newScalingLocationName.trim() ? 1 : 0.4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={handleCreateLocation}
            disabled={!newScalingLocationName.trim()}
          >
            Создать локацию и QR
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScalingTab;
