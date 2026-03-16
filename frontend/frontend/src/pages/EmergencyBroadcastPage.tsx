import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmergencyBroadcast, {
  BroadcastComposerPayload,
  BroadcastHospitalOption,
  BroadcastTemplate,
} from '@/components/EmergencyBroadcast';
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Siren,
  AlertTriangle,
  MessageSquare,
  CheckCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import { broadcastsApi, hospitalsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { BROADCASTS_UPDATED_EVENT } from '@/constants/events';

interface BroadcastItem {
  id: string;
  title: string;
  message: string;
  status: string;
  scope?: string;
  is_read?: boolean;
  allow_response?: boolean;
  created_by_id?: string;
  created_by_hospital_name?: string;
  responders_count?: number;
  created_at: string;
  priority?: string;
}

interface BroadcastResponseItem {
  id: string;
  hospital_name?: string;
  response?: string;
  created_at?: string;
}

const EMERGENCY_TEMPLATES: BroadcastTemplate[] = [
  {
    id: 'mass-casualty',
    name: 'Mass Casualty Event',
    message: 'Multiple patients requiring immediate care. Share available ICU beds, trauma teams, and blood products.',
    priority: 'emergency',
  },
  {
    id: 'blood-shortage',
    name: 'Critical Blood Shortage',
    message: 'Immediate need for blood products. Please respond with available blood units and compatibility details.',
    priority: 'emergency',
  },
  {
    id: 'equipment-failure',
    name: 'Critical Equipment Failure',
    message: 'Essential medical equipment failure impacting patient care. Share available backup equipment urgently.',
    priority: 'urgent',
  },
  {
    id: 'medication-shortage',
    name: 'Essential Medication Shortage',
    message: 'Critical medication supplies running low. Respond with available stock and dispatch timeline.',
    priority: 'urgent',
  },
];

export default function EmergencyBroadcastPage() {
  const { user } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const role = user?.role?.toUpperCase() ?? '';
  const canCreateBroadcast = role === 'SUPER_ADMIN' || role === 'HOSPITAL_ADMIN';
  const canRespond = Boolean(user?.hospital_id) && role !== 'SUPER_ADMIN';

  const [showBroadcast, setShowBroadcast] = useState(false);
  const [recentBroadcasts, setRecentBroadcasts] = useState<BroadcastItem[]>([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);

  const [hospitalOptions, setHospitalOptions] = useState<BroadcastHospitalOption[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  const [responsesDialogOpen, setResponsesDialogOpen] = useState(false);
  const [responseItems, setResponseItems] = useState<BroadcastResponseItem[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [selectedResponseBroadcast, setSelectedResponseBroadcast] = useState<BroadcastItem | null>(null);

  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedDetailBroadcast, setSelectedDetailBroadcast] = useState<BroadcastItem | null>(null);

  const [respondDialog, setRespondDialog] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<BroadcastItem | null>(null);
  const [respondNotes, setRespondNotes] = useState('');
  const [respondSubmitting, setRespondSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [responseFilter, setResponseFilter] = useState('all');

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  useEffect(() => {
    const state = location.state as { highlightBroadcastId?: string; openDetails?: boolean } | null;
    if (!state?.highlightBroadcastId || recentBroadcasts.length === 0) {
      return;
    }

    const target = recentBroadcasts.find((broadcast) => broadcast.id === String(state.highlightBroadcastId));
    if (!target) {
      return;
    }

    if (state.openDetails) {
      openDetails(target);
    }
  }, [location.state, recentBroadcasts]);

  useEffect(() => {
    if (!canCreateBroadcast) {
      return;
    }
    fetchHospitalOptions();
  }, [canCreateBroadcast, role, user?.hospital_id]);

  const fetchHospitalOptions = async () => {
    setLoadingHospitals(true);
    try {
      const response = await hospitalsApi.getAll();
      const raw: any[] = (response as any)?.data?.results ?? (response as any)?.data ?? (response as any)?.results ?? (Array.isArray(response) ? response : []);
      const currentHospitalId = String(user?.hospital_id || '');
      const filtered = raw.filter((hospital) => {
        const id = String(hospital?.id || '');
        if (!id) return false;
        if (role === 'HOSPITAL_ADMIN' && id === currentHospitalId) {
          return false;
        }
        return true;
      });

      setHospitalOptions(
        filtered.map((hospital) => ({
          id: String(hospital.id),
          name: hospital.name || `Hospital ${hospital.id}`,
        }))
      );
    } catch {
      setHospitalOptions([]);
    } finally {
      setLoadingHospitals(false);
    }
  };

  const fetchBroadcasts = async () => {
    setLoadingBroadcasts(true);
    try {
      const data = await broadcastsApi.getAll();
      const raw: any[] = (data as any)?.data?.results ?? (data as any)?.data ?? (data as any)?.results ?? (Array.isArray(data) ? data : []);
      const items: BroadcastItem[] = raw.map((broadcast: any) => ({
        id: String(broadcast.id),
        title: broadcast.title || 'Emergency Broadcast',
        message: broadcast.message || '',
        status: broadcast.status || 'active',
        scope: broadcast.scope || 'all',
        is_read: Boolean(broadcast.is_read ?? false),
        allow_response: Boolean(broadcast.allow_response ?? true),
        created_by_id: String(broadcast.created_by_id || broadcast.sent_by_id || ''),
        created_by_hospital_name: broadcast.created_by_hospital_name || broadcast.hospital_name || '',
        responders_count:
          broadcast.responders_count ??
          broadcast.responses_count ??
          broadcast.response_count ??
          broadcast.response_total ??
          (Array.isArray(broadcast.responses) ? broadcast.responses.length : 0),
        created_at: broadcast.created_at || new Date().toISOString(),
        priority: broadcast.priority || 'urgent',
      }));
      setRecentBroadcasts(items);
      await hydrateResponseCounts(items);
      window.dispatchEvent(new Event(BROADCASTS_UPDATED_EVENT));
    } catch (err: any) {
      setRecentBroadcasts([]);
      toast({ title: 'Failed to load broadcasts', description: err?.message || 'Please try again later.', variant: 'destructive' });
    } finally {
      setLoadingBroadcasts(false);
    }
  };

  const canViewResponses = (broadcast: BroadcastItem) => {
    const currentUserId = String(user?.id || '');
    return role === 'SUPER_ADMIN' || (!!currentUserId && currentUserId === broadcast.created_by_id);
  };

  const hydrateResponseCounts = async (items: BroadcastItem[]) => {
    const targets = items.filter((broadcast) => canViewResponses(broadcast));
    if (targets.length === 0) {
      return;
    }

    const updates = await Promise.all(
      targets.map(async (broadcast) => {
        try {
          const response = await broadcastsApi.getResponses(broadcast.id);
          const raw: any[] =
            (response as any)?.data?.results ??
            (response as any)?.data ??
            (response as any)?.results ??
            (Array.isArray(response) ? response : []);
          return { id: broadcast.id, count: Array.isArray(raw) ? raw.length : 0 };
        } catch {
          return null;
        }
      })
    );

    const countMap = new Map(updates.filter(Boolean).map((item: any) => [item.id, item.count]));
    if (countMap.size === 0) {
      return;
    }

    setRecentBroadcasts((previous) =>
      previous.map((broadcast) =>
        countMap.has(broadcast.id)
          ? { ...broadcast, responders_count: countMap.get(broadcast.id) }
          : broadcast
      )
    );
  };

  const openDetails = async (broadcast: BroadcastItem) => {
    setSelectedDetailBroadcast(broadcast);
    setDetailsDialogOpen(true);

    if (canRespond && !broadcast.is_read) {
      await handleMarkRead(broadcast.id);
    }
  };

  const handleMarkRead = async (broadcastId: string) => {
    try {
      await broadcastsApi.markRead(broadcastId);
      setRecentBroadcasts((previous) =>
        previous.map((broadcast) =>
          broadcast.id === broadcastId
            ? { ...broadcast, is_read: true }
            : broadcast
        )
      );
      window.dispatchEvent(new Event(BROADCASTS_UPDATED_EVENT));
    } catch (err: any) {
      toast({ title: 'Failed to mark broadcast as read', description: err?.message || 'Please retry.', variant: 'destructive' });
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = recentBroadcasts
      .filter((broadcast) => !broadcast.is_read)
      .map((broadcast) => broadcast.id);

    if (unreadIds.length === 0) {
      return;
    }

    try {
      await Promise.all(unreadIds.map((id) => broadcastsApi.markRead(id)));
      setRecentBroadcasts((previous) =>
        previous.map((broadcast) => ({ ...broadcast, is_read: true }))
      );
      toast({ title: 'Broadcasts marked as read', description: `${unreadIds.length} broadcasts updated.` });
      window.dispatchEvent(new Event(BROADCASTS_UPDATED_EVENT));
    } catch (err: any) {
      toast({ title: 'Failed to mark broadcasts as read', description: err?.message || 'Please retry.', variant: 'destructive' });
    }
  };

  const fetchResponses = async (broadcast: BroadcastItem) => {
    setSelectedResponseBroadcast(broadcast);
    setResponsesDialogOpen(true);
    setLoadingResponses(true);
    try {
      const response = await broadcastsApi.getResponses(broadcast.id);
      const raw: any[] = (response as any)?.data?.results ?? (response as any)?.data ?? (response as any)?.results ?? (Array.isArray(response) ? response : []);
      setResponseItems(
        raw.map((item: any) => ({
          id: String(item.id || `${item.hospital_name || 'hospital'}-${item.created_at || Date.now()}`),
          hospital_name: item.hospital_name || item.responding_hospital_name || item.hospital?.name,
          response: item.response || item.response_message,
          created_at: item.created_at,
        }))
      );
    } catch (err: any) {
      setResponseItems([]);
      toast({ title: 'Failed to load responses', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoadingResponses(false);
    }
  };

  const handleBroadcastCreate = async (payload: BroadcastComposerPayload) => {
    try {
      const response = await broadcastsApi.create({
        title: payload.title,
        message: payload.message,
        priority: payload.priority,
        scope: payload.scope,
        allow_response: payload.allow_response,
        target_hospitals: payload.target_hospitals,
        // Keep explicit notification flags for backends that support configurable email fanout.
        send_email: true,
        notify_recipients: true,
      });
      const detail = (response as any)?.data?.detail || (response as any)?.detail;
      toast({
        title: 'Broadcast sent',
        description: detail || 'Emergency broadcast was sent and email notifications were queued for recipients.',
      });
      await fetchBroadcasts();
    } catch (err: any) {
      toast({ title: 'Failed to send broadcast', description: err?.message || 'Please retry.', variant: 'destructive' });
      throw err;
    }
  };

  const handleRespond = async () => {
    if (!selectedBroadcast) return;
    if (!respondNotes.trim()) {
      toast({ title: 'Response required', description: 'Add a response message before submitting.', variant: 'destructive' });
      return;
    }

    setRespondSubmitting(true);
    try {
      await broadcastsApi.respond(selectedBroadcast.id, {
        response: respondNotes.trim(),
      });
      await broadcastsApi.markRead(selectedBroadcast.id);
      toast({ title: 'Response submitted', description: 'Your hospital response has been recorded.' });
      setRespondDialog(false);
      setRespondNotes('');
      await fetchBroadcasts();
      window.dispatchEvent(new Event(BROADCASTS_UPDATED_EVENT));
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to submit response', variant: 'destructive' });
    } finally {
      setRespondSubmitting(false);
    }
  };

  const activeCount = recentBroadcasts.filter((broadcast) => broadcast.status === 'active').length;
  const unreadCount = recentBroadcasts.filter((broadcast) => !broadcast.is_read).length;

  const statusOptions = useMemo(
    () => ['all', ...Array.from(new Set(recentBroadcasts.map((broadcast) => String(broadcast.status || 'active').toLowerCase()))).filter((value) => value !== 'all')],
    [recentBroadcasts]
  );

  const priorityOptions = useMemo(
    () => ['all', ...Array.from(new Set(recentBroadcasts.map((broadcast) => String(broadcast.priority || 'normal').toLowerCase()))).filter((value) => value !== 'all')],
    [recentBroadcasts]
  );

  const scopeOptions = useMemo(
    () => ['all', ...Array.from(new Set(recentBroadcasts.map((broadcast) => String(broadcast.scope || 'all').toLowerCase()))).filter((value) => value !== 'all')],
    [recentBroadcasts]
  );

  const filteredBroadcasts = useMemo(() => {
    return recentBroadcasts.filter((broadcast) => {
      const normalizedStatus = String(broadcast.status || 'active').toLowerCase();
      const normalizedPriority = String(broadcast.priority || 'normal').toLowerCase();
      const normalizedScope = String(broadcast.scope || 'all').toLowerCase();

      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;
      if (priorityFilter !== 'all' && normalizedPriority !== priorityFilter) return false;
      if (scopeFilter !== 'all' && normalizedScope !== scopeFilter) return false;
      if (readFilter === 'read' && !broadcast.is_read) return false;
      if (readFilter === 'unread' && broadcast.is_read) return false;
      if (responseFilter === 'response_enabled' && !broadcast.allow_response) return false;
      if (responseFilter === 'response_disabled' && broadcast.allow_response) return false;
      return true;
    });
  }, [recentBroadcasts, statusFilter, priorityFilter, scopeFilter, readFilter, responseFilter]);

  const handleCloseBroadcast = async (broadcast: BroadcastItem) => {
    try {
      await broadcastsApi.close(broadcast.id);
      toast({ title: 'Broadcast closed', description: 'New responses are now blocked for this broadcast.' });
      await fetchBroadcasts();
    } catch (err: any) {
      toast({ title: 'Failed to close broadcast', description: err?.message || 'Please retry.', variant: 'destructive' });
    }
  };

  const canCloseBroadcast = (broadcast: BroadcastItem) => {
    const currentUserId = String(user?.id || '');
    return role === 'SUPER_ADMIN' || (!!currentUserId && currentUserId === broadcast.created_by_id);
  };

  return (
    <AppLayout title="Emergency Broadcast Center" subtitle="Coordinate emergency responses across hospitals">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="grid grid-cols-3 gap-3">
            <Badge variant="destructive" className="px-3 py-1">Active: {activeCount}</Badge>
            <Badge variant="default" className="px-3 py-1">Unread: {unreadCount}</Badge>
            <Badge variant="secondary" className="px-3 py-1">Total: {recentBroadcasts.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {canRespond && unreadCount > 0 && (
              <Button size="sm" variant="outline" onClick={handleMarkAllRead}>
                Mark all read
              </Button>
            )}
            {canCreateBroadcast && (
              <Button
                size="lg"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => setShowBroadcast(true)}
              >
                <Siren className="h-5 w-5 mr-2" />
                New Emergency Broadcast
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Emergency Broadcasts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-5 mb-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value === 'all' ? 'All Statuses' : value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value === 'all' ? 'All Priorities' : value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value === 'all' ? 'All Scopes' : value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={readFilter} onValueChange={setReadFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Read State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Read States</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>

              <Select value={responseFilter} onValueChange={setResponseFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Response" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Response Modes</SelectItem>
                  <SelectItem value="response_enabled">Response Enabled</SelectItem>
                  <SelectItem value="response_disabled">Response Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mb-4 flex justify-between items-center text-sm text-muted-foreground">
              <span>Showing {filteredBroadcasts.length} of {recentBroadcasts.length} broadcasts</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all');
                  setPriorityFilter('all');
                  setScopeFilter('all');
                  setReadFilter('all');
                  setResponseFilter('all');
                }}
              >
                Clear filters
              </Button>
            </div>

            {loadingBroadcasts ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBroadcasts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No broadcasts match the selected filters.</p>
            ) : (
              <div className="space-y-4">
                {filteredBroadcasts.map((broadcast) => (
                  <div key={broadcast.id} className="rounded-lg border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <button type="button" className="font-medium text-left hover:underline" onClick={() => openDetails(broadcast)}>
                          {broadcast.title}
                        </button>
                        {!broadcast.is_read && <Badge variant="default">Unread</Badge>}
                        <Badge variant={broadcast.status === 'active' ? 'destructive' : 'secondary'}>{broadcast.status}</Badge>
                        <Badge variant="outline" className="capitalize">{broadcast.priority || 'urgent'}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{broadcast.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {broadcast.created_by_hospital_name || 'System'} | {new Date(broadcast.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{broadcast.responders_count || 0} responses</Badge>
                      <Button size="sm" variant="outline" onClick={() => openDetails(broadcast)}>
                        Details
                      </Button>
                      {canRespond && !broadcast.is_read && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkRead(broadcast.id)}>
                          Mark Read
                        </Button>
                      )}
                      {canViewResponses(broadcast) && (
                        <Button size="sm" variant="outline" onClick={() => fetchResponses(broadcast)}>
                          View Responses
                        </Button>
                      )}
                      {canRespond && broadcast.status === 'active' && broadcast.allow_response && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-300 text-green-700"
                          onClick={() => {
                            setSelectedBroadcast(broadcast);
                            setRespondDialog(true);
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Respond
                        </Button>
                      )}
                      {broadcast.status === 'active' && canCloseBroadcast(broadcast) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 text-amber-700"
                          onClick={() => handleCloseBroadcast(broadcast)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Close
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {canCreateBroadcast && (
          <EmergencyBroadcast
            isOpen={showBroadcast}
            onClose={() => setShowBroadcast(false)}
            onBroadcast={handleBroadcastCreate}
            templates={EMERGENCY_TEMPLATES}
            hospitals={hospitalOptions}
            loadingHospitals={loadingHospitals}
          />
        )}

        <Dialog open={responsesDialogOpen} onOpenChange={setResponsesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Broadcast Responses</DialogTitle>
              <DialogDescription>
                {selectedResponseBroadcast?.title || 'Emergency Broadcast'}
              </DialogDescription>
            </DialogHeader>
            {loadingResponses ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : responseItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                No responses yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {responseItems.map((response) => (
                  <div key={response.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{response.hospital_name || 'Hospital'}</p>
                      <Badge variant="outline">Response</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{response.response || 'No message provided.'}</p>
                    {response.created_at && (
                      <p className="text-xs text-muted-foreground">{new Date(response.created_at).toLocaleString()}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedDetailBroadcast?.title || 'Emergency Broadcast'}</DialogTitle>
              <DialogDescription>
                Full broadcast details and context
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selectedDetailBroadcast?.status === 'active' ? 'destructive' : 'secondary'}>
                  {selectedDetailBroadcast?.status || 'active'}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {selectedDetailBroadcast?.priority || 'urgent'}
                </Badge>
                <Badge variant="outline">
                  {selectedDetailBroadcast?.responders_count || 0} responses
                </Badge>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedDetailBroadcast?.message || 'No message provided.'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedDetailBroadcast?.created_by_hospital_name || 'System'}
                {selectedDetailBroadcast?.created_at ? ` | ${new Date(selectedDetailBroadcast.created_at).toLocaleString()}` : ''}
              </p>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={respondDialog} onOpenChange={setRespondDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Respond to Broadcast</DialogTitle>
              <DialogDescription>
                {selectedBroadcast?.title || 'Emergency Broadcast'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="respondNotes">Response Message</Label>
                <Textarea
                  id="respondNotes"
                  placeholder="Example: We can supply 20 oxygen cylinders."
                  value={respondNotes}
                  onChange={(event) => setRespondNotes(event.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRespondDialog(false)}>Cancel</Button>
              <Button onClick={handleRespond} disabled={respondSubmitting}>
                {respondSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Submit Response
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!canCreateBroadcast && !canRespond && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <p className="text-sm text-amber-800">Your account does not have hospital context required for emergency broadcasting actions.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

