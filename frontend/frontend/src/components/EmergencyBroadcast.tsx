import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Siren, X } from 'lucide-react';

export interface BroadcastTemplate {
  id: string;
  name: string;
  message: string;
  priority: 'normal' | 'urgent' | 'emergency';
}

export interface BroadcastHospitalOption {
  id: string;
  name: string;
}

export interface BroadcastComposerPayload {
  title: string;
  message: string;
  priority: 'normal' | 'urgent' | 'emergency';
  scope: 'all' | 'hospitals';
  allow_response: boolean;
  target_hospitals?: string[];
  templateId?: string;
}

interface EmergencyBroadcastProps {
  isOpen: boolean;
  onClose: () => void;
  onBroadcast: (payload: BroadcastComposerPayload) => Promise<void>;
  templates: BroadcastTemplate[];
  hospitals: BroadcastHospitalOption[];
  loadingHospitals?: boolean;
}

export default function EmergencyBroadcast({
  isOpen,
  onClose,
  onBroadcast,
  templates,
  hospitals,
  loadingHospitals = false,
}: EmergencyBroadcastProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('custom');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'emergency'>('urgent');
  const [allowResponse, setAllowResponse] = useState(true);
  const [targetMode, setTargetMode] = useState<'all' | 'selected'>('all');
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedTemplateId('custom');
    setTitle('');
    setMessage('');
    setPriority('urgent');
    setAllowResponse(true);
    setTargetMode('all');
    setSelectedHospitals([]);
  }, [isOpen]);

  useEffect(() => {
    if (!selectedTemplate || selectedTemplateId === 'custom') {
      return;
    }
    setTitle(selectedTemplate.name);
    setMessage(selectedTemplate.message);
    setPriority(selectedTemplate.priority);
  }, [selectedTemplate, selectedTemplateId]);

  const recipientCount = targetMode === 'all' ? hospitals.length : selectedHospitals.length;

  const toggleHospital = (hospitalId: string) => {
    setSelectedHospitals((prev) => {
      if (prev.includes(hospitalId)) {
        return prev.filter((id) => id !== hospitalId);
      }
      return [...prev, hospitalId];
    });
  };

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) {
      return;
    }
    if (targetMode === 'selected' && selectedHospitals.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      await onBroadcast({
        title: title.trim(),
        message: message.trim(),
        priority,
        scope: targetMode === 'all' ? 'all' : 'hospitals',
        allow_response: allowResponse,
        target_hospitals: targetMode === 'selected' ? selectedHospitals : undefined,
        templateId: selectedTemplateId === 'custom' ? undefined : selectedTemplateId,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <Siren className="h-5 w-5" />
            Emergency Broadcast
          </DialogTitle>
          <DialogDescription>
            Send a high-priority message to hospital admins by email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template or custom message" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Message</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="broadcast-title">Title</Label>
              <Input
                id="broadcast-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Enter broadcast title"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value: 'normal' | 'urgent' | 'emergency') => setPriority(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadcast-message">Message</Label>
            <Textarea
              id="broadcast-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the emergency and what support is needed"
              rows={4}
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox
                checked={allowResponse}
                onCheckedChange={(checked) => setAllowResponse(checked === true)}
              />
              Allow hospital responses
            </Label>
            <p className="text-xs text-muted-foreground">
              If enabled, recipients can submit updates via the broadcast response endpoint.
            </p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recipient Hospitals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={targetMode === 'all' ? 'default' : 'outline'}
                  onClick={() => setTargetMode('all')}
                >
                  All Hospitals
                </Button>
                <Button
                  type="button"
                  variant={targetMode === 'selected' ? 'default' : 'outline'}
                  onClick={() => setTargetMode('selected')}
                >
                  Selected Hospitals
                </Button>
              </div>

              {targetMode === 'selected' && (
                <div className="max-h-56 overflow-y-auto rounded-md border p-3 space-y-3">
                  {loadingHospitals ? (
                    <p className="text-sm text-muted-foreground">Loading hospitals...</p>
                  ) : hospitals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No target hospitals available.</p>
                  ) : (
                    hospitals.map((hospital) => (
                      <label key={hospital.id} className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={selectedHospitals.includes(hospital.id)}
                          onCheckedChange={() => toggleHospital(hospital.id)}
                        />
                        <span>{hospital.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}

              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-sm text-muted-foreground">Estimated recipients</span>
                <Badge variant="secondary">{recipientCount} hospitals</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <p className="text-sm">Use emergency broadcasts only for genuine urgent coordination needs.</p>
          </div>
        </div>

        <div className="flex justify-between pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !title.trim() ||
              !message.trim() ||
              (targetMode === 'selected' && selectedHospitals.length === 0)
            }
            className="bg-red-600 hover:bg-red-700"
          >
            {submitting ? 'Sending...' : 'Send Broadcast'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
