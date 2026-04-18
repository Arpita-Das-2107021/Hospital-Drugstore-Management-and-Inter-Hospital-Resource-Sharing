import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, MessageCircle, Search, UserRound } from 'lucide-react';
import { conversationsApi, staffApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessNavItem, getCanonicalHealthcareId } from '@/lib/accessResolver';

interface StaffProfileRow {
  id: string;
  chatParticipantId: string;
  fullName: string;
  email: string;
  role: string;
  department: string;
  position: string;
  hospitalId: string;
  hospitalName: string;
  status: string;
  isActive: boolean;
  joinedAt: string;
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

const normalizeStaff = (entry: unknown): StaffProfileRow => {
  const record = asRecord(entry);
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
    readText(record.name) ||
    'Unnamed staff';

  const hospitalId = readText(record.hospital_id) || readText(record.hospital);
  const status = readText(record.employment_status) || readText(record.status) || 'active';
  const isActive =
    record.is_active === true ||
    status.toLowerCase() === 'active';

  return {
    id,
    chatParticipantId,
    fullName,
    email: readText(record.email) || readText(nestedUser.email),
    role: readText(record.role_name) || readText(asRecord(record.role).name) || readText(record.position) || '-',
    department: readText(record.department) || '-',
    position: readText(record.position) || '-',
    hospitalId,
    hospitalName: readText(record.hospital_name),
    status,
    isActive,
    joinedAt: readText(record.date_joined) || readText(record.created_at),
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

const StaffProfiles = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<StaffProfileRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [chattingStaffId, setChattingStaffId] = useState<string | null>(null);

  const healthcareId = getCanonicalHealthcareId(user);
  const canMessage = canAccessNavItem(user, 'hospital', CHAT_ACCESS_PERMISSION_CODES);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await staffApi.getAll();
      const root = asRecord(response);
      const data = asRecord(root.data);
      const rawList = Array.isArray(data.results)
        ? data.results
        : Array.isArray(root.data)
          ? (root.data as unknown[])
          : Array.isArray(root.results)
            ? root.results
            : Array.isArray(response)
              ? response
              : [];

      const normalized = rawList
        .map(normalizeStaff)
        .filter((profile) => profile.id);

      const scoped = healthcareId
        ? normalized.filter((profile) => profile.hospitalId === healthcareId)
        : normalized;

      setProfiles(scoped);
    } catch (error: unknown) {
      setProfiles([]);
      toast({
        title: 'Failed to load staff profiles',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [healthcareId, toast]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const filteredProfiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return profiles;

    return profiles.filter((profile) => {
      const haystack = [
        profile.fullName,
        profile.email,
        profile.role,
        profile.department,
        profile.position,
        profile.status,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [profiles, searchTerm]);

  const handleOpenChat = async (profile: StaffProfileRow) => {
    if (!profile.chatParticipantId || profile.chatParticipantId === String(user?.id || '').trim()) {
      navigate('/messages');
      return;
    }

    setChattingStaffId(profile.id);
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
      setChattingStaffId(null);
    }
  };

  return (
    <AppLayout title="Staff Profiles">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Profiles</p>
              <p className="mt-1 text-2xl font-semibold">{profiles.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-600">
                {profiles.filter((profile) => profile.isActive).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Suspended</p>
              <p className="mt-1 text-2xl font-semibold text-rose-600">
                {profiles.filter((profile) => !profile.isActive).length}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Healthcare Staff Directory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, role, or department"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading staff profiles...
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No staff profiles found.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Department / Position</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell className="min-w-[220px]">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <UserRound className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{profile.fullName}</p>
                              <p className="text-xs text-muted-foreground">{profile.email || 'No email'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{profile.role || '-'}</TableCell>
                        <TableCell>
                          <p>{profile.department || '-'}</p>
                          <p className="text-xs text-muted-foreground">{profile.position || '-'}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={profile.isActive ? 'default' : 'destructive'}>
                            {profile.isActive ? 'Active' : 'Suspended'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/hospital-admin/staff-profiles/${encodeURIComponent(profile.id)}`)}
                            >
                              View Profile
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                void handleOpenChat(profile);
                              }}
                              disabled={!canMessage || chattingStaffId === profile.id}
                            >
                              {chattingStaffId === profile.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <MessageCircle className="mr-2 h-4 w-4" />
                              )}
                              Chat
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default StaffProfiles;
