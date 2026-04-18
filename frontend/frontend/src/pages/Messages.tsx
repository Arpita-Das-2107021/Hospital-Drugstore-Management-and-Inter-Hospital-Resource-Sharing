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
import { useChatStore } from '@/store/chatStore';
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
import { canAccessNavItem, getCanonicalHealthcareId } from '@/lib/accessResolver';
import { useSearchParams } from 'react-router-dom';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const PAGE_LIMIT = 25;
const CHAT_ACCESS_PERMISSION_CODES = [
  'communication:chat.view',
  'communication:conversation.view',
  'hospital:communication.view',
];
const CHAT_UNAVAILABLE_MESSAGE = 'You are not authorized to access chat in this context.';

type ChatServerEnvelope = {
  event?: string;
  data?: unknown;
};

type ConversationPageState = {
  page: number;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
};

const EMPTY_MESSAGES: Message[] = [];
const LOCAL_MESSAGE_ID_PREFIXES = ['tmp-', 'tmp-att-', 'tmp-att-file-'];

const isLocalOptimisticMessageId = (id: string): boolean => {
  const value = String(id || '').trim().toLowerCase();
  return LOCAL_MESSAGE_ID_PREFIXES.some((prefix) => value.startsWith(prefix));
};

const getLatestServerMessageId = (messages: Message[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidateId = String(messages[index]?.id || '').trim();
    if (!candidateId) continue;
    if (!isLocalOptimisticMessageId(candidateId)) {
      return candidateId;
    }
  }
  return '';
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

const mapEmployee = (p: unknown): Employee => {
  const record = (p && typeof p === 'object' ? p as Record<string, unknown> : {});
  const nestedUser = (record.user && typeof record.user === 'object')
    ? record.user as Record<string, unknown>
    : {};
  const nestedHospital = (record.hospital && typeof record.hospital === 'object')
    ? record.hospital as Record<string, unknown>
    : {};

  const resolvedId = String(
    record.user_id ??
    nestedUser.id ??
    record.user ??
    record.id ??
    '',
  ).trim();

  const resolvedEmail = String(
    record.user_email ??
    record.email ??
    nestedUser.email ??
    '',
  ).trim();

  const resolvedName = (
    String(
      record.user_full_name ??
      record.full_name ??
      nestedUser.full_name ??
      record.name ??
      nestedUser.name ??
      resolvedEmail ??
      'Unknown',
    ).trim() || 'Unknown'
  );

  const resolvedHospital = String(
    record.hospital_name ??
    nestedHospital.name ??
    (typeof record.hospital === 'string' ? record.hospital : '') ??
    '',
  ).trim();

  return {
    id: resolvedId,
    name: resolvedName || 'Unknown',
    email: resolvedEmail,
    role: normalizeRole(String(record.role_name ?? nestedUser.role_name ?? record.role ?? nestedUser.role ?? '')),
    hospital: resolvedHospital,
    department: String(record.department ?? nestedUser.department ?? '').trim(),
    isOnline: Boolean(record.is_online ?? nestedUser.is_online ?? false),
    lastSeen: String(record.last_seen ?? nestedUser.last_seen ?? '').trim() || undefined,
  };
};

const mapAttachment = (attachment: unknown) => {
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

const parseItems = (res: unknown): unknown[] => {
  const root = res?.data ?? res;
  if (Array.isArray(root?.results)) return root.results;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root)) return root;
  return [];
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toUnreadCount = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ChatHeaderWriteTrace = {
  functionName: string;
  payload: unknown;
  fieldPath: string;
  nextRenderedValue?: unknown;
};

const traceChatHeaderWrite = ({
  functionName,
  payload,
  fieldPath,
  nextRenderedValue,
}: ChatHeaderWriteTrace) => {
  console.log('CHAT HEADER WRITE TRACE', {
    file: 'src/pages/Messages.tsx',
    function: functionName,
    payload,
    fieldPath,
    nextRenderedValue,
    timestamp: Date.now(),
  });
};

export const getLatestInboundMessageId = (messages: Message[], currentUserId: string): string => {
  return [...messages]
    .reverse()
    .find((message) => message.sender.id !== currentUserId)?.id || '';
};

export const applyMessageReadReceipt = (
  messages: Message[],
  currentUserId: string,
  readMessageId: string,
  readAt: string,
): Message[] => {
  if (messages.length === 0) return messages;

  const pointerMessage = readMessageId
    ? messages.find((message) => message.id === readMessageId)
    : undefined;
  const pointerTime = pointerMessage ? new Date(pointerMessage.createdAt).getTime() : null;

  return messages.map((message) => {
    if (message.sender.id !== currentUserId || message.status === 'read') {
      return message;
    }

    const shouldMarkRead = readMessageId
      ? (pointerTime !== null
          ? new Date(message.createdAt).getTime() <= pointerTime
          : message.id === readMessageId)
      : true;

    return shouldMarkRead
      ? { ...message, status: 'read', readAt }
      : message;
  });
};

export const applyUnreadCountUpdatedEvent = (
  conversations: Conversation[],
  payload: unknown,
): {
  conversations: Conversation[];
  totalUnread: number;
  unreadConversations: number;
} => {
  const root = asRecord(payload);
  const nestedData = asRecord(root.data);
  const data = Object.keys(nestedData).length > 0 ? nestedData : root;
  const unreadByConversation = new Map<string, number>();
  const conversationUnread = Array.isArray(data.conversation_unread)
    ? data.conversation_unread
    : [];

  conversationUnread.forEach((entry) => {
    const record = asRecord(entry);
    const conversationId = String(record.conversation_id ?? '').trim();
    const unreadCount = toUnreadCount(record.unread_count);
    if (conversationId && unreadCount !== null) {
      unreadByConversation.set(conversationId, unreadCount);
    }
  });

  const singleConversationId = String(data.conversation_id ?? '').trim();
  const singleConversationUnread = toUnreadCount(data.unread_count);
  if (singleConversationId && singleConversationUnread !== null && !unreadByConversation.has(singleConversationId)) {
    unreadByConversation.set(singleConversationId, singleConversationUnread);
  }

  const nextConversations = unreadByConversation.size > 0
    ? conversations.map((conversation) => {
      const unreadCount = unreadByConversation.get(conversation.id);
      if (typeof unreadCount !== 'number') {
        return conversation;
      }
      return { ...conversation, unreadCount };
    })
    : conversations;

  const computedTotal = nextConversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);
  const payloadTotal = toUnreadCount(data.total_unread);
  const totalUnread = payloadTotal ?? Math.max(0, computedTotal);
  const unreadConversations = nextConversations.filter((conversation) => conversation.unreadCount > 0).length;

  return {
    conversations: nextConversations,
    totalUnread,
    unreadConversations,
  };
};

type UnreadConversationDelta = {
  conversationId: string;
  unreadCount: number;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt?: string;
};

const extractUnreadConversationDeltas = (payload: unknown): UnreadConversationDelta[] => {
  const root = asRecord(payload);
  const nestedData = asRecord(root.data);
  const data = Object.keys(nestedData).length > 0 ? nestedData : root;
  const deltasByConversation = new Map<string, UnreadConversationDelta>();

  const appendDelta = (entry: Record<string, unknown>) => {
    const conversationId = String(entry.conversation_id ?? entry.conversation ?? '').trim();
    const unreadCount = toUnreadCount(entry.unread_count);
    if (!conversationId || unreadCount === null) {
      return;
    }

    const lastMessage = String(
      entry.last_message ??
      entry.preview ??
      entry.message_preview ??
      '',
    ).trim();
    const lastMessageAt = String(
      entry.last_message_at ??
      entry.last_message_created_at ??
      '',
    ).trim();
    const updatedAt = String(entry.updated_at ?? '').trim();

    deltasByConversation.set(conversationId, {
      conversationId,
      unreadCount,
      ...(lastMessage ? { lastMessage } : {}),
      ...(lastMessageAt ? { lastMessageAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    });
  };

  const conversationUnread = Array.isArray(data.conversation_unread)
    ? data.conversation_unread
    : [];
  conversationUnread.forEach((entry) => appendDelta(asRecord(entry)));
  appendDelta(data);

  return Array.from(deltasByConversation.values());
};

const countUnreadConversations = (conversations: Conversation[]): number => {
  return conversations.filter((conversation) => (conversation.unreadCount || 0) > 0).length;
};

const toUnreadCountMap = (conversations: Conversation[]): Record<string, number> => {
  return conversations.reduce<Record<string, number>>((acc, conversation) => {
    acc[conversation.id] = conversation.unreadCount;
    return acc;
  }, {});
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
  const [searchParams, setSearchParams] = useSearchParams();

  const canAccessChat = useMemo(
    () => canAccessNavItem(user, 'hospital', CHAT_ACCESS_PERMISSION_CODES),
    [user],
  );
  const healthcareContextId = useMemo(() => getCanonicalHealthcareId(user), [user]);

  const currentUser: Employee = useMemo(() => ({
    id: user?.id || '',
    name: user?.full_name || user?.email || 'Me',
    email: user?.email || '',
    role: (user?.role || 'staff').toLowerCase() as Employee['role'],
    hospital: user?.hospital_name || healthcareContextId || '',
    department: user?.department || '',
    isOnline: true,
  }), [healthcareContextId, user]);

  const selectedConversationId = useChatStore((state) => state.selectedConversationId);
  const recipientCache = useChatStore((state) => state.recipientCache);
  const unreadCounts = useChatStore((state) => state.unreadCounts);
  const conversationMessages = useChatStore((state) => (
    selectedConversationId ? (state.conversations[selectedConversationId] || EMPTY_MESSAGES) : EMPTY_MESSAGES
  ));

  const setMessagesCache = useChatStore((state) => state.setMessages);
  const addMessageCache = useChatStore((state) => state.addMessage);
  const appendMessagesCache = useChatStore((state) => state.appendMessages);
  const setSelectedConversationId = useChatStore((state) => state.setSelectedConversation);
  const setUnreadCountCache = useChatStore((state) => state.setUnreadCount);
  const setUnreadCountsCache = useChatStore((state) => state.setUnreadCounts);
  const upsertRecipientCache = useChatStore((state) => state.upsertRecipient);
  const upsertRecipientsCache = useChatStore((state) => state.upsertRecipients);
  const clearConversationCache = useChatStore((state) => state.clearConversation);

  const conversations = useMemo(() => {
    return Object.values(recipientCache)
      .map((conversation) => {
        const unreadCount = unreadCounts[conversation.id];
        if (typeof unreadCount !== 'number' || unreadCount === conversation.unreadCount) {
          return conversation;
        }
        return {
          ...conversation,
          unreadCount,
        };
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [recipientCache, unreadCounts]);

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    const conversation = recipientCache[selectedConversationId];
    if (!conversation) return null;

    const unreadCount = unreadCounts[selectedConversationId];
    if (typeof unreadCount !== 'number' || unreadCount === conversation.unreadCount) {
      return conversation;
    }

    return {
      ...conversation,
      unreadCount,
    };
  }, [selectedConversationId, recipientCache, unreadCounts]);

  const [pagesByConversation, setPagesByConversation] = useState<Record<string, ConversationPageState>>({});
  const [allUsers, setAllUsers] = useState<Employee[]>([]);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showGroupDetailsModal, setShowGroupDetailsModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);
  const requestedConversationId = (searchParams.get('conversation') || '').trim();

  const [filter, setFilter] = useState<MessageFilter>({});
  const [sort, setSort] = useState<MessageSort>({ field: 'recent', direction: 'desc' });
  const [typingStatus, setTypingStatus] = useState<TypingStatus[]>([]);
  const onlineStatus = useMemo<Record<string, OnlineStatus>>(() => ({}), []);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const messageLoadInFlightRef = useRef<Record<string, boolean>>({});
  const lastReadPointerByConversationRef = useRef<Record<string, string>>({});
  const restrictedAccessToastShownRef = useRef(false);
  const participantDisplayNameByKeyRef = useRef<Record<string, string>>({});
  const conversationDisplayNameByIdRef = useRef<Record<string, string>>({});
  const loadConversationsRequestRef = useRef(0);
  const unreadSyncRequestRef = useRef(0);
  const syncMessagesRequestByConversationRef = useRef<Record<string, number>>({});

  const latestInboundMessageId = useMemo(() => {
    return getLatestInboundMessageId(conversationMessages, currentUser.id);
  }, [conversationMessages, currentUser.id]);

  const selectedPageState = useMemo<ConversationPageState>(() => {
    if (!selectedConversationId) {
      return { page: 0, hasMore: false, loading: false, loaded: false };
    }

    const existingState = pagesByConversation[selectedConversationId];
    if (existingState) {
      return existingState;
    }

    if (conversationMessages.length > 0) {
      return {
        page: Math.max(1, Math.ceil(conversationMessages.length / PAGE_LIMIT)),
        hasMore: conversationMessages.length % PAGE_LIMIT === 0,
        loading: false,
        loaded: true,
      };
    }

    return { page: 0, hasMore: false, loading: false, loaded: false };
  }, [conversationMessages.length, pagesByConversation, selectedConversationId]);

  const allHospitals = useMemo(
    () => Array.from(new Set(allUsers.map((employee) => employee.hospital).filter(Boolean))),
    [allUsers],
  );

  const normalizeEmail = useCallback((value?: string) => (value || '').trim().toLowerCase(), []);

  const isLikelyEmail = useCallback((value?: string) => {
    const normalized = (value || '').trim().toLowerCase();
    if (!normalized) return false;
    return EMAIL_PATTERN.test(normalized);
  }, []);

  const getStableDisplayName = useCallback((cacheKey: string, preferredName: string, fallbackName: string) => {
    const preferred = preferredName.trim();
    const fallback = fallbackName.trim();
    const cached = (participantDisplayNameByKeyRef.current[cacheKey] || '').trim();

    const preferredIsEmail = isLikelyEmail(preferred);
    const cachedIsEmail = isLikelyEmail(cached);

    let resolved = preferred || fallback || cached || 'Unknown User';

    if (preferredIsEmail && cached && !cachedIsEmail) {
      resolved = cached;
    } else if (!preferredIsEmail && preferred) {
      resolved = preferred;
    }

    if (cacheKey) {
      const shouldPromote =
        !participantDisplayNameByKeyRef.current[cacheKey] ||
        (!isLikelyEmail(resolved) && cachedIsEmail);

      if (shouldPromote) {
        traceChatHeaderWrite({
          functionName: 'getStableDisplayName',
          payload: {
            cacheKey,
            preferred,
            fallback,
            cached,
            resolved,
          },
          fieldPath: 'participantDisplayNameByKeyRef.current[cacheKey]',
          nextRenderedValue: resolved,
        });
        participantDisplayNameByKeyRef.current[cacheKey] = resolved;
      }
    }

    return resolved;
  }, [isLikelyEmail]);

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

  const resolveParticipant = useCallback((raw: unknown, index: number): Employee => {
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
      const cacheKey = emailKey || `participant-${index}`;
      const fromDirectory = emailKey ? staffByEmail.get(emailKey) : undefined;
      if (fromDirectory) {
        return {
          ...fromDirectory,
          name: getStableDisplayName(cacheKey, fromDirectory.name, raw),
        };
      }

      const isCurrentUser = emailKey && emailKey === normalizeEmail(currentUser.email);
      return {
        id: isCurrentUser ? currentUser.id : raw,
        name: getStableDisplayName(cacheKey, isCurrentUser ? currentUser.name : raw, raw),
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
    const participantId = String(
      raw?.user ||
      raw?.user_id ||
      (isCurrentUser ? currentUser.id : fromDirectory?.id) ||
      raw?.id ||
      email ||
      `participant-${index}`,
    ).trim();
    const cacheKey = participantId || emailKey || `participant-${index}`;

    const preferredDisplayName =
      fromDirectory?.name ||
      raw?.user_full_name ||
      raw?.full_name ||
      raw?.name ||
      (isCurrentUser ? currentUser.name : '') ||
      '';
    const fallbackDisplayName = String(raw?.user_email || email || participantId || 'Unknown User');
    const displayName = getStableDisplayName(
      cacheKey,
      String(preferredDisplayName || ''),
      fallbackDisplayName,
    );

    return {
      id: participantId,
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
  }, [currentUser, getStableDisplayName, normalizeEmail, staffByEmail]);

  const mapConversation = useCallback((c: unknown): Conversation => {
    const rawParticipants = Array.isArray(c?.participants)
      ? c.participants
      : Array.isArray(c?.participant_details)
        ? c.participant_details
        : [];

    const participants = rawParticipants.map((participant: unknown, index: number) =>
      resolveParticipant(participant, index),
    );

    const conversationId = String(c?.id || '').trim();
    const conversationType = String(c?.type || 'private').toLowerCase() as ConversationType;
    const normalizedCurrentEmail = normalizeEmail(currentUser.email);

    const counterpart = participants.find(
      (participant) =>
        participant.id !== currentUser.id &&
        (!normalizedCurrentEmail || normalizeEmail(participant.email) !== normalizedCurrentEmail),
    )
      || participants.find((participant) => participant.id !== currentUser.id)
      || participants.find((participant) => !normalizedCurrentEmail || normalizeEmail(participant.email) !== normalizedCurrentEmail);

    const previousDisplayName = conversationDisplayNameByIdRef.current[conversationId] || '';
    const incomingDisplayName = (
      conversationType === 'group'
        ? String(c?.name || c?.subject || '')
        : String(counterpart?.name || counterpart?.email || c?.name || c?.subject || '')
    ).trim();

    let stableDisplayName = incomingDisplayName || previousDisplayName || (conversationType === 'group' ? 'Unnamed Group' : 'Direct Message');
    if (
      conversationType !== 'group' &&
      isLikelyEmail(stableDisplayName) &&
      previousDisplayName &&
      !isLikelyEmail(previousDisplayName)
    ) {
      stableDisplayName = previousDisplayName;
    }

    if (conversationId) {
      const cached = conversationDisplayNameByIdRef.current[conversationId];
      const shouldPromote = !cached || (!isLikelyEmail(stableDisplayName) && isLikelyEmail(cached));
      if (shouldPromote) {
        traceChatHeaderWrite({
          functionName: 'mapConversation',
          payload: {
            conversationId,
            conversationType,
            cached,
            incomingDisplayName,
            stableDisplayName,
          },
          fieldPath: 'conversationDisplayNameByIdRef.current[conversationId]',
          nextRenderedValue: stableDisplayName,
        });
        conversationDisplayNameByIdRef.current[conversationId] = stableDisplayName;
      }
    }

    return {
      id: c?.id,
      type: conversationType,
      name: stableDisplayName,
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
  }, [currentUser.email, currentUser.id, isLikelyEmail, normalizeEmail, resolveParticipant]);

  const mapMessage = useCallback((m: unknown, conversationId: string): Message => {
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
    const state = useChatStore.getState();
    const conversation = state.recipientCache[conversationId];
    if (!conversation) return;

    const currentUnread = state.unreadCounts[conversationId] ?? conversation.unreadCount ?? 0;
    const nextUnread =
      message.sender.id !== currentUser.id && selectedConversationId !== conversationId
        ? currentUnread + 1
        : currentUnread;

    const nextConversation = {
      ...conversation,
      lastMessage: message.content || (message.attachments?.length ? '[Attachment]' : ''),
      lastMessageAt: message.createdAt,
      updatedAt: message.createdAt,
      unreadCount: nextUnread,
    };

    traceChatHeaderWrite({
      functionName: 'updateConversationPreview',
      payload: {
        conversationId,
        incomingMessageId: message.id,
        incomingSenderId: message.sender.id,
      },
      fieldPath: 'useChatStore.recipientCache[conversationId]',
      nextRenderedValue: {
        name: nextConversation.name,
        participantNames: nextConversation.participants.map((participant) => participant.name),
      },
    });

    upsertRecipientCache(nextConversation);
    setUnreadCountCache(conversationId, nextUnread);
  }, [currentUser.id, selectedConversationId, setUnreadCountCache, upsertRecipientCache]);

  const sendWsEvent = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const dispatchChatUpdated = useCallback((unreadMessages: number, unreadConversations?: number) => {
    const normalizedUnreadMessages = Number.isFinite(unreadMessages)
      ? Math.max(0, Math.floor(unreadMessages))
      : 0;

    const normalizedUnreadConversations = typeof unreadConversations === 'number' && Number.isFinite(unreadConversations)
      ? Math.max(0, Math.floor(unreadConversations))
      : undefined;

    window.dispatchEvent(
      new CustomEvent(CHAT_UPDATED_EVENT, {
        detail: {
          unreadMessages: normalizedUnreadMessages,
          ...(typeof normalizedUnreadConversations === 'number'
            ? { unreadConversations: normalizedUnreadConversations }
            : {}),
        },
      }),
    );
  }, []);

  const applyUnreadConversationDeltas = useCallback((
    deltas: UnreadConversationDelta[],
    source: 'syncGlobalUnreadState' | 'handleWsEvent.unread_count.updated',
  ) => {
    if (deltas.length === 0) {
      return;
    }

    deltas.forEach((delta) => {
      const hasPreviewOrTimestampUpdate = !!(delta.lastMessage || delta.lastMessageAt || delta.updatedAt);
      if (!hasPreviewOrTimestampUpdate) {
        return;
      }

      const existing = useChatStore.getState().recipientCache[delta.conversationId];
      if (!existing) {
        return;
      }

      const nextConversation: Conversation = {
        ...existing,
        unreadCount: delta.unreadCount,
        lastMessage: delta.lastMessage || existing.lastMessage,
        lastMessageAt: delta.lastMessageAt || existing.lastMessageAt,
        updatedAt: delta.updatedAt || delta.lastMessageAt || existing.updatedAt,
      };

      traceChatHeaderWrite({
        functionName: `${source}.applyUnreadConversationDeltas`,
        payload: delta,
        fieldPath: 'useChatStore.recipientCache[conversationId].{unreadCount,lastMessage,lastMessageAt,updatedAt}',
        nextRenderedValue: {
          conversationId: nextConversation.id,
          unreadCount: nextConversation.unreadCount,
          lastMessage: nextConversation.lastMessage,
          lastMessageAt: nextConversation.lastMessageAt,
        },
      });

      upsertRecipientCache(nextConversation);
    });
  }, [upsertRecipientCache]);

  const syncGlobalUnreadState = useCallback(async (
    baseConversations: Conversation[],
    parentRequestId?: number,
  ) => {
    if (typeof parentRequestId === 'number' && parentRequestId !== loadConversationsRequestRef.current) {
      return;
    }

    if (baseConversations.length === 0) {
      dispatchChatUpdated(0, 0);
      return;
    }

    const unreadRequestId = unreadSyncRequestRef.current + 1;
    unreadSyncRequestRef.current = unreadRequestId;

    try {
      const response = await conversationsApi.getGlobalUnreadCount();
      if (unreadRequestId !== unreadSyncRequestRef.current) {
        return;
      }

      if (typeof parentRequestId === 'number' && parentRequestId !== loadConversationsRequestRef.current) {
        return;
      }

      const root = asRecord(response);
      const payload = asRecord(root.data);
      const unreadPayload = Object.keys(payload).length > 0 ? payload : root;
      const unreadUpdate = applyUnreadCountUpdatedEvent(baseConversations, unreadPayload);
      const unreadDeltas = extractUnreadConversationDeltas(unreadPayload);

      traceChatHeaderWrite({
        functionName: 'syncGlobalUnreadState',
        payload: {
          unreadPayload,
          conversationCount: unreadUpdate.conversations.length,
          deltaCount: unreadDeltas.length,
        },
        fieldPath: 'useChatStore.unreadCounts[*], useChatStore.recipientCache[conversationId].{unreadCount,lastMessage,lastMessageAt,updatedAt}',
        nextRenderedValue: unreadUpdate.conversations.map((conversation) => ({
          id: conversation.id,
          unreadCount: conversation.unreadCount,
        })),
      });

      setUnreadCountsCache(toUnreadCountMap(unreadUpdate.conversations));
      applyUnreadConversationDeltas(unreadDeltas, 'syncGlobalUnreadState');
      dispatchChatUpdated(unreadUpdate.totalUnread, unreadUpdate.unreadConversations);
    } catch {
      if (unreadRequestId !== unreadSyncRequestRef.current) {
        return;
      }

      if (typeof parentRequestId === 'number' && parentRequestId !== loadConversationsRequestRef.current) {
        return;
      }

      const unreadConversations = countUnreadConversations(baseConversations);
      dispatchChatUpdated(unreadConversations, unreadConversations);
    }
  }, [applyUnreadConversationDeltas, dispatchChatUpdated, setUnreadCountsCache]);

  const loadMessages = useCallback(async (conversationId: string, page: number) => {
    if (messageLoadInFlightRef.current[conversationId]) {
      return;
    }

    messageLoadInFlightRef.current[conversationId] = true;

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

      if (page === 1) {
        setMessagesCache(conversationId, mappedItems);
      } else {
        appendMessagesCache(conversationId, mappedItems);
      }

      setPagesByConversation((prev) => ({
        ...prev,
        [conversationId]: {
          page,
          hasMore,
          loading: false,
          loaded: true,
        },
      }));
    } catch (error: unknown) {
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
    } finally {
      messageLoadInFlightRef.current[conversationId] = false;
    }
  }, [appendMessagesCache, mapMessage, setMessagesCache, toast]);

  const syncConversationMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) return;

    const syncRequestId = (syncMessagesRequestByConversationRef.current[conversationId] || 0) + 1;
    syncMessagesRequestByConversationRef.current[conversationId] = syncRequestId;

    const state = useChatStore.getState();
    const cachedMessages = state.conversations[conversationId] || [];
    const persistedAfter = String(state.lastMessageId[conversationId] || '').trim();
    const after = persistedAfter && !isLocalOptimisticMessageId(persistedAfter)
      ? persistedAfter
      : getLatestServerMessageId(cachedMessages);

    if (!after) return;

    try {
      const response = await conversationsApi.syncMessages(conversationId, after);
      if (syncMessagesRequestByConversationRef.current[conversationId] !== syncRequestId) {
        return;
      }

      const rawItems = parseItems(response);
      if (rawItems.length === 0) {
        return;
      }

      const mappedItems = rawItems.map((item) => mapMessage(item, conversationId));
      if (syncMessagesRequestByConversationRef.current[conversationId] !== syncRequestId) {
        return;
      }

      appendMessagesCache(conversationId, mappedItems);

      const latestMessage = mappedItems[mappedItems.length - 1];
      if (latestMessage) {
        updateConversationPreview(conversationId, latestMessage);
      }
    } catch {
      // Delta-sync endpoint is optional. Keep local cache when unavailable.
    }
  }, [appendMessagesCache, mapMessage, updateConversationPreview]);

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
          .map((hospital: unknown) => hospital?.id)
          .filter(Boolean)
          .map((hospitalId: string) => hospitalsApi.getStaff(hospitalId)),
      );

      const hospitalStaff = hospitalStaffResponses
        .filter((result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled')
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

      const nextAllUsers = Array.from(deduped.values());
      traceChatHeaderWrite({
        functionName: 'loadAllStaff',
        payload: {
          seedStaffCount: seedStaff.length,
          hospitalsCount: hospitals.length,
          hospitalStaffCount: hospitalStaff.length,
        },
        fieldPath: 'allUsers',
        nextRenderedValue: {
          allUsersCount: nextAllUsers.length,
          sampleUsers: nextAllUsers.slice(0, 5).map((staff) => ({
            id: staff.id,
            email: staff.email,
            name: staff.name,
          })),
        },
      });
      setAllUsers(nextAllUsers);
    } catch {
      toast({ title: 'Failed to load staff list', variant: 'destructive' });
    }
  }, [normalizeEmail, toast]);

  useEffect(() => {
    void loadAllStaff();
  }, [loadAllStaff]);

  useEffect(() => {
    let isDisposed = false;

    const loadConversations = async () => {
      const requestId = loadConversationsRequestRef.current + 1;
      loadConversationsRequestRef.current = requestId;

      try {
        const res: unknown = await conversationsApi.getAll();
        const raw: unknown[] = parseItems(res);
        const mappedConversations = raw.map(mapConversation);

        if (isDisposed || requestId !== loadConversationsRequestRef.current) {
          return;
        }

        traceChatHeaderWrite({
          functionName: 'loadConversations',
          payload: {
            rawConversationCount: raw.length,
          },
          fieldPath: 'useChatStore.recipientCache[*]',
          nextRenderedValue: mappedConversations.map((conversation) => ({
            id: conversation.id,
            name: conversation.name,
            participantNames: conversation.participants.map((participant) => participant.name),
          })),
        });

        upsertRecipientsCache(mappedConversations);
        await syncGlobalUnreadState(mappedConversations, requestId);
      } catch {
        if (isDisposed || requestId !== loadConversationsRequestRef.current) {
          return;
        }

        toast({ title: 'Failed to load conversations', variant: 'destructive' });
      }
    };

    void loadConversations();

    return () => {
      isDisposed = true;
    };
  }, [mapConversation, syncGlobalUnreadState, toast, upsertRecipientsCache]);

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

  const markLatestAsRead = useCallback(async (conversationId: string) => {
    const messages = useChatStore.getState().conversations[conversationId] || [];
    const readPointer = getLatestInboundMessageId(messages, currentUser.id) || undefined;
    const pointerKey = readPointer || '__latest__';

    if (lastReadPointerByConversationRef.current[conversationId] === pointerKey) {
      return;
    }

    try {
      const response = await conversationsApi.markRead(
        conversationId,
        readPointer ? { last_read_message_id: readPointer } : undefined,
      );

      const root = asRecord(response);
      const data = asRecord(root.data);
      const unreadCount = toUnreadCount(data.unread_count ?? root.unread_count);
      const responsePointer = String(data.last_read_message_id ?? data.message_id ?? readPointer ?? '').trim();

      lastReadPointerByConversationRef.current[conversationId] = responsePointer || pointerKey;

      if (unreadCount !== null) {
        setUnreadCountCache(conversationId, unreadCount);
      }
    } catch {
      // Keep optimistic unread state and reconcile on the next unread sync event.
    }

    if (readPointer && wsRef.current?.readyState === WebSocket.OPEN) {
      sendWsEvent({ type: 'message.read', last_read_message_id: readPointer });
    }
  }, [currentUser.id, sendWsEvent, setUnreadCountCache]);

  const upsertIncomingMessage = useCallback((conversationId: string, incoming: Message) => {
    const current = useChatStore.getState().conversations[conversationId] || [];
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
      setMessagesCache(conversationId, replaced);
    } else {
      addMessageCache(conversationId, incoming);
    }

    updateConversationPreview(conversationId, incoming);
  }, [addMessageCache, setMessagesCache, updateConversationPreview]);

  const handleWsEvent = useCallback((envelope: ChatServerEnvelope) => {
    if (!selectedConversationId || !envelope?.event) return;

    const eventType = envelope.event;
    const data = asRecord(envelope.data);

    if (eventType === 'message.created' || eventType === 'message.attachment') {
      const eventPayload = asRecord(data.message ?? data);
      const conversationId = String(eventPayload.conversation_id ?? eventPayload.conversation ?? selectedConversationId);
      const mapped = mapMessage(eventPayload, conversationId);
      upsertIncomingMessage(conversationId, mapped);

      if (conversationId === selectedConversationId && mapped.sender.id !== currentUser.id) {
        void markLatestAsRead(conversationId);
      }
      return;
    }

    if (eventType === 'typing.start' || eventType === 'typing.stop') {
      const userId = String(data.user_id ?? data.sender_id ?? '').trim();
      if (!userId || userId === currentUser.id) return;

      setTypingStatus((prev) => {
        const next = prev.filter((status) => status.userId !== userId);
        if (eventType === 'typing.start') {
          next.push({
            userId,
            userName: String(data.user_name ?? data.sender_email ?? 'Unknown'),
            isTyping: true,
            timestamp: new Date().toISOString(),
          });
        }
        return next;
      });
      return;
    }

    if (eventType === 'message.read') {
      const conversationId = String(data.conversation_id ?? selectedConversationId ?? '').trim();
      if (!conversationId) return;

      const readMessageId = String(data.last_read_message_id ?? data.message_id ?? '').trim();
      const readAt = String(data.last_read_at ?? data.read_at ?? new Date().toISOString());
      const readerUserId = String(data.user_id ?? data.sender_id ?? '').trim();
      if (readerUserId && readerUserId === currentUser.id) return;

      const existingMessages = useChatStore.getState().conversations[conversationId] || [];
      if (existingMessages.length === 0) return;

      const nextMessages = applyMessageReadReceipt(
        existingMessages,
        currentUser.id,
        readMessageId,
        readAt,
      );

      setMessagesCache(conversationId, nextMessages);
      return;
    }

    if (eventType === 'unread_count.updated') {
      const unreadUpdate = applyUnreadCountUpdatedEvent(conversations, data);
      const unreadDeltas = extractUnreadConversationDeltas(data);
      traceChatHeaderWrite({
        functionName: 'handleWsEvent.unread_count.updated',
        payload: data,
        fieldPath: 'useChatStore.unreadCounts[*], useChatStore.recipientCache[conversationId].{unreadCount,lastMessage,lastMessageAt,updatedAt}',
        nextRenderedValue: unreadUpdate.conversations.map((conversation) => ({
          id: conversation.id,
          unreadCount: conversation.unreadCount,
        })),
      });
      setUnreadCountsCache(toUnreadCountMap(unreadUpdate.conversations));
      applyUnreadConversationDeltas(unreadDeltas, 'handleWsEvent.unread_count.updated');
      dispatchChatUpdated(unreadUpdate.totalUnread, unreadUpdate.unreadConversations);
      return;
    }

    if (eventType === 'error') {
      toast({
        title: 'Chat error',
        description: String(data.message ?? 'WebSocket returned an error event.'),
        variant: 'destructive',
      });
    }
  }, [
    selectedConversationId,
    conversations,
    currentUser.id,
    dispatchChatUpdated,
    markLatestAsRead,
    setMessagesCache,
    setUnreadCountsCache,
    toast,
    applyUnreadConversationDeltas,
    upsertIncomingMessage,
  ]);

  useEffect(() => {
    const teardownSocket = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };

    if (!selectedConversationId) {
      restrictedAccessToastShownRef.current = false;
      teardownSocket();
      return () => {
        teardownSocket();
      };
    }

    if (!canAccessChat) {
      teardownSocket();

      if (!restrictedAccessToastShownRef.current) {
        restrictedAccessToastShownRef.current = true;
        toast({
          title: 'Chat unavailable',
          description: CHAT_UNAVAILABLE_MESSAGE,
          variant: 'destructive',
        });
      }

      return () => {
        teardownSocket();
      };
    }

    restrictedAccessToastShownRef.current = false;

    const token = authService.getAccessToken();
    if (!token) {
      teardownSocket();
      return () => {
        teardownSocket();
      };
    }

    const wsUrl = `${getWsBaseUrl()}/ws/chat/${selectedConversationId}/?token=${encodeURIComponent(token)}`;
    let isDisposed = false;

    const connectSocket = () => {
      if (isDisposed) {
        return;
      }

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        void syncConversationMessages(selectedConversationId);
      };

      socket.onmessage = (event) => {
        try {
          const parsed: ChatServerEnvelope = JSON.parse(event.data);
          handleWsEvent(parsed);
        } catch {
          // Ignore malformed ws frames.
        }
      };

      socket.onclose = (event) => {
        if (isDisposed) {
          return;
        }

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

        if (reconnectTimeoutRef.current !== null) {
          window.clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (!isDisposed && useChatStore.getState().selectedConversationId === selectedConversationId) {
            connectSocket();
          }
        }, 2000);
      };
    };

    connectSocket();

    return () => {
      isDisposed = true;
      teardownSocket();
    };
  }, [canAccessChat, handleWsEvent, selectedConversationId, syncConversationMessages, toast]);

  useEffect(() => {
    if (!selectedConversationId || !canAccessChat) return;

    const recoverOnVisibilityOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void syncConversationMessages(selectedConversationId);
    };

    document.addEventListener('visibilitychange', recoverOnVisibilityOrFocus);
    window.addEventListener('focus', recoverOnVisibilityOrFocus);

    return () => {
      document.removeEventListener('visibilitychange', recoverOnVisibilityOrFocus);
      window.removeEventListener('focus', recoverOnVisibilityOrFocus);
    };
  }, [canAccessChat, selectedConversationId, syncConversationMessages]);

  useEffect(() => {
    const unreadConversations = countUnreadConversations(conversations);
    dispatchChatUpdated(unreadConversations, unreadConversations);
  }, [conversations, dispatchChatUpdated]);

  const handleConversationSelect = useCallback((conversation: Conversation) => {
    traceChatHeaderWrite({
      functionName: 'handleConversationSelect',
      payload: {
        conversationId: conversation.id,
        conversationName: conversation.name,
      },
      fieldPath: 'useChatStore.selectedConversationId',
      nextRenderedValue: {
        selectedConversationId: conversation.id,
        headerName: conversation.name,
      },
    });
    setSelectedConversationId(conversation.id);
    setUnreadCountCache(conversation.id, 0);

    const existingPageState = pagesByConversation[conversation.id];
    const cachedMessages = useChatStore.getState().conversations[conversation.id] || [];

    if (cachedMessages.length === 0 && !existingPageState?.loading) {
      void loadMessages(conversation.id, 1);
    } else if (!existingPageState) {
      setPagesByConversation((prev) => ({
        ...prev,
        [conversation.id]: {
          page: Math.max(1, Math.ceil(cachedMessages.length / PAGE_LIMIT)),
          hasMore: cachedMessages.length % PAGE_LIMIT === 0,
          loading: false,
          loaded: true,
        },
      }));
    }

    if (isMobile) setShowConversationList(false);
  }, [isMobile, loadMessages, pagesByConversation, setSelectedConversationId, setUnreadCountCache]);

  useEffect(() => {
    if (!requestedConversationId) return;

    const targetConversation = recipientCache[requestedConversationId];
    if (!targetConversation) return;

    if (selectedConversationId !== requestedConversationId) {
      traceChatHeaderWrite({
        functionName: 'useEffect.requestedConversationId',
        payload: {
          requestedConversationId,
          selectedConversationId,
        },
        fieldPath: 'useChatStore.selectedConversationId',
        nextRenderedValue: {
          selectedConversationId: requestedConversationId,
          headerName: targetConversation.name,
        },
      });
      setSelectedConversationId(requestedConversationId);
    }

    setUnreadCountCache(requestedConversationId, 0);
    if (isMobile) {
      setShowConversationList(false);
    }

    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('conversation');
      return next;
    }, { replace: true });
  }, [
    isMobile,
    recipientCache,
    requestedConversationId,
    selectedConversationId,
    setSearchParams,
    setSelectedConversationId,
    setUnreadCountCache,
  ]);

  const handleLoadMoreMessages = useCallback(() => {
    if (!selectedConversationId || selectedPageState.loading || !selectedPageState.hasMore) {
      return;
    }
    void loadMessages(selectedConversationId, selectedPageState.page + 1);
  }, [selectedConversationId, selectedPageState, loadMessages]);

  useEffect(() => {
    if (!selectedConversationId) return;

    const cachedMessages = useChatStore.getState().conversations[selectedConversationId] || [];
    const existingPageState = pagesByConversation[selectedConversationId];

    if (cachedMessages.length === 0 && !existingPageState?.loading && !existingPageState?.loaded) {
      void loadMessages(selectedConversationId, 1);
    }
  }, [loadMessages, pagesByConversation, selectedConversationId]);

  const handleCreateConversation = useCallback((
    type: ConversationType,
    participants: Employee[],
    name?: string,
    description?: string,
    caseId?: string,
  ) => {
    const participantIds = Array.from(
      new Set(
        participants
          .map((participant) => String(participant.id || '').trim())
          .filter(Boolean)
          .filter((participantId) => participantId !== currentUser.id),
      ),
    );

    if (participantIds.length === 0) {
      toast({
        title: 'Unable to create conversation',
        description: 'Please select at least one valid participant.',
        variant: 'destructive',
      });
      return;
    }

    const unwrapCreatedConversation = (response: unknown): unknown => {
      const root = asRecord(response);
      const data = asRecord(root.data);
      return data.conversation ?? root.conversation ?? root.data ?? response;
    };

    const payload: unknown = {
      type,
      participant_ids: participantIds,
      subject: name || 'New conversation',
    };
    if (name) payload.name = name;
    if (description) payload.description = description;
    if (caseId) payload.case_id = caseId;

    const createRequest = type === 'private'
      ? conversationsApi.openDirectConversation(participantIds[0]).catch(() => conversationsApi.create(payload))
      : conversationsApi.create(payload);

    createRequest
      .then((res: unknown) => {
        const created = mapConversation(unwrapCreatedConversation(res));
        traceChatHeaderWrite({
          functionName: 'handleCreateConversation.then',
          payload: {
            response: res,
            createdConversationId: created.id,
          },
          fieldPath: 'useChatStore.recipientCache[created.id], useChatStore.selectedConversationId',
          nextRenderedValue: {
            selectedConversationId: created.id,
            headerName: created.name,
            participantNames: created.participants.map((participant) => participant.name),
          },
        });
        upsertRecipientCache(created);
        setSelectedConversationId(created.id);
        setUnreadCountCache(created.id, created.unreadCount || 0);
      })
      .catch((error: unknown) => {
        toast({
          title: 'Failed to create conversation',
          description: error?.message || 'Please retry.',
          variant: 'destructive',
        });
      });

    setShowNewMessageModal(false);
    if (isMobile) setShowConversationList(false);
  }, [
    currentUser.id,
    isMobile,
    mapConversation,
    setSelectedConversationId,
    setUnreadCountCache,
    toast,
    upsertRecipientCache,
  ]);

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

      addMessageCache(conversationId, optimisticMessage);

      updateConversationPreview(conversationId, optimisticMessage);

      try {
        const response = await conversationsApi.sendMessage(conversationId, {
          body: trimmed,
          mentions,
        });
        const root = asRecord(response);
        const data = asRecord(root.data);
        const messagePayload = data.message ?? root.message ?? root.data ?? response;
        const realMessage = mapMessage(messagePayload, conversationId);
        upsertIncomingMessage(conversationId, realMessage);
      } catch (err: unknown) {
        console.error('Chat message send API failed', {
          conversationId,
          error: err,
        });

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendWsEvent({
            type: 'message.send',
            body: trimmed,
            ...(mentions && mentions.length > 0 ? { mentions } : {}),
          });
        } else {
          toast({
            title: 'Failed to send message',
            description: err?.message || 'Could not deliver the message.',
            variant: 'destructive',
          });
          // Remove the optimistic message on failure.
          const nextMessages = (useChatStore.getState().conversations[conversationId] || [])
            .filter((message) => message.id !== optimisticMessage.id);
          setMessagesCache(conversationId, nextMessages);
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

        addMessageCache(conversationId, tempAttachmentMessage);
        updateConversationPreview(conversationId, tempAttachmentMessage);

        try {
          const uploadResponse = await conversationsApi.uploadAttachment(conversationId, file, {
            mediaKind: inferMediaKind(file),
          });
          const messagePayload = uploadResponse?.data?.message || uploadResponse?.message || uploadResponse?.data || uploadResponse;
          const uploadedMessage = mapMessage(messagePayload, conversationId);
          upsertIncomingMessage(conversationId, uploadedMessage);
          URL.revokeObjectURL(localAttachmentUrl);
        } catch (error: unknown) {
          URL.revokeObjectURL(localAttachmentUrl);
          const nextMessages = (useChatStore.getState().conversations[conversationId] || [])
            .filter((message) => message.id !== tempAttachmentMessage.id);
          setMessagesCache(conversationId, nextMessages);
          toast({
            title: 'Attachment upload failed',
            description: `${file.name}: ${error?.message || 'Unable to upload file.'}`,
            variant: 'destructive',
          });
        }
      }
    }
  }, [
    addMessageCache,
    currentUser,
    mapMessage,
    selectedConversation,
    sendWsEvent,
    setMessagesCache,
    toast,
    updateConversationPreview,
    upsertIncomingMessage,
  ]);

  const handleTyping = useCallback((isTyping: boolean) => {
    if (!selectedConversationId) return;

    sendWsEvent({ type: isTyping ? 'typing.start' : 'typing.stop' });
  }, [selectedConversationId, sendWsEvent]);

  const handleUpdateGroup = useCallback((updates: Partial<Conversation>) => {
    if (!selectedConversation) return;
    traceChatHeaderWrite({
      functionName: 'handleUpdateGroup',
      payload: {
        conversationId: selectedConversation.id,
        updates,
      },
      fieldPath: 'useChatStore.recipientCache[selectedConversation.id]',
      nextRenderedValue: {
        headerName: selectedConversation.name,
        participantNames: selectedConversation.participants.map((participant) => participant.name),
      },
    });
    upsertRecipientCache({
      ...selectedConversation,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }, [selectedConversation, upsertRecipientCache]);

  const handleMessageDelete = useCallback((message: Message) => {
    if (!selectedConversationId) return;
    const deleteForEveryone = message.sender.id === currentUser.id
      ? window.confirm('Delete this message for everyone? Click Cancel to delete only for you.')
      : false;

    conversationsApi.deleteMessage(selectedConversationId, message.id, deleteForEveryone)
      .then(() => {
        const nextMessages = (useChatStore.getState().conversations[selectedConversationId] || [])
          .filter((item) => item.id !== message.id);
        setMessagesCache(selectedConversationId, nextMessages);
      })
      .catch((error: unknown) => {
        toast({
          title: 'Could not delete message',
          description: error?.message || 'Please try again.',
          variant: 'destructive',
        });
      });
  }, [currentUser.id, selectedConversationId, setMessagesCache, toast]);

  const handleConversationDelete = useCallback(() => {
    if (!selectedConversationId) return;
    if (!window.confirm('Delete this chat for your account?')) return;

    conversationsApi.deleteConversation(selectedConversationId)
      .then(() => {
        traceChatHeaderWrite({
          functionName: 'handleConversationDelete.then',
          payload: {
            selectedConversationId,
          },
          fieldPath: 'useChatStore.recipientCache[selectedConversationId], useChatStore.selectedConversationId',
          nextRenderedValue: {
            selectedConversationId: null,
            headerName: null,
          },
        });
        clearConversationCache(selectedConversationId);
        setSelectedConversationId(null);
        setPagesByConversation((prev) => {
          const next = { ...prev };
          delete next[selectedConversationId];
          return next;
        });
      })
      .catch((error: unknown) => {
        toast({
          title: 'Could not delete chat',
          description: error?.message || 'Please try again.',
          variant: 'destructive',
        });
      });
  }, [clearConversationCache, selectedConversationId, setSelectedConversationId, toast]);

  const handleMobileBack = useCallback(() => {
    if (selectedConversationId && isMobile) {
      traceChatHeaderWrite({
        functionName: 'handleMobileBack',
        payload: {
          selectedConversationId,
          isMobile,
        },
        fieldPath: 'useChatStore.selectedConversationId',
        nextRenderedValue: {
          selectedConversationId: null,
        },
      });
      setShowConversationList(true);
      setSelectedConversationId(null);
      setTypingStatus([]);
    }
  }, [isMobile, selectedConversationId, setSelectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || conversationMessages.length === 0) return;
    void markLatestAsRead(selectedConversationId);
  }, [selectedConversationId, latestInboundMessageId, conversationMessages.length, markLatestAsRead]);

  useEffect(() => {
    setTypingStatus([]);
  }, [selectedConversationId]);

  return (
    <AppLayout title="Secure Messaging"
      // subtitle="Healthcare Communication Platform"
    >
      <div className="flex h-[calc(100dvh-10rem)] min-h-[32rem] min-w-0 gap-3 overflow-hidden md:gap-4">
        <div className={cn(
          'transition-all duration-300 ease-in-out flex flex-col',
          isMobile ? (showConversationList ? 'w-full' : 'hidden') : 'w-[22rem] max-w-[40%] flex-shrink-0',
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
          <Card className="flex-1 flex min-h-0 flex-col overflow-hidden rounded-xl border-border/70">
            <ChatHeader
              conversation={selectedConversation}
              currentUserId={currentUser.id}
              currentUserEmail={currentUser.email}
              onlineStatus={onlineStatus}
              onViewMembers={() => setShowGroupDetailsModal(true)}
              onAddMember={() => {}}
              onToggleMute={() => selectedConversation && handleUpdateGroup({ isMuted: !selectedConversation.isMuted })}
              onToggleArchive={() => selectedConversation && handleUpdateGroup({ isArchived: !selectedConversation.isArchived })}
              onDeleteConversation={handleConversationDelete}
              onBack={isMobile ? handleMobileBack : undefined}
            />

            {!canAccessChat ? (
              <div className="flex-1 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {CHAT_UNAVAILABLE_MESSAGE}
              </div>
            ) : (
              <>
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
              </>
            )}
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
