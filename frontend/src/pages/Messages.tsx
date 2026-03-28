import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationList from '@/components/messages/ConversationList';
import ChatHeader from '@/components/messages/ChatHeader';
import MessageList from '@/components/messages/MessageList';
import ChatInput from '@/components/messages/ChatInput';
import NewMessageModal from '@/components/messages/NewMessageModal';
import GroupDetailsModal from '@/components/messages/GroupDetailsModal';
import { mockConversations, mockMessages, mockEmployees, mockHospitals } from '@/data';
import { 
  Conversation, 
  Message, 
  Employee, 
  ConversationType, 
  MessageFilter, 
  MessageSort, 
  TypingStatus, 
  OnlineStatus,
  MessageAttachment
} from '@/types/healthcare';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const Messages = () => {
  // Current user (mock - replace with actual auth)
  const currentUser: Employee = mockEmployees[0];
  
  // State management
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showGroupDetailsModal, setShowGroupDetailsModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);
  
  // Filters and sorting
  const [filter, setFilter] = useState<MessageFilter>({});
  const [sort, setSort] = useState<MessageSort>({ field: 'recent', direction: 'desc' });
  
  // Real-time features
  const [typingStatus, setTypingStatus] = useState<TypingStatus[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<Record<string, OnlineStatus>>({});

  // Responsive handling
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      
      if (!mobile) {
        setShowConversationList(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mock online status (replace with real WebSocket implementation)
  useEffect(() => {
    const mockOnlineStatus: Record<string, OnlineStatus> = {};
    mockEmployees.forEach(employee => {
      mockOnlineStatus[employee.id] = {
        userId: employee.id,
        isOnline: employee.isOnline,
        lastSeen: employee.lastSeen
      };
    });
    setOnlineStatus(mockOnlineStatus);
  }, []);

  // Get messages for selected conversation
  const conversationMessages = useMemo(() => {
    if (!selectedConversation) return [];
    return messages.filter(m => m.conversationId === selectedConversation.id);
  }, [messages, selectedConversation?.id]);

  // All available users for new message creation
  const allUsers = useMemo(() => mockEmployees, []);
  
  // All hospitals for filtering
  const allHospitals = useMemo(() => 
    Array.from(new Set(mockEmployees.map(e => e.hospital)))
  , []);

  // Handle conversation selection
  const handleConversationSelect = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    
    // Mark messages as read
    setMessages(prev => prev.map(msg => 
      msg.conversationId === conversation.id && msg.sender.id !== currentUser.id
        ? { ...msg, status: 'read' }
        : msg
    ));
    
    // Update conversation unread count
    setConversations(prev => prev.map(conv =>
      conv.id === conversation.id
        ? { ...conv, unreadCount: 0 }
        : conv
    ));

    // On mobile, hide conversation list when selecting a conversation
    if (isMobile) {
      setShowConversationList(false);
    }
  }, [currentUser.id, isMobile]);

  // Handle new message creation
  const handleCreateConversation = useCallback((
    type: ConversationType,
    participants: Employee[],
    name?: string,
    description?: string,
    caseId?: string
  ) => {
    const newConversation: Conversation = {
      id: crypto.randomUUID(),
      type,
      name,
      participants,
      creator: type === 'group' ? currentUser : undefined,
      caseId,
      description,
      lastMessage: '',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      isArchived: false,
      isMuted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setConversations(prev => [newConversation, ...prev]);
    setSelectedConversation(newConversation);
    setShowNewMessageModal(false);

    if (isMobile) {
      setShowConversationList(false);
    }
  }, [currentUser, isMobile]);

  // Handle sending messages
  const handleSendMessage = useCallback((
    content: string,
    attachments?: MessageAttachment[],
    mentions?: string[]
  ) => {
    if (!selectedConversation) return;

    const newMessage: Message = {
      id: crypto.randomUUID(),
      conversationId: selectedConversation.id,
      sender: currentUser,
      content,
      attachments,
      mentions,
      status: 'sent',
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    
    // Update conversation last message
    setConversations(prev => prev.map(conv =>
      conv.id === selectedConversation.id
        ? {
            ...conv,
            lastMessage: content,
            lastMessageAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : conv
    ));

    // Simulate message delivery/read status updates
    setTimeout(() => {
      setMessages(prev => prev.map(msg =>
        msg.id === newMessage.id ? { ...msg, status: 'delivered' } : msg
      ));
    }, 1000);

    setTimeout(() => {
      setMessages(prev => prev.map(msg =>
        msg.id === newMessage.id ? { ...msg, status: 'read' } : msg
      ));
    }, 2000);
  }, [selectedConversation, currentUser]);

  // Handle typing indicator
  const handleTyping = useCallback((isTyping: boolean) => {
    if (!selectedConversation) return;

    const typingUpdate: TypingStatus = {
      userId: currentUser.id,
      userName: currentUser.name,
      isTyping,
      timestamp: new Date().toISOString()
    };

    setTypingStatus(prev => {
      const filtered = prev.filter(t => t.userId !== currentUser.id);
      return isTyping ? [...filtered, typingUpdate] : filtered;
    });

    // Here you would send typing status to WebSocket
  }, [selectedConversation, currentUser]);

  // Handle group details actions
  const handleUpdateGroup = useCallback((updates: Partial<Conversation>) => {
    if (!selectedConversation) return;

    setConversations(prev => prev.map(conv =>
      conv.id === selectedConversation.id
        ? { ...conv, ...updates, updatedAt: new Date().toISOString() }
        : conv
    ));
    
    setSelectedConversation(prev => prev ? { ...prev, ...updates } : null);
  }, [selectedConversation]);

  // Handle message actions
  const handleMessageReply = useCallback((message: Message) => {
    // Implement reply functionality
    console.log('Reply to message:', message.id);
  }, []);

  const handleMessageEdit = useCallback((message: Message) => {
    // Implement edit functionality
    console.log('Edit message:', message.id);
  }, []);

  const handleMessageDelete = useCallback((message: Message) => {
    setMessages(prev => prev.filter(msg => msg.id !== message.id));
  }, []);

  // Mobile back navigation
  const handleMobileBack = useCallback(() => {
    if (selectedConversation && isMobile) {
      setShowConversationList(true);
      setSelectedConversation(null);
    }
  }, [selectedConversation, isMobile]);

  return (
    <AppLayout title="Secure Messaging" subtitle="Healthcare Communication Platform">
      <div className="h-[calc(100vh-12rem)] flex gap-4 overflow-hidden">
        {/* Conversation List - Hidden on mobile when chat is selected */}
        <div className={cn(
          "transition-all duration-300 ease-in-out flex flex-col",
          isMobile ? (showConversationList ? "w-full" : "hidden") : "w-80 flex-shrink-0"
        )}>
          <ConversationList
            conversations={conversations}
            selectedConversation={selectedConversation}
            onConversationSelect={handleConversationSelect}
            onNewMessage={() => setShowNewMessageModal(true)}
            filter={filter}
            onFilterChange={setFilter}
            sort={sort}
            onSortChange={setSort}
            className="flex-1 min-h-0"
          />
        </div>

        {/* Chat Area - Always visible on desktop, shown when conversation selected on mobile */}
        <div className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-in-out min-w-0",
          isMobile && showConversationList ? "hidden" : "flex"
        )}>
          <Card className="flex-1 flex flex-col min-h-0">
            {/* Chat Header */}
            <ChatHeader
              conversation={selectedConversation}
              onlineStatus={onlineStatus}
              onViewMembers={() => setShowGroupDetailsModal(true)}
              onAddMember={() => {/* Handle add member */}}
              onToggleMute={() => selectedConversation && handleUpdateGroup({ isMuted: !selectedConversation.isMuted })}
              onToggleArchive={() => selectedConversation && handleUpdateGroup({ isArchived: !selectedConversation.isArchived })}
              onCall={() => {/* Handle voice call */}}
              onVideoCall={() => {/* Handle video call */}}
              onBack={isMobile ? handleMobileBack : undefined}
            />

            {/* Message List */}
            <MessageList
              conversation={selectedConversation}
              messages={conversationMessages}
              currentUserId={currentUser.id}
              typingStatus={typingStatus}
              hasMoreMessages={false} // Implement pagination as needed
              isLoadingMessages={false}
              onLoadMoreMessages={() => {/* Handle load more */}}
              onMessageReply={handleMessageReply}
              onMessageEdit={handleMessageEdit}
              onMessageDelete={handleMessageDelete}
              className="flex-1"
            />

            {/* Chat Input */}
            <ChatInput
              conversation={selectedConversation}
              currentUser={currentUser}
              participants={selectedConversation?.participants || []}
              onSendMessage={handleSendMessage}
              onTyping={handleTyping}
            />
          </Card>
        </div>

        {/* Floating New Message Button (Mobile) */}
        {isMobile && showConversationList && (
          <Button
            className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg z-50"
            onClick={() => setShowNewMessageModal(true)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        )}
      </div>

      {/* New Message Modal */}
      <NewMessageModal
        open={showNewMessageModal}
        onOpenChange={setShowNewMessageModal}
        currentUser={currentUser}
        allUsers={allUsers}
        hospitals={allHospitals}
        onCreateConversation={handleCreateConversation}
      />

      {/* Group Details Modal */}
      <GroupDetailsModal
        open={showGroupDetailsModal}
        onOpenChange={setShowGroupDetailsModal}
        conversation={selectedConversation}
        currentUser={currentUser}
        onUpdateGroup={handleUpdateGroup}
        onAddMembers={(userIds) => {/* Handle add members */}}
        onRemoveMember={(userId) => {/* Handle remove member */}}
        onLeaveGroup={() => {/* Handle leave group */}}
        onDeleteGroup={() => {/* Handle delete group */}}
        canEdit={selectedConversation?.creator?.id === currentUser.id}
        canManageMembers={selectedConversation?.creator?.id === currentUser.id}
      />
    </AppLayout>
  );
};

export default Messages;