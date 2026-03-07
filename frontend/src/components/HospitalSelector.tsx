import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, MapPin, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useHospitals } from '@/hooks/useDashboardData';
import { Link } from 'react-router-dom';

interface HospitalSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  showAllOption?: boolean;
  className?: string;
}

export const HospitalSelector = ({
  value,
  onValueChange,
  placeholder = 'Select hospital...',
  showAllOption = true,
  className
}: HospitalSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { hospitals, loading } = useHospitals();

  const filteredHospitals = useMemo(() => {
    if (!hospitals || !search) return hospitals || [];
    const lower = search.toLowerCase();
    return hospitals.filter(
      h => h.name.toLowerCase().includes(lower) || 
           h.city?.toLowerCase().includes(lower) ||
           h.region?.toLowerCase().includes(lower)
    );
  }, [hospitals, search]);

  const selectedHospital = hospitals?.find(h => h.name === value || h.id === value);

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-72 justify-between"
          >
            {selectedHospital ? (
              <div className="flex items-center gap-2 truncate">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedHospital.name}</span>
              </div>
            ) : value === 'all' ? (
              <span>All Hospitals</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Search hospitals..." 
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-64">
              {loading ? (
                <div className="flex items-center justify-center p-4">
                  <span className="text-sm text-muted-foreground">Loading hospitals...</span>
                </div>
              ) : (
                <>
                  <CommandEmpty>No hospital found.</CommandEmpty>
                  <CommandGroup>
                    {showAllOption && (
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          onValueChange('all');
                          setOpen(false);
                          setSearch('');
                        }}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === 'all' ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span>All Hospitals</span>
                      </CommandItem>
                    )}
                    {filteredHospitals.map((hospital) => (
                      <CommandItem
                        key={hospital.id}
                        value={hospital.name}
                        onSelect={() => {
                          onValueChange(hospital.name);
                          setOpen(false);
                          setSearch('');
                        }}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            (value === hospital.name || value === hospital.id) ? "opacity-100" : "opacity-0"
                          )}
                        />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{hospital.name}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {hospital.city}, {hospital.region}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
          <div className="border-t p-2">
            <Link to="/hospitals">
              <Button variant="ghost" size="sm" className="w-full justify-start text-primary">
                <Building2 className="mr-2 h-4 w-4" />
                View All Hospitals
              </Button>
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default HospitalSelector;