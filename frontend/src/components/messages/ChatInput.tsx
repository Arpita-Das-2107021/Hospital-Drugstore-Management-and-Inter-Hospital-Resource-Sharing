import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  FileText, 
  X, 
  AtSign,
  Smile,
  Plus
} from 'lucide-react';
import { Employee, MessageAttachment, Conversation } from '@/types/healthcare';
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  conversation: Conversation | null;
  currentUser: Employee;
  participants: Employee[];
  onSendMessage: (content: string, attachments?: MessageAttachment[], mentions?: string[]) => void;
  onTyping: (isTyping: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  conversation,
  currentUser,
  participants,
  onSendMessage,
  onTyping,
  placeholder = "Type a message...",
  disabled = false,
  className
}) => {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Handle typing indicator
  useEffect(() => {
    if (message.trim() && !isTyping) {
      setIsTyping(true);
      onTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        onTyping(false);
      }
    }, 2000);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message, isTyping, onTyping]);

  const handleSend = useCallback(() => {
    if (!message.trim() && attachments.length === 0) return;
    if (!conversation || disabled) return;

    onSendMessage(message, attachments, mentions);
    
    // Reset form
    setMessage('');
    setAttachments([]);
    setMentions([]);
    setIsTyping(false);
    onTyping(false);
    
    inputRef.current?.focus();
  }, [message, attachments, mentions, conversation, disabled, onSendMessage, onTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileAttachment = (type: 'file' | 'image') => {
    const input = type === 'image' ? imageInputRef.current : fileInputRef.current;
    input?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = Array.from(e.target.files || []);
    
    files.forEach(file => {
      const attachment: MessageAttachment = {
        id: crypto.randomUUID(),
        name: file.name,
        type,
        url: URL.createObjectURL(file), // In real app, upload to server first
        size: file.size
      };
      
      setAttachments(prev => [...prev, attachment]);
    });
    
    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);
    
    // Check for mention trigger (@)
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      const spaceIndex = textAfterAt.indexOf(' ');
      
      if (spaceIndex === -1 || textAfterAt.length < spaceIndex) {
        setMentionQuery(textAfterAt.toLowerCase());
        setMentionPosition(lastAtIndex);
        setShowMentionPopover(true);
        return;
      }
    }
    
    setShowMentionPopover(false);
  };

  const handleMentionSelect = (user: Employee) => {
    const beforeMention = message.substring(0, mentionPosition);
    const afterMention = message.substring(mentionPosition + mentionQuery.length + 1);
    const newMessage = `${beforeMention}@${user.name} ${afterMention}`;
    
    setMessage(newMessage);
    setMentions(prev => [...new Set([...prev, user.id])]);
    setShowMentionPopover(false);
    inputRef.current?.focus();
  };

  const filteredParticipants = participants.filter(p => 
    p.id !== currentUser.id &&
    p.name.toLowerCase().includes(mentionQuery)
  );

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn("border-t bg-background/95", className)}>
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="p-4 border-b">
          <div className="flex flex-wrap gap-2">
            {attachments.map(attachment => (
              <div key={attachment.id} className="relative group">
                <Badge variant="secondary" className="flex items-center gap-2 pr-1">
                  {attachment.type === 'image' ? (
                    <ImageIcon className="h-3 w-3" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  <span className="max-w-[100px] truncate">{attachment.name}</span>
                  <span className="text-xs opacity-70">({formatFileSize(attachment.size)})</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Input Area */}
      <div className="p-4">
        <div className="flex items-end gap-2">
          {/* Attachment Menu */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 flex-shrink-0"
                disabled={disabled}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-48 p-2">
              <div className="grid gap-1">
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleFileAttachment('image')}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Image
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleFileAttachment('file')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  File
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Message Input */}
          <div className="flex-1 relative">
            <Popover open={showMentionPopover} onOpenChange={setShowMentionPopover}>
              <PopoverTrigger asChild>
                <Input
                  ref={inputRef}
                  value={message}
                  onChange={(e) => handleMessageChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={conversation ? placeholder : "Select a conversation to start messaging"}
                  disabled={disabled || !conversation}
                  className="min-h-[2.5rem] focus-visible:ring-1"
                />
              </PopoverTrigger>
              
              {showMentionPopover && filteredParticipants.length > 0 && (
                <PopoverContent 
                  side="top" 
                  align="start" 
                  className="w-[200px] p-0"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command>
                    <CommandList>
                      <CommandEmpty>No users found</CommandEmpty>
                      <CommandGroup heading="Mention">
                        {filteredParticipants.map(user => (
                          <CommandItem
                            key={user.id}
                            onSelect={() => handleMentionSelect(user)}
                            className="flex items-center gap-2"
                          >
                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.role}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              )}
            </Popover>
            
            {/* Mention trigger helper */}
            {conversation?.type === 'group' && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => {
                  const newMessage = message + '@';
                  setMessage(newMessage);
                  setMentionPosition(newMessage.length - 1);
                  setMentionQuery('');
                  setShowMentionPopover(true);
                  inputRef.current?.focus();
                }}
                disabled={disabled}
              >
                <AtSign className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={disabled || (!message.trim() && attachments.length === 0) || !conversation}
            size="sm"
            className="h-9 w-9 p-0 flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Character count for long messages */}
        {message.length > 500 && (
          <div className="flex justify-end mt-1">
            <span className={cn(
              "text-xs",
              message.length > 1000 ? "text-destructive" : "text-muted-foreground"
            )}>
              {message.length}/1000
            </span>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.ppt,.pptx,.zip,.rar"
        onChange={(e) => handleFileChange(e, 'file')}
      />
      
      <input
        ref={imageInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*"
        onChange={(e) => handleFileChange(e, 'image')}
      />
    </div>
  );
};

export default ChatInput;