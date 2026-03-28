import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageCircle, 
  Users, 
  FileText, 
  Search, 
  X, 
  Check, 
  ChevronsUpDown,
  Building2,
  UserCheck
} from 'lucide-react';
import { Employee, ConversationType, UserRole } from '@/types/healthcare';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface NewMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: Employee;
  allUsers: Employee[]; // All users across hospitals
  hospitals: string[];
  onCreateConversation: (
    type: ConversationType,
    participants: Employee[],
    name?: string,
    description?: string,
    caseId?: string
  ) => void;
}

const NewMessageModal: React.FC<NewMessageModalProps> = ({
  open,
  onOpenChange,
  currentUser,
  allUsers,
  hospitals,
  onCreateConversation
}) => {
  const [conversationType, setConversationType] = useState<ConversationType>('private');
  const [selectedParticipants, setSelectedParticipants] = useState<Employee[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [caseId, setCaseId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHospital, setSelectedHospital] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<UserRole | 'all'>('all');
  const [hospitalSearchOpen, setHospitalSearchOpen] = useState(false);

  // Filter users based on search criteria
  const filteredUsers = useMemo(() => {
    let filtered = allUsers.filter(user => user.id !== currentUser.id);

    // Hospital filter
    if (selectedHospital !== 'all') {
      filtered = filtered.filter(user => user.hospital === selectedHospital);
    }

    // Role filter
    if (selectedRole !== 'all') {
      filtered = filtered.filter(user => user.role === selectedRole);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.hospital.toLowerCase().includes(query) ||
        (user as any).department?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allUsers, currentUser.id, selectedHospital, selectedRole, searchQuery]);

  const handleUserToggle = (user: Employee) => {
    setSelectedParticipants(prev => {
      const isSelected = prev.some(p => p.id === user.id);
      
      if (conversationType === 'private') {
        return isSelected ? [] : [user];
      }
      
      return isSelected
        ? prev.filter(p => p.id !== user.id)
        : [...prev, user];
    });
  };

  const handleCreateConversation = () => {
    if (selectedParticipants.length === 0) return;
    
    if (conversationType === 'group' && !groupName.trim()) return;

    const participants = [currentUser, ...selectedParticipants];
    
    onCreateConversation(
      conversationType,
      participants,
      conversationType === 'group' ? groupName : undefined,
      conversationType === 'group' ? groupDescription : undefined,
      conversationType === 'case' ? caseId : undefined
    );

    // Reset form
    setSelectedParticipants([]);
    setGroupName('');
    setGroupDescription('');
    setCaseId('');
    setSearchQuery('');
    setConversationType('private');
    onOpenChange(false);
  };

  const getConversationTypeIcon = (type: ConversationType) => {
    switch (type) {
      case 'private':
        return <MessageCircle className="h-4 w-4" />;
      case 'group':
        return <Users className="h-4 w-4" />;
      case 'case':
        return <FileText className="h-4 w-4" />;
    }
  };

  const canCreate = () => {
    if (selectedParticipants.length === 0) return false;
    
    if (conversationType === 'private') {
      return selectedParticipants.length === 1;
    }
    
    if (conversationType === 'group') {
      return selectedParticipants.length >= 2 && groupName.trim().length > 0;
    }
    
    if (conversationType === 'case') {
      return selectedParticipants.length >= 1;
    }
    
    return false;
  };

  const getCreateButtonText = () => {
    switch (conversationType) {
      case 'private':
        return 'Start Chat';
      case 'group':
        return 'Create Group';
      case 'case':
        return 'Create Case Chat';
      default:
        return 'Create';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            New Message
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={conversationType} onValueChange={(v) => setConversationType(v as ConversationType)} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="private" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Private
              </TabsTrigger>
              <TabsTrigger value="group" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Group
              </TabsTrigger>
              <TabsTrigger value="case" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Case
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden mt-4">
              <TabsContent value="private" className="mt-0 h-full">
                <div className="space-y-4 h-full flex flex-col">
                  <div className="text-sm text-muted-foreground">
                    Select a staff member to start a private conversation
                  </div>
                  
                  {/* User Selection */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <UserSelectionComponent
                      filteredUsers={filteredUsers}
                      selectedParticipants={selectedParticipants}
                      searchQuery={searchQuery}
                      selectedHospital={selectedHospital}
                      selectedRole={selectedRole}
                      hospitals={hospitals}
                      hospitalSearchOpen={hospitalSearchOpen}
                      onSearchChange={setSearchQuery}
                      onHospitalChange={setSelectedHospital}
                      onRoleChange={setSelectedRole}
                      onHospitalSearchToggle={setHospitalSearchOpen}
                      onUserToggle={handleUserToggle}
                      maxSelection={1}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="group" className="mt-0 h-full">
                <div className="space-y-4 h-full flex flex-col">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="groupName">Group Name</Label>
                      <Input
                        id="groupName"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Enter group name..."
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="groupDescription">Description (Optional)</Label>
                      <Textarea
                        id="groupDescription"
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        placeholder="Describe the purpose of this group..."
                        className="mt-1 min-h-[60px]"
                      />
                    </div>
                  </div>

                  {/* User Selection */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <UserSelectionComponent
                      filteredUsers={filteredUsers}
                      selectedParticipants={selectedParticipants}
                      searchQuery={searchQuery}
                      selectedHospital={selectedHospital}
                      selectedRole={selectedRole}
                      hospitals={hospitals}
                      hospitalSearchOpen={hospitalSearchOpen}
                      onSearchChange={setSearchQuery}
                      onHospitalChange={setSelectedHospital}
                      onRoleChange={setSelectedRole}
                      onHospitalSearchToggle={setHospitalSearchOpen}
                      onUserToggle={handleUserToggle}
                      minSelection={2}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="case" className="mt-0 h-full">
                <div className="space-y-4 h-full flex flex-col">
                  <div>
                    <Label htmlFor="caseId">Case ID (Optional)</Label>
                    <Input
                      id="caseId"
                      value={caseId}
                      onChange={(e) => setCaseId(e.target.value)}
                      placeholder="e.g., CASE-2024-0892"
                      className="mt-1"
                    />
                  </div>

                  {/* User Selection */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <UserSelectionComponent
                      filteredUsers={filteredUsers}
                      selectedParticipants={selectedParticipants}
                      searchQuery={searchQuery}
                      selectedHospital={selectedHospital}
                      selectedRole={selectedRole}
                      hospitals={hospitals}
                      hospitalSearchOpen={hospitalSearchOpen}
                      onSearchChange={setSearchQuery}
                      onHospitalChange={setSelectedHospital}
                      onRoleChange={setSelectedRole}
                      onHospitalSearchToggle={setHospitalSearchOpen}
                      onUserToggle={handleUserToggle}
                      minSelection={1}
                    />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selectedParticipants.length > 0 && 
                `${selectedParticipants.length} selected`
              }
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateConversation} disabled={!canCreate()}>
                {getCreateButtonText()}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface UserSelectionComponentProps {
  filteredUsers: Employee[];
  selectedParticipants: Employee[];
  searchQuery: string;
  selectedHospital: string;
  selectedRole: UserRole | 'all';
  hospitals: string[];
  hospitalSearchOpen: boolean;
  onSearchChange: (query: string) => void;
  onHospitalChange: (hospital: string) => void;
  onRoleChange: (role: UserRole | 'all') => void;
  onHospitalSearchToggle: (open: boolean) => void;
  onUserToggle: (user: Employee) => void;
  maxSelection?: number;
  minSelection?: number;
}

const UserSelectionComponent: React.FC<UserSelectionComponentProps> = ({
  filteredUsers,
  selectedParticipants,
  searchQuery,
  selectedHospital,
  selectedRole,
  hospitals,
  hospitalSearchOpen,
  onSearchChange,
  onHospitalChange,
  onRoleChange,
  onHospitalSearchToggle,
  onUserToggle,
  maxSelection,
  minSelection
}) => {
  const roles: Array<{value: UserRole | 'all', label: string}> = [
    { value: 'all', label: 'All Roles' },
    { value: 'doctor', label: 'Doctors' },
    { value: 'nurse', label: 'Nurses' },
    { value: 'pharmacist', label: 'Pharmacists' },
    { value: 'admin', label: 'Administrators' },
    { value: 'coordinator', label: 'Coordinators' },
    { value: 'technician', label: 'Technicians' }
  ];

  return (
    <>
      {/* Selected Participants */}
      {selectedParticipants.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedParticipants.map(user => (
            <Badge key={user.id} variant="secondary" className="flex items-center gap-2 pr-1">
              <div className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                {user.name.split(' ').map(n => n[0]).join('')}
              </div>
              {user.name}
              <Button
                size="sm"
                variant="ghost"
                className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => onUserToggle(user)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Hospital Filter */}
        <Popover open={hospitalSearchOpen} onOpenChange={onHospitalSearchToggle}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={hospitalSearchOpen}
              className="w-[200px] justify-between"
            >
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {selectedHospital === 'all' ? 'All Hospitals' : selectedHospital}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search hospitals..." />
              <CommandList>
                <CommandEmpty>No hospitals found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      onHospitalChange('all');
                      onHospitalSearchToggle(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", selectedHospital === 'all' ? "opacity-100" : "opacity-0")} />
                    All Hospitals
                  </CommandItem>
                  {hospitals.map(hospital => (
                    <CommandItem
                      key={hospital}
                      value={hospital}
                      onSelect={() => {
                        onHospitalChange(hospital);
                        onHospitalSearchToggle(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedHospital === hospital ? "opacity-100" : "opacity-0")} />
                      {hospital}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Role Filter */}
        <Select value={selectedRole} onValueChange={onRoleChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map(role => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* User List */}
      <div className="flex-1 border rounded-lg">
        <ScrollArea className="h-full max-h-[300px]">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No staff members found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredUsers.map(user => {
                const isSelected = selectedParticipants.some(p => p.id === user.id);
                const isMaxReached = maxSelection && selectedParticipants.length >= maxSelection && !isSelected;
                
                return (
                  <div
                    key={user.id}
                    className={cn(
                      "flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50",
                      isSelected && "bg-muted",
                      isMaxReached && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => !isMaxReached && onUserToggle(user)}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {isSelected ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        user.name.split(' ').map(n => n[0]).join('')
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.role} • {user.hospital}</p>
                      {(user as any).department && (
                        <p className="text-xs text-muted-foreground">{(user as any).department}</p>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {(user as any).isOnline && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          Online
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Selection Helper */}
      {(minSelection || maxSelection) && (
        <div className="text-xs text-muted-foreground mt-2">
          {minSelection && selectedParticipants.length < minSelection && (
            <span>Select at least {minSelection} {minSelection === 1 ? 'person' : 'people'}</span>
          )}
          {maxSelection && (
            <span> • Max {maxSelection} {maxSelection === 1 ? 'person' : 'people'}</span>
          )}
        </div>
      )}
    </>
  );
};

export default NewMessageModal;