import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Activity, Building2, CheckCircle, AlertCircle, ArrowLeft, Clock, Mail, Key, LogIn, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import BroadcastLocationPicker from '@/components/maps/BroadcastLocationPicker';
import { type StructuredLocation } from '@/utils/location';
import registrationService, {
  type HospitalRegistrationData,
  type RegistrationResponse,
} from '@/services/registrationService';
import { attachDraftRegistrationId, saveHospitalAdminDraft } from '@/services/hospitalAdminDraftStore';

type InventoryOperatingMode = 'dashboard' | 'api';

const HospitalRegistration = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [locationValidationError, setLocationValidationError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const { toast } = useToast();
  const [submittedRegistration, setSubmittedRegistration] = useState<RegistrationResponse['data'] | null>(null);

  const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;
  
  // Form state — flat structure matching /api/v1/hospital-registration/ payload
  const [formData, setFormData] = useState({
    name: '',
    registration_number: '',
    email: '',
    admin_name: '',
    admin_email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    country: '',
    latitude: '',
    longitude: '',
    hospital_type: 'general' as 'general' | 'teaching' | 'specialty' | 'clinic',
    facility_type: 'hospital' as 'hospital' | 'pharmacy' | 'clinic' | 'warehouse',
    facility_classification: 'PRIVATE' as 'GOVT' | 'PRIVATE',
    data_submission_type: 'manual' as 'api' | 'csv_upload' | 'manual',
    needs_inventory_dashboard: true,
    inventory_source_type: 'DASHBOARD' as 'API' | 'CSV' | 'DASHBOARD' | 'HYBRID',
    has_existing_api: false,
    // optional API config
    api_base_url: '',
    api_auth_type: 'none' as 'none' | 'api_key' | 'basic' | 'bearer',
    api_key: '',
    api_username: '',
    api_password: '',
    bearer_token: '',
  });
  
  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const isValidHttpUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const clearApiConfig = {
    api_base_url: '',
    api_auth_type: 'none' as const,
    api_key: '',
    api_username: '',
    api_password: '',
    bearer_token: '',
  };

  const applyInventoryOperatingMode = (mode: InventoryOperatingMode) => {
    setFormData((prev) => {
      if (mode === 'api') {
        return {
          ...prev,
          has_existing_api: true,
          needs_inventory_dashboard: false,
          data_submission_type: 'api',
          inventory_source_type: 'API',
        };
      }

      return {
        ...prev,
        has_existing_api: false,
        needs_inventory_dashboard: true,
        data_submission_type: prev.data_submission_type === 'api' ? 'manual' : prev.data_submission_type,
        inventory_source_type: prev.inventory_source_type === 'API' ? 'DASHBOARD' : prev.inventory_source_type,
        ...clearApiConfig,
      };
    });
  };

  const handleApiIntegrationDecision = (hasApi: boolean) => {
    applyInventoryOperatingMode(hasApi ? 'api' : 'dashboard');
  };

  const handleLocationChange = (location: StructuredLocation | null) => {
    setFormData((prev) => ({
      ...prev,
      latitude: typeof location?.lat === 'number' ? String(location.lat) : '',
      longitude: typeof location?.lng === 'number' ? String(location.lng) : '',
      address: location?.address ?? '',
    }));

    setErrors((prev) => {
      if (!prev.latitude && !prev.longitude && !prev.location && !prev.address) {
        return prev;
      }

      const next = { ...prev };
      delete next.latitude;
      delete next.longitude;
      delete next.location;
      delete next.address;
      return next;
    });
  };
  
  // Inline validation is performed in handleSubmit now (no wizard steps)
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Validate all required fields (both sections)
    const newErrors: Record<string, string[]> = {};
    // Section: Hospital Info
    if (!formData.name) newErrors.name = ['Hospital name is required'];
    if (!formData.registration_number) newErrors.registration_number = ['Registration number is required'];
    if (!formData.email) newErrors.email = ['Contact email is required'];
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = ['Invalid email format'];
    if (!formData.admin_name) newErrors.admin_name = ['Hospital admin name is required'];
    if (!formData.admin_email) newErrors.admin_email = ['Hospital admin email is required'];
    else if (!/\S+@\S+\.\S+/.test(formData.admin_email)) newErrors.admin_email = ['Invalid admin email format'];
    if (!formData.facility_type) newErrors.facility_type = ['Facility type is required'];
    if (!formData.facility_classification) newErrors.facility_classification = ['Facility classification is required'];
    if (!formData.data_submission_type) newErrors.data_submission_type = ['Data submission type is required'];
    if (!formData.inventory_source_type) newErrors.inventory_source_type = ['Inventory source type is required'];

    if (formData.has_existing_api && formData.needs_inventory_dashboard) {
      newErrors.needs_inventory_dashboard = ['Inventory dashboard mode and API integration cannot both be enabled'];
    }

    if (formData.has_existing_api && formData.data_submission_type !== 'api') {
      newErrors.data_submission_type = ['API integration mode requires API data submission type'];
    }

    if (formData.has_existing_api && formData.inventory_source_type !== 'API') {
      newErrors.inventory_source_type = ['API integration mode requires API inventory source type'];
    }

    if (!formData.has_existing_api && formData.data_submission_type === 'api') {
      newErrors.data_submission_type = ['API data submission is unavailable when Inventory Management System mode is selected'];
    }

    if (!formData.has_existing_api && formData.inventory_source_type === 'API') {
      newErrors.inventory_source_type = ['API source is unavailable when Inventory Management System mode is selected'];
    }
    if (locationValidationError) {
      newErrors.location = [locationValidationError];
    }
    if (formData.latitude) {
      const lat = Number(formData.latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        newErrors.latitude = ['Latitude must be a number between -90 and 90'];
      }
    }
    if (formData.longitude) {
      const lng = Number(formData.longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        newErrors.longitude = ['Longitude must be a number between -180 and 180'];
      }
    }
    // Section: API Config (optional)
    if (formData.has_existing_api) {
      if (!formData.api_base_url) {
        newErrors.api_base_url = ['API base URL is required when API integration is enabled'];
      } else if (!isValidHttpUrl(formData.api_base_url)) {
        newErrors.api_base_url = ['Enter a valid URL that starts with http:// or https://'];
      }

      if (formData.api_auth_type === 'api_key' && !formData.api_key) {
        newErrors.api_key = ['API key is required when using API Key authentication'];
      }
      if (formData.api_auth_type === 'basic' && (!formData.api_username || !formData.api_password)) {
        newErrors.api_username = ['Username and password are required for basic authentication'];
      }
      if (formData.api_auth_type === 'bearer' && !formData.bearer_token) {
        newErrors.bearer_token = ['Bearer token is required for bearer authentication'];
      }
    }
    if (logoFile) {
      if (!ALLOWED_LOGO_TYPES.includes(logoFile.type)) {
        newErrors.logo = ['Logo must be a PNG, JPG, WEBP, or GIF image'];
      } else if (logoFile.size > MAX_LOGO_SIZE_BYTES) {
        newErrors.logo = ['Logo size must be less than 5 MB'];
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors before submitting',
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    setErrors({});
    
    try {
      // Save frontend-only hospital admin onboarding details.
      saveHospitalAdminDraft({
        admin_name: formData.admin_name,
        admin_email: formData.admin_email,
        registration_number: formData.registration_number,
        registration_email: formData.email,
        created_at: new Date().toISOString(),
      });

      // Build payload
      const payload: HospitalRegistrationData = {
        name: formData.name,
        registration_number: formData.registration_number,
        email: formData.email,
        admin_name: formData.admin_name,
        admin_email: formData.admin_email,
        phone: formData.phone,
        facility_type: formData.facility_type,
        facility_classification: formData.facility_classification,
        data_submission_type: formData.data_submission_type,
        inventory_source_type: formData.inventory_source_type,
        needs_inventory_dashboard: formData.needs_inventory_dashboard,
      };
      if (formData.facility_type === 'hospital') {
        payload.hospital_type = formData.hospital_type;
      }
      if (formData.website) payload.website = formData.website;
      if (formData.address) payload.address = formData.address;
      if (formData.city) payload.city = formData.city;
      if (formData.state) payload.state = formData.state;
      if (formData.country) payload.country = formData.country;
      if (formData.latitude) payload.latitude = formData.latitude;
      if (formData.longitude) payload.longitude = formData.longitude;
      if (formData.has_existing_api) {
        payload.api_base_url = formData.api_base_url;
        payload.api_auth_type = formData.api_auth_type;
        if (formData.api_key) payload.api_key = formData.api_key;
        if (formData.api_username) payload.api_username = formData.api_username;
        if (formData.api_password) payload.api_password = formData.api_password;
        if (formData.bearer_token) payload.bearer_token = formData.bearer_token;
      }
      
      const response = await registrationService.registerHospital(
        logoFile ? { ...payload, logo: logoFile } : payload,
      );
      
      if (response.success) {
        const registrationId = response.data?.id;
        if (registrationId) {
          attachDraftRegistrationId(
            {
              registration_number: formData.registration_number,
              registration_email: formData.email,
            },
            registrationId
          );
        }

        toast({
          title: 'Registration Submitted',
          description: response.message || 'Your registration is pending review.',
        });
        setSubmittedRegistration({
          ...response.data,
          admin_email: response.data?.admin_email || formData.admin_email,
        });
      } else {
        if (response.errors) setErrors(response.errors);
        toast({
          title: 'Registration Failed',
          description: response.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: 'Registration Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const getFieldError = (field: string): string | undefined => errors[field]?.[0];

  if (submittedRegistration) {
    const registration = submittedRegistration;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-secondary/20">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Activity className="h-7 w-7 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold">HealthSync</h1>
            </div>
          </div>

          <Card className="border-2 border-primary/20">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <CardTitle className="text-2xl">Registration Submitted!</CardTitle>
              <CardDescription>
                Your health facility registration request has been received and is pending review
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-lg mb-3">Registration Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Facility Name</p>
                    <p className="font-medium">{registration.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Registration Number</p>
                    <p className="font-medium font-mono">{registration.registration_number}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Contact Email</p>
                    <p className="font-medium">{registration.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Submission Mode</p>
                    <p className="font-medium">{formData.data_submission_type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Inventory Source</p>
                    <p className="font-medium">{formData.inventory_source_type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="font-medium text-yellow-600 capitalize">
                        {registration.status?.replace('_', ' ') ?? 'Pending Approval'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-lg mb-3">What Happens Next?</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">1</div>
                    <div>
                      <p className="font-medium">Review by Platform Admin</p>
                      <p className="text-sm text-muted-foreground">A platform administrator will review your facility registration details. This typically takes 1–2 business days.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">2</div>
                    <div>
                      <p className="font-medium flex items-center gap-1"><Mail className="h-4 w-4" /> Invitation Email Sent on Approval</p>
                        <p className="text-sm text-muted-foreground">Once approved, a <strong>password setup email</strong> will be sent to the <strong>facility admin email</strong> <strong>{registration.admin_email || formData.admin_email}</strong>. This email contains a secure link to set up your administrator account and password.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">3</div>
                    <div>
                      <p className="font-medium flex items-center gap-1"><Key className="h-4 w-4" /> Set Your Password</p>
                      <p className="text-sm text-muted-foreground">Click the invitation link in the email to create your secure password and activate your facility admin account.</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">4</div>
                    <div>
                      <p className="font-medium flex items-center gap-1"><LogIn className="h-4 w-4" /> Log In and Get Started</p>
                      <p className="text-sm text-muted-foreground">After setting your password, return to the login page and sign in with your email and the password you chose.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Important</p>
                  <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">No account has been created yet. Credentials are created only after approval, and the setup link is sent to the facility admin email <strong>{registration.admin_email || formData.admin_email}</strong>.</p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button className="flex-1" onClick={() => window.location.assign('/login')}>Go to Login</Button>
                <Button variant="outline" className="flex-1" onClick={() => window.location.assign('/register')}>Register Another Facility</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-secondary/20">
      {/* Header */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      
      <div className="fixed top-4 left-4 z-50">
        <Link to="/login">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Login
          </Button>
        </Link>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Activity className="h-7 w-7 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold">HealthSync</h1>
            </div>
            <p className="text-muted-foreground">
                Register your health facility to join the resource sharing network
            </p>
          </div>
          
          
          
          {/* Form Card */}
          <div className="w-full">
            <div className="sticky top-20">
              <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Health Facility Registration
              </CardTitle>
              <CardDescription>
                Complete facility identity, source setup, and integration details below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                {/* Hospital Info Section */}
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Health Facility Information</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Facility Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => updateField('name', e.target.value)}
                          placeholder="Metro General Hospital"
                        />
                        {getFieldError('name') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('name')}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="registration_number">Registration Number *</Label>
                        <Input
                          id="registration_number"
                          value={formData.registration_number}
                          onChange={(e) => updateField('registration_number', e.target.value)}
                          placeholder="REG-2024-12345"
                        />
                        {getFieldError('registration_number') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('registration_number')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border p-4 bg-muted/20">
                      <Label htmlFor="logo" className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Facility Logo (Optional)
                      </Label>
                      <Input
                        id="logo"
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        onChange={(e) => {
                          const selected = e.target.files?.[0] ?? null;
                          setLogoFile(selected);
                          if (errors.logo) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.logo;
                              return next;
                            });
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Accepted types: PNG, JPG, WEBP, GIF. Max size: 5 MB.
                      </p>
                      {logoFile && (
                        <p className="text-xs text-muted-foreground">
                          Selected file: <span className="font-medium">{logoFile.name}</span>
                        </p>
                      )}
                      {getFieldError('logo') && (
                        <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {getFieldError('logo')}
                        </p>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="email">Contact Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => updateField('email', e.target.value)}
                          placeholder="contact@hospital.com"
                        />
                        {getFieldError('email') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('email')}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="phone">Contact Phone</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => updateField('phone', e.target.value)}
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="facility_type">Facility Type *</Label>
                        <Select
                          value={formData.facility_type}
                          onValueChange={(v) => updateField('facility_type', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hospital">Hospital</SelectItem>
                            <SelectItem value="pharmacy">Pharmacy</SelectItem>
                            <SelectItem value="clinic">Clinic</SelectItem>
                            <SelectItem value="warehouse">Warehouse</SelectItem>
                          </SelectContent>
                        </Select>
                        {getFieldError('facility_type') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('facility_type')}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="facility_classification">Facility Classification *</Label>
                        <Select
                          value={formData.facility_classification}
                          onValueChange={(v) => updateField('facility_classification', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GOVT">Government</SelectItem>
                            <SelectItem value="PRIVATE">Private</SelectItem>
                          </SelectContent>
                        </Select>
                        {getFieldError('facility_classification') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('facility_classification')}
                          </p>
                        )}
                      </div>
                    </div>

                    {formData.facility_type === 'hospital' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="hospital_type">Hospital Type</Label>
                          <Select
                            value={formData.hospital_type}
                            onValueChange={(v) => updateField('hospital_type', v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="teaching">Teaching</SelectItem>
                              <SelectItem value="specialty">Specialty</SelectItem>
                              <SelectItem value="clinic">Clinic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="website">Website</Label>
                          <Input
                            id="website"
                            value={formData.website}
                            onChange={(e) => updateField('website', e.target.value)}
                            placeholder="https://www.hospital.com"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          value={formData.website}
                          onChange={(e) => updateField('website', e.target.value)}
                          placeholder="https://www.facility.com"
                        />
                      </div>
                    )}


                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => updateField('city', e.target.value)}
                          placeholder="San Francisco"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => updateField('state', e.target.value)}
                          placeholder="CA"
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) => updateField('country', e.target.value)}
                          placeholder="USA"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <BroadcastLocationPicker
                      value={{
                        ...(formData.latitude ? { lat: Number(formData.latitude) } : {}),
                        ...(formData.longitude ? { lng: Number(formData.longitude) } : {}),
                        ...(formData.address ? { address: formData.address } : {}),
                      }}
                      onChange={handleLocationChange}
                      onValidationErrorChange={setLocationValidationError}
                      disabled={isLoading}
                    />
                    {getFieldError('location') && (
                      <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {getFieldError('location')}
                      </p>
                    )}
                    {getFieldError('latitude') && (
                      <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {getFieldError('latitude')}
                      </p>
                    )}
                    {getFieldError('longitude') && (
                      <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {getFieldError('longitude')}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Search a place, pick on map, use current location, or enter coordinates manually.
                    </p>
                    </div>

                    <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                      <p className="text-sm font-medium">Facility Admin Information</p>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="admin_name">Admin Name *</Label>
                          <Input
                            id="admin_name"
                            required
                            value={formData.admin_name}
                            onChange={(e) => updateField('admin_name', e.target.value)}
                            placeholder="Dr. Jane Smith"
                          />
                          {getFieldError('admin_name') && (
                            <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {getFieldError('admin_name')}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="admin_email">Admin Email *</Label>
                          <Input
                            id="admin_email"
                            type="email"
                            required
                            value={formData.admin_email}
                            onChange={(e) => updateField('admin_email', e.target.value)}
                            placeholder="admin@hospital.com"
                          />
                          {getFieldError('admin_email') && (
                            <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {getFieldError('admin_email')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                {/* API Configuration Section */}
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Inventory Source Decision</p>
                    <p className="text-sm text-muted-foreground">
                      Choose one operating mode. API Integration and Inventory Management System modes are mutually exclusive.
                    </p>

                    <div>
                      <Label htmlFor="inventory_operating_mode">Inventory Operating Mode</Label>
                      <Select
                        value={formData.has_existing_api ? 'api' : 'dashboard'}
                        onValueChange={(value) => handleApiIntegrationDecision(value === 'api')}
                      >
                        <SelectTrigger id="inventory_operating_mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dashboard">HealthSync Inventory Management System (Primary)</SelectItem>
                          <SelectItem value="api">External API Integration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {!formData.has_existing_api && (
                      <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm text-muted-foreground">
                        Inventory Management System mode selected. Facilities can manage inventory directly in HealthSync as their primary inventory platform.
                      </div>
                    )}

                    {formData.has_existing_api && (
                      <>
                        <div>
                          <Label htmlFor="api_base_url">Base API URL *</Label>
                          <Input
                            id="api_base_url"
                            type="url"
                            value={formData.api_base_url}
                            onChange={(e) => updateField('api_base_url', e.target.value)}
                            placeholder="https://api.cityhospital.com"
                          />
                          <p className="text-sm text-muted-foreground mt-1">
                            Must start with http:// or https://
                          </p>
                          {getFieldError('api_base_url') && (
                            <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {getFieldError('api_base_url')}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="api_auth_type">Authentication Type</Label>
                          <Select
                            value={formData.api_auth_type}
                            onValueChange={(v) => updateField('api_auth_type', v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="api_key">API Key</SelectItem>
                              <SelectItem value="basic">Basic Auth</SelectItem>
                              <SelectItem value="bearer">Bearer Token</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {formData.api_auth_type === 'api_key' && (
                          <div>
                            <Label htmlFor="api_key">API Key</Label>
                            <Input
                              id="api_key"
                              type="password"
                              value={formData.api_key}
                              onChange={(e) => updateField('api_key', e.target.value)}
                              placeholder="Enter your API key"
                            />
                            {getFieldError('api_key') && (
                              <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {getFieldError('api_key')}
                              </p>
                            )}
                          </div>
                        )}
                        
                        {formData.api_auth_type === 'basic' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="api_username">Username</Label>
                              <Input
                                id="api_username"
                                value={formData.api_username}
                                onChange={(e) => updateField('api_username', e.target.value)}
                                placeholder="API username"
                              />
                            </div>
                            <div>
                              <Label htmlFor="api_password">Password</Label>
                              <Input
                                id="api_password"
                                type="password"
                                value={formData.api_password}
                                onChange={(e) => updateField('api_password', e.target.value)}
                                placeholder="API password"
                              />
                            </div>
                          </div>
                        )}

                        {formData.api_auth_type === 'bearer' && (
                          <div>
                            <Label htmlFor="bearer_token">Bearer Token</Label>
                            <Input
                              id="bearer_token"
                              type="password"
                              value={formData.bearer_token}
                              onChange={(e) => updateField('bearer_token', e.target.value)}
                              placeholder="Enter bearer token"
                            />
                            {getFieldError('bearer_token') && (
                              <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {getFieldError('bearer_token')}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  </div>
                
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="data_submission_type">Data Submission Type *</Label>
                        <Select
                          value={formData.data_submission_type}
                          onValueChange={(v) => {
                            if (v === 'api') {
                              handleApiIntegrationDecision(true);
                              return;
                            }
                            updateField('data_submission_type', v);
                          }}
                        >
                          <SelectTrigger id="data_submission_type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {formData.has_existing_api ? (
                              <SelectItem value="api">API</SelectItem>
                            ) : (
                              <>
                                <SelectItem value="csv_upload">CSV Upload</SelectItem>
                                <SelectItem value="manual">Manual</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formData.has_existing_api
                            ? 'API mode selected: submission is locked to API.'
                            : 'Inventory Management System mode selected: API submission is disabled.'}
                        </p>
                        {getFieldError('data_submission_type') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('data_submission_type')}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="inventory_source_type">Inventory Source Type *</Label>
                        <Select
                          value={formData.inventory_source_type}
                          onValueChange={(v) => {
                            if (v === 'API') {
                              handleApiIntegrationDecision(true);
                              return;
                            }
                            updateField('inventory_source_type', v);
                          }}
                        >
                          <SelectTrigger id="inventory_source_type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {formData.has_existing_api ? (
                              <SelectItem value="API">API</SelectItem>
                            ) : (
                              <>
                                <SelectItem value="DASHBOARD">DASHBOARD</SelectItem>
                                <SelectItem value="CSV">CSV</SelectItem>
                                <SelectItem value="HYBRID">HYBRID</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        {getFieldError('inventory_source_type') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('inventory_source_type')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-md border p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Inventory Platform Mode</p>
                        <p className="text-sm text-muted-foreground leading-5">
                          {formData.has_existing_api
                            ? 'External API Integration mode is active. Inventory Management System mode is disabled.'
                            : 'HealthSync Inventory Management System mode is active. API integration mode is disabled.'}
                        </p>
                      </div>
                    </div>
                    {getFieldError('needs_inventory_dashboard') && (
                      <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {getFieldError('needs_inventory_dashboard')}
                      </p>
                    )}
                {/* Submit Button */}
                <div className="flex justify-end mt-6 pt-6 border-t">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Submitting...' : 'Submit Registration'}
                  </Button>
                </div>
              </form>
            </CardContent>
              </Card>
            </div>
          </div>
          
          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already registered?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default HospitalRegistration;
