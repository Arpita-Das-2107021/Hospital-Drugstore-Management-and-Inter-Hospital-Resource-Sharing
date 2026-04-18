import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { MessageCircle, Users, Search, Archive, Circle } from 'lucide-react';
import { Conversation, ConversationType, MessageFilter, MessageSort } from '@/types/healthcare';
import { useState, useMemo, memo } from 'react';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  currentUserId: string;
  currentUserEmail?: string;
  onConversationSelect: (conversation: Conversation) => void;
  onNewMessage: () => void;
  filter: MessageFilter;
  onFilterChange: (filter: MessageFilter) => void;
  sort: MessageSort;
  onSortChange: (sort: MessageSort) => void;
  className?: string;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedConversation,
  currentUserId,
  currentUserEmail = '',
  onConversationSelect,
  onNewMessage,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | ConversationType>('all');

  const getInitials = (value: string) =>
    value
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const getAvatarTone = (seed: string) => {
    const tones = [
      'bg-blue-500/15 text-blue-700 dark:text-blue-300',
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      'bg-rose-500/15 text-rose-700 dark:text-rose-300',
      'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
      'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    ];

    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return tones[Math.abs(hash) % tones.length];
  };

  // Filter conversations based on active tab
  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    // Filter by tab
    if (activeTab !== 'all') {
      filtered = filtered.filter(convo => convo.type === activeTab);
    }

    // Apply additional filters
    if (filter.hospital) {
      filtered = filtered.filter(convo => 
        convo.participants.some(p => p.hospital === filter.hospital)
      );
    }

    if (filter.department) {
      filtered = filtered.filter(convo => 
        convo.participants.some(p => p.department === filter.department)
      );
    }

    if (filter.role) {
      filtered = filtered.filter(convo => 
        convo.participants.some(p => p.role === filter.role)
      );
    }

    if (filter.caseId) {
      filtered = filtered.filter(convo => convo.caseId === filter.caseId);
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(convo => 
        convo.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        convo.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
        convo.participants.some(p => 
          p.name.toLowerCase().includes(searchQuery.toLowerCase())
        ) ||
        convo.caseId?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sort.field) {
        case 'recent':
          return sort.direction === 'desc' 
            ? new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
            : new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime();
        case 'unread':
          return sort.direction === 'desc'
            ? b.unreadCount - a.unreadCount
            : a.unreadCount - b.unreadCount;
        case 'name':
          const aName = getConversationDisplayName(a);
          const bName = getConversationDisplayName(b);
          return sort.direction === 'desc'
            ? bName.localeCompare(aName)
            : aName.localeCompare(bName);
        case 'created':
          return sort.direction === 'desc'
            ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [conversations, activeTab, filter, searchQuery, sort, currentUserId, currentUserEmail]);

  // Finds the other participant in a private/case conversation.
  // Checks by ID first, then by email, so it works even if ID formats differ.
  const getOtherParticipant = (conversation: Conversation) => {
    const normalizedEmail = currentUserEmail.trim().toLowerCase();
    return (
      conversation.participants.find(
        p => p.id !== currentUserId && (!normalizedEmail || p.email?.toLowerCase() !== normalizedEmail)
      ) ||
      conversation.participants.find(p => p.id !== currentUserId) ||
      conversation.participants.find(
        p => !normalizedEmail || p.email?.toLowerCase() !== normalizedEmail
      )
    );
  };

  const getConversationDisplayName = (conversation: Conversation) => {
    if (conversation.type === 'group') {
      return conversation.name || 'Unnamed Group';
    }
    
    const otherParticipant = getOtherParticipant(conversation);
    return conversation.name || otherParticipant?.name || otherParticipant?.email || 'Direct Message';
  };

  const getConversationAvatar = (conversation: Conversation) => {
    return getInitials(getConversationDisplayName(conversation));
  };

  const getConversationSubtitle = (conversation: Conversation) => {
    if (conversation.type === 'group') {
      return `${conversation.participants.length} members`;
    }
    
    if (conversation.type === 'case' && conversation.caseId) {
      return conversation.caseId;
    }
    
    const otherParticipant = getOtherParticipant(conversation);
    return otherParticipant?.hospital || otherParticipant?.email || 'Direct Message';
  };

  const getTabCount = (type: 'all' | ConversationType) => {
    if (type === 'all') return conversations.length;
    return conversations.filter(c => c.type === type).length;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <Card className={cn('flex flex-col h-full overflow-hidden border-border/60 bg-card/70 shadow-sm', className)}>
      <CardHeader className="pb-2 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Messages
          </CardTitle>
          <Button onClick={onNewMessage} size="sm" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            New
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters and Sort */}
        <div className="flex items-center gap-2">
          <Select
            value={sort.field}
            onValueChange={(value: MessageSort['field']) => onSortChange({ ...sort, field: value })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="created">Created</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort.direction}
            onValueChange={(value: MessageSort['direction']) => onSortChange({ ...sort, direction: value })}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Desc</SelectItem>
              <SelectItem value="asc">Asc</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="h-full flex flex-col">
          <div className="px-4 pb-4 flex-shrink-0">
            <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all" className="flex items-center gap-1">
              All
              <Badge variant="secondary" className="text-xs">
                {getTabCount('all')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="private" className="flex items-center gap-1">
              Private
              <Badge variant="secondary" className="text-xs">
                {getTabCount('private')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="group" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              Groups
              <Badge variant="secondary" className="text-xs">
                {getTabCount('group')}
              </Badge>
            </TabsTrigger>
          </TabsList>
          </div>

          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="px-4">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No conversations found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {searchQuery ? "Try adjusting your search criteria" : "Click 'New' to start a conversation"}
                  </p>
                </div>
              ) : (
                filteredConversations.map(conversation => (
                  <div
                    key={conversation.id}
                    onClick={() => onConversationSelect(conversation)}
                    className={cn(
                      'cursor-pointer border-b border-border/40 p-4 transition-all hover:bg-accent/30',
                      conversation.unreadCount > 0 && selectedConversation?.id !== conversation.id && 'bg-accent/20',
                      selectedConversation?.id === conversation.id && 'bg-accent/45 border-l-4 border-l-primary'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative flex-shrink-0">
                        <div
                          className={cn(
                            'h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold',
                            getAvatarTone(getConversationDisplayName(conversation)),
                          )}
                        >
                          {getInitials(getConversationDisplayName(conversation))}
                        </div>

                        {/* Online indicator for private chats */}
                        {conversation.type === 'private' && (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background">
                            <Circle className="h-full w-full fill-green-500 text-green-500" />
                          </div>
                        )}

                        {/* Member count for groups */}
                        {conversation.type === 'group' && (
                          <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full px-1 min-w-[20px] h-5 flex items-center justify-center">
                            {conversation.participants.length}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">
                              {getConversationDisplayName(conversation)}
                            </p>
                            {conversation.unreadCount > 0 && selectedConversation?.id !== conversation.id && (
                              <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread conversation" />
                            )}
                            {conversation.type === 'case' && conversation.caseId && (
                              <Badge variant="outline" className="text-xs">
                                {conversation.caseId}
                              </Badge>
                            )}
                            {conversation.isMuted && (
                              <Badge variant="secondary" className="text-xs">
                                Muted
                              </Badge>
                            )}
                            {conversation.isArchived && (
                              <Archive className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {formatTime(conversation.lastMessageAt)}
                            </span>
                            {conversation.unreadCount > 0 && (
                              <Badge variant="destructive" className="text-xs min-w-[20px] h-5 flex items-center justify-center px-2">
                                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground mb-1">
                          {getConversationSubtitle(conversation)}
                        </p>

                        <p className={cn(
                          'text-sm truncate',
                          conversation.unreadCount > 0 && selectedConversation?.id !== conversation.id
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground',
                        )}>
                          {conversation.lastMessage}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              </div>
            </ScrollArea>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default memo(ConversationList);