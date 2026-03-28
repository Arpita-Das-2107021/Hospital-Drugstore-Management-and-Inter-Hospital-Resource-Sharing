import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Employee } from '@/types/healthcare';
import { Phone, Mail, Circle } from 'lucide-react';

interface EmployeeCardProps {
  employee: Employee;
  onSelect?: (employee: Employee) => void;
  onPhone?: (employee: Employee) => void;
  onEmail?: (employee: Employee) => void;
  compact?: boolean;
  showActions?: boolean;
}

export const EmployeeCard = ({ 
  employee, 
  onSelect, 
  onPhone, 
  onEmail, 
  compact = false,
  showActions = true 
}: EmployeeCardProps) => {
  const getRoleColor = (role: string) => {
    const colors = {
      doctor: 'bg-blue-100 text-blue-800 border-blue-300',
      nurse: 'bg-green-100 text-green-800 border-green-300',
      pharmacist: 'bg-purple-100 text-purple-800 border-purple-300',
      admin: 'bg-orange-100 text-orange-800 border-orange-300',
      coordinator: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      technician: 'bg-gray-100 text-gray-800 border-gray-300'
    };
    return colors[role as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-300';
  };
  
  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return '';
    const date = new Date(lastSeen);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card 
      className={`transition-all hover:shadow-md ${onSelect ? 'cursor-pointer hover:scale-105 border-2 hover:border-primary/50' : ''} ${compact ? 'p-2' : ''}`}
      onClick={() => onSelect?.(employee)}
    >
      <CardContent className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`${compact ? 'w-10 h-10 text-sm' : 'w-12 h-12 text-lg'} bg-primary/10 rounded-full flex items-center justify-center text-primary font-semibold`}>
                {employee.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className={`absolute -bottom-1 -right-1 ${compact ? 'w-3 h-3' : 'w-4 h-4'} rounded-full border-2 border-white ${
                employee.isOnline ? 'bg-green-500' : 'bg-gray-400'
              }`} />
            </div>
          </div>
          <Badge className={`${getRoleColor(employee.role)} border text-xs`}>
            {employee.role}
          </Badge>
        </div>
        
        <h3 className={`font-semibold ${compact ? 'text-base' : 'text-lg'} mb-1`}>{employee.name}</h3>
        <p className="text-sm text-muted-foreground mb-2">{employee.department}</p>
        {employee.specialization && (
          <p className="text-sm text-primary mb-3">{employee.specialization}</p>
        )}
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Circle className={`h-2 w-2 ${employee.isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-400 text-gray-400'}`} />
            <span className={employee.isOnline ? 'text-green-600' : 'text-muted-foreground'}>
              {employee.isOnline ? 'Online' : `Offline ${formatLastSeen(employee.lastSeen)}`}
            </span>
          </div>
          {showActions && (
            <div className="flex gap-2">
              {employee.phoneNumber && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPhone?.(employee);
                  }}
                >
                  <Phone className="h-4 w-4" />
                </Button>
              )}
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 w-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onEmail?.(employee);
                }}
              >
                <Mail className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};