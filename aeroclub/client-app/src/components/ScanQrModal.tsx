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
      // Use a local variable for the scanner instance in this effect's scope
      const scanner = new Html5QrcodeScanner(
        'qr-reader-container',
        { fps: 10, qrbox: 250, aspectRatio: 1.0 },
        false // verbose
      );

      const onScanSuccess = (decodedText: string) => {
        // Cleanup is handled by the library on success, but we also have our own cleanup
        onScan(decodedText);
        onClose();
      };

      const onScanFailure = (error: any) => {
        // console.warn(`QR scan error: ${error}`);
      };

      scanner.render(onScanSuccess, onScanFailure);

      // Return a cleanup function
      return () => {
        // The key is to ensure `clear()` is called on the instance from this render.
        // The library might have issues if the component re-renders and `scanner` variable is stale.
        // By keeping it local to useEffect, we ensure we call clear on the correct instance.
        scanner.clear().catch((error: any) => {
          // This can throw an error if the scanner is already cleared or not in a clearable state.
          // We can safely ignore it as our goal is just to ensure it's gone.
          console.error("QR Scanner cleanup failed, this can sometimes be ignored.", error);
        });
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
