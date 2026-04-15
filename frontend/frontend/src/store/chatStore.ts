import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Conversation, Message } from '@/types/healthcare';

type ChatStoreState = {
  conversations: Record<string, Message[]>;
  selectedConversationId: string | null;
  drafts: Record<string, string>;
  unreadCounts: Record<string, number>;
  recipientCache: Record<string, Conversation>;
  lastMessageId: Record<string, string>;
};

type ChatStoreActions = {
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  appendMessages: (conversationId: string, messages: Message[]) => void;
  setSelectedConversation: (conversationId: string | null) => void;
  setDraft: (conversationId: string, text: string) => void;
  setUnreadCount: (conversationId: string, count: number) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
  upsertRecipient: (conversation: Conversation) => void;
  upsertRecipients: (conversations: Conversation[]) => void;
  clearConversation: (conversationId: string) => void;
  resetChatStore: () => void;
};

export type ChatStore = ChatStoreState & ChatStoreActions;

const initialState: ChatStoreState = {
  conversations: {},
  selectedConversationId: null,
  drafts: {},
  unreadCounts: {},
  recipientCache: {},
  lastMessageId: {},
};

const sortAndDedupeMessages = (messages: Message[]): Message[] => {
  const byId = new Map<string, Message>();
  messages.forEach((message) => {
    if (!message?.id) return;
    byId.set(message.id, message);
  });

  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
};

const getLatestMessageId = (messages: Message[]): string => {
  if (messages.length === 0) return '';
  return messages[messages.length - 1]?.id || '';
};

const clampUnreadCount = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const STORE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_PLACEHOLDERS = new Set(['direct message', 'unnamed group', 'unknown user']);

type ParticipantIdentity = Conversation['participants'][number];

const normalizeDisplayValue = (value?: string): string => String(value || '').trim();

const isLikelyEmailDisplay = (value?: string): boolean => {
  const normalized = normalizeDisplayValue(value).toLowerCase();
  if (!normalized) return false;
  return STORE_EMAIL_PATTERN.test(normalized);
};

const displayValueScore = (value?: string): number => {
  const normalized = normalizeDisplayValue(value);
  if (!normalized) return 0;

  const lower = normalized.toLowerCase();
  if (DISPLAY_NAME_PLACEHOLDERS.has(lower)) {
    return 1;
  }

  if (isLikelyEmailDisplay(normalized)) {
    return 2;
  }

  return 3;
};

const pickPreferredDisplayValue = (existing?: string, incoming?: string): string | undefined => {
  const existingLabel = normalizeDisplayValue(existing);
  const incomingLabel = normalizeDisplayValue(incoming);
  const existingScore = displayValueScore(existingLabel);
  const incomingScore = displayValueScore(incomingLabel);

  if (incomingScore > existingScore) {
    return incomingLabel || undefined;
  }

  if (existingScore > incomingScore) {
    return existingLabel || undefined;
  }

  return existingLabel || incomingLabel || undefined;
};

const participantIdentityKey = (participant: ParticipantIdentity, index: number): string => {
  const id = String(participant?.id || '').trim();
  if (id) return `id:${id}`;

  const email = normalizeDisplayValue(participant?.email).toLowerCase();
  if (email) return `email:${email}`;

  const name = normalizeDisplayValue(participant?.name).toLowerCase();
  if (name) return `name:${name}`;

  return `index:${index}`;
};

const mergeParticipantIdentity = (
  existing: ParticipantIdentity,
  incoming: ParticipantIdentity,
): ParticipantIdentity => {
  const preferredName = pickPreferredDisplayValue(existing.name, incoming.name)
    || normalizeDisplayValue(existing.name)
    || normalizeDisplayValue(incoming.name)
    || 'Unknown User';
  const existingEmail = normalizeDisplayValue(existing.email);
  const incomingEmail = normalizeDisplayValue(incoming.email);

  return {
    ...existing,
    ...incoming,
    name: preferredName,
    email: existingEmail || incomingEmail,
    hospital: normalizeDisplayValue(existing.hospital) || normalizeDisplayValue(incoming.hospital),
    department: normalizeDisplayValue(existing.department) || normalizeDisplayValue(incoming.department),
    role: existing.role || incoming.role,
    isOnline: incoming.isOnline ?? existing.isOnline,
    lastSeen: normalizeDisplayValue(incoming.lastSeen) || normalizeDisplayValue(existing.lastSeen) || undefined,
  };
};

const mergeParticipantIdentities = (
  existingParticipants: ParticipantIdentity[],
  incomingParticipants: ParticipantIdentity[],
): ParticipantIdentity[] => {
  if (existingParticipants.length === 0) return incomingParticipants;
  if (incomingParticipants.length === 0) return existingParticipants;

  const mergedParticipants = new Map<string, ParticipantIdentity>();
  existingParticipants.forEach((participant, index) => {
    mergedParticipants.set(participantIdentityKey(participant, index), participant);
  });

  incomingParticipants.forEach((participant, index) => {
    const key = participantIdentityKey(participant, index);
    const current = mergedParticipants.get(key);
    if (!current) {
      mergedParticipants.set(key, participant);
      return;
    }

    mergedParticipants.set(key, mergeParticipantIdentity(current, participant));
  });

  return Array.from(mergedParticipants.values());
};

const mergeConversationForCache = (
  existing: Conversation | undefined,
  incoming: Conversation,
): Conversation => {
  if (!existing) {
    return incoming;
  }

  const mergedParticipants = mergeParticipantIdentities(existing.participants, incoming.participants);
  const mergedCreator = existing.creator && incoming.creator
    ? mergeParticipantIdentity(existing.creator, incoming.creator)
    : incoming.creator || existing.creator;

  return {
    ...existing,
    ...incoming,
    name: pickPreferredDisplayValue(existing.name, incoming.name),
    participants: mergedParticipants,
    creator: mergedCreator,
    caseId: incoming.caseId ?? existing.caseId,
    description: incoming.description ?? existing.description,
    lastMessage: normalizeDisplayValue(incoming.lastMessage) || existing.lastMessage,
    lastMessageAt: normalizeDisplayValue(incoming.lastMessageAt) || existing.lastMessageAt,
    unreadCount: clampUnreadCount(
      typeof incoming.unreadCount === 'number' ? incoming.unreadCount : existing.unreadCount,
    ),
    createdAt: normalizeDisplayValue(incoming.createdAt) || existing.createdAt,
    updatedAt:
      normalizeDisplayValue(incoming.updatedAt)
      || normalizeDisplayValue(incoming.lastMessageAt)
      || existing.updatedAt,
  };
};

type ChatHeaderStoreWriteTrace = {
  functionName: string;
  payload: unknown;
  fieldPath: string;
  nextRenderedValue?: unknown;
};

const traceChatHeaderStoreWrite = ({
  functionName,
  payload,
  fieldPath,
  nextRenderedValue,
}: ChatHeaderStoreWriteTrace) => {
  console.log('CHAT HEADER WRITE TRACE', {
    file: 'src/store/chatStore.ts',
    function: functionName,
    payload,
    fieldPath,
    nextRenderedValue,
    timestamp: Date.now(),
  });
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      ...initialState,

      setMessages: (conversationId, messages) => {
        if (!conversationId) return;

        const normalizedMessages = sortAndDedupeMessages(messages);
        const latestMessageId = getLatestMessageId(normalizedMessages);

        set((state) => {
          const nextLastMessageId = { ...state.lastMessageId };
          if (latestMessageId) {
            nextLastMessageId[conversationId] = latestMessageId;
          } else {
            delete nextLastMessageId[conversationId];
          }

          return {
            conversations: {
              ...state.conversations,
              [conversationId]: normalizedMessages,
            },
            lastMessageId: nextLastMessageId,
          };
        });
      },

      addMessage: (conversationId, message) => {
        if (!conversationId || !message) return;

        set((state) => {
          const merged = sortAndDedupeMessages([
            ...(state.conversations[conversationId] || []),
            message,
          ]);
          const latestMessageId = getLatestMessageId(merged);

          return {
            conversations: {
              ...state.conversations,
              [conversationId]: merged,
            },
            lastMessageId: {
              ...state.lastMessageId,
              ...(latestMessageId ? { [conversationId]: latestMessageId } : {}),
            },
          };
        });
      },

      appendMessages: (conversationId, messages) => {
        if (!conversationId || messages.length === 0) return;

        set((state) => {
          const merged = sortAndDedupeMessages([
            ...(state.conversations[conversationId] || []),
            ...messages,
          ]);
          const latestMessageId = getLatestMessageId(merged);

          return {
            conversations: {
              ...state.conversations,
              [conversationId]: merged,
            },
            lastMessageId: {
              ...state.lastMessageId,
              ...(latestMessageId ? { [conversationId]: latestMessageId } : {}),
            },
          };
        });
      },

      setSelectedConversation: (conversationId) => {
        traceChatHeaderStoreWrite({
          functionName: 'setSelectedConversation',
          payload: { conversationId },
          fieldPath: 'selectedConversationId',
          nextRenderedValue: conversationId || null,
        });
        set({ selectedConversationId: conversationId || null });
      },

      setDraft: (conversationId, text) => {
        if (!conversationId) return;

        set((state) => {
          const nextDrafts = { ...state.drafts };
          if (text) {
            nextDrafts[conversationId] = text;
          } else {
            delete nextDrafts[conversationId];
          }

          return { drafts: nextDrafts };
        });
      },

      setUnreadCount: (conversationId, count) => {
        if (!conversationId) return;

        const nextCount = clampUnreadCount(count);
        traceChatHeaderStoreWrite({
          functionName: 'setUnreadCount',
          payload: {
            conversationId,
            count,
          },
          fieldPath: 'unreadCounts[conversationId], recipientCache[conversationId].unreadCount',
          nextRenderedValue: nextCount,
        });
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [conversationId]: nextCount,
          },
          recipientCache: state.recipientCache[conversationId]
            ? {
                ...state.recipientCache,
                [conversationId]: {
                  ...state.recipientCache[conversationId],
                  unreadCount: nextCount,
                },
              }
            : state.recipientCache,
        }));
      },

      setUnreadCounts: (counts) => {
        traceChatHeaderStoreWrite({
          functionName: 'setUnreadCounts',
          payload: counts,
          fieldPath: 'unreadCounts[*], recipientCache[*].unreadCount',
        });
        set((state) => {
          const normalizedCounts: Record<string, number> = {};
          Object.entries(counts).forEach(([conversationId, count]) => {
            normalizedCounts[conversationId] = clampUnreadCount(Number(count));
          });

          const nextRecipientCache: Record<string, Conversation> = { ...state.recipientCache };
          Object.entries(normalizedCounts).forEach(([conversationId, count]) => {
            const existing = nextRecipientCache[conversationId];
            if (existing) {
              nextRecipientCache[conversationId] = {
                ...existing,
                unreadCount: count,
              };
            }
          });

          return {
            unreadCounts: {
              ...state.unreadCounts,
              ...normalizedCounts,
            },
            recipientCache: nextRecipientCache,
          };
        });
      },

      upsertRecipient: (conversation) => {
        if (!conversation?.id) return;

        traceChatHeaderStoreWrite({
          functionName: 'upsertRecipient',
          payload: {
            conversationId: conversation.id,
            name: conversation.name,
            participantNames: conversation.participants.map((participant) => participant.name),
          },
          fieldPath: 'recipientCache[conversation.id], unreadCounts[conversation.id]',
          nextRenderedValue: {
            conversationId: conversation.id,
            name: conversation.name,
            participantNames: conversation.participants.map((participant) => participant.name),
          },
        });

        set((state) => {
          const mergedConversation = mergeConversationForCache(
            state.recipientCache[conversation.id],
            conversation,
          );

          return {
            recipientCache: {
              ...state.recipientCache,
              [conversation.id]: mergedConversation,
            },
            unreadCounts: {
              ...state.unreadCounts,
              [conversation.id]: clampUnreadCount(mergedConversation.unreadCount),
            },
          };
        });
      },

      upsertRecipients: (conversations) => {
        if (conversations.length === 0) return;

        traceChatHeaderStoreWrite({
          functionName: 'upsertRecipients',
          payload: {
            count: conversations.length,
            conversations: conversations.map((conversation) => ({
              id: conversation.id,
              name: conversation.name,
              participantNames: conversation.participants.map((participant) => participant.name),
            })),
          },
          fieldPath: 'recipientCache[*], unreadCounts[*]',
        });

        set((state) => {
          const nextRecipientCache: Record<string, Conversation> = { ...state.recipientCache };
          const nextUnreadCounts: Record<string, number> = { ...state.unreadCounts };

          conversations.forEach((conversation) => {
            if (!conversation?.id) return;
            const mergedConversation = mergeConversationForCache(
              nextRecipientCache[conversation.id],
              conversation,
            );
            nextRecipientCache[conversation.id] = mergedConversation;
            nextUnreadCounts[conversation.id] = clampUnreadCount(mergedConversation.unreadCount);
          });

          return {
            recipientCache: nextRecipientCache,
            unreadCounts: nextUnreadCounts,
          };
        });
      },

      clearConversation: (conversationId) => {
        if (!conversationId) return;

        traceChatHeaderStoreWrite({
          functionName: 'clearConversation',
          payload: { conversationId },
          fieldPath: 'conversations[conversationId], recipientCache[conversationId], selectedConversationId',
          nextRenderedValue: {
            conversationId,
            selectedConversationId: null,
          },
        });

        set((state) => {
          const nextConversations = { ...state.conversations };
          const nextDrafts = { ...state.drafts };
          const nextUnreadCounts = { ...state.unreadCounts };
          const nextRecipientCache = { ...state.recipientCache };
          const nextLastMessageId = { ...state.lastMessageId };

          delete nextConversations[conversationId];
          delete nextDrafts[conversationId];
          delete nextUnreadCounts[conversationId];
          delete nextRecipientCache[conversationId];
          delete nextLastMessageId[conversationId];

          return {
            conversations: nextConversations,
            drafts: nextDrafts,
            unreadCounts: nextUnreadCounts,
            recipientCache: nextRecipientCache,
            lastMessageId: nextLastMessageId,
            selectedConversationId:
              state.selectedConversationId === conversationId ? null : state.selectedConversationId,
          };
        });
      },

      resetChatStore: () => {
        set({ ...initialState });
      },
    }),
    {
      name: 'hrsp-chat-cache',
      partialize: (state) => ({
        conversations: state.conversations,
        selectedConversationId: state.selectedConversationId,
        drafts: state.drafts,
        unreadCounts: state.unreadCounts,
        recipientCache: state.recipientCache,
        lastMessageId: state.lastMessageId,
      }),
    },
  ),
);
