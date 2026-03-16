import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Droplets,
  Wind,
  Heart,
  Pill,
  Stethoscope,
  Thermometer,
  CheckCircle,
  AlertTriangle,
  Clock,
  User,
  MapPin,
  Zap,
  ShieldCheck,
  Timer,
  Package,
  Activity,
  Star
} from 'lucide-react';

interface RequestTemplate {
  id: string;
  name: string;
  category: string;
  icon: JSX.Element;
  description: string;
  urgencyLevels: string[];
  estimatedTime: string;
  successRate: number;
  defaultFields: any;
  compatibilityFields: string[];
  specialRequirements: string[];
  clinicalNotes?: string;
}

const requestTemplates: RequestTemplate[] = [
  {
    id: 'blood-request',
    name: 'Blood Products Request',
    category: 'blood',
    icon: <Droplets className="h-6 w-6" />,
    description: 'Request blood units, plasma, platelets, or other blood products',
    urgencyLevels: ['routine', 'urgent', 'emergency'],
    estimatedTime: '2-4 hours',
    successRate: 96,
    defaultFields: {
      bloodType: '',
      units: '1',
      crossMatchRequired: true,
      patientAge: '',
      indication: '',
      patientCount: '1',
      clinicalContext: ''
    },
    compatibilityFields: ['bloodType', 'rhFactor', 'antibodyScreen', 'cmvStatus'],
    specialRequirements: ['coldChain', 'crossMatch', 'irradiated', 'cmbNegative', 'leukoreduced'],
    clinicalNotes: 'Blood products require strict cold chain maintenance and compatibility testing'
  },
  {
    id: 'oxygen-request',
    name: 'Oxygen & Ventilation Support',
    category: 'respiratory',
    icon: <Wind className="h-6 w-6" />,
    description: 'Request oxygen cylinders, concentrators, or ventilation equipment',
    urgencyLevels: ['urgent', 'emergency'],
    estimatedTime: '1-2 hours',
    successRate: 89,
    defaultFields: {
      oxygenType: 'cylinder',
      flowRate: '5',
      duration: '24',
      patientCount: '1',
      deliveryMethod: 'nasal-cannula',
      oxygenPurity: '95%',
      backupRequired: false
    },
    compatibilityFields: ['flowRate', 'oxygenPurity', 'deliveryMethod', 'connectorType'],
    specialRequirements: ['portableUnit', 'backupPower', 'humidifier', 'mobilitySupport'],
    clinicalNotes: 'Critical for respiratory distress patients. Ensure backup power availability'
  },
  {
    id: 'ventilator-request',
    name: 'Ventilator & Critical Care Equipment',
    category: 'equipment',
    icon: <Heart className="h-6 w-6" />,
    description: 'Request ventilators, monitors, or critical care equipment',
    urgencyLevels: ['urgent', 'emergency'],
    estimatedTime: '30 minutes - 2 hours',
    successRate: 78,
    defaultFields: {
      equipmentType: 'ventilator',
      patientType: 'adult',
      duration: '48',
      ventilationMode: 'volume-control',
      requiredFeatures: [],
      weight: '',
      clinicalIndication: ''
    },
    compatibilityFields: ['patientType', 'ventilationMode', 'pressureRange', 'tubeSize'],
    specialRequirements: ['invasiveVentilation', 'nippv', 'pediatricMode', 'transport', 'batteryBackup'],
    clinicalNotes: 'Life-critical equipment requiring immediate setup and clinical training'
  },
  {
    id: 'medication-request',
    name: 'Emergency Medications',
    category: 'medication',
    icon: <Pill className="h-6 w-6" />,
    description: 'Request critical medications and pharmaceuticals',
    urgencyLevels: ['routine', 'urgent', 'emergency'],
    estimatedTime: '1-6 hours',
    successRate: 92,
    defaultFields: {
      medicationName: '',
      dosage: '',
      quantity: '',
      indication: '',
      patientWeight: '',
      allergies: '',
      alternativesAccepted: true
    },
    compatibilityFields: ['dosage', 'formulation', 'concentration', 'routeOfAdministration'],
    specialRequirements: ['coldStorage', 'controlledSubstance', 'pediatricFormulation', 'alternativeAvailable'],
    clinicalNotes: 'Verify patient allergies and contraindications before administration'
  },
  {
    id: 'surgical-request',
    name: 'Surgical Equipment & Supplies',
    category: 'surgical',
    icon: <Stethoscope className="h-6 w-6" />,
    description: 'Request surgical instruments, implants, or OR supplies',
    urgencyLevels: ['urgent', 'emergency'],
    estimatedTime: '2-4 hours',
    successRate: 85,
    defaultFields: {
      procedureType: '',
      instrumentSet: '',
      sterilizationRequired: true,
      implantSize: '',
      surgeonPreference: '',
      backupOptions: true
    },
    compatibilityFields: ['instrumentSize', 'sterilizationMethod', 'implantMaterial'],
    specialRequirements: ['sterilePackaging', 'sizeOptions', 'disposableAlternative', 'quickSterilization'],
    clinicalNotes: 'Ensure sterile packaging and verify surgeon preferences for optimal outcomes'
  },
  {
    id: 'diagnostic-request',
    name: 'Diagnostic Equipment',
    category: 'diagnostic',
    icon: <Activity className="h-6 w-6" />,
    description: 'Request imaging, lab equipment, or diagnostic tools',
    urgencyLevels: ['routine', 'urgent'],
    estimatedTime: '4-8 hours',
    successRate: 91,
    defaultFields: {
      equipmentType: '',
      testType: '',
      patientMobility: 'mobile',
      urgentResults: false,
      calibrationRequired: true,
      staffTraining: false
    },
    compatibilityFields: ['equipmentSpecs', 'powerRequirements', 'connectivity'],
    specialRequirements: ['portableUnit', 'batteryOperation', 'staffSupport', 'qualityControl'],
    clinicalNotes: 'Verify equipment calibration and staff training requirements'
  },
  {
    id: 'medication-request',
    name: 'Medications & Pharmaceuticals',
    category: 'medication',
    icon: <Pill className="h-6 w-6" />,
    description: 'Request specific medications, antibiotics, or controlled substances',
    urgencyLevels: ['routine', 'urgent', 'emergency'],
    estimatedTime: '2-6 hours',
    successRate: 91,
    defaultFields: {
      medicationName: '',
      strength: '',
      quantity: '',
      dosageForm: 'tablet',
      indication: '',
      patientWeight: ''
    },
    compatibilityFields: ['strength', 'dosageForm', 'brandGeneric'],
    specialRequirements: ['refrigeration', 'controlled', 'highAlert', 'crushable'],
    clinicalNotes: 'Verify dosing, allergies, and drug interactions before administration'
  },
  {
    id: 'surgical-request',
    name: 'Surgical Supplies & Equipment',
    category: 'surgical',
    icon: <Stethoscope className="h-6 w-6" />,
    description: 'Request surgical instruments, disposables, or OR equipment',
    urgencyLevels: ['routine', 'urgent'],
    estimatedTime: '3-6 hours',
    successRate: 93,
    defaultFields: {
      surgeryType: '',
      estimatedDuration: '',
      surgeonPreference: '',
      sterilityRequirement: 'sterile',
      disposablePreferred: false
    },
    compatibilityFields: ['sterilityLevel', 'materialType', 'sizing'],
    specialRequirements: ['singleUse', 'reusable', 'specialSterilization', 'sizeVariety'],
    clinicalNotes: 'Ensure sterility requirements and surgeon preferences are met'
  },
  {
    id: 'diagnostic-request',
    name: 'Diagnostic Equipment',
    category: 'diagnostic',
    icon: <Thermometer className="h-6 w-6" />,
    description: 'Request imaging, lab equipment, or diagnostic tools',
    urgencyLevels: ['routine', 'urgent'],
    estimatedTime: '4-8 hours',
    successRate: 89,
    defaultFields: {
      equipmentType: '',
      modalityType: '',
      portabilityRequired: false,
      calibrationStatus: 'recent',
      technician: false
    },
    compatibilityFields: ['powerRequirements', 'connectivity', 'softwareVersion'],
    specialRequirements: ['portable', 'batteryBackup', 'networkConnected', 'calibrated'],
    clinicalNotes: 'Verify equipment calibration and staff training requirements'
  }
];

interface GuidedRequestTemplateProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (requestData: any) => void;
}

export default function GuidedRequestTemplate({ isOpen, onClose, onSubmit }: GuidedRequestTemplateProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<RequestTemplate | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [urgency, setUrgency] = useState('routine');
  const [deliveryWindow, setDeliveryWindow] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState<string[]>([]);
  const [step, setStep] = useState<'template' | 'details' | 'compatibility' | 'review'>('template');

  const handleTemplateSelect = (template: RequestTemplate) => {
    setSelectedTemplate(template);
    setFormData(template.defaultFields);
    setSpecialRequirements([]);
    setStep('details');
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSpecialRequirementToggle = (requirement: string) => {
    setSpecialRequirements(prev => 
      prev.includes(requirement) 
        ? prev.filter(r => r !== requirement)
        : [...prev, requirement]
    );
  };

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'emergency': return 'bg-red-100 text-red-800 border-red-300';
      case 'urgent': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'routine': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'blood': return 'bg-red-100';
      case 'respiratory': return 'bg-blue-100';
      case 'equipment': return 'bg-purple-100';
      case 'medication': return 'bg-green-100';
      case 'surgical': return 'bg-orange-100';
      case 'diagnostic': return 'bg-cyan-100';
      default: return 'bg-gray-100';
    }
  };

  const validateCurrentStep = () => {
    if (step === 'details' && selectedTemplate) {
      // Basic validation for required fields
      const requiredFields = Object.keys(selectedTemplate.defaultFields);
      return requiredFields.every(field => 
        formData[field] !== '' && formData[field] !== null && formData[field] !== undefined
      );
    }
    return true;
  };

  const renderTemplateSelection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Choose Request Type</h3>
        <p className="text-sm text-muted-foreground">
          Select a template to guide you through the request process
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {requestTemplates.map((template) => (
          <Card 
            key={template.id}
            className="cursor-pointer hover:shadow-md transition-all border-2 hover:border-primary"
            onClick={() => handleTemplateSelect(template)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-lg ${getCategoryColor(template.category)}`}>
                  {template.icon}
                </div>
                <Badge variant="outline" className="capitalize">
                  {template.category}
                </Badge>
              </div>
              <CardTitle className="text-base">{template.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                {template.description}
              </CardDescription>
              <div className="flex flex-wrap gap-1 mt-3">
                {template.urgencyLevels.map((level) => (
                  <Badge key={level} className={`text-xs ${getUrgencyColor(level)}`}>
                    {level}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderDetailsForm = () => {
    if (!selectedTemplate) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-lg ${getCategoryColor(selectedTemplate.category)}`}>
            {selectedTemplate.icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold">{selectedTemplate.name}</h3>
            <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Urgency Level *</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectedTemplate.urgencyLevels.map((level) => (
                    <SelectItem key={level} value={level}>
                      <div className="flex items-center space-x-2">
                        <div className={`h-2 w-2 rounded-full ${
                          level === 'emergency' ? 'bg-red-500' :
                          level === 'urgent' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                        <span className="capitalize">{level}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Preferred Delivery Window *</Label>
              <Select value={deliveryWindow} onValueChange={setDeliveryWindow}>
                <SelectTrigger>
                  <SelectValue placeholder="Select delivery timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate (&lt; 1 hour)</SelectItem>
                  <SelectItem value="2-hours">Within 2 hours</SelectItem>
                  <SelectItem value="4-hours">Within 4 hours</SelectItem>
                  <SelectItem value="8-hours">Within 8 hours</SelectItem>
                  <SelectItem value="24-hours">Within 24 hours</SelectItem>
                  <SelectItem value="flexible">Flexible timing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Template-specific fields */}
            {selectedTemplate.id === 'blood-request' && (
              <>
                <div className="space-y-2">
                  <Label>Blood Type *</Label>
                  <Select 
                    value={formData.bloodType || ''} 
                    onValueChange={(value) => handleFieldChange('bloodType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select blood type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A+">A+ (A Positive)</SelectItem>
                      <SelectItem value="A-">A- (A Negative)</SelectItem>
                      <SelectItem value="B+">B+ (B Positive)</SelectItem>
                      <SelectItem value="B-">B- (B Negative)</SelectItem>
                      <SelectItem value="AB+">AB+ (AB Positive)</SelectItem>
                      <SelectItem value="AB-">AB- (AB Negative)</SelectItem>
                      <SelectItem value="O+">O+ (O Positive)</SelectItem>
                      <SelectItem value="O-">O- (O Negative)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Number of Units *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.units || '1'}
                    onChange={(e) => handleFieldChange('units', e.target.value)}
                  />
                </div>
              </>
            )}

            {selectedTemplate.id === 'oxygen-request' && (
              <>
                <div className="space-y-2">
                  <Label>Oxygen Type *</Label>
                  <Select 
                    value={formData.oxygenType || ''} 
                    onValueChange={(value) => handleFieldChange('oxygenType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cylinder">Oxygen Cylinder</SelectItem>
                      <SelectItem value="concentrator">Oxygen Concentrator</SelectItem>
                      <SelectItem value="liquid">Liquid Oxygen</SelectItem>
                      <SelectItem value="portable">Portable Unit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Flow Rate (L/min) *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="15"
                    value={formData.flowRate || '5'}
                    onChange={(e) => handleFieldChange('flowRate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration (hours) *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.duration || '24'}
                    onChange={(e) => handleFieldChange('duration', e.target.value)}
                  />
                </div>
              </>
            )}

            {selectedTemplate.id === 'medication-request' && (
              <>
                <div className="space-y-2">
                  <Label>Medication Name *</Label>
                  <Input
                    placeholder="Enter medication name"
                    value={formData.medicationName || ''}
                    onChange={(e) => handleFieldChange('medicationName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Strength/Dose *</Label>
                  <Input
                    placeholder="e.g., 500mg, 10ml, 0.25mg"
                    value={formData.strength || ''}
                    onChange={(e) => handleFieldChange('strength', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    placeholder="Number of units needed"
                    value={formData.quantity || ''}
                    onChange={(e) => handleFieldChange('quantity', e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Clinical Indication</Label>
              <Textarea
                placeholder="Brief clinical context (non-identifying)"
                value={formData.indication || ''}
                onChange={(e) => handleFieldChange('indication', e.target.value)}
                rows={3}
              />
            </div>

            {selectedTemplate.specialRequirements.length > 0 && (
              <div className="space-y-3">
                <Label>Special Requirements</Label>
                <div className="space-y-2">
                  {selectedTemplate.specialRequirements.map((requirement) => (
                    <div key={requirement} className="flex items-center space-x-2">
                      <Checkbox
                        id={requirement}
                        checked={specialRequirements.includes(requirement)}
                        onCheckedChange={() => handleSpecialRequirementToggle(requirement)}
                      />
                      <Label htmlFor={requirement} className="capitalize">
                        {requirement.replace(/([A-Z])/g, ' $1').toLowerCase()}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                placeholder="Any specific requirements or preferences..."
                value={formData.additionalNotes || ''}
                onChange={(e) => handleFieldChange('additionalNotes', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCompatibilityCheck = () => {
    if (!selectedTemplate) return null;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Compatibility & Safety Check</h3>
          <p className="text-sm text-muted-foreground">
            Verify compatibility requirements and safety considerations
          </p>
        </div>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Safety Notice</p>
                <p className="text-sm text-yellow-700">
                  Please verify all compatibility requirements before confirming your request.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedTemplate.id === 'blood-request' && formData.bloodType && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Blood Compatibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Requested Type:</Label>
                  <Badge className="ml-2 bg-red-100 text-red-800">{formData.bloodType}</Badge>
                </div>
                <div>
                  <Label>Compatible Donors:</Label>
                  <div className="mt-1">
                    {formData.bloodType === 'O-' && <Badge variant="outline" className="mr-1">O-</Badge>}
                    {formData.bloodType === 'O+' && (
                      <>
                        <Badge variant="outline" className="mr-1">O-</Badge>
                        <Badge variant="outline" className="mr-1">O+</Badge>
                      </>
                    )}
                    {formData.bloodType === 'AB+' && (
                      <>
                        <Badge variant="outline" className="mr-1">All types</Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="crossMatch"
                  checked={formData.crossMatchRequired}
                  onCheckedChange={(checked) => handleFieldChange('crossMatchRequired', checked)}
                />
                <Label htmlFor="crossMatch">Cross-matching required</Label>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center space-x-2 text-sm">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span>Compatibility requirements verified</span>
        </div>
      </div>
    );
  };

  const renderReview = () => {
    if (!selectedTemplate) return null;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Review Request</h3>
          <p className="text-sm text-muted-foreground">
            Please review all details before submitting your request
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getCategoryColor(selectedTemplate.category)}`}>
                  {selectedTemplate.icon}
                </div>
                <span>{selectedTemplate.name}</span>
              </CardTitle>
              <Badge className={getUrgencyColor(urgency)}>
                {urgency.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Delivery Window:</Label>
                <p className="text-sm">{deliveryWindow.replace('-', ' ')}</p>
              </div>
              <div>
                <Label>Category:</Label>
                <p className="text-sm capitalize">{selectedTemplate.category}</p>
              </div>
            </div>

            <Separator />

            {/* Template-specific display */}
            {selectedTemplate.id === 'blood-request' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Blood Type:</Label>
                    <Badge className="ml-2 bg-red-100 text-red-800">{formData.bloodType}</Badge>
                  </div>
                  <div>
                    <Label>Units:</Label>
                    <span className="ml-2 text-sm">{formData.units}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedTemplate.id === 'oxygen-request' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Type:</Label>
                  <p className="text-sm capitalize">{formData.oxygenType?.replace('-', ' ')}</p>
                </div>
                <div>
                  <Label>Flow Rate:</Label>
                  <p className="text-sm">{formData.flowRate} L/min</p>
                </div>
                <div>
                  <Label>Duration:</Label>
                  <p className="text-sm">{formData.duration} hours</p>
                </div>
              </div>
            )}

            {selectedTemplate.id === 'medication-request' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Medication:</Label>
                  <p className="text-sm">{formData.medicationName}</p>
                </div>
                <div>
                  <Label>Strength:</Label>
                  <p className="text-sm">{formData.strength}</p>
                </div>
                <div>
                  <Label>Quantity:</Label>
                  <p className="text-sm">{formData.quantity}</p>
                </div>
              </div>
            )}

            {formData.indication && (
              <>
                <Separator />
                <div>
                  <Label>Clinical Indication:</Label>
                  <p className="text-sm mt-1">{formData.indication}</p>
                </div>
              </>
            )}

            {specialRequirements.length > 0 && (
              <>
                <Separator />
                <div>
                  <Label>Special Requirements:</Label>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {specialRequirements.map((req) => (
                      <Badge key={req} variant="outline">
                        {req.replace(/([A-Z])/g, ' $1').toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {formData.additionalNotes && (
              <>
                <Separator />
                <div>
                  <Label>Additional Notes:</Label>
                  <p className="text-sm mt-1">{formData.additionalNotes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const handleSubmit = () => {
    const requestData = {
      template: selectedTemplate,
      urgency,
      deliveryWindow,
      formData,
      specialRequirements,
      timestamp: new Date().toISOString()
    };
    onSubmit(requestData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'template' && 'Create New Request'}
            {step === 'details' && 'Request Details'}
            {step === 'compatibility' && 'Compatibility Check'}
            {step === 'review' && 'Review Request'}
          </DialogTitle>
          <DialogDescription>
            Use guided templates to ensure complete and accurate resource requests
          </DialogDescription>
        </DialogHeader>

        {step === 'template' && renderTemplateSelection()}
        {step === 'details' && renderDetailsForm()}
        {step === 'compatibility' && renderCompatibilityCheck()}
        {step === 'review' && renderReview()}

        <div className="flex justify-between space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="space-x-2">
            {step !== 'template' && (
              <Button 
                variant="outline" 
                onClick={() => {
                  const steps = ['template', 'details', 'compatibility', 'review'];
                  const currentIndex = steps.indexOf(step);
                  if (currentIndex > 0) {
                    setStep(steps[currentIndex - 1] as any);
                  }
                }}
              >
                Back
              </Button>
            )}
            
            {step === 'details' && (
              <Button 
                onClick={() => setStep('compatibility')}
                disabled={!validateCurrentStep()}
              >
                Next: Compatibility
              </Button>
            )}
            
            {step === 'compatibility' && (
              <Button onClick={() => setStep('review')}>
                Next: Review
              </Button>
            )}
            
            {step === 'review' && (
              <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-4 w-4 mr-2" />
                Submit Request
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}