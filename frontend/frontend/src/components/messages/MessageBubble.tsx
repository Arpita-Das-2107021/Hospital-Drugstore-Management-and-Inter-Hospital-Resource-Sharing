import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Check, 
  CheckCheck, 
  Clock, 
  MoreHorizontal, 
  Reply, 
  Edit, 
  Trash2, 
  Download, 
  Eye,
  FileText,
  ExternalLink
} from 'lucide-react';
import { Message, ConversationType, MessageAttachment } from '@/types/healthcare';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isGrouped?: boolean;
  showTimestamp?: boolean;
  conversationType: ConversationType;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  className?: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isGrouped = false,
  showTimestamp = true,
  conversationType,
  onReply,
  onEdit,
  onDelete,
  className
}) => {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const downloadAttachment = (attachment: MessageAttachment) => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.name || 'attachment';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusIcon = () => {
    if (!isOwn) return null;

    switch (message.status) {
      case 'sent':
        return <Clock className="h-3 w-3" />;
      case 'delivered':
        return <Check className="h-3 w-3" />;
      case 'read':
        return <CheckCheck className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (message.status) {
      case 'sent':
        return 'text-muted-foreground';
      case 'delivered':
        return 'text-muted-foreground';
      case 'read':
        return 'text-blue-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const renderAttachment = (attachment: MessageAttachment) => {
    const sizeInMB = (attachment.size / (1024 * 1024)).toFixed(2);
    const mediaType = attachment.type || (attachment.mimeType?.startsWith('image/') ? 'image' : 'file');

    if (mediaType === 'image') {
      return (
        <div key={attachment.id} className="mt-2">
          <div className="relative group">
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-w-[300px] max-h-[200px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(attachment.url, '_blank')}
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}
                  type="button"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadAttachment(attachment)}
                  type="button"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{attachment.name}</span>
            <span>{sizeInMB} MB</span>
          </div>
        </div>
      );
    }

    if (mediaType === 'audio') {
      return (
        <div key={attachment.id} className="mt-2 rounded-lg border bg-muted/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{attachment.name}</p>
            <Button size="sm" variant="ghost" onClick={() => downloadAttachment(attachment)} type="button">
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <audio controls className="w-full">
            <source src={attachment.url} type={attachment.mimeType || 'audio/webm'} />
          </audio>
        </div>
      );
    }

    if (mediaType === 'video') {
      return (
        <div key={attachment.id} className="mt-2 rounded-lg border bg-muted/40 p-2">
          <video controls className="max-h-[280px] w-full rounded-lg">
            <source src={attachment.url} type={attachment.mimeType || 'video/mp4'} />
          </video>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate pr-2">{attachment.name}</span>
            <Button size="sm" variant="ghost" onClick={() => downloadAttachment(attachment)} type="button">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div key={attachment.id} className="mt-2">
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
          <div className="p-2 bg-background rounded">
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{attachment.name}</p>
            <p className="text-xs text-muted-foreground">{sizeInMB} MB</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadAttachment(attachment)}
            type="button"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const renderCaseReference = () => {
    if (!message.caseTag) return null;

    return (
      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-600">{message.caseTag}</span>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto">
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  const renderMentions = (content: string) => {
    if (!message.mentions || message.mentions.length === 0) {
      return <span>{content}</span>;
    }

    const parts = content.split(/(\s+)/).map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={`${part}-${index}`} className="rounded px-1 font-medium bg-primary/15 text-primary">
            {part}
          </span>
        );
      }
      return <span key={`${part}-${index}`}>{part}</span>;
    });

    return <>{parts}</>;
  };

  const canEdit = isOwn && !message.attachments?.length;
  const canDelete = isOwn;

  return (
    <TooltipProvider>
      <div
        className={cn(
          'group relative overflow-visible',
          isOwn ? 'pr-20' : 'pl-20',
          className
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 max-w-full break-words transition-all shadow-sm border',
            isOwn
              ? 'bg-primary text-primary-foreground border-primary/20'
              : 'bg-card border-border/60',
            isGrouped
              ? isOwn
                ? 'rounded-br-md'
                : 'rounded-bl-md'
              : ''
          )}
        >
          {/* Message Content */}
          <div className="text-sm leading-relaxed">
            {renderMentions(message.content)}
          </div>

          {/* Attachments */}
          {message.attachments?.map(renderAttachment)}

          {/* Case Reference */}
          {renderCaseReference()}

          {/* Edited indicator */}
          {message.editedAt && (
            <div className="text-xs opacity-70 mt-1">
              (edited)
            </div>
          )}

          {/* Timestamp and Status */}
          {showTimestamp && (
            <div className={cn(
              "flex items-center gap-1 mt-1 text-xs",
              isOwn ? "justify-end text-primary-foreground/70" : "text-muted-foreground"
            )}>
              <span>{formatTimestamp(message.createdAt)}</span>
              {isOwn && (
                <span className={getStatusColor()}>
                  {getStatusIcon()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div
          className={cn(
            'absolute top-1/2 z-10 -translate-y-1/2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:opacity-100',
            isOwn ? 'left-2' : 'right-2',
          )}
        >
            {onReply && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 w-7 p-0 shadow-sm"
                    onClick={() => onReply(message)}
                  >
                    <Reply className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reply</p>
                </TooltipContent>
              </Tooltip>
            )}

            {(canEdit || canDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 w-7 p-0 shadow-sm"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-32">
                  {canEdit && onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(message)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && onDelete && (
                    <DropdownMenuItem 
                      onClick={() => onDelete(message)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default MessageBubble;