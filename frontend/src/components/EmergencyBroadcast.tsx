import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  Siren,
  Zap,
  Clock,
  Users,
  CheckCircle,
  X,
  Heart,
  Droplets,
  Stethoscope,
  Pill,
  Shield
} from 'lucide-react';

interface EmergencyBroadcastProps {
  isOpen: boolean;
  onClose: () => void;
  onBroadcast: (data: any) => void;
}

const emergencyTemplates = [
  {
    id: 'mass-casualty',
    name: 'Mass Casualty Event',
    icon: <Users className="h-6 w-6" />,
    description: 'Multiple patients requiring immediate care',
    urgency: 'critical',
    defaults: {
      timeframe: '30 minutes',
      priority: 'emergency',
      expectedResponses: 10
    },
    resources: [
      { name: 'Blood Products (All Types)', category: 'blood', urgent: true },
      { name: 'Trauma Supplies', category: 'supplies', urgent: true },
      { name: 'Ventilators', category: 'equipment', urgent: true },
      { name: 'ICU Beds', category: 'beds', urgent: true }
    ]
  },
  {
    id: 'blood-shortage',
    name: 'Critical Blood Shortage',
    icon: <Droplets className="h-6 w-6" />,
    description: 'Immediate need for specific blood products',
    urgency: 'emergency',
    defaults: {
      timeframe: '1 hour',
      priority: 'emergency',
      expectedResponses: 15
    },
    resources: [
      { name: 'O-Negative Blood', category: 'blood', urgent: true },
      { name: 'O-Positive Blood', category: 'blood', urgent: true },
      { name: 'Platelets', category: 'blood', urgent: true },
      { name: 'Fresh Frozen Plasma', category: 'blood', urgent: true }
    ]
  },
  {
    id: 'equipment-failure',
    name: 'Critical Equipment Failure',
    icon: <Stethoscope className="h-6 w-6" />,
    description: 'Essential medical equipment malfunction',
    urgency: 'urgent',
    defaults: {
      timeframe: '2 hours',
      priority: 'urgent',
      expectedResponses: 8
    },
    resources: [
      { name: 'Backup Ventilators', category: 'equipment', urgent: true },
      { name: 'Patient Monitors', category: 'equipment', urgent: false },
      { name: 'Infusion Pumps', category: 'equipment', urgent: false },
      { name: 'Defibrillators', category: 'equipment', urgent: true }
    ]
  },
  {
    id: 'medication-shortage',
    name: 'Essential Medication Shortage',
    icon: <Pill className="h-6 w-6" />,
    description: 'Critical medications running low',
    urgency: 'urgent',
    defaults: {
      timeframe: '4 hours',
      priority: 'urgent',
      expectedResponses: 12
    },
    resources: [
      { name: 'Insulin', category: 'medication', urgent: true },
      { name: 'Epinephrine', category: 'medication', urgent: true },
      { name: 'Antibiotics', category: 'medication', urgent: false },
      { name: 'Pain Management', category: 'medication', urgent: false }
    ]
  }
];

export default function EmergencyBroadcast({ isOpen, onClose, onBroadcast }: EmergencyBroadcastProps) {
  const [step, setStep] = useState<'template' | 'details' | 'confirm' | 'broadcasting'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof emergencyTemplates[0] | null>(null);
  const [broadcastDetails, setBroadcastDetails] = useState({
    description: '',
    timeframe: '',
    expectedPatients: '',
    additionalNotes: '',
    selectedResources: [] as string[]
  });
  const [broadcastProgress, setBroadcastProgress] = useState(0);

  const handleTemplateSelect = (template: typeof emergencyTemplates[0]) => {
    setSelectedTemplate(template);
    setBroadcastDetails({
      description: template.description,
      timeframe: template.defaults.timeframe,
      expectedPatients: '',
      additionalNotes: '',
      selectedResources: template.resources.filter(r => r.urgent).map(r => r.name)
    });
    setStep('details');
  };

  const handleBroadcast = () => {
    setStep('broadcasting');
    setBroadcastProgress(0);
    
    // Simulate broadcast progress
    const interval = setInterval(() => {
      setBroadcastProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            onBroadcast({
              template: selectedTemplate,
              details: broadcastDetails,
              timestamp: new Date().toISOString()
            });
            onClose();
            setStep('template');
            setBroadcastProgress(0);
          }, 1000);
          return 100;
        }
        return prev + 20;
      });
    }, 300);
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'emergency': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'urgent': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-red-700">
            <Siren className="h-6 w-6" />
            <span>Emergency Broadcast</span>
          </DialogTitle>
          <DialogDescription>
            Send immediate requests to all connected hospitals in your network
          </DialogDescription>
        </DialogHeader>

        {step === 'template' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {emergencyTemplates.map((template) => (
                <Card 
                  key={template.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-red-200"
                  onClick={() => handleTemplateSelect(template)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center space-x-3 text-base">
                        <div className={`p-2 rounded-lg ${
                          template.urgency === 'critical' ? 'bg-red-100' :
                          template.urgency === 'emergency' ? 'bg-orange-100' : 'bg-yellow-100'
                        }`}>
                          {template.icon}
                        </div>
                        <span>{template.name}</span>
                      </CardTitle>
                      <Badge className={getUrgencyColor(template.urgency)}>
                        {template.urgency.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {template.description}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Response time:</span>
                      <span className="font-medium">{template.defaults.timeframe}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Expected hospitals:</span>
                      <span className="font-medium">{template.defaults.expectedResponses}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div className="text-sm text-red-700">
                <p className="font-medium">Emergency Broadcast Warning</p>
                <p>This will immediately notify all hospitals in your network. Only use for genuine emergencies.</p>
              </div>
            </div>
          </div>
        )}

        {step === 'details' && selectedTemplate && (
          <div className="space-y-6">
            <div className="flex items-center space-x-3 p-4 bg-muted rounded-lg">
              <div className="p-2 bg-red-100 rounded-lg">
                {selectedTemplate.icon}
              </div>
              <div>
                <h3 className="font-semibold">{selectedTemplate.name}</h3>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              </div>
              <Badge className={getUrgencyColor(selectedTemplate.urgency)}>
                {selectedTemplate.urgency.toUpperCase()}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Situation Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the emergency situation..."
                    value={broadcastDetails.description}
                    onChange={(e) => setBroadcastDetails(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeframe">Required Response Time *</Label>
                  <Select 
                    value={broadcastDetails.timeframe} 
                    onValueChange={(value) => setBroadcastDetails(prev => ({ ...prev, timeframe: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15 minutes">15 minutes</SelectItem>
                      <SelectItem value="30 minutes">30 minutes</SelectItem>
                      <SelectItem value="1 hour">1 hour</SelectItem>
                      <SelectItem value="2 hours">2 hours</SelectItem>
                      <SelectItem value="4 hours">4 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="patients">Expected Patients/Cases</Label>
                  <Input
                    id="patients"
                    type="number"
                    placeholder="Number of patients expected"
                    value={broadcastDetails.expectedPatients}
                    onChange={(e) => setBroadcastDetails(prev => ({ ...prev, expectedPatients: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional context or special requirements..."
                    value={broadcastDetails.additionalNotes}
                    onChange={(e) => setBroadcastDetails(prev => ({ ...prev, additionalNotes: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Required Resources</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select the resources you need immediate help with
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedTemplate.resources.map((resource) => (
                      <label 
                        key={resource.name}
                        className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={broadcastDetails.selectedResources.includes(resource.name)}
                          onChange={(e) => {
                            setBroadcastDetails(prev => ({
                              ...prev,
                              selectedResources: e.target.checked 
                                ? [...prev.selectedResources, resource.name]
                                : prev.selectedResources.filter(r => r !== resource.name)
                            }));
                          }}
                          className="rounded"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{resource.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">{resource.category}</p>
                        </div>
                        {resource.urgent && (
                          <Badge variant="destructive" className="text-xs">
                            URGENT
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'confirm' && selectedTemplate && (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-red-700">Confirm Emergency Broadcast</h3>
                <p className="text-red-600">
                  This will immediately alert all {selectedTemplate.defaults.expectedResponses} hospitals in your network
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Broadcast Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-medium">Emergency Type:</p>
                  <p className="text-muted-foreground">{selectedTemplate.name}</p>
                </div>
                
                <div>
                  <p className="font-medium">Description:</p>
                  <p className="text-muted-foreground">{broadcastDetails.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">Response Time:</p>
                    <p className="text-muted-foreground">{broadcastDetails.timeframe}</p>
                  </div>
                  {broadcastDetails.expectedPatients && (
                    <div>
                      <p className="font-medium">Expected Patients:</p>
                      <p className="text-muted-foreground">{broadcastDetails.expectedPatients}</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-medium">Requested Resources:</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {broadcastDetails.selectedResources.map((resource) => (
                      <Badge key={resource} variant="outline">
                        {resource}
                      </Badge>
                    ))}
                  </div>
                </div>

                {broadcastDetails.additionalNotes && (
                  <div>
                    <p className="font-medium">Additional Notes:</p>
                    <p className="text-muted-foreground">{broadcastDetails.additionalNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'broadcasting' && (
          <div className="space-y-6 text-center">
            <div className="space-y-4">
              <div className="p-6">
                <Zap className="h-16 w-16 text-yellow-500 mx-auto animate-pulse" />
                <h3 className="text-xl font-semibold mt-4">Broadcasting Emergency Alert</h3>
                <p className="text-muted-foreground">
                  Sending alerts to all hospitals in your network...
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{broadcastProgress}%</span>
                </div>
                <Progress value={broadcastProgress} className="h-3" />
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                {broadcastProgress >= 20 && (
                  <div className="flex items-center justify-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Alert sent to regional hospitals</span>
                  </div>
                )}
                {broadcastProgress >= 40 && (
                  <div className="flex items-center justify-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Alert sent to specialized centers</span>
                  </div>
                )}
                {broadcastProgress >= 60 && (
                  <div className="flex items-center justify-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>SMS notifications sent</span>
                  </div>
                )}
                {broadcastProgress >= 80 && (
                  <div className="flex items-center justify-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Email alerts dispatched</span>
                  </div>
                )}
                {broadcastProgress === 100 && (
                  <div className="flex items-center justify-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Broadcast completed successfully</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {step !== 'broadcasting' && (
          <div className="flex justify-between space-x-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <div className="space-x-2">
              {step === 'details' && (
                <Button variant="outline" onClick={() => setStep('template')}>
                  Back
                </Button>
              )}
              {step === 'confirm' && (
                <Button variant="outline" onClick={() => setStep('details')}>
                  Back
                </Button>
              )}
              {step === 'details' && (
                <Button 
                  onClick={() => setStep('confirm')}
                  disabled={!broadcastDetails.description || !broadcastDetails.timeframe || broadcastDetails.selectedResources.length === 0}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Review Broadcast
                </Button>
              )}
              {step === 'confirm' && (
                <Button 
                  onClick={handleBroadcast}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Siren className="h-4 w-4 mr-2" />
                  Send Emergency Broadcast
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}