import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { type ResourceWithVisibility } from '@/types/healthcare';
import { requestsApi, resourceSharesApi, templatesApi } from '@/services/api';
import { CreditCard, AlertTriangle, Package, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface ResourceRequestFormProps {
  resource: ResourceWithVisibility | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

interface MessageTemplate {
  id: string;
  name: string;
  subject?: string;
  body?: string;
}

export const ResourceRequestForm = ({ resource, isOpen, onClose, onSubmitted }: ResourceRequestFormProps) => {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'critical'>('routine');
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('none');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoadingTemplates(true);

    templatesApi
      .getAll()
      .then((res: unknown) => {
        if (!mounted) return;
        const items: unknown[] = res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
        setTemplates(
          items.map((item: unknown) => ({
            id: String(item.id),
            name: item.name || item.subject || 'Template',
            subject: item.subject,
            body: item.body,
          }))
        );
      })
      .catch(() => {
        if (!mounted) return;
        setTemplates([]);
      })
      .finally(() => {
        if (mounted) setLoadingTemplates(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (selectedTemplateId === 'none') return;
    const selected = templates.find((template) => template.id === selectedTemplateId);
    if (!selected || justification.trim()) return;
    setJustification(selected.body || selected.subject || '');
  }, [selectedTemplateId, templates, justification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const priorityMap: Record<string, string> = {
        routine: 'normal',
        urgent: 'urgent',
        critical: 'emergency',
      };

      let supplyingHospital = resource?.hospitalId;
      let catalogItem = resource?.catalogItemId;

      // Fallback lookup for older list payloads that don't include IDs directly.
      if ((!supplyingHospital || !catalogItem) && resource?.id) {
        try {
          const share: unknown = await resourceSharesApi.getById(resource.id);
          const payload = share?.data || share;
          supplyingHospital =
            supplyingHospital ||
            payload?.hospital ||
            payload?.hospital_id ||
            payload?.offering_hospital ||
            payload?.offering_hospital_id;
          catalogItem =
            catalogItem ||
            payload?.catalog_item ||
            payload?.catalog_item_id;
        } catch {
          // Keep original values and let the validation below handle missing fields.
        }
      }

      if (!supplyingHospital || !catalogItem) {
        throw new Error('Resource owner or catalog information is missing for this request.');
      }

      await requestsApi.create({
        requesting_hospital: user?.hospital_id || undefined,
        supplying_hospital: supplyingHospital,
        catalog_item: catalogItem,
        quantity_requested: quantity,
        priority: priorityMap[urgency] || 'normal',
        notes: justification || '',
      });

      toast({
        title: 'Request Submitted',
        description: `Your request for ${quantity} units of ${resource?.name} was submitted. The resource owner will be notified.`,
      });

      onSubmitted?.();
      onClose();
      setQuantity(1);
      setUrgency('routine');
      setJustification('');
      setSelectedTemplateId('none');
    } catch (err: unknown) {
      toast({
        title: 'Request Failed',
        description: err?.message || 'Could not submit request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!resource) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Request Resource
          </DialogTitle>
          <DialogDescription>Submit a request for shared resources from partner hospitals</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex gap-4">
                {resource.image ? (
                  <img src={resource.image} alt={resource.name} className="h-20 w-20 rounded-lg object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}

                <div className="flex-1">
                  <h3 className="font-semibold">{resource.name}</h3>
                  <p className="text-sm text-muted-foreground">{resource.hospital}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="capitalize">
                      {resource.type}
                    </Badge>
                    <Badge
                      className={
                        resource.availability === 'available'
                          ? 'bg-success text-success-foreground'
                          : 'bg-warning text-warning-foreground'
                      }
                    >
                      {resource.quantity} units available
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>Request Template</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTemplates ? 'Loading templates...' : 'Select a template'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity Needed</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={resource.quantity}
                value={quantity}
                onChange={(event) => setQuantity(parseInt(event.target.value, 10) || 1)}
              />
              <p className="text-xs text-muted-foreground">Max: {resource.quantity} units</p>
            </div>

            <div className="space-y-2">
              <Label>Urgency Level</Label>
              <Select value={urgency} onValueChange={(value: unknown) => setUrgency(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-medium">Payment workflow enabled</p>
                  <p className="text-sm text-muted-foreground">
                    Resource requests are submitted as payment-based transactions. Final pricing is provided during provider review.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="justification">
              Justification {urgency !== 'routine' && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="justification"
              placeholder="Explain why this resource is needed..."
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              rows={3}
            />
            {urgency !== 'routine' && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Justification required for urgent/critical requests
              </p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || (urgency !== 'routine' && !justification)}
              className="min-w-32"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ResourceRequestForm;
