import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ResourceWithVisibility, mockSharedResources, hospitals } from '@/data/mockData';
import { CreditCard, ArrowLeftRight, Coins, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ResourceRequestFormProps {
  resource: ResourceWithVisibility | null;
  isOpen: boolean;
  onClose: () => void;
}

type ExchangeMethod = 'payment' | 'barter' | 'credit';

export const ResourceRequestForm = ({ resource, isOpen, onClose }: ResourceRequestFormProps) => {
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'critical'>('routine');
  const [exchangeMethod, setExchangeMethod] = useState<ExchangeMethod>('payment');
  const [justification, setJustification] = useState('');
  const [barterResource, setBarterResource] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast({
      title: "Request Submitted",
      description: `Your request for ${quantity} units of ${resource?.name} has been submitted successfully.`,
    });
    
    setIsSubmitting(false);
    onClose();
    // Reset form
    setQuantity(1);
    setUrgency('routine');
    setExchangeMethod('payment');
    setJustification('');
    setBarterResource('');
  };

  if (!resource) return null;

  const estimatedCost = quantity * 150; // Mock price calculation
  const availableForBarter = mockSharedResources.filter(
    r => r.hospital !== resource.hospital && r.availability === 'available'
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Request Resource
          </DialogTitle>
          <DialogDescription>
            Submit a request for shared resources from partner hospitals
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Resource Summary */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex gap-4">
                <img 
                  src={resource.image} 
                  alt={resource.name}
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <div className="flex-1">
                  <h3 className="font-semibold">{resource.name}</h3>
                  <p className="text-sm text-muted-foreground">{resource.hospital}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="capitalize">{resource.type}</Badge>
                    <Badge 
                      className={resource.availability === 'available' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}
                    >
                      {resource.quantity} units available
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quantity & Urgency */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity Needed</Label>
              <Input 
                id="quantity"
                type="number" 
                min={1} 
                max={resource.quantity}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Max: {resource.quantity} units
              </p>
            </div>

            <div className="space-y-2">
              <Label>Urgency Level</Label>
              <Select value={urgency} onValueChange={(v: any) => setUrgency(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                      Routine (3-5 days)
                    </div>
                  </SelectItem>
                  <SelectItem value="urgent">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-warning" />
                      Urgent (24-48 hours)
                    </div>
                  </SelectItem>
                  <SelectItem value="critical">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      Critical (Immediate)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Exchange Method */}
          <div className="space-y-3">
            <Label>Exchange Method</Label>
            <RadioGroup 
              value={exchangeMethod} 
              onValueChange={(v: ExchangeMethod) => setExchangeMethod(v)}
              className="grid gap-3 sm:grid-cols-3"
            >
              {/* Payment Option */}
              <Label 
                htmlFor="payment" 
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:bg-muted/50 ${
                  exchangeMethod === 'payment' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <RadioGroupItem value="payment" id="payment" className="sr-only" />
                <CreditCard className={`h-8 w-8 ${exchangeMethod === 'payment' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium">Payment</span>
                <span className="text-xs text-center text-muted-foreground">
                  Standard purchase
                </span>
              </Label>

              {/* Barter Option */}
              <Label 
                htmlFor="barter" 
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:bg-muted/50 ${
                  exchangeMethod === 'barter' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <RadioGroupItem value="barter" id="barter" className="sr-only" />
                <ArrowLeftRight className={`h-8 w-8 ${exchangeMethod === 'barter' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium">Barter</span>
                <span className="text-xs text-center text-muted-foreground">
                  Exchange resources
                </span>
              </Label>

              {/* Credit Option */}
              <Label 
                htmlFor="credit" 
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all hover:bg-muted/50 ${
                  exchangeMethod === 'credit' ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <RadioGroupItem value="credit" id="credit" className="sr-only" />
                <Coins className={`h-8 w-8 ${exchangeMethod === 'credit' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium">Credit</span>
                <span className="text-xs text-center text-muted-foreground">
                  Use credit balance
                </span>
              </Label>
            </RadioGroup>
          </div>

          {/* Payment Details */}
          {exchangeMethod === 'payment' && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Cost</p>
                    <p className="text-2xl font-bold text-primary">${estimatedCost.toLocaleString()}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Final cost will be confirmed after approval
                </p>
              </CardContent>
            </Card>
          )}

          {/* Barter Selection */}
          {exchangeMethod === 'barter' && (
            <div className="space-y-2">
              <Label>Select Resource to Offer</Label>
              <Select value={barterResource} onValueChange={setBarterResource}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a resource to exchange..." />
                </SelectTrigger>
                <SelectContent>
                  {availableForBarter.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <div className="flex items-center gap-2">
                        <span>{r.name}</span>
                        <Badge variant="outline" className="ml-auto">
                          {r.quantity} units
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Credit Balance */}
          {exchangeMethod === 'credit' && (
            <Card className="border-warning/20 bg-warning/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Coins className="h-8 w-8 text-warning" />
                  <div>
                    <p className="font-medium">Credit Balance: 2,450 credits</p>
                    <p className="text-sm text-muted-foreground">
                      This request will use approximately {quantity * 15} credits
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Justification */}
          <div className="space-y-2">
            <Label htmlFor="justification">
              Justification {urgency !== 'routine' && <span className="text-destructive">*</span>}
            </Label>
            <Textarea 
              id="justification"
              placeholder="Explain why this resource is needed..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
            />
            {urgency !== 'routine' && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Justification required for urgent/critical requests
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || (urgency !== 'routine' && !justification)}
              className="min-w-32"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ResourceRequestForm;