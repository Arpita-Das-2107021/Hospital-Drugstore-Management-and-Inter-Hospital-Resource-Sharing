// frontend/src/pages/AcceptInvitation.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle,
  Circle,
  CircleCheck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { invitationService } from '../services/invitationService';

interface InvitationDetails {
  email?: string;
  first_name?: string;
  last_name?: string;
  designation?: string;
  hospital_name?: string;
  department_name?: string;
  role_name?: string;
  status?: string;
  expires_at?: string;
  is_expired?: boolean;
  can_be_accepted?: boolean;
}

const MIN_PASSWORD_LENGTH = 8;

const AuthShell: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-100 px-4 py-8 sm:px-6 sm:py-10">
    <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/40 blur-3xl" />
    <div className="pointer-events-none absolute -left-12 bottom-10 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl" />
    <div className="pointer-events-none absolute -right-12 top-1/3 h-64 w-64 rounded-full bg-indigo-200/40 blur-3xl" />
    <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
      {children}
    </div>
  </div>
);

const formatStatus = (status?: string) => {
  if (!status) return 'Pending';
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const AcceptInvitation: React.FC = () => {
  const { token: routeToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const token = (routeToken || searchParams.get('token') || '').trim();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const fetchInvitationDetails = async () => {
      if (!token) {
        setError('Invalid invitation link');
        setLoading(false);
        return;
      }

      try {
        const data = await invitationService.getInvitationByToken(token);
        setInvitation(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load invitation details';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void fetchInvitationDetails();
  }, [token]);

  useEffect(() => {
    if (!success) return undefined;

    const timeoutId = window.setTimeout(() => {
      navigate('/login');
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [success, navigate]);

  const passwordRules = useMemo(
    () => [
      {
        label: `At least ${MIN_PASSWORD_LENGTH} characters`,
        passed: password.length >= MIN_PASSWORD_LENGTH,
      },
      {
        label: 'Contains uppercase letter',
        passed: /[A-Z]/.test(password),
      },
      {
        label: 'Contains lowercase letter',
        passed: /[a-z]/.test(password),
      },
      {
        label: 'Contains number',
        passed: /\d/.test(password),
      },
      {
        label: 'Contains special character',
        passed: /[^A-Za-z0-9]/.test(password),
      },
    ],
    [password],
  );

  const passwordSuggestionScore = useMemo(
    () => passwordRules.slice(1).filter((rule) => rule.passed).length,
    [passwordRules],
  );

  const passwordStrength = useMemo(() => {
    if (!password) {
      return {
        label: 'Not set',
        percent: 0,
        barClass: 'bg-slate-300',
        textClass: 'text-slate-500',
      };
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        label: 'Too short',
        percent: 20,
        barClass: 'bg-rose-500',
        textClass: 'text-rose-700',
      };
    }

    if (passwordSuggestionScore <= 1) {
      return {
        label: 'Weak',
        percent: 45,
        barClass: 'bg-amber-500',
        textClass: 'text-amber-700',
      };
    }

    if (passwordSuggestionScore <= 3) {
      return {
        label: 'Strong',
        percent: 75,
        barClass: 'bg-sky-500',
        textClass: 'text-sky-700',
      };
    }

    return {
      label: 'Excellent',
      percent: 100,
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-700',
    };
  }, [password, passwordSuggestionScore]);

  const roleDisplay = useMemo(() => {
    if (!invitation) return '';
    if (invitation.role_name && invitation.designation) {
      return `${invitation.designation} (${invitation.role_name})`;
    }
    return invitation.role_name || invitation.designation || '';
  }, [invitation]);

  const expiresAtLabel = useMemo(() => {
    if (!invitation?.expires_at) return '';
    const dateValue = new Date(invitation.expires_at);
    if (Number.isNaN(dateValue.getTime())) return '';
    return dateValue.toLocaleString();
  }, [invitation?.expires_at]);

  const isExpiringSoon = useMemo(() => {
    if (!invitation?.expires_at || invitation.is_expired) return false;
    const dateValue = new Date(invitation.expires_at);
    if (Number.isNaN(dateValue.getTime())) return false;
    return dateValue.getTime() - Date.now() < 1000 * 60 * 60 * 48;
  }, [invitation?.expires_at, invitation?.is_expired]);

  const hasInvitationDetails = useMemo(
    () =>
      Boolean(
        invitation?.first_name ||
          invitation?.last_name ||
          invitation?.email ||
          invitation?.hospital_name ||
          roleDisplay ||
          invitation?.department_name,
      ),
    [invitation, roleDisplay],
  );

  const showPasswordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const canSubmit =
    Boolean(token) &&
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length >= MIN_PASSWORD_LENGTH &&
    password === confirmPassword &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    if (!token) {
      setFormError('Invalid invitation token');
      return;
    }

    try {
      setSubmitting(true);
      await invitationService.acceptInvitation({
        token,
        password,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to accept invitation';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthShell>
        <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/90 p-8 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-4 text-base font-medium text-slate-700">Loading invitation details...</p>
          <p className="mt-1 text-sm text-slate-500">This should only take a moment.</p>
        </div>
      </AuthShell>
    );
  }

  if (error || !invitation) {
    return (
      <AuthShell>
        <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white/95 p-8 text-center shadow-2xl backdrop-blur">
          <AlertCircle className="mx-auto mb-4 h-14 w-14 text-red-500" />
          <h2 className="text-2xl font-bold text-slate-900">Invalid Invitation</h2>
          <p className="mt-3 text-sm text-slate-600">{error || 'This invitation link is not valid anymore.'}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </AuthShell>
    );
  }

  if (invitation.can_be_accepted === false) {
    return (
      <AuthShell>
        <div className="w-full max-w-md rounded-2xl border border-amber-100 bg-white/95 p-8 text-center shadow-2xl backdrop-blur">
          <AlertCircle className="mx-auto mb-4 h-14 w-14 text-amber-500" />
          <h2 className="text-2xl font-bold text-slate-900">
            {invitation.is_expired ? 'Invitation Expired' : 'Invitation Unavailable'}
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            {invitation.is_expired
              ? 'This invitation has expired. Please contact your hospital administrator for a new invitation.'
              : `This invitation is currently ${formatStatus(invitation.status).toLowerCase()}.`}
          </p>
          {expiresAtLabel && <p className="mt-2 text-xs text-slate-500">Expired on {expiresAtLabel}</p>}
          <button
            onClick={() => navigate('/login')}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell>
        <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/95 p-8 text-center shadow-2xl backdrop-blur">
          <CheckCircle className="mx-auto mb-4 h-14 w-14 text-emerald-500" />
          <h2 className="text-2xl font-bold text-slate-900">Invitation Accepted</h2>
          <p className="mt-2 text-sm text-slate-600">Your account has been created successfully.</p>
          <p className="mt-1 text-xs text-slate-500">Redirecting to login page...</p>
          <div className="mx-auto mt-5 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl border border-white/70 bg-white/90 p-6 shadow-2xl backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff Invitation</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Create your password to activate your HealthSync account.
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              <span>{formatStatus(invitation.status)}</span>
            </div>
          </div>

          {expiresAtLabel && (
            <div
              className={`mt-5 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                isExpiringSoon
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-sky-200 bg-sky-50 text-sky-800'
              }`}
            >
              <CalendarClock className="h-4 w-4 flex-shrink-0" />
              <span>{invitation.is_expired ? `Expired: ${expiresAtLabel}` : `Expires: ${expiresAtLabel}`}</span>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(invitation.first_name || invitation.last_name) && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <User className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {[invitation.first_name, invitation.last_name].filter(Boolean).join(' ')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {invitation.email && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</p>
                    <p className="break-all text-sm font-semibold text-slate-900">{invitation.email}</p>
                  </div>
                </div>
              </div>
            )}

            {invitation.hospital_name && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Hospital</p>
                    <p className="text-sm font-semibold text-slate-900">{invitation.hospital_name}</p>
                  </div>
                </div>
              </div>
            )}

            {roleDisplay && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <Briefcase className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Role</p>
                    <p className="text-sm font-semibold text-slate-900">{roleDisplay}</p>
                  </div>
                </div>
              </div>
            )}

            {invitation.department_name && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 sm:col-span-2">
                <div className="flex items-start gap-2">
                  <Briefcase className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Department</p>
                    <p className="text-sm font-semibold text-slate-900">{invitation.department_name}</p>
                  </div>
                </div>
              </div>
            )}

            {!hasInvitationDetails && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <p className="text-sm text-slate-600">
                  You have been invited to join HealthSync. Create a secure password below to finish your registration.
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/80 p-4">
            <p className="mb-3 text-sm font-semibold text-blue-900">Before you continue</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-blue-800">
                <CircleCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>Use the same email address that received this invitation.</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-blue-800">
                <CircleCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>Your password must be at least {MIN_PASSWORD_LENGTH} characters long.</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-blue-800">
                <CircleCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>After account setup, you will be redirected to the sign-in page automatically.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-6 shadow-2xl backdrop-blur sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Set your account password</h2>
              <p className="text-sm text-slate-600">Make it memorable and hard to guess.</p>
            </div>
          </div>

          {formError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="invitation-password" className="mb-1 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="invitation-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formError) {
                      setFormError('');
                    }
                  }}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder={`Enter password (min ${MIN_PASSWORD_LENGTH} characters)`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">Password strength</p>
                  <p className={`text-xs font-semibold ${passwordStrength.textClass}`}>{passwordStrength.label}</p>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.barClass}`}
                    style={{ width: `${passwordStrength.percent}%` }}
                  />
                </div>
              </div>

              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {passwordRules.map((rule) => (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-2 text-xs ${
                      rule.passed ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {rule.passed ? (
                      <CircleCheck className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span>{rule.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label htmlFor="invitation-confirm-password" className="mb-1 block text-sm font-semibold text-slate-700">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="invitation-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (formError) {
                      setFormError('');
                    }
                  }}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Re-enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-700"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {showPasswordMismatch && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                  <AlertCircle className="h-4 w-4" />
                  Passwords do not match
                </p>
              )}
              {passwordsMatch && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CircleCheck className="h-4 w-4" />
                  Passwords match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition-all hover:from-blue-700 hover:via-cyan-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:from-slate-400 disabled:via-slate-400 disabled:to-slate-400 disabled:shadow-none"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <span>Accept Invitation & Create Account</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-6 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login')}
                className="font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                Sign in here
              </button>
            </p>
          </div>
        </section>
      </div>
    </AuthShell>
  );
};

export default AcceptInvitation;
