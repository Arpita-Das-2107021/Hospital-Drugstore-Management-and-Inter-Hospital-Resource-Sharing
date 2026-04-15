import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, MessageCircle, UserRound } from 'lucide-react';
import { conversationsApi, staffApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessNavItem } from '@/lib/accessResolver';

interface StaffProfile {
  id: string;
  chatParticipantId: string;
  fullName: string;
  email: string;
  role: string;
  hospitalName: string;
  department: string;
  position: string;
  phoneNumber: string;
  employeeId: string;
  status: string;
  isActive: boolean;
  joinedAt: string;
  lastLogin: string;
}

const CHAT_ACCESS_PERMISSION_CODES = [
  'communication:chat.view',
  'communication:conversation.view',
  'hospital:communication.view',
];

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

const readText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

const mapProfile = (value: unknown): StaffProfile => {
  const record = asRecord(value);
  const nestedUser = asRecord(record.user);

  const id = readText(record.id) || readText(record.staff_id);
  const chatParticipantId =
    readText(record.user_id) ||
    readText(nestedUser.id) ||
    id;

  const firstName = readText(record.first_name);
  const lastName = readText(record.last_name);
  const fullName =
    readText(record.full_name) ||
    `${firstName} ${lastName}`.trim() ||
    readText(nestedUser.full_name) ||
    readText(nestedUser.name) ||
    'Unnamed staff';

  const status = readText(record.employment_status) || readText(record.status) || 'active';

  return {
    id,
    chatParticipantId,
    fullName,
    email: readText(record.email) || readText(nestedUser.email),
    role: readText(record.role_name) || readText(asRecord(record.role).name) || readText(record.position) || '-',
    hospitalName: readText(record.hospital_name) || '-',
    department: readText(record.department) || '-',
    position: readText(record.position) || '-',
    phoneNumber: readText(record.phone_number) || '-',
    employeeId: readText(record.employee_id) || '-',
    status,
    isActive: record.is_active === true || status.toLowerCase() === 'active',
    joinedAt: readText(record.date_joined) || readText(record.created_at),
    lastLogin: readText(record.last_login),
  };
};

const resolveConversationId = (payload: unknown): string => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const conversationSource = asRecord(data.conversation ?? root.conversation ?? root.data ?? payload);

  return (
    readText(conversationSource.id) ||
    readText(conversationSource.conversation_id) ||
    readText(root.conversation_id) ||
    readText(data.conversation_id)
  );
};

const StaffProfileDetails = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { staffId } = useParams<{ staffId: string }>();

  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [profile, setProfile] = useState<StaffProfile | null>(null);

  const canMessage = canAccessNavItem(user, 'hospital', CHAT_ACCESS_PERMISSION_CODES);

  const loadProfile = useCallback(async () => {
    if (!staffId) {
      setLoading(false);
      setProfile(null);
      return;
    }

    setLoading(true);
    try {
      const response = await staffApi.getById(staffId);
      const root = asRecord(response);
      const data = asRecord(root.data);
      const source = Object.keys(data).length > 0 ? data : root;
      setProfile(mapProfile(source));
    } catch (error: unknown) {
      setProfile(null);
      toast({
        title: 'Failed to load staff profile',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [staffId, toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const detailRows = useMemo(() => {
    if (!profile) return [];

    return [
      { label: 'Email', value: profile.email || '-' },
      { label: 'Role', value: profile.role || '-' },
      { label: 'Hospital', value: profile.hospitalName || '-' },
      { label: 'Department', value: profile.department || '-' },
      { label: 'Position', value: profile.position || '-' },
      { label: 'Phone', value: profile.phoneNumber || '-' },
      { label: 'Employee ID', value: profile.employeeId || '-' },
      { label: 'Joined', value: profile.joinedAt ? new Date(profile.joinedAt).toLocaleString() : '-' },
      { label: 'Last Login', value: profile.lastLogin ? new Date(profile.lastLogin).toLocaleString() : '-' },
    ];
  }, [profile]);

  const handleStartChat = async () => {
    if (!profile) return;

    if (!profile.chatParticipantId || profile.chatParticipantId === String(user?.id || '').trim()) {
      navigate('/messages');
      return;
    }

    setStartingChat(true);
    try {
      const response = await conversationsApi.openDirectConversation(profile.chatParticipantId);
      const conversationId = resolveConversationId(response);
      if (!conversationId) {
        throw new Error('Unable to resolve conversation id for this profile.');
      }
      navigate(`/messages?conversation=${encodeURIComponent(conversationId)}`);
    } catch (error: unknown) {
      toast({
        title: 'Unable to start chat',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <AppLayout title="Staff Profile Details">
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate('/hospital-admin/staff-profiles')}>
          Back to Staff Profiles
        </Button>

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-14 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading profile...
            </CardContent>
          </Card>
        ) : !profile ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Staff profile could not be found.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <p>{profile.fullName}</p>
                    <p className="text-sm font-normal text-muted-foreground">{profile.email || 'No email available'}</p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Badge variant={profile.isActive ? 'default' : 'destructive'}>
                  {profile.isActive ? 'Active account' : 'Suspended account'}
                </Badge>
                <Badge variant="outline">{profile.status || 'unknown'}</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {detailRows.map((row) => (
                    <div key={row.label} className="rounded-md border border-border/70 bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
                      <p className="mt-1 text-sm font-medium break-words">{row.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => {
                  void handleStartChat();
                }}
                disabled={!canMessage || startingChat}
              >
                {startingChat ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="mr-2 h-4 w-4" />
                )}
                Start Chat
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default StaffProfileDetails;
