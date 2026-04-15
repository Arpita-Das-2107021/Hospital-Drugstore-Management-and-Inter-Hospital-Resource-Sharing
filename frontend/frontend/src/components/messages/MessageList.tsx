import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronUp, Users, MessageCircle } from 'lucide-react';
import { Message, Conversation, TypingStatus, Employee } from '@/types/healthcare';
import MessageBubble from './MessageBubble';
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';

interface MessageListProps {
  conversation: Conversation | null;
  messages: Message[];
  currentUserId: string;
  typingStatus: TypingStatus[];
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  onLoadMoreMessages?: () => void;
  onMessageReply?: (message: Message) => void;
  onMessageEdit?: (message: Message) => void;
  onMessageDelete?: (message: Message) => void;
  className?: string;
}

const MessageList: React.FC<MessageListProps> = ({
  conversation,
  messages,
  currentUserId,
  typingStatus,
  hasMoreMessages = false,
  isLoadingMessages = false,
  onLoadMoreMessages,
  onMessageReply,
  onMessageEdit,
  onMessageDelete,
  className
}) => {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Keep auto-scroll scoped to the message viewport only.
  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom('smooth');
    }
  }, [messages, isNearBottom]);

  useEffect(() => {
    if (!conversation) return;
    window.requestAnimationFrame(() => {
      scrollToBottom('auto');
    });
  }, [conversation?.id]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    });
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 100;
    
    setIsNearBottom(isAtBottom);
    setShowScrollToBottom(!isAtBottom && messages.length > 5);

    // Load more messages when scrolled to top.
    if (scrollTop <= 20 && hasMoreMessages && !isLoadingMessages && onLoadMoreMessages) {
      onLoadMoreMessages();
    }
  }, [hasMoreMessages, isLoadingMessages, onLoadMoreMessages, messages.length]);

  const formatDateSeparator = (date: Date): string => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const shouldShowDateSeparator = (currentMessage: Message, previousMessage: Message | null): boolean => {
    if (!previousMessage) return true;

    const currentDate = new Date(currentMessage.createdAt);
    const previousDate = new Date(previousMessage.createdAt);

    return currentDate.toDateString() !== previousDate.toDateString();
  };

  const groupMessagesByUser = (messages: Message[]) => {
    const grouped: Array<{ messages: Message[]; showAvatar: boolean; showName: boolean }> = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const prevMessage = messages[i - 1];
      const nextMessage = messages[i + 1];
      
      const isFirstInGroup = !prevMessage || 
        prevMessage.sender.id !== message.sender.id || 
        (new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime()) > 5 * 60 * 1000; // 5 minutes
      
      const isLastInGroup = !nextMessage || 
        nextMessage.sender.id !== message.sender.id ||
        (new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime()) > 5 * 60 * 1000; // 5 minutes

      if (isFirstInGroup) {
        grouped.push({
          messages: [message],
          showAvatar: isLastInGroup,
          showName: conversation?.type === 'group' && message.sender.id !== currentUserId
        });
      } else {
        const lastGroup = grouped[grouped.length - 1];
        lastGroup.messages.push(message);
        if (isLastInGroup) {
          lastGroup.showAvatar = true;
        }
      }
    }
    
    return grouped;
  };

  const renderTypingIndicator = () => {
    const activeTyping = typingStatus.filter(t => t.isTyping && t.userId !== currentUserId);
    
    if (activeTyping.length === 0) return null;

    return (
      <div className="flex items-start gap-3 px-4 py-2">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <div className="flex space-x-1">
            <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {activeTyping.length === 1 
            ? `${activeTyping[0].userName} is typing...`
            : activeTyping.length === 2
            ? `${activeTyping[0].userName} and ${activeTyping[1].userName} are typing...`
            : `${activeTyping[0].userName} and ${activeTyping.length - 1} others are typing...`
          }
        </div>
      </div>
    );
  };

  if (!conversation) {
    return (
      <div className={cn('flex-1 flex items-center justify-center bg-card/30', className)}>
        <div className="text-center px-6">
          <MessageCircle className="h-14 w-14 text-muted-foreground/70 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Welcome to Secure Messaging</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Select a conversation or start a new one to begin messaging
          </p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn('flex-1 flex items-center justify-center bg-card/30', className)}>
        <div className="text-center px-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            {conversation.type === 'group' && <Users className="h-8 w-8 text-primary" />}
            {conversation.type !== 'group' && (
              <div className="text-primary font-semibold text-xl">
                {conversation.participants.find(p => p.id !== currentUserId)?.name
                  .split(' ')
                  .map(n => n[0])
                  .join('') || '?'}
              </div>
            )}
          </div>
          
          <h3 className="font-medium text-lg mb-2">
            {conversation.type === 'group' 
              ? `Welcome to ${conversation.name || 'the group'}`
              : `Start a conversation with ${conversation.participants.find(p => p.id !== currentUserId)?.name}`
            }
          </h3>
          
          <p className="text-sm text-muted-foreground mb-4">
            {conversation.type === 'group' 
              ? `${conversation.participants.length} members • ${conversation.caseId || 'General discussion'}`
              : conversation.participants.find(p => p.id !== currentUserId)?.hospital
            }
          </p>
          
          <p className="text-xs text-muted-foreground">
            Send a message to begin your conversation
          </p>
        </div>
      </div>
    );
  }

  const groupedMessages = groupMessagesByUser(messages);

  return (
    <div className={cn('flex-1 flex flex-col relative bg-card/30', className)}>
      <div
        ref={scrollViewportRef}
        className="flex-1 overflow-y-auto px-5 py-4"
        onScroll={handleScroll}
      >
        {/* Load more messages button */}
        {hasMoreMessages && (
          <div className="flex justify-center py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={onLoadMoreMessages}
              disabled={isLoadingMessages}
              className="flex items-center gap-2"
            >
              {isLoadingMessages ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
              {isLoadingMessages ? 'Loading...' : 'Load more messages'}
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {groupedMessages.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Date separator */}
              {shouldShowDateSeparator(group.messages[0], groupIndex > 0 ? groupedMessages[groupIndex - 1].messages[0] : null) && (
                <div className="flex items-center justify-center py-4">
                  <Badge variant="outline" className="text-xs px-3 py-1">
                    {formatDateSeparator(new Date(group.messages[0].createdAt))}
                  </Badge>
                </div>
              )}

              {/* Message group */}
              <div className={cn(
                "flex gap-3",
                group.messages[0].sender.id === currentUserId ? "justify-end" : "justify-start"
              )}>
                {/* Avatar (for other users, shown on last message in group) */}
                {group.messages[0].sender.id !== currentUserId && (
                  <div className={cn(
                    "w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium flex-shrink-0",
                    !group.showAvatar && "invisible"
                  )}>
                    {group.messages[0].sender.name.split(' ').map(n => n[0]).join('')}
                  </div>
                )}

                {/* Messages */}
                <div className={cn(
                  "flex flex-col space-y-1 max-w-[70%]",
                  group.messages[0].sender.id === currentUserId ? "items-end" : "items-start"
                )}>
                  {/* Sender name (for groups, non-current user) */}
                  {group.showName && (
                    <p className="text-xs text-muted-foreground px-3">
                      {group.messages[0].sender.name}
                    </p>
                  )}

                  {/* Individual messages */}
                  {group.messages.map((message, messageIndex) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender.id === currentUserId}
                      isGrouped={group.messages.length > 1}
                      showTimestamp={messageIndex === group.messages.length - 1}
                      conversationType={conversation.type}
                      onReply={onMessageReply}
                      onEdit={onMessageEdit}
                      onDelete={onMessageDelete}
                    />
                  ))}
                </div>

                {/* Spacer for current user messages */}
                {group.messages[0].sender.id === currentUserId && <div className="w-8" />}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {renderTypingIndicator()}
        </div>

      </div>

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <div className="absolute bottom-4 right-4">
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full shadow-lg"
            onClick={() => scrollToBottom('smooth')}
          >
            <ChevronUp className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default memo(MessageList);