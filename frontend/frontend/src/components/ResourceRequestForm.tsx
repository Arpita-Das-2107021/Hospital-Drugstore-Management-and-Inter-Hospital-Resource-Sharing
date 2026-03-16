import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { type ResourceWithVisibility } from '@/types/healthcare';
import { creditsApi, requestsApi, resourceSharesApi, templatesApi } from '@/services/api';
import { CreditCard, ArrowLeftRight, Coins, AlertTriangle, CheckCircle, Package, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

type ExchangeMethod = 'payment' | 'barter' | 'credit';

export const ResourceRequestForm = ({ resource, isOpen, onClose, onSubmitted }: ResourceRequestFormProps) => {
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'critical'>('routine');
  const [exchangeMethod, setExchangeMethod] = useState<ExchangeMethod>('payment');
  const [justification, setJustification] = useState('');
  const [barterResource, setBarterResource] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('none');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loadingCreditBalance, setLoadingCreditBalance] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoadingTemplates(true);

    templatesApi
      .getAll()
      .then((res: any) => {
        if (!mounted) return;
        const items: any[] = res?.data?.results ?? res?.data ?? res?.results ?? (Array.isArray(res) ? res : []);
        setTemplates(
          items.map((item: any) => ({
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
    if (!isOpen || exchangeMethod !== 'credit') return;

    let mounted = true;
    setLoadingCreditBalance(true);

    creditsApi
      .getBalance()
      .then((res: any) => {
        if (!mounted) return;
        const value =
          res?.data?.balance ??
          res?.balance ??
          res?.data?.current_balance ??
          res?.current_balance ??
          null;
        const normalized = typeof value === 'number' ? value : Number(value);
        setCreditBalance(Number.isFinite(normalized) ? normalized : null);
      })
      .catch(() => {
        if (!mounted) return;
        setCreditBalance(null);
      })
      .finally(() => {
        if (mounted) setLoadingCreditBalance(false);
      });

    return () => {
      mounted = false;
    };
  }, [exchangeMethod, isOpen]);

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
          const share: any = await resourceSharesApi.getById(resource.id);
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
      setExchangeMethod('payment');
      setJustification('');
      setBarterResource('');
      setSelectedTemplateId('none');
    } catch (err: any) {
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
              <Select value={urgency} onValueChange={(value: any) => setUrgency(value)}>
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

          <div className="space-y-3">
            <Label>Exchange Method</Label>
            <RadioGroup
              value={exchangeMethod}
              onValueChange={(value: ExchangeMethod) => setExchangeMethod(value)}
              className="grid gap-3 sm:grid-cols-3"
            >
              <Label
                htmlFor="payment"
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:bg-muted/50 ${
                  exchangeMethod === 'payment' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <RadioGroupItem value="payment" id="payment" className="sr-only" />
                <CreditCard className={`h-8 w-8 ${exchangeMethod === 'payment' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium">Payment</span>
              </Label>

              <Label
                htmlFor="barter"
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:bg-muted/50 ${
                  exchangeMethod === 'barter' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <RadioGroupItem value="barter" id="barter" className="sr-only" />
                <ArrowLeftRight className={`h-8 w-8 ${exchangeMethod === 'barter' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium">Barter</span>
              </Label>

              <Label
                htmlFor="credit"
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:bg-muted/50 ${
                  exchangeMethod === 'credit' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <RadioGroupItem value="credit" id="credit" className="sr-only" />
                <Coins className={`h-8 w-8 ${exchangeMethod === 'credit' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium">Credit</span>
              </Label>
            </RadioGroup>
          </div>

          {exchangeMethod === 'payment' && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-success" />
                  <div>
                    <p className="font-medium">Payment method selected</p>
                    <p className="text-sm text-muted-foreground">
                      Final pricing is provided by the supplying hospital during request review.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {exchangeMethod === 'barter' && (
            <div className="space-y-2">
              <Label>Select Resource to Offer</Label>
              <Input
                placeholder="Enter resource ID or description to exchange..."
                value={barterResource}
                onChange={(event) => setBarterResource(event.target.value)}
              />
            </div>
          )}

          {exchangeMethod === 'credit' && (
            <Card className="border-warning/20 bg-warning/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Coins className="h-8 w-8 text-warning" />
                  <div>
                    <p className="font-medium">
                      Credit Balance:{' '}
                      {loadingCreditBalance
                        ? 'Loading...'
                        : creditBalance !== null
                        ? `${creditBalance}`
                        : 'Unavailable'}
                    </p>
                    <p className="text-sm text-muted-foreground">Credits are settled after provider approval and dispatch.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
