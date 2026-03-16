import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Users, 
  UserPlus, 
  Phone, 
  Video, 
  MoreVertical, 
  Archive, 
  VolumeX, 
  Volume2, 
  Info,
  FileText,
  Circle,
  ChevronLeft,
  Trash2,
} from 'lucide-react';
import { Conversation, OnlineStatus } from '@/types/healthcare';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  conversation: Conversation | null;
  currentUserId: string;
  onlineStatus?: Record<string, OnlineStatus>;
  onViewMembers?: () => void;
  onAddMember?: () => void;
  onToggleMute?: () => void;
  onToggleArchive?: () => void;
  onCall?: () => void;
  onVideoCall?: () => void;
  onDeleteConversation?: () => void;
  onBack?: () => void; // For mobile
  className?: string;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversation,
  currentUserId,
  onlineStatus,
  onViewMembers,
  onAddMember,
  onToggleMute,
  onToggleArchive,
  onCall,
  onVideoCall,
  onDeleteConversation,
  onBack,
  className
}) => {
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

  if (!conversation) {
    return (
      <div className={cn('border-b p-4 h-16 flex items-center justify-center bg-card/60', className)}>
        <p className="text-muted-foreground">Select a conversation to start messaging</p>
      </div>
    );
  }

  const counterpart = conversation.participants.find((p) => p.id !== currentUserId);

  const getConversationDisplayName = () => {
    if (conversation.type === 'group') {
      return conversation.name || 'Unnamed Group';
    }

    return counterpart?.name || 'Direct Message';
  };

  const getConversationSubtitle = () => {
    if (conversation.type === 'group') {
      return `${conversation.participants.length} members`;
    }
    
    if (conversation.type === 'case' && conversation.caseId) {
      return `${conversation.caseId} • ${counterpart?.hospital || 'Cross-hospital'}`;
    }

    const status = onlineStatus?.[counterpart?.id || ''];
    
    if (status?.isOnline) {
      return 'Online';
    } else if (status?.lastSeen) {
      const lastSeen = new Date(status.lastSeen);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
      
      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    }
    
    return counterpart?.hospital || 'Healthcare conversation';
  };

  const displayName = getConversationDisplayName();

  const isOtherParticipantOnline = () => {
    return onlineStatus?.[counterpart?.id || '']?.isOnline || false;
  };

  const getConversationTypeIcon = () => {
    switch (conversation.type) {
      case 'group':
        return <Users className="h-4 w-4" />;
      case 'case':
        return <FileText className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getConversationTypeBadge = () => {
    switch (conversation.type) {
      case 'group':
        return (
          <Badge variant="secondary" className="text-xs">
            <Users className="h-3 w-3 mr-1" />
            Group
          </Badge>
        );
      case 'case':
        return (
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Case
          </Badge>
        );
      case 'private':
        return (
          <Badge variant="outline" className="text-xs">
            Private
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <div className={cn('border-b p-4 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mobile back button */}
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden p-2">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}

            {/* Avatar */}
            <div className="relative">
              <div
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold',
                  getAvatarTone(displayName),
                )}
              >
                {getInitials(displayName)}
              </div>

              {/* Online indicator for private chats */}
              {conversation.type === 'private' && isOtherParticipantOnline() && (
                <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background">
                  <Circle className="h-full w-full fill-green-500 text-green-500" />
                </div>
              )}
            </div>

            {/* Conversation Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-sm truncate">
                  {displayName}
                </h3>
                {getConversationTypeBadge()}
                {conversation.caseId && conversation.type === 'case' && (
                  <Badge variant="outline" className="text-xs">
                    {conversation.caseId}
                  </Badge>
                )}
                {conversation.isMuted && (
                  <Tooltip>
                    <TooltipTrigger>
                      <VolumeX className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Muted</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {conversation.isArchived && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Archive className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Archived</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {conversation.type === 'private' && isOtherParticipantOnline() && (
                  <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                )}
                <p className="text-xs text-muted-foreground truncate">
                  {getConversationSubtitle()}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* View Members (Group only) */}
            {conversation.type === 'group' && onViewMembers && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onViewMembers}>
                    <Users className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View Members</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Add Member (Group only, role-based) */}
            {conversation.type === 'group' && onAddMember && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onAddMember}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add Member</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Call Actions (Private chats only) */}
            {conversation.type === 'private' && onCall && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onCall}>
                    <Phone className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Voice Call</p>
                </TooltipContent>
              </Tooltip>
            )}

            {conversation.type === 'private' && onVideoCall && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onVideoCall}>
                    <Video className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Video Call</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {conversation.type === 'group' && onViewMembers && (
                  <DropdownMenuItem onClick={onViewMembers}>
                    <Info className="h-4 w-4 mr-2" />
                    View Info
                  </DropdownMenuItem>
                )}
                
                {onToggleMute && (
                  <DropdownMenuItem onClick={onToggleMute}>
                    {conversation.isMuted ? (
                      <>
                        <Volume2 className="h-4 w-4 mr-2" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <VolumeX className="h-4 w-4 mr-2" />
                        Mute
                      </>
                    )}
                  </DropdownMenuItem>
                )}

                {onToggleArchive && (
                  <DropdownMenuItem onClick={onToggleArchive}>
                    {conversation.isArchived ? (
                      <>
                        <Archive className="h-4 w-4 mr-2" />
                        Unarchive
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </>
                    )}
                  </DropdownMenuItem>
                )}

                {onDeleteConversation && (
                  <DropdownMenuItem
                    onClick={onDeleteConversation}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete chat
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ChatHeader;