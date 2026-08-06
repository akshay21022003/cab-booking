'use client';

import { useState, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchUsers } from '@/lib/actions';

interface UserOption {
  id: string;
  email: string;
  department?: { name: string } | null;
}

interface UserSearchComboboxProps {
  onSelect: (user: UserOption) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function UserSearchCombobox({ onSelect, placeholder = 'Search user...', disabled }: UserSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserOption | null>(null);

  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) { setUsers([]); return; }
    setLoading(true);
    try {
      const result = await searchUsers(searchQuery);
      if (result.success) setUsers(result.data as UserOption[]);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { doSearch(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-64 justify-between h-8 text-sm font-normal" disabled={disabled}>
          {selected ? <span className="truncate">{selected.email}</span> : <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type email to search..." value={query} onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : query.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Type at least 2 characters to search</div>
            ) : (
              <>
                <CommandEmpty>No user found.</CommandEmpty>
                <CommandGroup>
                  {users.map((user) => (
                    <CommandItem key={user.id} value={user.email} onSelect={() => { setSelected(user); onSelect(user); setOpen(false); }}>
                      <Check className={cn('mr-2 h-3 w-3', selected?.id === user.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{user.email}</span>
                        {user.department && <span className="text-xs text-muted-foreground">{user.department.name}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
