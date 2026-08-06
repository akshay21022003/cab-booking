'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { UserPlus, Pencil, X } from 'lucide-react';
import { getAdminUsers, getAdminDepartments, getAdminCostCenters, createUserAction, updateUserAction } from '@/lib/actions';

export default function AdminUsersPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Record<string, unknown> | null>(null);
  const [page, setPage] = useState(1);
  const [departmentId, setDepartmentId] = useState('');
  const queryClient = useQueryClient();

  const { data: deptResponse } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => getAdminDepartments(),
  });
  const deptData = deptResponse?.isSuperAdmin ? deptResponse.data : null;

  const { data: costCentersResponse } = useQuery({
    queryKey: ['admin-cost-centers'],
    queryFn: () => getAdminCostCenters().then(r => { if (!r.success) throw new Error(r.error?.message); return r.data || []; }),
  });
  const costCenters = (costCentersResponse || []) as { id: string; name: string; code: string; departmentId: string }[];

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, departmentId],
    queryFn: () => getAdminUsers({ page, departmentId: departmentId || undefined }).then(r => { if (!r.success) throw new Error(r.error?.message); return r; }),
  });

  const createUser = useMutation({
    mutationFn: (userData: Record<string, string>) => createUserAction(userData).then(r => { if (!r.success) throw new Error(r.error?.message); return r.data; }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); setShowAddForm(false); },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) => updateUserAction(id, data).then(r => { if (!r.success) throw new Error(r.error?.message); return r.data; }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); setEditingUser(null); },
  });

  const users = (data?.data || []) as Record<string, unknown>[];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">Manage Users</h2><p className="text-muted-foreground">Add and manage employees</p></div>
        <Button onClick={() => { setShowAddForm(!showAddForm); setEditingUser(null); }}><UserPlus className="h-4 w-4 mr-2" /> Add User</Button>
      </div>

      {deptData && (
        <div className="flex gap-3 items-end">
          <div className="space-y-1"><label className="text-xs font-medium">Department</label>
            <select className="block h-10 rounded-md border px-3 text-sm" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
              <option value="">All Departments</option>
              {(deptData as Record<string, unknown>[]).map((d) => <option key={d.id as string} value={d.id as string}>{d.name as string}</option>)}
            </select>
          </div>
        </div>
      )}

      {showAddForm && (<Card><CardHeader><CardTitle className="text-lg">Add New Employee</CardTitle></CardHeader><CardContent><UserForm costCenters={costCenters} onSubmit={(d) => createUser.mutate(d)} onCancel={() => setShowAddForm(false)} isLoading={createUser.isPending} error={createUser.error?.message} /></CardContent></Card>)}

      {editingUser && (<Card className="border-blue-200"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg">Edit: {editingUser.email as string}</CardTitle><Button variant="ghost" size="icon" onClick={() => setEditingUser(null)}><X className="h-4 w-4" /></Button></CardHeader><CardContent><UserForm costCenters={costCenters} initialData={editingUser} onSubmit={(d) => updateUser.mutate({ id: editingUser.id as string, data: d })} onCancel={() => setEditingUser(null)} isLoading={updateUser.isPending} error={updateUser.error?.message} isEdit /></CardContent></Card>)}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="text-left p-3 font-medium">Email</th><th className="text-left p-3 font-medium">Facility</th><th className="text-left p-3 font-medium">Cost Center</th><th className="text-left p-3 font-medium">Pickup</th><th className="text-left p-3 font-medium">Drop</th><th className="text-left p-3 font-medium">Status</th><th className="text-left p-3 font-medium">Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id as string} className="border-t">
                  <td className="p-3 font-medium">{u.email as string}</td>
                  <td className="p-3"><Badge className="bg-blue-100 text-blue-800">{(u.cabFacility as string).replace('_', ' ')}</Badge></td>
                  <td className="p-3">{(u.costCenter as Record<string, string>)?.code || '-'}</td>
                  <td className="p-3 text-muted-foreground text-xs max-w-[100px] truncate">{(u.defaultPickupLocation as string) || '-'}</td>
                  <td className="p-3 text-muted-foreground text-xs max-w-[100px] truncate">{(u.defaultDropLocation as string) || '-'}</td>
                  <td className="p-3"><Badge className={u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="p-3"><Button variant="ghost" size="sm" onClick={() => { setEditingUser(u); setShowAddForm(false); }}><Pencil className="h-3 w-3 mr-1" /> Edit</Button></td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {pagination && (pagination as { pages: number }).pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Showing {((pagination as { page: number }).page - 1) * (pagination as { limit: number }).limit + 1}-{Math.min((pagination as { page: number }).page * (pagination as { limit: number }).limit, (pagination as { total: number }).total)} of {(pagination as { total: number }).total}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= (pagination as { pages: number }).pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>
        </div>
      )}
    </div>
  );
}

function UserForm({ initialData, costCenters, onSubmit, onCancel, isLoading, error, isEdit = false }: { initialData?: Record<string, unknown>; costCenters: { id: string; name: string; code: string; departmentId: string }[]; onSubmit: (data: Record<string, string>) => void; onCancel: () => void; isLoading: boolean; error?: string; isEdit?: boolean }) {
  const [formData, setFormData] = useState({
    email: (initialData?.email as string) || '', cabFacility: (initialData?.cabFacility as string) || 'BOTH',
    costCenterId: (initialData?.costCenter as Record<string, string>)?.id || (initialData?.costCenterId as string) || '',
    defaultPickupLocation: (initialData?.defaultPickupLocation as string) || '', defaultPickupTime: (initialData?.defaultPickupTime as string) || '',
    defaultDropLocation: (initialData?.defaultDropLocation as string) || '', defaultDropTime: (initialData?.defaultDropTime as string) || '',
  });

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); onSubmit(formData); }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2"><label className="text-sm font-medium">Email *</label><Input type="email" placeholder="e.g. john@company.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required disabled={isEdit} /></div>
      <div className="space-y-2"><label className="text-sm font-medium">Cab Facility *</label><select className="h-10 w-full rounded-md border px-3 text-sm" value={formData.cabFacility} onChange={(e) => setFormData({ ...formData, cabFacility: e.target.value })}><option value="BOTH">Both (Pickup & Drop)</option><option value="PICKUP_ONLY">Pickup Only</option><option value="DROP_ONLY">Drop Only</option></select></div>
      <div className="space-y-2"><label className="text-sm font-medium">Cost Center</label><select className="h-10 w-full rounded-md border px-3 text-sm" value={formData.costCenterId} onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}><option value="">No Cost Center</option>{costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>)}</select></div>
      <div className="space-y-2"><label className="text-sm font-medium">Default Pickup Location</label><Input placeholder="e.g. HQ Main Gate" value={formData.defaultPickupLocation} onChange={(e) => setFormData({ ...formData, defaultPickupLocation: e.target.value })} /></div>
      <div className="space-y-2"><label className="text-sm font-medium">Default Pickup Time</label><Input type="time" value={formData.defaultPickupTime} onChange={(e) => setFormData({ ...formData, defaultPickupTime: e.target.value })} /></div>
      <div className="space-y-2"><label className="text-sm font-medium">Default Drop Location</label><Input placeholder="e.g. Tech Park B2" value={formData.defaultDropLocation} onChange={(e) => setFormData({ ...formData, defaultDropLocation: e.target.value })} /></div>
      <div className="space-y-2"><label className="text-sm font-medium">Default Drop Time</label><Input type="time" value={formData.defaultDropTime} onChange={(e) => setFormData({ ...formData, defaultDropTime: e.target.value })} /></div>
      {error ? <div className="md:col-span-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div> : null}
      <div className="md:col-span-2 flex gap-3"><Button type="submit" disabled={isLoading}>{isLoading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Add Employee')}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
