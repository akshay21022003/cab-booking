'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { UserSearchCombobox } from '@/components/user-search-combobox';
import { Plus, UserPlus, X } from 'lucide-react';
import { getSuperAdminDepartments, createDepartmentAction, updateDepartmentAction, assignDepartmentAdminAction, removeDepartmentAdminAction } from '@/lib/actions';

export default function DepartmentsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [assignDeptId, setAssignDeptId] = useState<string | null>(null);
  const [assignEmail, setAssignEmail] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sa-departments'],
    queryFn: () => getSuperAdminDepartments().then(r => r.data || []),
  });

  const createDept = useMutation({
    mutationFn: (name: string) => createDepartmentAction(name).then(r => { if (!r.success) throw new Error(r.error?.message); return r.data; }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sa-departments'] }); setShowAdd(false); setNewName(''); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateDepartmentAction(id, { isActive }).then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sa-departments'] }),
  });

  const assignAdmin = useMutation({
    mutationFn: ({ deptId, email }: { deptId: string; email: string }) => assignDepartmentAdminAction(deptId, email).then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sa-departments'] }); setAssignDeptId(null); setAssignEmail(''); },
  });

  const removeAdmin = useMutation({
    mutationFn: ({ deptId, userId }: { deptId: string; userId: string }) => removeDepartmentAdminAction(deptId, userId).then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sa-departments'] }),
  });

  const departments = (data || []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">Departments</h2><p className="text-muted-foreground">Create and manage departments, assign admins</p></div>
        <Button onClick={() => setShowAdd(!showAdd)}><Plus className="h-4 w-4 mr-2" /> Add Department</Button>
      </div>

      {showAdd && (<Card><CardContent className="p-4"><form onSubmit={(e) => { e.preventDefault(); createDept.mutate(newName); }} className="flex gap-3"><Input placeholder="Department name" value={newName} onChange={(e) => setNewName(e.target.value)} required /><Button type="submit" disabled={createDept.isPending}>{createDept.isPending ? 'Creating...' : 'Create'}</Button><Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button></form>{createDept.error ? <p className="text-sm text-destructive mt-2">{createDept.error.message}</p> : null}</CardContent></Card>)}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />)}</div>
      ) : (
        <div className="space-y-4">
          {departments.map((dept) => {
            const admins = (dept.departmentAdmins || []) as Array<{ user: { email: string }; userId: string }>;
            const counts = dept._count as { users: number; costCenters: number };
            return (
              <Card key={dept.id as string}><CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{dept.name as string}</h3>
                    <Badge className={dept.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{dept.isActive ? 'Active' : 'Inactive'}</Badge>
                    <span className="text-xs text-muted-foreground">{counts.users} users · {counts.costCenters} cost centers</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toggleActive.mutate({ id: dept.id as string, isActive: !dept.isActive })}>{dept.isActive ? 'Deactivate' : 'Activate'}</Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">Admins:</span>
                    {admins.length === 0 ? <span className="text-sm text-muted-foreground">None assigned</span> : null}
                    {admins.map((a) => (<div key={a.userId} className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">{a.user.email}<button onClick={() => removeAdmin.mutate({ deptId: dept.id as string, userId: a.userId })} className="text-destructive hover:text-destructive/80 ml-1"><X className="h-3 w-3" /></button></div>))}
                    <Button variant="ghost" size="sm" onClick={() => setAssignDeptId(dept.id as string)} className="h-7 text-xs"><UserPlus className="h-3 w-3 mr-1" /> Assign</Button>
                  </div>
                  {assignDeptId === dept.id ? (
                    <div className="flex items-center gap-2 mt-2">
                      <UserSearchCombobox placeholder="Search user to assign..." disabled={assignAdmin.isPending} onSelect={(user) => setAssignEmail(user.email)} />
                      <Button size="sm" disabled={assignAdmin.isPending || !assignEmail} onClick={() => assignAdmin.mutate({ deptId: dept.id as string, email: assignEmail })}>{assignAdmin.isPending ? 'Assigning...' : 'Assign'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAssignDeptId(null); setAssignEmail(''); }}>Cancel</Button>
                      {assignAdmin.error ? <span className="text-xs text-destructive self-center">{assignAdmin.error.message}</span> : null}
                    </div>
                  ) : null}
                </div>
              </CardContent></Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
