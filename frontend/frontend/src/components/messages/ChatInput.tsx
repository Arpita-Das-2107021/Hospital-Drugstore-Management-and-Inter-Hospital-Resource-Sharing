import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Send, 
  Image as ImageIcon, 
  FileText, 
  X, 
  Plus
} from 'lucide-react';
import { Employee, MessageAttachment, Conversation } from '@/types/healthcare';
import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useChatStore } from '@/store/chatStore';

interface ChatInputProps {
  conversation: Conversation | null;
  currentUser: Employee;
  participants: Employee[];
  onSendMessage: (content: string, attachments?: File[], mentions?: string[]) => void;
  onTyping: (isTyping: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  conversation,
  currentUser: _currentUser,
  participants: _participants,
  onSendMessage,
  onTyping,
  placeholder = "Type a message...",
  disabled = false,
  className
}) => {
  const { toast } = useToast();
  const conversationId = conversation?.id || '';
  const message = useChatStore((state) => (
    conversationId ? (state.drafts[conversationId] || '') : ''
  ));
  const setDraft = useChatStore((state) => state.setDraft);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<Record<string, File>>({});
  const [mentions, setMentions] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const isComposerDisabled = disabled || !conversation;

  const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
  const allowedExtensions = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
    'pdf', 'csv', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip',
  ]);

  // Handle typing indicator
  useEffect(() => {
    if (isComposerDisabled) {
      return;
    }

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
  }, [message, isTyping, onTyping, isComposerDisabled]);

  useEffect(() => {
    setAttachments([]);
    setAttachmentFiles({});
    setMentions([]);
    setIsTyping(false);
    onTyping(false);
  }, [conversationId, onTyping]);

  const handleSend = useCallback(() => {
    if (!message.trim() && attachments.length === 0) return;
    if (!conversation || disabled) return;

    const files = attachments
      .map((attachment) => attachmentFiles[attachment.id])
      .filter((file): file is File => !!file);

    onSendMessage(message, files, mentions);
    
    // Reset form
    setDraft(conversationId, '');
    setAttachments([]);
    setAttachmentFiles({});
    setMentions([]);
    setIsTyping(false);
    onTyping(false);
    
    inputRef.current?.focus();
  }, [
    attachments,
    conversation,
    conversationId,
    disabled,
    message,
    mentions,
    onSendMessage,
    onTyping,
    setDraft,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSend();
    }
  };

  const handleFileAttachment = (type: 'file' | 'image') => {
    const input = type === 'image' ? imageInputRef.current : fileInputRef.current;
    input?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = Array.from(e.target.files || []);
    const nextAttachments: MessageAttachment[] = [];
    const nextFiles: Record<string, File> = {};

    files.forEach(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedExtensions.has(extension)) {
        toast({
          title: 'Unsupported file format',
          description: `${file.name} is not an allowed attachment type.`,
          variant: 'destructive',
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          title: 'Attachment exceeds 15 MB',
          description: `${file.name} is too large to upload.`,
          variant: 'destructive',
        });
        return;
      }

      const attachmentId = crypto.randomUUID();
      const attachment: MessageAttachment = {
        id: attachmentId,
        name: file.name,
        type,
        url: URL.createObjectURL(file), // In real app, upload to server first
        size: file.size,
        mimeType: file.type,
        mediaKind: type === 'image' ? 'image' : 'file',
      };

      nextAttachments.push(attachment);
      nextFiles[attachmentId] = file;
    });

    if (nextAttachments.length > 0) {
      setAttachments(prev => [...prev, ...nextAttachments]);
      setAttachmentFiles(prev => ({ ...prev, ...nextFiles }));
    }
    
    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    const file = attachmentFiles[id];
    if (file) {
      const target = attachments.find((att) => att.id === id);
      if (target?.url) {
        URL.revokeObjectURL(target.url);
      }
    }
    setAttachments(prev => prev.filter(att => att.id !== id));
    setAttachmentFiles(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleMessageChange = (value: string) => {
    if (!conversationId) return;
    setDraft(conversationId, value);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn('border-t bg-background', className)}>
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="border-b p-3 sm:p-4">
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
                    type="button"
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
      <div className="p-3 sm:p-4">
        <div className="flex items-end gap-1.5 sm:gap-2">
          {/* Attachment Menu */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 flex-shrink-0 p-0 sm:h-9 sm:w-9"
                disabled={isComposerDisabled}
                type="button"
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
                  disabled={isComposerDisabled}
                  type="button"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Image
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleFileAttachment('file')}
                  disabled={isComposerDisabled}
                  type="button"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  File
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Message Input */}
          <div className="relative min-w-0 flex-1">
            <Input
              ref={inputRef}
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={conversation ? placeholder : 'Select a conversation to start messaging'}
              disabled={isComposerDisabled}
              className="h-9 focus-visible:ring-1 sm:h-10"
            />
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={disabled || (!message.trim() && attachments.length === 0) || !conversation}
            size="sm"
            className="h-8 w-8 flex-shrink-0 p-0 sm:h-9 sm:w-9"
            type="button"
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
        accept=".pdf,.csv,.txt,.doc,.docx,.xlsx,.xls,.ppt,.pptx,.zip"
        onChange={(e) => handleFileChange(e, 'file')}
        disabled={isComposerDisabled}
      />
      
      <input
        ref={imageInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*"
        onChange={(e) => handleFileChange(e, 'image')}
        disabled={isComposerDisabled}
      />
    </div>
  );
};

export default memo(ChatInput);