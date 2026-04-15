import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, CheckCircle, Clock, Mail, Key, LogIn } from 'lucide-react';

const RegistrationSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // New API returns { registration: { id, name, registration_number, email, status, submitted_at } }
  const { registration } = location.state || {};
  const adminEmail = registration?.admin_email || registration?.contact_email || registration?.email;

  // If no state (direct navigation), redirect to register instead of login
  if (!registration) {
    navigate('/register');
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
            <CardTitle className="text-2xl">Registration Submitted!</CardTitle>
            <CardDescription>
              Your health facility registration request has been received and is pending review
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Registration Details */}
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
                  <p className="font-medium">{registration.data_submission_type || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Inventory Source</p>
                  <p className="font-medium">{registration.inventory_source_type || 'N/A'}</p>
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

            {/* Next Steps */}
            <div className="border-t pt-4">
              <h3 className="font-semibold text-lg mb-3">What Happens Next?</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Review by Platform Admin</p>
                    <p className="text-sm text-muted-foreground">
                      A platform administrator will review your facility registration details.
                      This typically takes 1–2 business days.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    2
                  </div>
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="h-4 w-4" /> Invitation Email Sent on Approval
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Once approved, a <strong>password setup email</strong> will be sent to the{' '}
                      <strong>facility admin email</strong> <strong>{adminEmail}</strong>. This email contains
                      a secure link to set up your administrator account and password.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    3
                  </div>
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <Key className="h-4 w-4" /> Set Your Password
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Click the invitation link in the email to create your secure password
                      and activate your facility admin account.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    4
                  </div>
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <LogIn className="h-4 w-4" /> Log In and Get Started
                    </p>
                    <p className="text-sm text-muted-foreground">
                      After setting your password, return to the login page and sign in with
                      your email and the password you chose.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Important Note */}
            <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Important</p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                  No account has been created yet — your login credentials will only be set up
                  after your registration is approved and you accept the invitation email.
                  Please check <strong>{adminEmail}</strong> for updates.
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
                onClick={() => navigate('/register')}
              >
                Register Another Facility
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RegistrationSuccess;
