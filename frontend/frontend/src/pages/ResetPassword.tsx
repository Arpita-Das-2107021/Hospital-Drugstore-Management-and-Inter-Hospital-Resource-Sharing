import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, ArrowLeft, CheckCircle, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useToast } from '@/hooks/use-toast';
import authService, { AuthError } from '@/services/authService';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const token = searchParams.get('token')?.trim() || '';
  const hasToken = Boolean(token);

  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [passwordValidationErrors, setPasswordValidationErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const pageCopy = useMemo(() => {
    if (hasToken) {
      return {
        title: 'Reset your password',
        description: 'Set a new password for your account.',
        submitText: 'Reset Password',
        submittingText: 'Resetting...',
      };
    }
    return {
      title: 'Forgot your password?',
      description: 'Enter your account email and we will send you a reset link.',
      submitText: 'Send Reset Link',
      submittingText: 'Sending...',
    };
  }, [hasToken]);

  const validateRequestForm = () => {
    if (!email.trim()) {
      setFormError('Email is required.');
      return false;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return false;
    }
    return true;
  };

  const validateConfirmForm = () => {
    if (!newPassword) {
      setFormError('New password is required.');
      return false;
    }
    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return false;
    }
    if (!confirmPassword) {
      setFormError('Please confirm your new password.');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    setPasswordValidationErrors([]);
    setSuccessMessage('');

    const isValid = hasToken ? validateConfirmForm() : validateRequestForm();
    if (!isValid) {
      return;
    }

    setSubmitting(true);
    try {
      if (hasToken) {
        await authService.confirmPasswordReset(token, newPassword);
        const successText = 'Password reset successful. You can now log in with your new password.';
        setSuccessMessage(successText);
        toast({ title: 'Success', description: successText });
        window.setTimeout(() => {
          navigate('/login', { replace: true });
        }, 1800);
      } else {
        const detail = await authService.requestPasswordReset(email);
        setSuccessMessage(detail);
        toast({ title: 'Reset email sent', description: detail });
      }
    } catch (error) {
      let message = error instanceof Error ? error.message : 'Unable to process your request.';
      if (error instanceof AuthError && error.errors && hasToken) {
        const asList = (value?: string | string[]) => {
          if (!value) return [];
          return Array.isArray(value) ? value : [value];
        };

        const passwordErrors = [
          ...asList(error.errors.new_password),
          ...asList(error.errors.newPassword),
          ...asList(error.errors.password),
        ];

        if (passwordErrors.length > 0) {
          setPasswordValidationErrors(passwordErrors);
          message = 'Please choose a stronger password.';
        }

        const tokenErrors = [
          ...asList(error.errors.token),
          ...asList(error.errors.non_field_errors),
          ...asList(error.errors.__all__),
        ];
        if (tokenErrors.length > 0 && passwordErrors.length === 0) {
          message = tokenErrors.join(' ');
        }
      }
      setFormError(message);
      toast({ title: 'Request failed', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-secondary/20">
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

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Activity className="h-7 w-7 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold">HealthSync</h1>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{pageCopy.title}</CardTitle>
              <CardDescription>{pageCopy.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-start gap-2 p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md">
                    <CheckCircle className="h-4 w-4 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {!hasToken ? (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@hospital.org"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={submitting}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="new_password">New Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="new_password"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          disabled={submitting}
                          className="pl-10 pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordValidationErrors.length > 0 && (
                        <ul className="space-y-1 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                          {passwordValidationErrors.map((err, index) => (
                            <li key={`${err}-${index}`} className="list-disc ml-4">{err}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm_password">Confirm New Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="confirm_password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={submitting}
                          className="pl-10 pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? pageCopy.submittingText : pageCopy.submitText}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
