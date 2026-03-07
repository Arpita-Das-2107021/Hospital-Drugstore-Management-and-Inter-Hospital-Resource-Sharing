import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert,
  Eye,
  Pencil,
  Trash2,
  Settings,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Save,
  RotateCcw
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { RolePermissions } from '@/services/roleService';

type Role = 'admin' | 'pharmacist' | 'doctor' | 'coordinator' | 'regulator';
type Module = 'inventory' | 'sharing' | 'communication' | 'admin' | 'reports';
type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

interface Permission {
  role: Role;
  module: Module;
  actions: Action[];
}

const roles: { id: Role; label: string; description: string; icon: typeof Shield; color: string }[] = [
  { id: 'admin', label: 'Administrator', description: 'Full system access', icon: ShieldAlert, color: 'text-destructive' },
  { id: 'pharmacist', label: 'Pharmacist', description: 'Inventory & dispensing', icon: ShieldCheck, color: 'text-success' },
  { id: 'doctor', label: 'Doctor', description: 'Clinical requests', icon: Shield, color: 'text-primary' },
  { id: 'coordinator', label: 'Coordinator', description: 'Resource coordination', icon: Shield, color: 'text-warning' },
  { id: 'regulator', label: 'Regulator', description: 'Audit & compliance', icon: Shield, color: 'text-info' },
];

const modules: { id: Module; label: string; description: string }[] = [
  { id: 'inventory', label: 'Inventory Management', description: 'Stock, analytics, forecasting' },
  { id: 'sharing', label: 'Resource Sharing', description: 'Requests, visibility, transfers' },
  { id: 'communication', label: 'Communication', description: 'Alerts, messages, notifications' },
  { id: 'admin', label: 'Administration', description: 'Roles, settings, integrations' },
  { id: 'reports', label: 'Reports & Analytics', description: 'Dashboards, exports, audits' },
];

const actions: { id: Action; label: string; icon: typeof Eye }[] = [
  { id: 'view', label: 'View', icon: Eye },
  { id: 'create', label: 'Create', icon: Pencil },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'delete', label: 'Delete', icon: Trash2 },
  { id: 'approve', label: 'Approve', icon: ShieldCheck },
  { id: 'export', label: 'Export', icon: Settings },
];

// Default permissions
const defaultPermissions: Permission[] = [
  { role: 'admin', module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { role: 'admin', module: 'sharing', actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { role: 'admin', module: 'communication', actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { role: 'admin', module: 'admin', actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { role: 'admin', module: 'reports', actions: ['view', 'create', 'edit', 'delete', 'approve', 'export'] },
  { role: 'pharmacist', module: 'inventory', actions: ['view', 'create', 'edit', 'export'] },
  { role: 'pharmacist', module: 'sharing', actions: ['view', 'create', 'edit'] },
  { role: 'pharmacist', module: 'communication', actions: ['view', 'create'] },
  { role: 'pharmacist', module: 'reports', actions: ['view', 'export'] },
  { role: 'doctor', module: 'inventory', actions: ['view'] },
  { role: 'doctor', module: 'sharing', actions: ['view', 'create'] },
  { role: 'doctor', module: 'communication', actions: ['view', 'create'] },
  { role: 'doctor', module: 'reports', actions: ['view'] },
  { role: 'coordinator', module: 'inventory', actions: ['view'] },
  { role: 'coordinator', module: 'sharing', actions: ['view', 'create', 'edit', 'approve'] },
  { role: 'coordinator', module: 'communication', actions: ['view', 'create'] },
  { role: 'coordinator', module: 'reports', actions: ['view', 'export'] },
  { role: 'regulator', module: 'inventory', actions: ['view'] },
  { role: 'regulator', module: 'sharing', actions: ['view'] },
  { role: 'regulator', module: 'communication', actions: ['view'] },
  { role: 'regulator', module: 'admin', actions: ['view'] },
  { role: 'regulator', module: 'reports', actions: ['view', 'export'] },
];

export const PermissionMatrix = ({ permissions: rolePermissions }: { permissions?: RolePermissions[] }) => {
  const [localPermissions, setLocalPermissions] = useState<Permission[]>(
    rolePermissions ? transformRolePermissionsToLocal(rolePermissions) : defaultPermissions
  );
  const [expandedModules, setExpandedModules] = useState<Module[]>(['inventory', 'sharing']);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Transform backend role permissions to local format
  function transformRolePermissionsToLocal(rolePerms: RolePermissions[]): Permission[] {
    const transformed: Permission[] = [];
    
    rolePerms.forEach(rolePerm => {
      Object.entries(rolePerm.permissions).forEach(([module, perms]) => {
        const actions: Action[] = [];
        if (perms?.read) actions.push('view');
        if (perms?.write) actions.push('create', 'edit');
        if (perms?.admin) actions.push('delete', 'approve', 'export');
        
        transformed.push({
          role: rolePerm.role as Role,
          module: module as Module,
          actions
        });
      });
    });
    
    return transformed;
  }

  const hasPermission = (role: Role, module: Module, action: Action): boolean => {
    const permission = localPermissions.find(p => p.role === role && p.module === module);
    return permission?.actions.includes(action) || false;
  };

  const togglePermission = (role: Role, module: Module, action: Action) => {
    setLocalPermissions(prev => {
      const existing = prev.find(p => p.role === role && p.module === module);
      if (existing) {
        const newActions = existing.actions.includes(action)
          ? existing.actions.filter(a => a !== action)
          : [...existing.actions, action];
        return prev.map(p => 
          p.role === role && p.module === module 
            ? { ...p, actions: newActions }
            : p
        );
      } else {
        return [...prev, { role, module, actions: [action] }];
      }
    });
    setHasChanges(true);
  };

  const toggleModuleExpand = (module: Module) => {
    setExpandedModules(prev => 
      prev.includes(module) 
        ? prev.filter(m => m !== module)
        : [...prev, module]
    );
  };

  const handleSave = () => {
    // Simulate saving
    toast({
      title: "Permissions Updated",
      description: "Role permissions have been saved successfully.",
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalPermissions(rolePermissions ? transformRolePermissionsToLocal(rolePermissions) : defaultPermissions);
    setHasChanges(false);
    toast({
      title: "Permissions Reset",
      description: "Role permissions have been reset to defaults.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Permission Matrix</h2>
          <p className="text-sm text-muted-foreground">Configure granular access control for each role</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges}>
            <Save className="h-4 w-4 mr-1" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Role Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {roles.map(role => {
          const Icon = role.icon;
          const totalPermissions = permissions
            .filter(p => p.role === role.id)
            .reduce((acc, p) => acc + p.actions.length, 0);
          
          return (
            <Card key={role.id} className="relative overflow-hidden">
              <div className={cn(
                "absolute top-0 left-0 w-1 h-full",
                role.id === 'admin' && "bg-destructive",
                role.id === 'pharmacist' && "bg-success",
                role.id === 'doctor' && "bg-primary",
                role.id === 'coordinator' && "bg-warning",
                role.id === 'regulator' && "bg-info"
              )} />
              <CardContent className="p-4 pl-5">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-5 w-5", role.color)} />
                  <div>
                    <p className="font-medium text-sm">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{totalPermissions} permissions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Permission Grid */}
      <Card>
        <CardContent className="p-0">
          {modules.map(module => (
            <Collapsible
              key={module.id}
              open={expandedModules.includes(module.id)}
              onOpenChange={() => toggleModuleExpand(module.id)}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer border-b">
                  <div>
                    <p className="font-medium">{module.label}</p>
                    <p className="text-xs text-muted-foreground">{module.description}</p>
                  </div>
                  {expandedModules.includes(module.id) ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Action</th>
                        {roles.map(role => (
                          <th key={role.id} className="p-3 text-center font-medium min-w-[100px]">
                            {role.label.split(' ')[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {actions.map(action => {
                        const ActionIcon = action.icon;
                        return (
                          <tr key={action.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <ActionIcon className="h-4 w-4 text-muted-foreground" />
                                <span>{action.label}</span>
                              </div>
                            </td>
                            {roles.map(role => (
                              <td key={role.id} className="p-3 text-center">
                                <Checkbox
                                  checked={hasPermission(role.id, module.id, action.id)}
                                  onCheckedChange={() => togglePermission(role.id, module.id, action.id)}
                                  disabled={role.id === 'admin'} // Admin always has all permissions
                                  className={cn(
                                    role.id === 'admin' && "opacity-50"
                                  )}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1">
          <Lock className="h-3 w-3" />
          Admin permissions locked
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Unlock className="h-3 w-3" />
          Changes require approval
        </Badge>
      </div>
    </div>
  );
};

export default PermissionMatrix;
