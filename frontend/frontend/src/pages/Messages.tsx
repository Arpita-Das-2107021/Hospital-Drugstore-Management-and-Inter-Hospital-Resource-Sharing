import AppLayout from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CHAT_UPDATED_EVENT } from '@/constants/events';
import ConversationList from '@/components/messages/ConversationList';
import ChatHeader from '@/components/messages/ChatHeader';
import MessageList from '@/components/messages/MessageList';
import ChatInput from '@/components/messages/ChatInput';
import NewMessageModal from '@/components/messages/NewMessageModal';
import GroupDetailsModal from '@/components/messages/GroupDetailsModal';
import { conversationsApi, hospitalsApi, staffApi } from '@/services/api';
import authService from '@/services/authService';
import { useAuth } from '@/contexts/AuthContext';
import {
  Conversation,
  Message,
  Employee,
  ConversationType,
  MessageFilter,
  MessageSort,
  TypingStatus,
  OnlineStatus,
} from '@/types/healthcare';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const PAGE_LIMIT = 25;

type ChatServerEnvelope = {
  event?: string;
  data?: any;
};

type ConversationPageState = {
  page: number;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
};

const normalizeRole = (roleValue?: string): Employee['role'] => {
  const value = (roleValue || '').toLowerCase();
  if (value.includes('admin')) return 'admin';
  if (value.includes('pharmac')) return 'pharmacist';
  if (value.includes('doctor')) return 'doctor';
  if (value.includes('coord')) return 'coordinator';
  if (value.includes('regulat')) return 'regulator';
  if (value.includes('nurse')) return 'nurse';
  return 'technician';
};

const toAbsoluteUrl = (value?: string): string => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
};

const getWsBaseUrl = (): string => {
  if (API_BASE_URL.startsWith('https://')) {
    return API_BASE_URL.replace('https://', 'wss://');
  }
  return API_BASE_URL.replace('http://', 'ws://');
};

const mapEmployee = (p: any): Employee => ({
  id: p?.id || '',
  name: p?.full_name || p?.name || p?.email || 'Unknown',
  email: p?.email || '',
  role: normalizeRole(p?.role_name || p?.role),
  hospital: p?.hospital_name || p?.hospital || '',
  department: p?.department || '',
  isOnline: !!p?.is_online,
  lastSeen: p?.last_seen,
});

const mapAttachment = (attachment: any) => {
  const rawName = attachment?.name || attachment?.original_name || attachment?.file_name || attachment?.filename || 'Attachment';
  const rawUrl = attachment?.url || attachment?.file || attachment?.file_url || '';
  const mimeType = attachment?.content_type || attachment?.mime_type || '';
  const extension = rawName.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
  const mediaKind = String(attachment?.media_kind || '').toLowerCase();
  const inferredIsImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension);
  const inferredIsAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(extension);
  const inferredIsVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension);
  const inferredMimeType = inferredIsImage ? `image/${extension}` : '';
  const normalizedMimeType = mimeType || inferredMimeType;

  const attachmentType = mediaKind === 'voice'
    ? 'audio'
    : mediaKind === 'video'
      ? 'video'
      : mediaKind === 'image'
        ? 'image'
        : normalizedMimeType.startsWith('image/') || inferredIsImage
          ? 'image'
          : normalizedMimeType.startsWith('audio/') || inferredIsAudio
            ? 'audio'
            : normalizedMimeType.startsWith('video/') || inferredIsVideo
              ? 'video'
              : 'file';

  return {
    id: attachment?.id || crypto.randomUUID(),
    name: rawName,
    type: attachmentType,
    url: toAbsoluteUrl(rawUrl),
    size: Number(attachment?.size || attachment?.file_size || 0),
    mimeType,
    mediaKind: mediaKind || undefined,
    processingStatus: attachment?.processing_status,
  };
};

const parseItems = (res: any): any[] => {
  const root = res?.data ?? res;
  if (Array.isArray(root?.results)) return root.results;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root)) return root;
  return [];
};

const mergeAndSortMessages = (current: Message[], incoming: Message[]): Message[] => {
  const byId = new Map<string, Message>();
  [...current, ...incoming].forEach((msg) => {
    byId.set(msg.id, msg);
  });
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
};

const inferMediaKind = (file: File): 'image' | 'file' | 'voice' | 'video' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'voice';
  if (file.type.startsWith('video/')) return 'video';

  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) return 'image';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(extension)) return 'voice';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(extension)) return 'video';
  return 'file';
};

const Messages = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const currentUser: Employee = useMemo(() => ({
    id: user?.id || '',
    name: user?.full_name || user?.email || 'Me',
    email: user?.email || '',
    role: (user?.role || 'staff').toLowerCase() as Employee['role'],
    hospital: user?.hospital_name || user?.hospital_id || '',
    department: user?.department || '',
    isOnline: true,
  }), [user]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>({});
  const [pagesByConversation, setPagesByConversation] = useState<Record<string, ConversationPageState>>({});
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [allUsers, setAllUsers] = useState<Employee[]>([]);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showGroupDetailsModal, setShowGroupDetailsModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);

  const [filter, setFilter] = useState<MessageFilter>({});
  const [sort, setSort] = useState<MessageSort>({ field: 'recent', direction: 'desc' });
  const [typingStatus, setTypingStatus] = useState<TypingStatus[]>([]);
  const [onlineStatus] = useState<Record<string, OnlineStatus>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const selectedConversationId = selectedConversation?.id;
  const conversationMessages = useMemo(
    () => (selectedConversationId ? (messagesByConversation[selectedConversationId] || []) : []),
    [messagesByConversation, selectedConversationId],
  );

  const selectedPageState = selectedConversationId
    ? (pagesByConversation[selectedConversationId] || { page: 0, hasMore: false, loading: false, loaded: false })
    : { page: 0, hasMore: false, loading: false, loaded: false };

  const allHospitals = useMemo(
    () => Array.from(new Set(allUsers.map((employee) => employee.hospital).filter(Boolean))),
    [allUsers],
  );

  const normalizeEmail = useCallback((value?: string) => (value || '').trim().toLowerCase(), []);

  const staffByEmail = useMemo(() => {
    const lookup = new Map<string, Employee>();
    allUsers.forEach((staff) => {
      const key = normalizeEmail(staff.email);
      if (key) {
        lookup.set(key, staff);
      }
    });
    return lookup;
  }, [allUsers, normalizeEmail]);

  const resolveParticipant = useCallback((raw: any, index: number): Employee => {
    if (!raw) {
      return {
        id: `participant-${index}`,
        name: 'Unknown User',
        email: '',
        role: 'technician',
        hospital: '',
        department: '',
        isOnline: false,
      };
    }

    if (typeof raw === 'string') {
      const emailKey = normalizeEmail(raw);
      const fromDirectory = emailKey ? staffByEmail.get(emailKey) : undefined;
      if (fromDirectory) {
        return fromDirectory;
      }

      const isCurrentUser = emailKey && emailKey === normalizeEmail(currentUser.email);
      return {
        id: isCurrentUser ? currentUser.id : raw,
        name: isCurrentUser ? currentUser.name : raw,
        email: raw.includes('@') ? raw : '',
        role: isCurrentUser ? currentUser.role : 'technician',
        hospital: isCurrentUser ? currentUser.hospital : '',
        department: isCurrentUser ? currentUser.department : '',
        isOnline: isCurrentUser,
      };
    }

    const email = raw?.user_email || raw?.email || '';
    const emailKey = normalizeEmail(email);
    const fromDirectory = emailKey ? staffByEmail.get(emailKey) : undefined;
    const isCurrentUser = emailKey && emailKey === normalizeEmail(currentUser.email);
    const displayName =
      fromDirectory?.name ||
      raw?.user_full_name ||
      raw?.full_name ||
      raw?.name ||
      (isCurrentUser ? currentUser.name : '') ||
      raw?.user_email ||
      'Unknown User';

    return {
      id:
        raw?.user ||
        raw?.user_id ||
        (isCurrentUser ? currentUser.id : fromDirectory?.id) ||
        raw?.id ||
        email ||
        `participant-${index}`,
      name: displayName,
      email: email || fromDirectory?.email || (isCurrentUser ? currentUser.email : ''),
      role:
        fromDirectory?.role ||
        (raw?.role_name ? normalizeRole(String(raw.role_name)) : undefined) ||
        (raw?.role ? normalizeRole(String(raw.role)) : undefined) ||
        (isCurrentUser ? currentUser.role : 'technician'),
      hospital: fromDirectory?.hospital || raw?.hospital_name || (isCurrentUser ? currentUser.hospital : ''),
      department: fromDirectory?.department || raw?.department || (isCurrentUser ? currentUser.department : ''),
      isOnline: isCurrentUser || !!fromDirectory?.isOnline,
      lastSeen: fromDirectory?.lastSeen,
    };
  }, [currentUser, normalizeEmail, staffByEmail]);

  const mapConversation = useCallback((c: any): Conversation => {
    const rawParticipants = Array.isArray(c?.participants)
      ? c.participants
      : Array.isArray(c?.participant_details)
        ? c.participant_details
        : [];

    const participants = rawParticipants.map((participant: any, index: number) =>
      resolveParticipant(participant, index),
    );

    return {
      id: c?.id,
      type: c?.type || 'private',
      name: c?.name || c?.subject,
      participants,
      creator: c?.creator ? mapEmployee(c.creator) : undefined,
      caseId: c?.case_id,
      description: c?.description,
      lastMessage: (typeof c?.last_message === 'object' ? c?.last_message?.body : c?.last_message) || '',
      lastMessageAt: c?.last_message?.created_at || c?.last_message_at || c?.updated_at || new Date().toISOString(),
      unreadCount: c?.unread_count || 0,
      isArchived: !!c?.is_archived,
      isMuted: !!c?.is_muted,
      createdAt: c?.created_at || new Date().toISOString(),
      updatedAt: c?.updated_at || c?.last_message_at || new Date().toISOString(),
    };
  }, [resolveParticipant]);

  const mapMessage = useCallback((m: any, conversationId: string): Message => {
    const senderPayload = typeof m?.sender === 'object'
      ? m.sender
      : {
          id: m?.sender_id || m?.sender || '',
          email: m?.sender_email || '',
          name: m?.sender_email || 'Unknown User',
        };

    const sender = resolveParticipant(senderPayload, 0);

    return {
      id: m?.id || crypto.randomUUID(),
      conversationId,
      sender,
      content: m?.body || m?.content || '',
      attachments: Array.isArray(m?.attachments) ? m.attachments.map(mapAttachment) : [],
      mentions: Array.isArray(m?.mentions) ? m.mentions : undefined,
      status: (m?.status || 'delivered') as Message['status'],
      createdAt: m?.created_at || new Date().toISOString(),
      editedAt: m?.edited_at,
      readAt: m?.read_at,
    };
  }, [resolveParticipant]);

  const updateConversationPreview = useCallback((conversationId: string, message: Message) => {
    setConversations((prev) => {
      const updated = prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return {
          ...conversation,
          lastMessage: message.content || (message.attachments?.length ? '[Attachment]' : ''),
          lastMessageAt: message.createdAt,
          updatedAt: message.createdAt,
          unreadCount:
            message.sender.id !== currentUser.id && selectedConversationId !== conversationId
              ? conversation.unreadCount + 1
              : conversation.unreadCount,
        };
      });

      return updated.sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );
    });
  }, [currentUser.id, selectedConversationId]);

  const sendWsEvent = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, page: number) => {
    setPagesByConversation((prev) => ({
      ...prev,
      [conversationId]: {
        ...(prev[conversationId] || { page: 0, hasMore: true, loaded: false }),
        loading: true,
      },
    }));

    try {
      const response = await conversationsApi.getMessages(conversationId, {
        page: String(page),
        limit: String(PAGE_LIMIT),
      });

      const payload = response?.data ?? response;
      const rawItems = parseItems(response);
      const mappedItems = rawItems.map((message) => mapMessage(message, conversationId));
      const hasMore = Boolean(payload?.next) || mappedItems.length === PAGE_LIMIT;

      setMessagesByConversation((prev) => ({
        ...prev,
        [conversationId]: mergeAndSortMessages(prev[conversationId] || [], mappedItems),
      }));

      setPagesByConversation((prev) => ({
        ...prev,
        [conversationId]: {
          page,
          hasMore,
          loading: false,
          loaded: true,
        },
      }));
    } catch (error: any) {
      setPagesByConversation((prev) => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] || { page: 0, hasMore: false, loaded: false }),
          loading: false,
        },
      }));

      toast({
        title: 'Failed to load messages',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadAllStaff = useCallback(async () => {
    try {
      const [seedStaffRes, hospitalsRes] = await Promise.all([
        staffApi.getAll().catch(() => null),
        hospitalsApi.getAll().catch(() => null),
      ]);

      const seedStaff = seedStaffRes ? parseItems(seedStaffRes) : [];
      const hospitals = hospitalsRes ? parseItems(hospitalsRes) : [];

      const hospitalStaffResponses = await Promise.allSettled(
        hospitals
          .map((hospital: any) => hospital?.id)
          .filter(Boolean)
          .map((hospitalId: string) => hospitalsApi.getStaff(hospitalId)),
      );

      const hospitalStaff = hospitalStaffResponses
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .flatMap((result) => parseItems(result.value));

      const combined = [...seedStaff, ...hospitalStaff].map(mapEmployee);
      const deduped = new Map<string, Employee>();
      combined.forEach((staff, index) => {
        const key =
          normalizeEmail(staff.email) ||
          `${staff.id}-${staff.hospital}-${staff.name}-${index}`;
        if (!deduped.has(key)) {
          deduped.set(key, staff);
        }
      });

      setAllUsers(Array.from(deduped.values()));
    } catch {
      toast({ title: 'Failed to load staff list', variant: 'destructive' });
    }
  }, [normalizeEmail, toast]);

  useEffect(() => {
    void loadAllStaff();
  }, [loadAllStaff]);

  useEffect(() => {
    conversationsApi.getAll()
      .then((res: any) => {
        const raw: any[] = parseItems(res);
        setConversations(raw.map(mapConversation));
      })
      .catch(() => {
        toast({ title: 'Failed to load conversations', variant: 'destructive' });
      });
  }, [toast, mapConversation]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setShowConversationList(true);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const markLatestAsRead = useCallback((conversationId: string) => {
    const latest = [...(messagesByConversation[conversationId] || [])]
      .reverse()
      .find((message) => message.sender.id !== currentUser.id);

    if (!latest) return;
    sendWsEvent({ type: 'message.read', message_id: latest.id });
  }, [currentUser.id, messagesByConversation, sendWsEvent]);

  const upsertIncomingMessage = useCallback((conversationId: string, incoming: Message) => {
    setMessagesByConversation((prev) => {
      const current = prev[conversationId] || [];
      const incomingAttachmentName = incoming.attachments?.[0]?.name;

      const optimisticIndex = current.findIndex((message) => {
        if (message.sender.id !== incoming.sender.id) return false;

        if (incoming.attachments?.length) {
          const localAttachmentName = message.attachments?.[0]?.name;
          return message.id.startsWith('tmp-att-')
            && !!localAttachmentName
            && localAttachmentName === incomingAttachmentName;
        }

        return message.id.startsWith('tmp-') && message.content === incoming.content;
      });

      if (optimisticIndex !== -1) {
        const replaced = [...current];
        replaced[optimisticIndex] = incoming;
        return {
          ...prev,
          [conversationId]: mergeAndSortMessages([], replaced),
        };
      }

      return {
        ...prev,
        [conversationId]: mergeAndSortMessages(current, [incoming]),
      };
    });

    updateConversationPreview(conversationId, incoming);
  }, [updateConversationPreview]);

  const handleWsEvent = useCallback((envelope: ChatServerEnvelope) => {
    if (!selectedConversationId || !envelope?.event) return;

    const eventType = envelope.event;
    const data = envelope.data || {};

    if (eventType === 'message.created' || eventType === 'message.attachment') {
      const eventPayload = data?.message || data;
      const conversationId = eventPayload?.conversation_id || eventPayload?.conversation || selectedConversationId;
      const mapped = mapMessage(eventPayload, conversationId);
      upsertIncomingMessage(conversationId, mapped);

      if (conversationId === selectedConversationId && mapped.sender.id !== currentUser.id) {
        markLatestAsRead(conversationId);
      }
      return;
    }

    if (eventType === 'typing.start' || eventType === 'typing.stop') {
      const userId = data?.user_id || data?.sender_id;
      if (!userId || userId === currentUser.id) return;

      setTypingStatus((prev) => {
        const next = prev.filter((status) => status.userId !== userId);
        if (eventType === 'typing.start') {
          next.push({
            userId,
            userName: data?.user_name || data?.sender_email || 'Unknown',
            isTyping: true,
            timestamp: new Date().toISOString(),
          });
        }
        return next;
      });
      return;
    }

    if (eventType === 'message.read') {
      const readMessageId = data?.message_id;
      const readAt = data?.read_at || new Date().toISOString();

      if (readMessageId) {
        setMessagesByConversation((prev) => ({
          ...prev,
          [selectedConversationId]: (prev[selectedConversationId] || []).map((message) =>
            message.id === readMessageId || (message.sender.id === currentUser.id && message.status !== 'read')
              ? { ...message, status: 'read', readAt }
              : message,
          ),
        }));
      }
      return;
    }

    if (eventType === 'error') {
      toast({
        title: 'Chat error',
        description: data?.message || 'WebSocket returned an error event.',
        variant: 'destructive',
      });
    }
  }, [selectedConversationId, upsertIncomingMessage, currentUser.id, markLatestAsRead, toast]);

  useEffect(() => {
    if (!selectedConversationId) return;

    const token = authService.getAccessToken();
    if (!token) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${getWsBaseUrl()}/ws/chat/${selectedConversationId}/?token=${encodeURIComponent(token)}`;

    const connectSocket = () => {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const parsed: ChatServerEnvelope = JSON.parse(event.data);
          handleWsEvent(parsed);
        } catch {
          // Ignore malformed ws frames.
        }
      };

      socket.onclose = (event) => {
        if (event.code === 4401) {
          toast({
            title: 'WebSocket authentication failed',
            description: 'Please sign in again.',
            variant: 'destructive',
          });
          return;
        }

        if (event.code === 4403) {
          toast({
            title: 'Access denied',
            description: 'You are not a participant in this conversation.',
            variant: 'destructive',
          });
          return;
        }

        if (reconnectTimeoutRef.current) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (selectedConversation?.id === selectedConversationId) {
            connectSocket();
          }
        }, 2000);
      };
    };

    connectSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [handleWsEvent, selectedConversation?.id, selectedConversationId, toast]);

  useEffect(() => {
    const unreadMessages = conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);
    window.dispatchEvent(
      new CustomEvent(CHAT_UPDATED_EVENT, {
        detail: {
          unreadMessages,
          unreadConversations: conversations.filter((conversation) => conversation.unreadCount > 0).length,
        },
      }),
    );
  }, [conversations]);

  const handleConversationSelect = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);

    setConversations((prev) => prev.map((item) => (
      item.id === conversation.id ? { ...item, unreadCount: 0 } : item
    )));

    const existingPageState = pagesByConversation[conversation.id];
    if (!existingPageState?.loaded && !existingPageState?.loading) {
      void loadMessages(conversation.id, 1);
    }

    window.dispatchEvent(
      new CustomEvent(CHAT_UPDATED_EVENT, {
        detail: { forceRefresh: true },
      }),
    );

    if (isMobile) setShowConversationList(false);
  }, [isMobile, loadMessages, pagesByConversation]);

  const handleLoadMoreMessages = useCallback(() => {
    if (!selectedConversationId || selectedPageState.loading || !selectedPageState.hasMore) {
      return;
    }
    void loadMessages(selectedConversationId, selectedPageState.page + 1);
  }, [selectedConversationId, selectedPageState, loadMessages]);

  const handleCreateConversation = useCallback((
    type: ConversationType,
    participants: Employee[],
    name?: string,
    description?: string,
    caseId?: string,
  ) => {
    const payload: any = {
      type,
      participant_ids: participants.map((participant) => participant.id),
      subject: name || 'New conversation',
    };
    if (name) payload.name = name;
    if (description) payload.description = description;
    if (caseId) payload.case_id = caseId;

    conversationsApi.create(payload)
      .then((res: any) => {
        const created = mapConversation(res?.data || res);
        setConversations((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        setSelectedConversation(created);
      })
      .catch((error: any) => {
        toast({
          title: 'Failed to create conversation',
          description: error?.message || 'Please retry.',
          variant: 'destructive',
        });
      });

    setShowNewMessageModal(false);
    if (isMobile) setShowConversationList(false);
  }, [isMobile, toast]);

  const handleSendMessage = useCallback(async (
    content: string,
    files?: File[],
    mentions?: string[],
  ) => {
    if (!selectedConversation) return;

    const trimmed = content.trim();
    const conversationId = selectedConversation.id;

    if (trimmed.length > 0) {
      const optimisticMessage: Message = {
        id: `tmp-${crypto.randomUUID()}`,
        conversationId,
        sender: currentUser,
        content: trimmed,
        mentions,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };

      setMessagesByConversation((prev) => ({
        ...prev,
        [conversationId]: mergeAndSortMessages(prev[conversationId] || [], [optimisticMessage]),
      }));

      updateConversationPreview(conversationId, optimisticMessage);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendWsEvent({ type: 'message.send', body: trimmed });
      } else {
        // WebSocket not ready — fall back to REST API
        try {
          const res = await conversationsApi.sendMessage(conversationId, { body: trimmed });
          const realMessage = mapMessage(res?.data || res, conversationId);
          upsertIncomingMessage(conversationId, realMessage);
        } catch (err: any) {
          toast({
            title: 'Failed to send message',
            description: err?.message || 'Could not deliver the message.',
            variant: 'destructive',
          });
          // Remove the optimistic message on failure
          setMessagesByConversation((prev) => ({
            ...prev,
            [conversationId]: (prev[conversationId] || []).filter((m) => m.id !== optimisticMessage.id),
          }));
        }
      }
    }

    if (files && files.length > 0) {
      for (const file of files) {
        const localAttachmentUrl = URL.createObjectURL(file);
        const tempAttachmentMessage: Message = {
          id: `tmp-att-${crypto.randomUUID()}`,
          conversationId,
          sender: currentUser,
          content: file.name,
          attachments: [{
            id: `tmp-att-file-${crypto.randomUUID()}`,
            name: file.name,
            type: file.type.startsWith('image/')
              ? 'image'
              : file.type.startsWith('audio/')
                ? 'audio'
                : file.type.startsWith('video/')
                  ? 'video'
                  : 'file',
            url: localAttachmentUrl,
            size: file.size,
            mimeType: file.type,
            mediaKind: inferMediaKind(file),
          }],
          status: 'sent',
          createdAt: new Date().toISOString(),
        };

        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: mergeAndSortMessages(prev[conversationId] || [], [tempAttachmentMessage]),
        }));
        updateConversationPreview(conversationId, tempAttachmentMessage);

        try {
          const uploadResponse = await conversationsApi.uploadAttachment(conversationId, file, {
            mediaKind: inferMediaKind(file),
          });
          const messagePayload = uploadResponse?.data?.message || uploadResponse?.message || uploadResponse?.data || uploadResponse;
          const uploadedMessage = mapMessage(messagePayload, conversationId);
          upsertIncomingMessage(conversationId, uploadedMessage);
          URL.revokeObjectURL(localAttachmentUrl);
        } catch (error: any) {
          URL.revokeObjectURL(localAttachmentUrl);
          setMessagesByConversation((prev) => ({
            ...prev,
            [conversationId]: (prev[conversationId] || []).filter((message) => message.id !== tempAttachmentMessage.id),
          }));
          toast({
            title: 'Attachment upload failed',
            description: `${file.name}: ${error?.message || 'Unable to upload file.'}`,
            variant: 'destructive',
          });
        }
      }
    }
  }, [selectedConversation, currentUser, updateConversationPreview, sendWsEvent, upsertIncomingMessage, mapMessage, toast]);

  const handleTyping = useCallback((isTyping: boolean) => {
    if (!selectedConversation) return;

    sendWsEvent({ type: isTyping ? 'typing.start' : 'typing.stop' });

    setTypingStatus((prev) => {
      const filtered = prev.filter((status) => status.userId !== currentUser.id);
      if (!isTyping) return filtered;
      return [
        ...filtered,
        {
          userId: currentUser.id,
          userName: currentUser.name,
          isTyping,
          timestamp: new Date().toISOString(),
        },
      ];
    });
  }, [selectedConversation, currentUser.id, currentUser.name, sendWsEvent]);

  const handleUpdateGroup = useCallback((updates: Partial<Conversation>) => {
    if (!selectedConversation) return;
    setConversations((prev) => prev.map((conversation) => (
      conversation.id === selectedConversation.id
        ? { ...conversation, ...updates, updatedAt: new Date().toISOString() }
        : conversation
    )));
    setSelectedConversation((prev) => (prev ? { ...prev, ...updates } : null));
  }, [selectedConversation]);

  const handleMessageDelete = useCallback((message: Message) => {
    if (!selectedConversationId) return;
    const deleteForEveryone = message.sender.id === currentUser.id
      ? window.confirm('Delete this message for everyone? Click Cancel to delete only for you.')
      : false;

    conversationsApi.deleteMessage(selectedConversationId, message.id, deleteForEveryone)
      .then(() => {
        setMessagesByConversation((prev) => ({
          ...prev,
          [selectedConversationId]: (prev[selectedConversationId] || []).filter((item) => item.id !== message.id),
        }));
      })
      .catch((error: any) => {
        toast({
          title: 'Could not delete message',
          description: error?.message || 'Please try again.',
          variant: 'destructive',
        });
      });
  }, [selectedConversationId, currentUser.id, toast]);

  const handleConversationDelete = useCallback(() => {
    if (!selectedConversationId) return;
    if (!window.confirm('Delete this chat for your account?')) return;

    conversationsApi.deleteConversation(selectedConversationId)
      .then(() => {
        setConversations((prev) => prev.filter((conversation) => conversation.id !== selectedConversationId));
        setMessagesByConversation((prev) => {
          const next = { ...prev };
          delete next[selectedConversationId];
          return next;
        });
        setSelectedConversation(null);
      })
      .catch((error: any) => {
        toast({
          title: 'Could not delete chat',
          description: error?.message || 'Please try again.',
          variant: 'destructive',
        });
      });
  }, [selectedConversationId, toast]);

  const handleMobileBack = useCallback(() => {
    if (selectedConversation && isMobile) {
      setShowConversationList(true);
      setSelectedConversation(null);
      setTypingStatus([]);
    }
  }, [selectedConversation, isMobile]);

  useEffect(() => {
    if (!selectedConversationId || conversationMessages.length === 0) return;
    markLatestAsRead(selectedConversationId);
  }, [selectedConversationId, conversationMessages.length, markLatestAsRead]);

  useEffect(() => {
    setTypingStatus([]);
  }, [selectedConversationId]);

  return (
    <AppLayout title="Secure Messaging" subtitle="Healthcare Communication Platform">
      <div className="h-[calc(100dvh-11rem)] min-h-0 flex gap-4 overflow-hidden">
        <div className={cn(
          'transition-all duration-300 ease-in-out flex flex-col',
          isMobile ? (showConversationList ? 'w-full' : 'hidden') : 'w-80 flex-shrink-0',
        )}>
          <ConversationList
            conversations={conversations}
            selectedConversation={selectedConversation}
            currentUserId={currentUser.id}
            currentUserEmail={currentUser.email}
            onConversationSelect={handleConversationSelect}
            onNewMessage={() => setShowNewMessageModal(true)}
            filter={filter}
            onFilterChange={setFilter}
            sort={sort}
            onSortChange={setSort}
            className="flex-1 min-h-0"
          />
        </div>

        <div className={cn(
          'flex-1 flex flex-col transition-all duration-300 ease-in-out min-w-0',
          isMobile && showConversationList ? 'hidden' : 'flex',
        )}>
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ChatHeader
              conversation={selectedConversation}
              currentUserId={currentUser.id}
              onlineStatus={onlineStatus}
              onViewMembers={() => setShowGroupDetailsModal(true)}
              onAddMember={() => {}}
              onToggleMute={() => selectedConversation && handleUpdateGroup({ isMuted: !selectedConversation.isMuted })}
              onToggleArchive={() => selectedConversation && handleUpdateGroup({ isArchived: !selectedConversation.isArchived })}
              onDeleteConversation={handleConversationDelete}
              onCall={() => {}}
              onVideoCall={() => {}}
              onBack={isMobile ? handleMobileBack : undefined}
            />

            <MessageList
              conversation={selectedConversation}
              messages={conversationMessages}
              currentUserId={currentUser.id}
              typingStatus={typingStatus}
              hasMoreMessages={selectedPageState.hasMore}
              isLoadingMessages={selectedPageState.loading}
              onLoadMoreMessages={handleLoadMoreMessages}
              onMessageReply={() => {}}
              onMessageEdit={() => {}}
              onMessageDelete={handleMessageDelete}
              className="flex-1 min-h-0"
            />

            <ChatInput
              conversation={selectedConversation}
              currentUser={currentUser}
              participants={selectedConversation?.participants || []}
              onSendMessage={handleSendMessage}
              onTyping={handleTyping}
            />
          </Card>
        </div>

        {isMobile && showConversationList && (
          <Button
            className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg z-50"
            onClick={() => setShowNewMessageModal(true)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        )}
      </div>

      <NewMessageModal
        open={showNewMessageModal}
        onOpenChange={setShowNewMessageModal}
        currentUser={currentUser}
        allUsers={allUsers}
        hospitals={allHospitals}
        onCreateConversation={handleCreateConversation}
      />

      <GroupDetailsModal
        open={showGroupDetailsModal}
        onOpenChange={setShowGroupDetailsModal}
        conversation={selectedConversation}
        currentUser={currentUser}
        onUpdateGroup={handleUpdateGroup}
        onAddMembers={() => {}}
        onRemoveMember={() => {}}
        onLeaveGroup={() => {}}
        onDeleteGroup={() => {}}
        canEdit={selectedConversation?.creator?.id === currentUser.id}
        canManageMembers={selectedConversation?.creator?.id === currentUser.id}
      />
    </AppLayout>
  );
};

export default Messages;
