import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Activity, Building2, Cloud, UserPlus, CheckCircle, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import registrationService, { HospitalRegistrationData } from '@/services/registrationService';

const HospitalRegistration = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Form state
  const [formData, setFormData] = useState<HospitalRegistrationData>({
    hospital_name: '',
    license_number: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    contact_email: '',
    contact_phone: '',
    api_config: {
      api_base_url: '',
      auth_type: 'API_KEY',
      api_key: '',
      api_secret: '',
      inventory_endpoint: '/api/inventory',
      staff_endpoint: '/api/staff',
      transfer_request_endpoint: '/api/transfer-requests',
    },
    admin_user: {
      username: '',
      password: '',
      confirm_password: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      designation: 'Hospital Administrator',
    },
  });
  
  const updateFormData = (section: keyof HospitalRegistrationData, field: string, value: string) => {
    if (section === 'api_config' || section === 'admin_user') {
      setFormData(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value,
      }));
    }
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };
  
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string[]> = {};
    
    if (step === 1) {
      // Hospital Information
      if (!formData.hospital_name) newErrors.hospital_name = ['Hospital name is required'];
      if (!formData.license_number) newErrors.license_number = ['License number is required'];
      if (!formData.contact_email) newErrors.contact_email = ['Contact email is required'];
      if (!formData.contact_phone) newErrors.contact_phone = ['Contact phone is required'];
      
      // Email validation
      if (formData.contact_email && !/\S+@\S+\.\S+/.test(formData.contact_email)) {
        newErrors.contact_email = ['Invalid email format'];
      }
    } else if (step === 2) {
      // API Configuration
      if (!formData.api_config.api_base_url) {
        newErrors['api_config.api_base_url'] = ['API base URL is required'];
      } else if (!/^https?:\/\/.+/.test(formData.api_config.api_base_url)) {
        newErrors['api_config.api_base_url'] = ['API base URL must start with http:// or https://'];
      }
      
      if (formData.api_config.auth_type === 'API_KEY' && !formData.api_config.api_key) {
        newErrors['api_config.api_key'] = ['API key is required for API_KEY authentication'];
      }
    } else if (step === 3) {
      // Admin User
      if (!formData.admin_user.username) newErrors['admin_user.username'] = ['Username is required'];
      if (!formData.admin_user.password) newErrors['admin_user.password'] = ['Password is required'];
      if (!formData.admin_user.confirm_password) newErrors['admin_user.confirm_password'] = ['Please confirm password'];
      if (!formData.admin_user.first_name) newErrors['admin_user.first_name'] = ['First name is required'];
      if (!formData.admin_user.last_name) newErrors['admin_user.last_name'] = ['Last name is required'];
      if (!formData.admin_user.email) newErrors['admin_user.email'] = ['Email is required'];
      
      // Email validation
      if (formData.admin_user.email && !/\S+@\S+\.\S+/.test(formData.admin_user.email)) {
        newErrors['admin_user.email'] = ['Invalid email format'];
      }
      
      // Password match
      if (formData.admin_user.password && formData.admin_user.confirm_password &&
          formData.admin_user.password !== formData.admin_user.confirm_password) {
        newErrors['admin_user.confirm_password'] = ['Passwords do not match'];
      }
      
      // Password strength
      if (formData.admin_user.password && formData.admin_user.password.length < 8) {
        newErrors['admin_user.password'] = ['Password must be at least 8 characters'];
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 3));
    } else {
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors before proceeding',
        variant: 'destructive',
      });
    }
  };
  
  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(3)) {
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
      const response = await registrationService.registerHospital(formData);
      
      if (response.success) {
        toast({
          title: 'Registration Successful',
          description: response.message,
        });
        
        // Redirect to a success page or login
        navigate('/registration-success', { 
          state: { 
            hospital: response.data?.hospital,
            adminUser: response.data?.admin_user,
          } 
        });
      } else {
        if (response.errors) {
          setErrors(response.errors);
        }
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
  
  const getFieldError = (field: string): string | undefined => {
    return errors[field]?.[0];
  };
  
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
              Register your hospital to join the resource sharing network
            </p>
          </div>
          
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    currentStep >= step
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    {currentStep > step ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <span className="font-bold">{step}</span>
                    )}
                  </div>
                  {step < 3 && (
                    <div className={`flex-1 h-1 mx-2 ${
                      currentStep > step ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Hospital Info</span>
              <span>API Config</span>
              <span>Admin User</span>
            </div>
          </div>
          
          {/* Form Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {currentStep === 1 && <><Building2 className="h-5 w-5" /> Hospital Information</>}
                {currentStep === 2 && <><Cloud className="h-5 w-5" /> API Configuration</>}
                {currentStep === 3 && <><UserPlus className="h-5 w-5" /> Administrator Account</>}
              </CardTitle>
              <CardDescription>
                {currentStep === 1 && 'Enter your hospital\'s basic information'}
                {currentStep === 2 && 'Configure your hospital\'s API for data synchronization'}
                {currentStep === 3 && 'Create an administrator account for your hospital'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                {/* Step 1: Hospital Information */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="hospital_name">Hospital Name *</Label>
                      <Input
                        id="hospital_name"
                        value={formData.hospital_name}
                        onChange={(e) => updateFormData('hospital_name', 'hospital_name', e.target.value)}
                        placeholder="Metro General Hospital"
                      />
                      {getFieldError('hospital_name') && (
                        <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {getFieldError('hospital_name')}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="license_number">License Number *</Label>
                      <Input
                        id="license_number"
                        value={formData.license_number}
                        onChange={(e) => updateFormData('license_number', 'license_number', e.target.value)}
                        placeholder="LIC-2024-12345"
                      />
                      {getFieldError('license_number') && (
                        <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {getFieldError('license_number')}
                        </p>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="contact_email">Contact Email *</Label>
                        <Input
                          id="contact_email"
                          type="email"
                          value={formData.contact_email}
                          onChange={(e) => updateFormData('contact_email', 'contact_email', e.target.value)}
                          placeholder="contact@hospital.com"
                        />
                        {getFieldError('contact_email') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('contact_email')}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="contact_phone">Contact Phone *</Label>
                        <Input
                          id="contact_phone"
                          type="tel"
                          value={formData.contact_phone}
                          onChange={(e) => updateFormData('contact_phone', 'contact_phone', e.target.value)}
                          placeholder="+1 (555) 123-4567"
                        />
                        {getFieldError('contact_phone') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('contact_phone')}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => updateFormData('address', 'address', e.target.value)}
                        placeholder="123 Main Street"
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => updateFormData('city', 'city', e.target.value)}
                          placeholder="San Francisco"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => updateFormData('state', 'state', e.target.value)}
                          placeholder="CA"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="postal_code">Postal Code</Label>
                        <Input
                          id="postal_code"
                          value={formData.postal_code}
                          onChange={(e) => updateFormData('postal_code', 'postal_code', e.target.value)}
                          placeholder="94102"
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Step 2: API Configuration */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="api_base_url">API Base URL *</Label>
                      <Input
                        id="api_base_url"
                        value={formData.api_config.api_base_url}
                        onChange={(e) => updateFormData('api_config', 'api_base_url', e.target.value)}
                        placeholder="https://api.yourhospital.com"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        The base URL of your hospital's API (must start with http:// or https://)
                      </p>
                      {getFieldError('api_config.api_base_url') && (
                        <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {getFieldError('api_config.api_base_url')}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="auth_type">Authentication Type *</Label>
                      <Select
                        value={formData.api_config.auth_type}
                        onValueChange={(value) => updateFormData('api_config', 'auth_type', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="API_KEY">API Key</SelectItem>
                          <SelectItem value="OAUTH2">OAuth 2.0</SelectItem>
                          <SelectItem value="BASIC_AUTH">Basic Authentication</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {formData.api_config.auth_type === 'API_KEY' && (
                      <div>
                        <Label htmlFor="api_key">API Key *</Label>
                        <Input
                          id="api_key"
                          type="password"
                          value={formData.api_config.api_key}
                          onChange={(e) => updateFormData('api_config', 'api_key', e.target.value)}
                          placeholder="Enter your API key"
                        />
                        {getFieldError('api_config.api_key') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('api_config.api_key')}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {formData.api_config.auth_type !== 'API_KEY' && (
                      <div>
                        <Label htmlFor="api_secret">API Secret</Label>
                        <Input
                          id="api_secret"
                          type="password"
                          value={formData.api_config.api_secret}
                          onChange={(e) => updateFormData('api_config', 'api_secret', e.target.value)}
                          placeholder="Enter your API secret"
                        />
                      </div>
                    )}
                    
                    <div className="border-t pt-4 mt-4">
                      <h4 className="font-medium mb-3">API Endpoints (Optional)</h4>
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="inventory_endpoint">Inventory Endpoint</Label>
                          <Input
                            id="inventory_endpoint"
                            value={formData.api_config.inventory_endpoint}
                            onChange={(e) => updateFormData('api_config', 'inventory_endpoint', e.target.value)}
                            placeholder="/api/inventory"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="staff_endpoint">Staff Endpoint</Label>
                          <Input
                            id="staff_endpoint"
                            value={formData.api_config.staff_endpoint}
                            onChange={(e) => updateFormData('api_config', 'staff_endpoint', e.target.value)}
                            placeholder="/api/staff"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="transfer_request_endpoint">Transfer Request Endpoint</Label>
                          <Input
                            id="transfer_request_endpoint"
                            value={formData.api_config.transfer_request_endpoint}
                            onChange={(e) => updateFormData('api_config', 'transfer_request_endpoint', e.target.value)}
                            placeholder="/api/transfer-requests"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Step 3: Admin User */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="first_name">First Name *</Label>
                        <Input
                          id="first_name"
                          value={formData.admin_user.first_name}
                          onChange={(e) => updateFormData('admin_user', 'first_name', e.target.value)}
                          placeholder="John"
                        />
                        {getFieldError('admin_user.first_name') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('admin_user.first_name')}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="last_name">Last Name *</Label>
                        <Input
                          id="last_name"
                          value={formData.admin_user.last_name}
                          onChange={(e) => updateFormData('admin_user', 'last_name', e.target.value)}
                          placeholder="Doe"
                        />
                        {getFieldError('admin_user.last_name') && (
                          <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {getFieldError('admin_user.last_name')}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="username">Username *</Label>
                      <Input
                        id="username"
                        value={formData.admin_user.username}
                        onChange={(e) => updateFormData('admin_user', 'username', e.target.value)}
                        placeholder="admin123"
                      />
                      {getFieldError('admin_user.username') && (
                        <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {getFieldError('admin_user.username')}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="admin_email">Email *</Label>
                      <Input
                        id="admin_email"
                        type="email"
                        value={formData.admin_user.email}
                        onChange={(e) => updateFormData('admin_user', 'email', e.target.value)}
                        placeholder="admin@hospital.com"
                      />
                      {getFieldError('admin_user.email') && (
                        <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {getFieldError('admin_user.email')}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="admin_phone">Phone</Label>
                      <Input
                        id="admin_phone"
                        type="tel"
                        value={formData.admin_user.phone}
                        onChange={(e) => updateFormData('admin_user', 'phone', e.target.value)}
                        placeholder="+1 (555) 987-6543"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="designation">Designation</Label>
                      <Input
                        id="designation"
                        value={formData.admin_user.designation}
                        onChange={(e) => updateFormData('admin_user', 'designation', e.target.value)}
                        placeholder="Hospital Administrator"
                      />
                    </div>
                    
                    <div className="border-t pt-4 mt-4">
                      <h4 className="font-medium mb-3">Password</h4>
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="password">Password *</Label>
                          <Input
                            id="password"
                            type="password"
                            value={formData.admin_user.password}
                            onChange={(e) => updateFormData('admin_user', 'password', e.target.value)}
                            placeholder="Enter a strong password"
                          />
                          <p className="text-sm text-muted-foreground mt-1">
                            At least 8 characters with letters and numbers
                          </p>
                          {getFieldError('admin_user.password') && (
                            <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {getFieldError('admin_user.password')}
                            </p>
                          )}
                        </div>
                        
                        <div>
                          <Label htmlFor="confirm_password">Confirm Password *</Label>
                          <Input
                            id="confirm_password"
                            type="password"
                            value={formData.admin_user.confirm_password}
                            onChange={(e) => updateFormData('admin_user', 'confirm_password', e.target.value)}
                            placeholder="Re-enter your password"
                          />
                          {getFieldError('admin_user.confirm_password') && (
                            <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {getFieldError('admin_user.confirm_password')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Navigation Buttons */}
                <div className="flex justify-between mt-6 pt-6 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={currentStep === 1 || isLoading}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  
                  {currentStep < 3 ? (
                    <Button type="button" onClick={handleNext}>
                      Next
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? 'Submitting...' : 'Complete Registration'}
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          
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
