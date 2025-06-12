import React, { useState, useEffect } from 'react';

interface LogEntry {
  timestamp: string;
  message: string;
}

const DebugInfo: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [buildDateTime, setBuildDateTime] = useState('');

  useEffect(() => {
    // Capture console.log messages
    const originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      originalConsoleLog(...args);
      setLogs((prevLogs) => [
        ...prevLogs,
        {
          timestamp: new Date().toLocaleTimeString('ru-RU', { hour12: false, timeZone: 'Europe/Moscow' }),
          message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
        },
      ]);
    };

    // Set build date and time
    const rawBuildDate = process.env.REACT_APP_BUILD_DATE;
    const rawBuildTime = process.env.REACT_APP_BUILD_TIME;

    if (rawBuildDate && rawBuildTime) {
      try {
        const buildDate = new Date(`${rawBuildDate}T${rawBuildTime}`);
        setBuildDateTime(buildDate.toLocaleString('ru-RU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Europe/Moscow'
        }));
      } catch (error) {
        console.error('Ошибка парсинга даты/времени билда:', error);
        setBuildDateTime('Неизвестно');
      }
    } else {
      setBuildDateTime('Не установлено');
    }

    return () => {
      console.log = originalConsoleLog; // Restore original console.log on unmount
    };
  }, []);

  if (process.env.REACT_APP_DEBUG !== 'true') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '10px',
      fontSize: '12px',
      maxHeight: '200px',
      overflowY: 'auto',
      zIndex: 9999,
      textAlign: 'left',
      width: '300px',
      boxSizing: 'border-box'
    }}>
      <div>
        <strong>Время билда (МСК):</strong> {buildDateTime}
      </div>
      <div style={{ marginTop: '5px' }}>
        <strong>Логи:</strong>
        {logs.length === 0 ? (
          <div>Нет логов</div>
        ) : (
          <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
            {logs.map((entry, index) => (
              <li key={index} style={{ wordBreak: 'break-all' }}>
                [{entry.timestamp}] {entry.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DebugInfo;
