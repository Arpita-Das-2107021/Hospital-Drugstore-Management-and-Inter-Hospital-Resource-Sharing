type DeliveryErrorLike = Error & {
  status?: number;
  payload?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const extractBackendMessage = (error: unknown): string => {
  const candidate = error as DeliveryErrorLike;
  const payload = asRecord(candidate?.payload);
  const nestedError = asRecord(payload.error);

  return (
    toNonEmptyString(
      nestedError.message,
      nestedError.detail,
      payload.message,
      payload.detail,
      candidate?.message,
    ) || 'Unable to confirm delivery QR.'
  );
};

export type TransferConfirmPayload = {
  qrPayload: string;
  quantity_received: number;
  notes?: string;
};

export const buildTransferConfirmPayload = (
  qrPayload: string,
  quantityReceived: number,
  notes?: string,
): TransferConfirmPayload => {
  const payload: TransferConfirmPayload = {
    qrPayload,
    quantity_received: quantityReceived,
  };

  const normalizedNotes = toNonEmptyString(notes);
  if (normalizedNotes) {
    payload.notes = normalizedNotes;
  }

  return payload;
};

export const validateTransferConfirmInput = (
  rawQrPayload: string,
  quantityReceived: number,
): { payload?: TransferConfirmPayload; error?: string } => {
  const hasQrPayload = typeof rawQrPayload === 'string' && rawQrPayload.trim().length > 0;
  if (!hasQrPayload) {
    return {
      error: 'Scan QR or paste the QR payload before submitting transfer confirmation.',
    };
  }

  if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) {
    return {
      error: 'Received quantity must be greater than zero.',
    };
  }

  return {
    payload: buildTransferConfirmPayload(rawQrPayload, Math.floor(quantityReceived)),
  };
};

export const mapDeliveryConfirmationError = (error: unknown): { title: string; description: string } => {
  const candidate = error as DeliveryErrorLike;
  const status = candidate?.status;
  const backendMessage = extractBackendMessage(error);
  const normalized = backendMessage.toLowerCase();

  if (status === 403 || normalized.includes('does not belong to your healthcare facility')) {
    return {
      title: 'Delivery confirmation denied',
      description: backendMessage,
    };
  }

  if (
    normalized.includes('qr already used') ||
    normalized.includes('delivery token is already used') ||
    normalized.includes('already used') ||
    normalized.includes('already confirmed')
  ) {
    return {
      title: 'Shipment already confirmed',
      description: backendMessage,
    };
  }

  if (normalized.includes('expired') && (normalized.includes('qr') || normalized.includes('token'))) {
    return {
      title: 'Expired QR code',
      description: backendMessage,
    };
  }

  if (normalized.includes('invalid') && (normalized.includes('qr') || normalized.includes('token'))) {
    return {
      title: 'Invalid delivery QR',
      description: backendMessage,
    };
  }

  if (
    normalized.includes('qrpayload') ||
    normalized.includes('qr payload')
  ) {
    return {
      title: 'QR payload required',
      description: backendMessage,
    };
  }

  if (
    status === 410 ||
    normalized.includes('legacy endpoint removed') ||
    normalized.includes('transfer-confirm')
  ) {
    return {
      title: 'Delivery confirmation route updated',
      description: 'Backend now requires transfer-confirm flow. Open the Request Workflow and complete confirmation from the request card.',
    };
  }

  return {
    title: 'Delivery confirmation failed',
    description: backendMessage || 'Unable to confirm delivery QR.',
  };
};