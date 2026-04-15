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
import BroadcastLocationPicker from '@/components/maps/BroadcastLocationPicker';
import { type StructuredLocation } from '@/utils/location';
import { AlertTriangle, Siren, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  location?: StructuredLocation;
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
  const [selectedTemplateId, setSelectedTemplateId] = useState('custom');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'emergency'>('urgent');
  const [allowResponse, setAllowResponse] = useState(true);
  const [targetMode, setTargetMode] = useState<'all' | 'selected'>('all');
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([]);
  const [location, setLocation] = useState<StructuredLocation | null>(null);
  const [locationValidationError, setLocationValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTemplateId('custom');
    setTitle('');
    setMessage('');
    setPriority('urgent');
    setAllowResponse(true);
    setTargetMode('all');
    setSelectedHospitals([]);
    setLocation(null);
    setLocationValidationError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!selectedTemplate || selectedTemplateId === 'custom') return;
    setTitle(selectedTemplate.name);
    setMessage(selectedTemplate.message);
    setPriority(selectedTemplate.priority);
  }, [selectedTemplate, selectedTemplateId]);

  const recipientCount = targetMode === 'all' ? hospitals.length : selectedHospitals.length;

  const toggleHospital = (hospitalId: string) => {
    setSelectedHospitals((prev) =>
      prev.includes(hospitalId) ? prev.filter((id) => id !== hospitalId) : [...prev, hospitalId],
    );
  };

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) return;
    if (targetMode === 'selected' && selectedHospitals.length === 0) return;
    if (locationValidationError) return;

    setSubmitting(true);
    try {
      await onBroadcast({
        title: title.trim(),
        message: message.trim(),
        priority,
        scope: targetMode === 'all' ? 'all' : 'hospitals',
        allow_response: allowResponse,
        target_hospitals: targetMode === 'selected' ? selectedHospitals : undefined,
        location: location || undefined,
        templateId: selectedTemplateId === 'custom' ? undefined : selectedTemplateId,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const priorityColor =
    priority === 'emergency'
      ? 'text-destructive'
      : priority === 'urgent'
        ? 'text-amber-600'
        : 'text-muted-foreground';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Siren className={cn('h-5 w-5', priorityColor)} />
            Emergency Broadcast
          </DialogTitle>
          <DialogDescription>
            Send a high-priority message to hospital admins by email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Template */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Template</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Message</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title + Priority */}
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Label htmlFor="broadcast-title">Title</Label>
              <Input
                id="broadcast-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter broadcast title"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="broadcast-message">Message</Label>
            <Textarea
              id="broadcast-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the emergency and what support is needed"
              rows={4}
            />
          </div>

          {/* Location Picker */}
          <BroadcastLocationPicker
            value={location}
            onChange={setLocation}
            onValidationErrorChange={setLocationValidationError}
            disabled={submitting}
          />

          {/* Allow Response */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-1.5">
            <Label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox
                checked={allowResponse}
                onCheckedChange={(checked) => setAllowResponse(checked === true)}
              />
              Allow hospital responses
            </Label>
            <p className="pl-7 text-xs text-muted-foreground">
              If enabled, recipients can submit updates via the broadcast response endpoint.
            </p>
          </div>

          {/* Recipient Hospitals */}
          <Card className="rounded-xl border-border/60 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Recipient Hospitals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={targetMode === 'all' ? 'default' : 'outline'}
                  onClick={() => setTargetMode('all')}
                >
                  All Hospitals
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={targetMode === 'selected' ? 'default' : 'outline'}
                  onClick={() => setTargetMode('selected')}
                >
                  Selected Hospitals
                </Button>
              </div>

              {targetMode === 'selected' && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 p-3 space-y-2.5">
                  {loadingHospitals ? (
                    <p className="text-sm text-muted-foreground">Loading hospitals…</p>
                  ) : hospitals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No target hospitals available.</p>
                  ) : (
                    hospitals.map((hospital) => (
                      <label key={hospital.id} className="flex items-center gap-3 text-sm cursor-pointer hover:text-foreground transition-colors">
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

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">Estimated recipients</span>
                <Badge variant="secondary" className="text-xs">{recipientCount} hospitals</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Warning */}
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <p className="text-xs text-destructive leading-relaxed">
              Use emergency broadcasts only for genuine urgent coordination needs.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !title.trim() ||
              !message.trim() ||
              Boolean(locationValidationError) ||
              (targetMode === 'selected' && selectedHospitals.length === 0)
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? 'Sending…' : (
              <>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Send Broadcast
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
