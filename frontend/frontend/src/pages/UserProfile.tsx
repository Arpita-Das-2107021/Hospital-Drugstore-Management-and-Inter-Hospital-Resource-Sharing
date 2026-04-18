import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import authService from '@/services/authService';
import { useToast } from '@/hooks/use-toast';
import { getInitials, resolveMediaUrl } from '@/utils/media';
import { Building2, Camera, Eye, EyeOff, Mail, ShieldCheck, Trash2, Upload, UserCircle2 } from 'lucide-react';

interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  hospital_id: string;
  hospital_name?: string;
  roles: string[];
  is_active: boolean;
  context?: string | null;
  access_mode?: string | null;
  profile_picture?: string | null;
  profile_picture_url?: string | null;
}

const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const hasOwn = (source: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(source, key);

const readString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const parseRoleName = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const roleRecord = value as Record<string, unknown>;
    return (
      readString(roleRecord.code) ||
      readString(roleRecord.name) ||
      readString(roleRecord.role)
    );
  }

  return '';
};

const toRoleList = (...sources: unknown[]): string[] => {
  const roleSet = new Set<string>();

  sources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((entry) => {
        const roleName = parseRoleName(entry);
        if (roleName) roleSet.add(roleName);
      });
      return;
    }

    const roleName = parseRoleName(source);
    if (roleName) roleSet.add(roleName);
  });

  return Array.from(roleSet);
};

const mapProfileData = (payload: unknown, fallbackUser: ReturnType<typeof useAuth>['user']): ProfileData => {
  const root = asRecord(payload);
  const data = asRecord(root.data ?? payload);
  const roles = toRoleList(data.roles, data.role, fallbackUser?.roles, fallbackUser?.role);
  const profilePicture = hasOwn(data, 'profile_picture')
    ? readString(data.profile_picture) || null
    : (fallbackUser?.profile_picture || null);
  const profilePictureUrl = hasOwn(data, 'profile_picture_url')
    ? readString(data.profile_picture_url) || null
    : (fallbackUser?.profile_picture_url || null);

  return {
    id: readString(data.id) || String(fallbackUser?.id || ''),
    email: readString(data.email) || String(fallbackUser?.email || ''),
    full_name: readString(data.full_name) || String(fallbackUser?.full_name || ''),
    hospital_id: readString(data.hospital_id) || String(fallbackUser?.hospital_id || ''),
    hospital_name: readString(data.hospital_name) || fallbackUser?.hospital_name || undefined,
    roles: roles.length > 0 ? roles : ['STAFF'],
    is_active: Boolean(data.is_active ?? true),
    context: readString(data.context) || null,
    access_mode: readString(data.access_mode) || null,
    profile_picture: profilePicture,
    profile_picture_url: profilePictureUrl,
  };
};

const formatFileSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const UserProfile = () => {
  const { user, setAuthUser } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPictureFile, setSelectedPictureFile] = useState<File | null>(null);
  const [picturePreviewUrl, setPicturePreviewUrl] = useState('');
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [removingPicture, setRemovingPicture] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const applyProfilePayload = useCallback((payload: unknown) => {
    const nextProfile = mapProfileData(payload, user);
    setProfile(nextProfile);

    const baseUser = user || authService.getUser();
    if (!baseUser) {
      return;
    }

    setAuthUser({
      ...baseUser,
      id: nextProfile.id || baseUser.id,
      email: nextProfile.email || baseUser.email,
      full_name: nextProfile.full_name || baseUser.full_name,
      hospital_id: nextProfile.hospital_id || baseUser.hospital_id,
      hospital_name: nextProfile.hospital_name || baseUser.hospital_name,
      profile_picture: nextProfile.profile_picture,
      profile_picture_url: nextProfile.profile_picture_url,
    });
  }, [setAuthUser, user]);

  const clearPictureSelection = () => {
    setSelectedPictureFile(null);
    if (pictureInputRef.current) {
      pictureInputRef.current.value = '';
    }
    setPicturePreviewUrl((current) => {
      if (current.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }
      return '';
    });
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profileResponse = await authService.authenticatedRequest<unknown>('/api/auth/me/');
        applyProfilePayload(profileResponse);
      } catch {
        toast({ title: 'Failed to load profile', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [applyProfilePayload, toast]);

  useEffect(() => {
    return () => {
      if (picturePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(picturePreviewUrl);
      }
    };
  }, [picturePreviewUrl]);

  const handlePictureSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please select an image file', variant: 'destructive' });
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PROFILE_PICTURE_BYTES) {
      toast({ title: 'Profile picture must be 5MB or less', variant: 'destructive' });
      event.target.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPicturePreviewUrl((current) => {
      if (current.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }
      return previewUrl;
    });
    setSelectedPictureFile(file);
  };

  const handleUploadPicture = async () => {
    if (!selectedPictureFile) {
      toast({ title: 'Select an image first', variant: 'destructive' });
      return;
    }

    setUploadingPicture(true);
    try {
      const formData = new FormData();
      formData.append('profile_picture', selectedPictureFile);

      const response = await authService.authenticatedRequest<unknown>('/api/auth/me/profile-picture/', {
        method: 'POST',
        body: formData,
      });

      applyProfilePayload(response);
      clearPictureSelection();
      toast({ title: 'Profile picture updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile picture';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setUploadingPicture(false);
    }
  };

  const resolvedPictureUrl = resolveMediaUrl(profile?.profile_picture_url || profile?.profile_picture || '');
  const activePictureUrl = picturePreviewUrl || resolvedPictureUrl;
  const hasStoredPicture = Boolean(resolvedPictureUrl);

  const handleRemovePicture = async () => {
    if (selectedPictureFile && !hasStoredPicture) {
      clearPictureSelection();
      return;
    }

    if (!hasStoredPicture) {
      toast({ title: 'No profile picture to remove', variant: 'destructive' });
      return;
    }

    setRemovingPicture(true);
    try {
      const response = await authService.authenticatedRequest<unknown>('/api/auth/me/profile-picture/', {
        method: 'DELETE',
      });

      applyProfilePayload(response);
      clearPictureSelection();
      toast({ title: 'Profile picture removed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove profile picture';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setRemovingPicture(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'All password fields are required', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'New password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'New password and confirm password do not match', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await authService.changePassword(currentPassword, newPassword, confirmPassword);
      toast({ title: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const roleBadges = useMemo(() => {
    if (!profile?.roles || profile.roles.length === 0) {
      return ['STAFF'];
    }
    return profile.roles;
  }, [profile?.roles]);

  const profileInitials = getInitials(profile?.full_name || profile?.email || 'User');

  if (loading) {
    return (
      <AppLayout title="User Profile">
        <div className="mx-auto max-w-5xl">
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-3 py-10">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <p className="text-sm text-muted-foreground">Loading profile...</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="User Profile" subtitle="Manage your account details, picture, and security settings.">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-sky-100/70 via-background to-emerald-100/70">
          <CardContent className="p-6 md:p-8">
            <div className="grid gap-8 md:grid-cols-12">
              <div className="md:col-span-4 space-y-4">
                <input
                  ref={pictureInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePictureSelection}
                  className="hidden"
                />

                <Avatar className="h-28 w-28 ring-4 ring-background shadow-lg">
                  {activePictureUrl ? <AvatarImage src={activePictureUrl} alt="Profile picture" /> : null}
                  <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
                    {profileInitials}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => pictureInputRef.current?.click()}
                      disabled={uploadingPicture || removingPicture}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Choose Photo
                    </Button>
                    <Button
                      type="button"
                      onClick={handleUploadPicture}
                      disabled={!selectedPictureFile || uploadingPicture || removingPicture}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {uploadingPicture ? 'Uploading...' : 'Save Photo'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemovePicture}
                      disabled={uploadingPicture || removingPicture || (!selectedPictureFile && !hasStoredPicture)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {removingPicture ? 'Removing...' : selectedPictureFile && !hasStoredPicture ? 'Clear Selection' : 'Remove Photo'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">JPG, PNG, or WEBP up to 5MB.</p>
                  {selectedPictureFile ? (
                    <p className="text-xs text-muted-foreground">
                      Selected: {selectedPictureFile.name} ({formatFileSize(selectedPictureFile.size)})
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="md:col-span-8 space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{profile?.full_name || 'Unnamed User'}</h2>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{profile?.email || 'No email available'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={profile?.is_active ? 'default' : 'destructive'}>
                    {profile?.is_active ? 'Active account' : 'Inactive account'}
                  </Badge>
                  {profile?.context ? <Badge variant="secondary">{profile.context}</Badge> : null}
                  {profile?.access_mode ? <Badge variant="outline">{profile.access_mode}</Badge> : null}
                </div>

                <div className="rounded-xl border bg-background/70 p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned Roles</p>
                  <div className="flex flex-wrap gap-2">
                    {roleBadges.map((role) => (
                      <Badge key={role} variant="outline" className="bg-background">
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Profile metadata synced from your authenticated account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Full Name</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>{profile?.full_name || '-'}</span>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{profile?.email || '-'}</span>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Hospital</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{profile?.hospital_name || '-'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Use your current password to set a new secure password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="current_password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current_password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm_password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
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
            <Button onClick={handleChangePassword} disabled={submitting}>
              {submitting ? 'Updating...' : 'Update Password'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default UserProfile;
