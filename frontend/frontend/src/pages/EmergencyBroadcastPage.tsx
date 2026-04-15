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
import BroadcastLocationPreview from '@/components/maps/BroadcastLocationPreview';
import { useState, useEffect, useMemo, useRef } from 'react';
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
  MapPin,
  XCircle,
  Radio,
  Eye,
  Send,
  Filter,
  X,
} from 'lucide-react';
import { broadcastsApi, hospitalsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { BROADCASTS_UPDATED_EVENT } from '@/constants/events';
import { hasAnyPermission } from '@/lib/rbac';
import { useBroadcastStore } from '@/store/broadcastStore';
import { cn } from '@/lib/utils';
import {
  buildLocationLink,
  formatLocationLabel,
  normalizeStructuredLocation,
  parseStructuredLocation,
  type StructuredLocation,
} from '@/utils/location';

/* ───────────────────────── Types ───────────────────────── */

interface BroadcastItem {
  id: string;
  title: string;
  message: string;
  status: string;
  scope?: string;
  is_read?: boolean;
  allow_response?: boolean;
  created_by_id?: string;
  created_by_email?: string;
  created_by_hospital_name?: string;
  responders_count?: number;
  created_at: string;
  priority?: string;
  location?: StructuredLocation | null;
}

interface BroadcastResponseItem {
  id: string;
  hospital_name?: string;
  response?: string;
  created_at?: string;
}

type BroadcastsUpdatedDetail = {
  unreadCount?: number;
  incrementUnread?: number;
  decrementUnread?: number;
  clearUnread?: boolean;
  forceRefresh?: boolean;
  listChanged?: boolean;
  broadcastId?: string;
  isRead?: boolean;
};

/* ───────────────────────── Constants ───────────────────────── */

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

/* ───────────────────────── Helpers ───────────────────────── */

const toBooleanFlag = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', '1', 'yes', 'y', 'read', 'enabled', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'unread', 'disabled', 'inactive'].includes(normalized)) return false;
  }
  return fallback;
};

const toNonNegativeInteger = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return null;
};

const extractEntityId = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.id ?? record.user_id ?? record.uuid ?? '').trim();
  }
  return '';
};

const extractEmail = (value: unknown): string => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.includes('@') ? normalized : '';
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return extractEmail(record.email ?? record.user_email ?? record.sent_by_email ?? record.created_by_email);
  }
  return '';
};

const asUnknownRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const resolveBroadcastLocation = (broadcast: Record<string, unknown>): StructuredLocation | null => {
  const nestedLocation = parseStructuredLocation(
    broadcast.location ?? broadcast.geo_location ?? broadcast.geoLocation ?? broadcast.coordinates,
  );
  const flattenedLocation = parseStructuredLocation({
    lat: broadcast.lat ?? broadcast.latitude ?? broadcast.coordinates_lat ?? broadcast.coordinatesLat,
    lng: broadcast.lng ?? broadcast.lon ?? broadcast.longitude ?? broadcast.coordinates_lng ?? broadcast.coordinatesLng,
    address: broadcast.address ?? broadcast.location_address ?? broadcast.location_text ?? broadcast.location_name,
  });
  return normalizeStructuredLocation({
    lat: nestedLocation?.lat ?? flattenedLocation?.lat,
    lng: nestedLocation?.lng ?? flattenedLocation?.lng,
    address: nestedLocation?.address ?? flattenedLocation?.address,
  });
};

/* ───────────────────────── Sub-components ───────────────────────── */

function BroadcastLocationInline({
  location,
  className,
}: {
  location: StructuredLocation | null | undefined;
  className?: string;
}) {
  if (!location) return null;
  const label = formatLocationLabel(location);
  if (!label) return null;
  const href = buildLocationLink(location);

  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-muted-foreground/40 hover:text-foreground transition-colors">
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}

const PriorityIndicator = ({ priority }: { priority: string }) => {
  const normalized = (priority || 'urgent').toLowerCase();
  const config = normalized === 'emergency'
    ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : normalized === 'urgent'
      ? 'border-amber-400/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
      : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wider', config)}>{priority || 'urgent'}</Badge>;
};

const StatusIndicator = ({ status }: { status: string }) => {
  const normalized = (status || 'active').toLowerCase();
  const config = normalized === 'active'
    ? 'border-emerald-400/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
    : normalized === 'closed'
      ? 'border-border bg-muted text-muted-foreground'
      : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={cn('text-[10px] font-medium capitalize', config)}>{status}</Badge>;
};

/* ───────────────────────── Stat Card ───────────────────────── */

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center rounded-xl border px-5 py-3 transition-colors',
      accent
        ? 'border-destructive/20 bg-destructive/5 text-destructive'
        : 'border-border/60 bg-card text-foreground',
    )}>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

/* ───────────────────────── Main Page ───────────────────────── */

export default function EmergencyBroadcastPage() {
  const { user } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const setUnreadBroadcasts = useBroadcastStore((state) => state.setUnreadCount);
  const decrementUnreadBroadcasts = useBroadcastStore((state) => state.decrementUnread);
  const clearUnreadBroadcasts = useBroadcastStore((state) => state.clearUnread);

  const canCreateBroadcast = hasAnyPermission(user, [
    'communication:broadcast.send',
    'communication:broadcast.create',
    'communication:broadcast.manage',
    'hospital:broadcast.manage',
    'hospital:communication.manage',
  ]);
  const canRespond = Boolean(user?.hospital_id) && hasAnyPermission(user, ['communication:broadcast.respond', 'communication:broadcast.read']);
  const canModerateAnyBroadcast = hasAnyPermission(user, ['communication:broadcast.manage', 'platform:hospital.manage', 'platform:audit.view']);
  const canViewResponsesByPermission = hasAnyPermission(user, ['broadcast:view_responses']);

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
  const broadcastFetchSequenceRef = useRef(0);
  const readOverrideByBroadcastIdRef = useRef<Record<string, boolean>>({});
  const currentUserId = String(user?.id || '').trim();
  const currentUserEmail = String(user?.email || '').trim().toLowerCase();

  const isOwnedByCurrentUser = (broadcast: BroadcastItem): boolean => {
    const ownerId = String(broadcast.created_by_id || '').trim();
    if (currentUserId && ownerId && currentUserId === ownerId) return true;
    const ownerEmail = String(broadcast.created_by_email || '').trim().toLowerCase();
    return Boolean(currentUserEmail && ownerEmail && currentUserEmail === ownerEmail);
  };

  const dispatchBroadcastsUpdated = (detail?: BroadcastsUpdatedDetail) => {
    window.dispatchEvent(new CustomEvent(BROADCASTS_UPDATED_EVENT, { detail }));
  };

  useEffect(() => { fetchBroadcasts(); }, []);

  useEffect(() => {
    const state = location.state as { highlightBroadcastId?: string; openDetails?: boolean; openResponses?: boolean } | null;
    if (!state?.highlightBroadcastId || recentBroadcasts.length === 0) return;
    const target = recentBroadcasts.find((b) => b.id === String(state.highlightBroadcastId));
    if (!target) return;
    const isSender = isOwnedByCurrentUser(target);
    const canViewResponsesForTarget = isSender || canViewResponsesByPermission;
    if (state.openResponses) {
      if (canViewResponsesForTarget) { void fetchResponses(target); }
      else { toast({ title: 'Access denied', description: 'You are not allowed to view responses for this broadcast.', variant: 'destructive' }); }
      return;
    }
    if (state.openDetails) { void openDetails(target); }
  }, [canViewResponsesByPermission, location.state, recentBroadcasts, toast, user?.email, user?.id]);

  useEffect(() => {
    if (!canCreateBroadcast) return;
    fetchHospitalOptions();
  }, [canCreateBroadcast, canModerateAnyBroadcast, user?.hospital_id]);

  const fetchHospitalOptions = async () => {
    setLoadingHospitals(true);
    try {
      const response = await hospitalsApi.getAll();
      const raw: unknown[] = (response as any)?.data?.results ?? (response as any)?.data ?? (response as any)?.results ?? (Array.isArray(response) ? response : []);
      const currentHospitalId = String(user?.hospital_id || '');
      const filtered = raw.filter((hospital: any) => {
        const id = String(hospital?.id || '');
        if (!id) return false;
        if (!canModerateAnyBroadcast && id === currentHospitalId) return false;
        return true;
      });
      setHospitalOptions(filtered.map((hospital: any) => ({ id: String(hospital.id), name: hospital.name || `Hospital ${hospital.id}` })));
    } catch { setHospitalOptions([]); }
    finally { setLoadingHospitals(false); }
  };

  const fetchBroadcasts = async () => {
    const requestSequence = ++broadcastFetchSequenceRef.current;
    setLoadingBroadcasts(true);
    try {
      const data = await broadcastsApi.getAll();
      const raw: unknown[] = (data as any)?.data?.results ?? (data as any)?.data ?? (data as any)?.results ?? (Array.isArray(data) ? data : []);
      const items: BroadcastItem[] = raw
        .map((entry: unknown) => {
          const broadcast = asUnknownRecord(entry);
          const id = extractEntityId(broadcast.id);
          if (!id) return null;
          const serverReadState = toBooleanFlag(broadcast.is_read ?? broadcast.isRead, false);
          const localReadOverride = readOverrideByBroadcastIdRef.current[id];
          return {
            id,
            title: String(broadcast.title ?? 'Emergency Broadcast').trim() || 'Emergency Broadcast',
            message: String(broadcast.message ?? '').trim(),
            status: String(broadcast.status ?? 'active').trim() || 'active',
            scope: String(broadcast.scope ?? 'all').trim() || 'all',
            is_read: typeof localReadOverride === 'boolean' ? localReadOverride : serverReadState,
            allow_response: toBooleanFlag(broadcast.allow_response ?? broadcast.allowResponse, true),
            created_by_id: extractEntityId(broadcast.created_by_id ?? broadcast.sent_by ?? broadcast.sent_by_id ?? broadcast.created_by ?? broadcast.sender ?? broadcast.user),
            created_by_email: extractEmail(broadcast.created_by_email ?? broadcast.sent_by_email ?? broadcast.sender_email ?? broadcast.user_email ?? broadcast.created_by ?? broadcast.sender ?? broadcast.user),
            created_by_hospital_name: String(broadcast.created_by_hospital_name ?? broadcast.sent_by_hospital_name ?? broadcast.hospital_name ?? '').trim(),
            responders_count: toNonNegativeInteger(broadcast.responders_count, broadcast.responses_count, broadcast.response_count, broadcast.response_total) ?? (Array.isArray(broadcast.responses) ? broadcast.responses.length : 0),
            created_at: String(broadcast.created_at ?? new Date().toISOString()).trim() || new Date().toISOString(),
            priority: String(broadcast.priority ?? 'urgent').trim() || 'urgent',
            location: resolveBroadcastLocation(broadcast),
          } as BroadcastItem;
        })
        .filter((b): b is BroadcastItem => Boolean(b))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (requestSequence !== broadcastFetchSequenceRef.current) return;
      setRecentBroadcasts(items);
      const unreadCount = items.filter((b) => !b.is_read).length;
      setUnreadBroadcasts(unreadCount);
      await hydrateResponseCounts(items, requestSequence);
      if (requestSequence !== broadcastFetchSequenceRef.current) return;
      dispatchBroadcastsUpdated({ unreadCount, listChanged: true });
    } catch (err: any) {
      if (requestSequence !== broadcastFetchSequenceRef.current) return;
      setRecentBroadcasts([]);
      toast({ title: 'Failed to load broadcasts', description: err?.message || 'Please try again later.', variant: 'destructive' });
    } finally {
      if (requestSequence === broadcastFetchSequenceRef.current) setLoadingBroadcasts(false);
    }
  };

  const canViewResponses = (broadcast: BroadcastItem) => canViewResponsesByPermission || isOwnedByCurrentUser(broadcast);

  const hydrateResponseCounts = async (items: BroadcastItem[], requestSequence?: number) => {
    const targets = items.filter((b) => canViewResponses(b));
    if (targets.length === 0) return;
    const updates = await Promise.all(targets.map(async (b) => {
      try {
        const response = await broadcastsApi.getResponses(b.id);
        const raw: unknown[] = (response as any)?.data?.results ?? (response as any)?.data ?? (response as any)?.results ?? (Array.isArray(response) ? response : []);
        return { id: b.id, count: Array.isArray(raw) ? raw.length : 0 };
      } catch { return null; }
    }));
    if (requestSequence && requestSequence !== broadcastFetchSequenceRef.current) return;
    const countMap = new Map(updates.filter((i): i is { id: string; count: number } => Boolean(i?.id)).map((i) => [i.id, i.count]));
    if (countMap.size === 0) return;
    setRecentBroadcasts((prev) => prev.map((b) => countMap.has(b.id) ? { ...b, responders_count: countMap.get(b.id) } : b));
  };

  const openDetails = async (broadcast: BroadcastItem) => {
    setSelectedDetailBroadcast(broadcast);
    setDetailsDialogOpen(true);
    if (user?.hospital_id && !broadcast.is_read) await handleMarkRead(broadcast.id);
  };

  const handleMarkRead = async (broadcastId: string) => {
    const target = recentBroadcasts.find((b) => b.id === broadcastId);
    const wasUnread = Boolean(target && !target.is_read);
    try {
      await broadcastsApi.markRead(broadcastId);
      readOverrideByBroadcastIdRef.current[broadcastId] = true;
      setRecentBroadcasts((prev) => prev.map((b) => b.id === broadcastId ? { ...b, is_read: true } : b));
      if (wasUnread) decrementUnreadBroadcasts(1);
      dispatchBroadcastsUpdated({ broadcastId, isRead: true });
    } catch (err: any) {
      toast({ title: 'Failed to mark broadcast as read', description: err?.message || 'Please retry.', variant: 'destructive' });
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = recentBroadcasts.filter((b) => !b.is_read).map((b) => b.id);
    if (unreadIds.length === 0) return;
    try {
      await Promise.all(unreadIds.map((id) => broadcastsApi.markRead(id)));
      unreadIds.forEach((id) => { readOverrideByBroadcastIdRef.current[id] = true; });
      setRecentBroadcasts((prev) => prev.map((b) => ({ ...b, is_read: true })));
      clearUnreadBroadcasts();
      toast({ title: 'Broadcasts marked as read', description: `${unreadIds.length} broadcasts updated.` });
      dispatchBroadcastsUpdated({ listChanged: true });
    } catch (err: any) {
      toast({ title: 'Failed to mark broadcasts as read', description: err?.message || 'Please retry.', variant: 'destructive' });
    }
  };

  const fetchResponses = async (broadcast: BroadcastItem) => {
    if (!canViewResponses(broadcast)) {
      toast({ title: 'Access denied', description: 'You are not allowed to view responses for this broadcast.', variant: 'destructive' });
      return;
    }
    setSelectedResponseBroadcast(broadcast);
    setResponsesDialogOpen(true);
    setLoadingResponses(true);
    try {
      const response = await broadcastsApi.getResponses(broadcast.id);
      const raw: unknown[] = (response as any)?.data?.results ?? (response as any)?.data ?? (response as any)?.results ?? (Array.isArray(response) ? response : []);
      setResponseItems(raw.map((item: any) => ({
        id: String(item.id || `${item.hospital_name || 'hospital'}-${item.created_at || Date.now()}`),
        hospital_name: item.hospital_name || item.responding_hospital_name || item.hospital?.name,
        response: item.response || item.response_message,
        created_at: item.created_at,
      })));
    } catch (err: any) {
      setResponseItems([]);
      toast({ title: 'Failed to load responses', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally { setLoadingResponses(false); }
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
        location: payload.location,
        send_email: true,
        notify_recipients: true,
      });
      const detail = (response as any)?.data?.detail || (response as any)?.detail;
      toast({ title: 'Broadcast sent', description: detail || 'Emergency broadcast was sent and email notifications were queued for recipients.' });
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
    const wasUnread = !selectedBroadcast.is_read;
    setRespondSubmitting(true);
    try {
      await broadcastsApi.respond(selectedBroadcast.id, { response: respondNotes.trim() });
      await broadcastsApi.markRead(selectedBroadcast.id);
      readOverrideByBroadcastIdRef.current[selectedBroadcast.id] = true;
      setRecentBroadcasts((prev) => prev.map((b) => b.id === selectedBroadcast.id ? { ...b, is_read: true } : b));
      if (wasUnread) decrementUnreadBroadcasts(1);
      dispatchBroadcastsUpdated({ broadcastId: selectedBroadcast.id, isRead: true, listChanged: true });
      toast({ title: 'Response submitted', description: 'Your hospital response has been recorded.' });
      setRespondDialog(false);
      setRespondNotes('');
      await fetchBroadcasts();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to submit response', variant: 'destructive' });
    } finally { setRespondSubmitting(false); }
  };

  const handleCloseBroadcast = async (broadcast: BroadcastItem) => {
    try {
      await broadcastsApi.close(broadcast.id);
      toast({ title: 'Broadcast closed', description: 'New responses are now blocked for this broadcast.' });
      await fetchBroadcasts();
    } catch (err: any) {
      toast({ title: 'Failed to close broadcast', description: err?.message || 'Please retry.', variant: 'destructive' });
    }
  };

  const canCloseBroadcast = (broadcast: BroadcastItem) => isOwnedByCurrentUser(broadcast);

  const activeCount = recentBroadcasts.filter((b) => b.status === 'active').length;
  const unreadCount = recentBroadcasts.filter((b) => !b.is_read).length;

  const statusOptions = useMemo(() => ['all', ...Array.from(new Set(recentBroadcasts.map((b) => String(b.status || 'active').toLowerCase()))).filter((v) => v !== 'all')], [recentBroadcasts]);
  const priorityOptions = useMemo(() => ['all', ...Array.from(new Set(recentBroadcasts.map((b) => String(b.priority || 'normal').toLowerCase()))).filter((v) => v !== 'all')], [recentBroadcasts]);
  const scopeOptions = useMemo(() => ['all', ...Array.from(new Set(recentBroadcasts.map((b) => String(b.scope || 'all').toLowerCase()))).filter((v) => v !== 'all')], [recentBroadcasts]);

  const filteredBroadcasts = useMemo(() => {
    return recentBroadcasts.filter((b) => {
      const s = String(b.status || 'active').toLowerCase();
      const p = String(b.priority || 'normal').toLowerCase();
      const sc = String(b.scope || 'all').toLowerCase();
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      if (priorityFilter !== 'all' && p !== priorityFilter) return false;
      if (scopeFilter !== 'all' && sc !== scopeFilter) return false;
      if (readFilter === 'read' && !b.is_read) return false;
      if (readFilter === 'unread' && b.is_read) return false;
      if (responseFilter === 'response_enabled' && !b.allow_response) return false;
      if (responseFilter === 'response_disabled' && b.allow_response) return false;
      return true;
    });
  }, [recentBroadcasts, statusFilter, priorityFilter, scopeFilter, readFilter, responseFilter]);

  const hasActiveFilters = statusFilter !== 'all' || priorityFilter !== 'all' || scopeFilter !== 'all' || readFilter !== 'all' || responseFilter !== 'all';

  const clearAllFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setScopeFilter('all');
    setReadFilter('all');
    setResponseFilter('all');
  };

  return (
    <AppLayout title="Emergency Broadcasts">
      <div className="mx-auto max-w-7xl space-y-6 pb-8">

        {/* ── Page Header ── */}
        <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
                <Siren className="h-6 w-6 text-destructive" />
                Emergency Broadcasts
              </h1>
              <p className="text-sm text-muted-foreground">Coordinate urgent healthcare communications across facilities</p>
            </div>

            <div className="flex items-center gap-2">
              {canRespond && unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                  <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                  Mark all read
                </Button>
              )}
              {canCreateBroadcast && (
                <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => setShowBroadcast(true)}>
                  <Siren className="mr-1.5 h-3.5 w-3.5" />
                  New Broadcast
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 sm:max-w-md">
            <StatCard label="Active" value={activeCount} accent />
            <StatCard label="Unread" value={unreadCount} accent={unreadCount > 0} />
            <StatCard label="Total" value={recentBroadcasts.length} />
          </div>
        </div>

        {/* ── Main Card ── */}
        <Card className="rounded-2xl border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5 text-primary" />
              Broadcast Feed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* ── Filters ── */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((v) => (<SelectItem key={v} value={v}>{v === 'all' ? 'All Statuses' : v}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((v) => (<SelectItem key={v} value={v}>{v === 'all' ? 'All Priorities' : v}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={scopeFilter} onValueChange={setScopeFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((v) => (<SelectItem key={v} value={v}>{v === 'all' ? 'All Scopes' : v}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={readFilter} onValueChange={setReadFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Read States</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={responseFilter} onValueChange={setResponseFilter}>
                  <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Response Modes</SelectItem>
                    <SelectItem value="response_enabled">Response Enabled</SelectItem>
                    <SelectItem value="response_disabled">Response Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{filteredBroadcasts.length}</span> of {recentBroadcasts.length} broadcasts
                </span>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground" onClick={clearAllFilters}>
                    <X className="mr-1 h-3 w-3" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {/* ── Broadcast List ── */}
            {loadingBroadcasts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBroadcasts.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-8 text-center">
                <p className="text-sm text-muted-foreground">No broadcasts match the selected filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBroadcasts.map((broadcast) => (
                  <div
                    key={broadcast.id}
                    className={cn(
                      'group rounded-xl border transition-all',
                      broadcast.is_read
                        ? 'border-border/60 bg-card'
                        : 'border-primary/20 bg-primary/[0.02] shadow-sm',
                    )}
                  >
                    <div className="p-4 pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left"
                            onClick={() => openDetails(broadcast)}
                          >
                            {broadcast.title}
                          </button>
                          {!broadcast.is_read && (
                            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusIndicator status={broadcast.status} />
                          <PriorityIndicator priority={broadcast.priority || 'urgent'} />
                        </div>
                      </div>

                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground leading-relaxed">{broadcast.message}</p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs text-muted-foreground">
                          {broadcast.created_by_hospital_name || 'System'} • {new Date(broadcast.created_at).toLocaleString()} • Scope: {broadcast.scope || 'all'}
                        </span>
                        <BroadcastLocationInline location={broadcast.location} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-4 py-2.5">
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {broadcast.responders_count || 0} responses
                      </span>
                      <div className="ml-auto flex flex-wrap items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetails(broadcast)}>
                          <Eye className="mr-1 h-3 w-3" />
                          Details
                        </Button>
                        {canViewResponses(broadcast) && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fetchResponses(broadcast)}>
                            <MessageSquare className="mr-1 h-3 w-3" />
                            Responses
                          </Button>
                        )}
                        {canRespond && broadcast.status === 'active' && broadcast.allow_response && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setSelectedBroadcast(broadcast); setRespondDialog(true); }}>
                            <Send className="mr-1 h-3 w-3" />
                            Respond
                          </Button>
                        )}
                        {broadcast.status === 'active' && canCloseBroadcast(broadcast) && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCloseBroadcast(broadcast)}>
                            <XCircle className="mr-1 h-3 w-3" />
                            Close
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Composer Dialog ── */}
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

        {/* ── Responses Dialog ── */}
        <Dialog open={responsesDialogOpen} onOpenChange={setResponsesDialogOpen}>
          <DialogContent className="max-w-lg rounded-2xl">
            <DialogHeader>
              <DialogTitle>Broadcast Responses</DialogTitle>
              <DialogDescription>{selectedResponseBroadcast?.title || 'Emergency Broadcast'}</DialogDescription>
            </DialogHeader>
            {loadingResponses ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : responseItems.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No responses yet.
              </div>
            ) : (
              <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                {responseItems.map((response) => (
                  <div key={response.id} className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{response.hospital_name || 'Hospital'}</p>
                      <Badge variant="outline" className="text-[10px]">Response</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{response.response || 'No message provided.'}</p>
                    {response.created_at && (
                      <p className="mt-2 text-xs text-muted-foreground/70">{new Date(response.created_at).toLocaleString()}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Details Dialog ── */}
        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-lg rounded-2xl">
            <DialogHeader>
              <DialogTitle>{selectedDetailBroadcast?.title || 'Emergency Broadcast'}</DialogTitle>
              <DialogDescription>Full broadcast details and context</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusIndicator status={selectedDetailBroadcast?.status || 'active'} />
                <PriorityIndicator priority={selectedDetailBroadcast?.priority || 'urgent'} />
                <Badge variant="secondary" className="text-[10px]">{selectedDetailBroadcast?.responders_count || 0} responses</Badge>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-sm text-foreground leading-relaxed">{selectedDetailBroadcast?.message || 'No message provided.'}</p>
              </div>

              {selectedDetailBroadcast?.location && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</p>
                  <BroadcastLocationInline location={selectedDetailBroadcast.location} />
                  <BroadcastLocationPreview location={selectedDetailBroadcast.location} className="h-40 w-full rounded-xl border border-border/60 overflow-hidden" />
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {selectedDetailBroadcast?.created_by_hospital_name || 'System'}
                {selectedDetailBroadcast?.created_at ? ` | ${new Date(selectedDetailBroadcast.created_at).toLocaleString()}` : ''}
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Respond Dialog ── */}
        <Dialog open={respondDialog} onOpenChange={setRespondDialog}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Respond to Broadcast</DialogTitle>
              <DialogDescription>{selectedBroadcast?.title || 'Emergency Broadcast'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="respond-notes">Response Message</Label>
                <Textarea
                  id="respond-notes"
                  placeholder="Describe your hospital's available resources or response..."
                  value={respondNotes}
                  onChange={(event) => setRespondNotes(event.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setRespondDialog(false)}>Cancel</Button>
              <Button onClick={handleRespond} disabled={respondSubmitting}>
                {respondSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    Submit Response
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── No permissions warning ── */}
        {!canCreateBroadcast && !canRespond && (
          <Card className="rounded-2xl border-amber-400/30 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Your account does not have hospital context required for emergency broadcasting actions.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
