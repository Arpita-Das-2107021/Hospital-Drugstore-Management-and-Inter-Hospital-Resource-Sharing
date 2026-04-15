import { useEffect, useMemo, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface DispatchQrScannerProps {
  active: boolean;
  onScan: (decodedText: string) => void;
  onScannerStateChange?: (isScanning: boolean) => void;
  onScannerError?: (message: string) => void;
}

const stopAndClearScanner = async (scanner: Html5Qrcode | null) => {
  if (!scanner) return;

  try {
    await scanner.stop();
  } catch {
    // Scanner may already be stopped.
  }

  try {
    await scanner.clear();
  } catch {
    // Ignore clear failures during teardown.
  }
};

const DispatchQrScanner = ({
  active,
  onScan,
  onScannerStateChange,
  onScannerError,
}: DispatchQrScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanLockedRef = useRef(false);
  const elementId = useMemo(() => `dispatch-qr-scanner-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    let isDisposed = false;

    const startScanner = async () => {
      if (!active) {
        onScannerStateChange?.(false);
        return;
      }

      scanLockedRef.current = false;
      const scanner = new Html5Qrcode(elementId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      try {
        const scanConfig = {
          fps: 10,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1,
          disableFlip: false,
        };

        const onScanSuccess = (decodedText: string) => {
          if (scanLockedRef.current) return;

          const normalized = decodedText.trim();
          if (!normalized) return;

          scanLockedRef.current = true;
          onScan(normalized);

          void stopAndClearScanner(scanner).finally(() => {
            onScannerStateChange?.(false);
          });
        };

        const onScanFailure = () => {
          // Ignore per-frame decode failures while camera is scanning.
        };

        try {
          await scanner.start({ facingMode: 'environment' }, scanConfig, onScanSuccess, onScanFailure);
        } catch {
          await scanner.start({ facingMode: 'user' }, scanConfig, onScanSuccess, onScanFailure);
        }

        if (!isDisposed) {
          onScannerStateChange?.(true);
        }
      } catch (error) {
        if (isDisposed) return;

        const message =
          error instanceof Error
            ? `Camera unavailable. ${error.message}`
            : 'Camera unavailable. Please allow webcam access and try again.';
        onScannerError?.(message);
        onScannerStateChange?.(false);

        await stopAndClearScanner(scanner);
      }
    };

    void startScanner();

    return () => {
      isDisposed = true;
      onScannerStateChange?.(false);
      const currentScanner = scannerRef.current;
      scannerRef.current = null;
      void stopAndClearScanner(currentScanner);
    };
  }, [active, elementId, onScan, onScannerError, onScannerStateChange]);

  return (
    <div className="overflow-hidden rounded-lg border bg-black/90">
      <div id={elementId} className="min-h-[300px] w-full" />
    </div>
  );
};

export default DispatchQrScanner;