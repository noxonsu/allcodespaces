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
        'qr-reader', 
        { fps: 10, qrbox: 250 },
        false // verbose
      );

      const onScanSuccess = (decodedText: string) => {
        scanner.clear();
        onScan(decodedText);
      };

      const onScanFailure = (error: any) => {
        // console.warn(`QR error = ${error}`);
      };

      scanner.render(onScanSuccess, onScanFailure);

      return () => {
        scanner.clear();
      };
    }
  }, [isOpen, onScan]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} className="modal-close-button">&times;</button>
        <h2>Scan QR Code</h2>
        <div id="qr-reader" style={{ width: '100%' }}></div>
      </div>
    </div>
  );
};

export default ScanQrModal;
