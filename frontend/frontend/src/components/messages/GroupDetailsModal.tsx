import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  Users, 
  UserPlus, 
  Crown, 
  Shield, 
  MoreVertical, 
  UserMinus, 
  Calendar,
  Clock,
  FileText,
  Edit,
  Trash2,
  Archive,
  VolumeX,
  Volume2
} from 'lucide-react';
import { Conversation, Employee } from '@/types/healthcare';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface GroupDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
  currentUser: Employee;
  onUpdateGroup: (updates: Partial<Conversation>) => void;
  onAddMembers: (userIds: string[]) => void;
  onRemoveMember: (userId: string) => void;
  onLeaveGroup: () => void;
  onDeleteGroup: () => void;
  canEdit?: boolean; // Based on user role/permissions
  canManageMembers?: boolean;
  className?: string;
}

const GroupDetailsModal: React.FC<GroupDetailsModalProps> = ({
  open,
  onOpenChange,
  conversation,
  currentUser,
  onUpdateGroup,
  onAddMembers,
  onRemoveMember,
  onLeaveGroup,
  onDeleteGroup,
  canEdit = false,
  canManageMembers = false,
  className
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [showRemoveDialog, setShowRemoveDialog] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  if (!conversation || conversation.type !== 'group') {
    return null;
  }

  const handleStartEdit = () => {
    setEditedName(conversation.name || '');
    setEditedDescription(conversation.description || '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onUpdateGroup({
      name: editedName,
      description: editedDescription
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName('');
    setEditedDescription('');
    setIsEditing(false);
  };

  const handleRemoveMember = (userId: string) => {
    onRemoveMember(userId);
    setShowRemoveDialog(null);
  };

  const isCreator = conversation.creator?.id === currentUser.id;
  const isAdmin = isCreator; // Extend this logic based on your permissions system
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMemberRole = (member: Employee) => {
    if (member.id === conversation.creator?.id) return 'Creator';
    return 'Member'; // Extend this based on your permissions system
  };

  const canRemoveMember = (member: Employee) => {
    if (member.id === currentUser.id) return false; // Can't remove self
    if (member.id === conversation.creator?.id) return false; // Can't remove creator
    return canManageMembers || isAdmin;
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("max-w-2xl max-h-[80vh] flex flex-col", className)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Group Details
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="info" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="members">Members ({conversation.participants.length})</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden mt-4">
                <TabsContent value="info" className="mt-0 h-full">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-6">
                      {/* Group Avatar and Basic Info */}
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full flex items-center justify-center">
                          <Users className="h-8 w-8" />
                        </div>
                        
                        <div className="flex-1">
                          {isEditing ? (
                            <div className="space-y-3">
                              <div>
                                <Label htmlFor="groupName">Group Name</Label>
                                <Input
                                  id="groupName"
                                  value={editedName}
                                  onChange={(e) => setEditedName(e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor="groupDescription">Description</Label>
                                <Textarea
                                  id="groupDescription"
                                  value={editedDescription}
                                  onChange={(e) => setEditedDescription(e.target.value)}
                                  className="mt-1 min-h-[80px]"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                                <Button size="sm" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-lg font-semibold">{conversation.name}</h3>
                                {canEdit && (
                                  <Button size="sm" variant="ghost" onClick={handleStartEdit}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              
                              {conversation.description && (
                                <p className="text-sm text-muted-foreground mb-3">
                                  {conversation.description}
                                </p>
                              )}
                              
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                  <Users className="h-3 w-3 mr-1" />
                                  {conversation.participants.length} members
                                </Badge>
                                
                                {conversation.caseId && (
                                  <Badge variant="outline">
                                    <FileText className="h-3 w-3 mr-1" />
                                    {conversation.caseId}
                                  </Badge>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Group Statistics */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Calendar className="h-4 w-4" />
                            Created
                          </div>
                          <p className="text-sm font-medium">{formatDate(conversation.createdAt)}</p>
                        </div>
                        
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Clock className="h-4 w-4" />
                            Last Activity
                          </div>
                          <p className="text-sm font-medium">{formatDate(conversation.lastMessageAt)}</p>
                        </div>
                      </div>

                      {/* Creator Info */}
                      {conversation.creator && (
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                              {conversation.creator.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{conversation.creator.name}</p>
                                <Crown className="h-4 w-4 text-yellow-500" />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {conversation.creator.role} • {conversation.creator.hospital}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="members" className="mt-0 h-full">
                  <div className="h-full flex flex-col">
                    {canManageMembers && (
                      <div className="mb-4">
                        <Button className="flex items-center gap-2" onClick={() => {/* Handle add members */}}>
                          <UserPlus className="h-4 w-4" />
                          Add Members
                        </Button>
                      </div>
                    )}
                    
                    <ScrollArea className="flex-1">
                      <div className="space-y-2">
                        {conversation.participants.map(member => (
                          <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border">
                            <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                              {member.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{member.name}</p>
                                {member.id === conversation.creator?.id && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Crown className="h-4 w-4 text-yellow-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>Group Creator</TooltipContent>
                                  </Tooltip>
                                )}
                                {member.id === currentUser.id && (
                                  <Badge variant="secondary" className="text-xs">You</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {member.role} • {member.hospital}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getMemberRole(member)}
                              </p>
                            </div>

                            {/* Member Actions */}
                            {canRemoveMember(member) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => setShowRemoveDialog(member.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <UserMinus className="h-4 w-4 mr-2" />
                                    Remove Member
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="mt-0 h-full">
                  <ScrollArea className="h-full">
                    <div className="space-y-6">
                      {/* Notification Settings */}
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-3">Notifications</h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Mute Notifications</p>
                              <p className="text-xs text-muted-foreground">
                                Turn off notifications for this group
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onUpdateGroup({ isMuted: !conversation.isMuted })}
                            >
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
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Archive Settings */}
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-3">Archive</h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Archive Group</p>
                              <p className="text-xs text-muted-foreground">
                                Hide this group from your active conversations
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onUpdateGroup({ isArchived: !conversation.isArchived })}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              {conversation.isArchived ? 'Unarchive' : 'Archive'}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Danger Zone */}
                      <div className="p-4 border border-destructive/20 rounded-lg">
                        <h4 className="font-medium text-destructive mb-3">Danger Zone</h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Leave Group</p>
                              <p className="text-xs text-muted-foreground">
                                You will no longer receive messages from this group
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => setShowLeaveDialog(true)}
                            >
                              Leave Group
                            </Button>
                          </div>
                          
                          {isCreator && (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">Delete Group</p>
                                <p className="text-xs text-muted-foreground">
                                  Permanently delete this group and all messages
                                </p>
                              </div>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowDeleteDialog(true)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={!!showRemoveDialog} onOpenChange={() => setShowRemoveDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the group? They will no longer be able to see new messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showRemoveDialog && handleRemoveMember(showRemoveDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Group Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this group? You will no longer receive messages and won't be able to rejoin unless added by another member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onLeaveGroup();
                setShowLeaveDialog(false);
                onOpenChange(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Group Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this group? This action cannot be undone. All messages and group data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeleteGroup();
                setShowDeleteDialog(false);
                onOpenChange(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default GroupDetailsModal;