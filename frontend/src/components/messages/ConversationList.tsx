import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { MessageCircle, Users, FileText, Search, Filter, Archive, Clock, Circle } from 'lucide-react';
import { Conversation, ConversationType, MessageFilter, MessageSort, UserRole, Employee } from '@/types/healthcare';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
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
          const aName = a.name || a.participants.filter(p => p.id !== '1')[0]?.name || '';
          const bName = b.name || b.participants.filter(p => p.id !== '1')[0]?.name || '';
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
  }, [conversations, activeTab, filter, searchQuery, sort]);

  const getConversationDisplayName = (conversation: Conversation) => {
    if (conversation.type === 'group') {
      return conversation.name || 'Unnamed Group';
    }
    
    const otherParticipant = conversation.participants.find(p => p.id !== '1');
    return otherParticipant?.name || 'Unknown User';
  };

  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.type === 'group') {
      return conversation.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'G';
    }
    
    const otherParticipant = conversation.participants.find(p => p.id !== '1');
    return otherParticipant?.name.split(' ').map(n => n[0]).join('') || '?';
  };

  const getConversationSubtitle = (conversation: Conversation) => {
    if (conversation.type === 'group') {
      return `${conversation.participants.length} members`;
    }
    
    if (conversation.type === 'case' && conversation.caseId) {
      return conversation.caseId;
    }
    
    const otherParticipant = conversation.participants.find(p => p.id !== '1');
    return otherParticipant?.hospital || '';
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
    <Card className={cn("flex flex-col h-full overflow-hidden", className)}>
      <CardHeader className="pb-2 flex-shrink-0">
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => onSortChange({ 
              ...sort, 
              direction: sort.direction === 'asc' ? 'desc' : 'asc' 
            })}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="h-full flex flex-col">
          <div className="px-4 pb-4 flex-shrink-0">
            <TabsList className="grid w-full grid-cols-4">
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
            <TabsTrigger value="case" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Cases
              <Badge variant="secondary" className="text-xs">
                {getTabCount('case')}
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
                      "cursor-pointer border-b p-4 transition-all hover:bg-muted/50",
                      selectedConversation?.id === conversation.id && "bg-muted border-l-4 border-l-primary"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src="" />
                          <AvatarFallback className={cn(
                            "text-sm font-medium",
                            conversation.type === 'group' && "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
                            conversation.type === 'case' && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          )}>
                            {conversation.type === 'group' && <Users className="h-4 w-4" />}
                            {conversation.type === 'case' && <FileText className="h-4 w-4" />}
                            {conversation.type === 'private' && getConversationAvatar(conversation)}
                          </AvatarFallback>
                        </Avatar>

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

                        <p className="text-sm text-muted-foreground truncate">
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

export default ConversationList;