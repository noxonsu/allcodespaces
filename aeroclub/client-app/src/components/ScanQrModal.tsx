import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './ScanQrModal.css';

interface ScanQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedData: string | null) => void;
}

const ScanQrModal: React.FC<ScanQrModalProps> = ({ isOpen, onClose, onScan }) => {
  useEffect(() => {
    if (isOpen) {
      const scanner = new Html5QrcodeScanner(
        'qr-reader-container',
        { fps: 10, qrbox: 250, aspectRatio: 1.0 },
        false // verbose
      );

      const onScanSuccess = (decodedText: string) => {
        // It's important to handle the cleanup properly.
        // The library should handle the scanner UI removal on success.
        onScan(decodedText);
        onClose(); // Close modal on successful scan
      };

      const onScanFailure = (error: any) => {
        // This callback is called frequently, so keep it light.
        // console.warn(`QR scan error: ${error}`);
      };

      scanner.render(onScanSuccess, onScanFailure);

      // Cleanup function to be called on component unmount or before re-render
      return () => {
        // Check if scanner is still active before trying to clear
        if (scanner && scanner.getState() !== 2 /* NOT_STARTED */) {
          scanner.clear().catch((error: any) => {
            console.error("Failed to clear html5-qrcode-scanner.", error);
          });
        }
      };
    }
  }, [isOpen, onScan, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="scan-qr-modal-overlay">
      <div className="scan-qr-modal-content">
        <div className="scan-qr-modal-icon-container">
          {/* Inlined SVG for the scanner icon */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.70833 2.70833H49.2917V21.125H2.70833V2.70833Z" fill="#FF5248"/>
            <path d="M2.70833 30.875H49.2917V49.2917H2.70833V30.875Z" fill="#FF5248"/>
            <path d="M2.70833 24.375H49.2917V27.625H2.70833V24.375Z" fill="#FF5248"/>
            <path d="M15.1667 10.8333H36.8333V19.5H15.1667V10.8333Z" fill="#FF5248"/>
            <path d="M15.1667 32.5H36.8333V41.1667H15.1667V32.5Z" fill="#FF5248"/>
          </svg>
        </div>
        
        {/* This div will be replaced by the QR code scanner video feed */}
        <div id="qr-reader-container" style={{ width: '300px', height: '300px', marginBottom: '20px' }}></div>

        <div className="scan-qr-modal-text-content">
            <h2 className="scan-qr-modal-title">Отсканируйте QR-код</h2>
            <p className="scan-qr-modal-text">
                Для подтверждения заказа отсканируйте QR-код повторно. Благодарим за понимание!
            </p>
        </div>

        <button onClick={onClose} className="scan-qr-modal-button">
          Хорошо
        </button>
      </div>
    </div>
  );
};

export default ScanQrModal;
