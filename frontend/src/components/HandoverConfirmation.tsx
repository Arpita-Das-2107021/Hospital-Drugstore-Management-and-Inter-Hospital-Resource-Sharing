import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Camera,
  QrCode,
  Package,
  User,
  CheckCircle,
  AlertCircle,
  Upload
} from 'lucide-react';

interface HandoverConfirmationProps {
  transportId: string;
  onClose: () => void;
  onConfirm: () => void;
}

// Mock transport data
const mockTransportData = {
  id: 'TRN-2024-0001',
  requestId: 'REQ-2024-0456',
  resource: 'Amoxicillin 500mg',
  quantity: '50 units',
  lotNumber: 'AMX-2024-0892',
  expiryDate: '2025-06-15',
  sender: 'Dhaka Medical College Hospital',
  recipient: 'Square Hospital',
  driver: 'Rahman Ahmed'
};

export default function HandoverConfirmation({ 
  transportId, 
  onClose, 
  onConfirm 
}: HandoverConfirmationProps) {
  const [formData, setFormData] = useState({
    receiverName: '',
    receiverPosition: '',
    notes: '',
    photoTaken: false,
    qrScanned: false
  });
  const [step, setStep] = useState<'verify' | 'photo' | 'confirm'>('verify');

  const handlePhotoTaken = () => {
    setFormData(prev => ({ ...prev, photoTaken: true }));
    // In real app, this would handle camera/photo upload
  };

  const handleQRScan = () => {
    setFormData(prev => ({ ...prev, qrScanned: true }));
    // In real app, this would handle QR code scanning
  };

  const canProceed = () => {
    switch (step) {
      case 'verify':
        return formData.receiverName.trim() !== '' && formData.receiverPosition.trim() !== '';
      case 'photo':
        return formData.photoTaken && formData.qrScanned;
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step === 'verify') {
      setStep('photo');
    } else if (step === 'photo') {
      setStep('confirm');
    } else {
      onConfirm();
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Handover Confirmation</span>
          </DialogTitle>
          <DialogDescription>
            Confirm receipt of resources for {mockTransportData.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Resource Summary */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{mockTransportData.resource}</h3>
                <span className="text-sm text-muted-foreground">
                  {mockTransportData.quantity}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Lot:</span>
                  <span className="ml-2">{mockTransportData.lotNumber}</span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Exp:</span>
                  <span className="ml-2">{new Date(mockTransportData.expiryDate).toLocaleDateString()}</span>
                </div>
              </div>
              
              <Separator />
              
              <div className="text-sm">
                <p><span className="font-medium">From:</span> {mockTransportData.sender}</p>
                <p><span className="font-medium">Driver:</span> {mockTransportData.driver}</p>
              </div>
            </CardContent>
          </Card>

          {/* Step Content */}
          {step === 'verify' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="receiverName">Receiver Name *</Label>
                <Input
                  id="receiverName"
                  placeholder="Enter your full name"
                  value={formData.receiverName}
                  onChange={(e) => setFormData(prev => ({ ...prev, receiverName: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="receiverPosition">Position/Title *</Label>
                <Input
                  id="receiverPosition"
                  placeholder="e.g., Pharmacist, Nurse, Inventory Manager"
                  value={formData.receiverPosition}
                  onChange={(e) => setFormData(prev => ({ ...prev, receiverPosition: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any observations or special notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          )}

          {step === 'photo' && (
            <div className="space-y-4">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Please take a photo of the resources and scan the QR code for verification
                </p>
                
                {/* Photo Section */}
                <Card className={`border-2 border-dashed ${formData.photoTaken ? 'border-green-300 bg-green-50' : 'border-gray-300'}`}>
                  <CardContent className="p-6 text-center">
                    {formData.photoTaken ? (
                      <div className="space-y-2">
                        <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                        <p className="font-medium text-green-700">Photo Captured</p>
                        <p className="text-sm text-green-600">Resource photo saved successfully</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Camera className="h-12 w-12 text-muted-foreground mx-auto" />
                        <p className="font-medium">Take Photo of Resources</p>
                        <Button onClick={handlePhotoTaken} className="mt-2">
                          <Camera className="h-4 w-4 mr-2" />
                          Open Camera
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* QR Code Section */}
                <Card className={`border-2 border-dashed ${formData.qrScanned ? 'border-green-300 bg-green-50' : 'border-gray-300'}`}>
                  <CardContent className="p-6 text-center">
                    {formData.qrScanned ? (
                      <div className="space-y-2">
                        <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                        <p className="font-medium text-green-700">QR Code Verified</p>
                        <p className="text-sm text-green-600">Resource authenticity confirmed</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <QrCode className="h-12 w-12 text-muted-foreground mx-auto" />
                        <p className="font-medium">Scan Resource QR Code</p>
                        <Button onClick={handleQRScan} variant="outline" className="mt-2">
                          <QrCode className="h-4 w-4 mr-2" />
                          Scan QR Code
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="text-center space-y-4">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
                <h3 className="text-lg font-semibold">Ready to Confirm Receipt</h3>
                <p className="text-muted-foreground">
                  Please review all details before confirming the handover.
                </p>
              </div>

              <Card>
                <CardContent className="p-4 space-y-2">
                  <h4 className="font-medium">Handover Summary</h4>
                  <div className="text-sm space-y-1">
                    <p><span className="font-medium">Receiver:</span> {formData.receiverName}</p>
                    <p><span className="font-medium">Position:</span> {formData.receiverPosition}</p>
                    <p><span className="font-medium">Resource:</span> {mockTransportData.resource} ({mockTransportData.quantity})</p>
                    <p><span className="font-medium">Verification:</span> Photo ✓ QR Code ✓</p>
                    {formData.notes && (
                      <p><span className="font-medium">Notes:</span> {formData.notes}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">Important:</p>
                  <p>By confirming, you acknowledge receipt and take responsibility for the resources.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="space-x-2">
            {step !== 'verify' && (
              <Button 
                variant="outline" 
                onClick={() => {
                  if (step === 'photo') setStep('verify');
                  else if (step === 'confirm') setStep('photo');
                }}
              >
                Back
              </Button>
            )}
            <Button 
              onClick={handleNext} 
              disabled={!canProceed()}
              className={step === 'confirm' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {step === 'confirm' ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Receipt
                </>
              ) : (
                'Next'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}