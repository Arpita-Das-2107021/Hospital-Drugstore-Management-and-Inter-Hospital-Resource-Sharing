import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, CheckCircle, Clock, Mail } from 'lucide-react';

const RegistrationSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const { hospital, adminUser } = location.state || {};
  
  // If no state (direct navigation), redirect to login
  if (!hospital || !adminUser) {
    navigate('/login');
    return null;
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-secondary/20">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Activity className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold">HealthSync</h1>
          </div>
        </div>
        
        {/* Success Card */}
        <Card className="border-2 border-primary/20">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Registration Successful!</CardTitle>
            <CardDescription>
              Your hospital has been registered on the HealthSync platform
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Hospital Details */}
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-lg mb-3">Hospital Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Hospital Name</p>
                  <p className="font-medium">{hospital.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hospital Code</p>
                  <p className="font-medium font-mono">{hospital.code}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">License Number</p>
                  <p className="font-medium">{hospital.license_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span className="font-medium text-yellow-600">{hospital.status_display}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Admin User Details */}
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-lg mb-3">Administrator Account</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Username</p>
                  <p className="font-medium font-mono">{adminUser.username}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Full Name</p>
                  <p className="font-medium">{adminUser.full_name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{adminUser.email}</p>
                </div>
              </div>
            </div>
            
            {/* Next Steps */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-lg mb-3">What's Next?</h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Approval Pending</p>
                    <p className="text-sm text-muted-foreground">
                      Your registration is currently pending approval by platform administrators.
                      This usually takes 1-2 business days.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Email Notification</p>
                    <p className="text-sm text-muted-foreground">
                      You will receive an email at <strong>{adminUser.email}</strong> once your
                      hospital is approved.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Access the Platform</p>
                    <p className="text-sm text-muted-foreground">
                      After approval, you can log in using your username <strong>{adminUser.username}</strong> to
                      access the dashboard and start managing resources.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Important Note */}
            <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Check Your Email</p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                  We've sent a confirmation email to both the hospital contact email and
                  administrator email with further instructions.
                </p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button 
                className="flex-1" 
                onClick={() => navigate('/login')}
              >
                Go to Login
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => navigate('/')}
              >
                Back to Home
              </Button>
            </div>
            
            {/* Support */}
            <p className="text-center text-sm text-muted-foreground pt-4 border-t">
              Questions or issues?{' '}
              <Link to="/support" className="text-primary hover:underline">
                Contact Support
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RegistrationSuccess;
