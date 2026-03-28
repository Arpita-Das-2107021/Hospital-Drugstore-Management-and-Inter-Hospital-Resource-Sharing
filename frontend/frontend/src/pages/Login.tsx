import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, LanguageToggle } from '@/components/layout/LanguageToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Activity, Shield, Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const loggedInUser = await login({ 
        email, 
        password, 
        rememberMe 
      });
      
      toast({
        title: 'Login Successful',
        description: `Welcome back!`,
      });

      // Redirect based on role
      if (loggedInUser?.role?.toUpperCase() === 'SUPER_ADMIN') {
        navigate('/admin/hospital-registrations');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Language and Theme Toggle - Fixed Position */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/20">
              <Activity className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('login.title', 'HealthSync')}</h1>
              <p className="text-sm text-primary-foreground/80">{t('login.subtitle')}</p>
            </div>
          </div>
          
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold leading-tight">
                Unified Healthcare<br />Resource Management
              </h2>
              <p className="mt-4 text-lg text-primary-foreground/80 max-w-md">
                Streamline inventory, coordinate multi-hospital resource sharing, 
                and optimize supply chain decisions with AI-powered forecasting.
              </p>
            </div>
            
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                  <Shield className="h-5 w-5" />
                </div>
                <span className="text-sm">HIPAA Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                  <Lock className="h-5 w-5" />
                </div>
                <span className="text-sm">Secure Access</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-primary-foreground/60">
            © 2024 HealthSync.
          </p>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-48 -left-48 h-96 w-96 rounded-full bg-primary-foreground/5" />
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">HealthSync</h1>
          </div>

          <div className="w-full">
            <div className="sticky top-24">
              <Card className="border-0 shadow-lg">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl">{t('login.signIn')}</CardTitle>
              <CardDescription>
                {t('login.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email">{t('login.email')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('login.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{t('login.password')}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('login.passwordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="rememberMe"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                    disabled={isLoading}
                  />
                  <Label 
                    htmlFor="rememberMe" 
                    className="text-sm font-normal cursor-pointer select-none"
                  >
                    Remember me 
                  </Label>
                </div>

                <div className="text-right">
                  <Link to="/reset-password" className="text-sm text-primary hover:underline">
                    Forgot your password?
                  </Link>
                </div>
                
                {/* {!rememberMe && (
                  <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-md p-2">
                    <Shield className="inline h-3 w-3 mr-1" />
                    Session only - you'll be logged out when you close the browser
                  </div>
                )} */}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t('login.signingIn') : t('login.signIn')}
                </Button>

                <div className="text-center text-sm">
                  <p className="text-muted-foreground">
                    New hospital?{' '}
                    <a href="/register" className="text-primary hover:underline font-medium">
                      Register here
                    </a>
                  </p>
                </div>

                {/* <div className="text-center text-sm text-muted-foreground">
                  <p>Test Account: sarah.chen@metro.health</p>
                  <p className="text-xs mt-1">Password: demo1234</p>
                </div> */}
              </form>
            </CardContent>
              </Card>
            </div>
          </div>

          {/* <p className="mt-6 text-center text-sm text-muted-foreground">
            <Shield className="inline h-4 w-4 mr-1" />
            This is a demo system for academic research purposes.
          </p> */}
        </div>
      </div>
    </div>
  );
};

export default Login;