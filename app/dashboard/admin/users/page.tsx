'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { UserPlus, Pencil, X } from 'lucide-react';

export default function AdminUsersPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Record<string, unknown> | null>(null);
  const [page, setPage] = useState(1);
  const [departmentId, setDepartmentId] = useState('');
  const queryClient = useQueryClient();

  const { data: deptResponse } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/departments');
      if (!res.ok) return null;
      return await res.json();
    },
  });
  const deptData = deptResponse?.isSuperAdmin ? deptResponse.data : null;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  if (departmentId) queryParams.set('department_id', departmentId);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/users?${queryParams.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json;
    },
  });

  const createUser = useMutation({
    mutationFn: async (userData: Record<string, string>) => {
      const res = await fetch('/api/v1/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json.data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); setShowAddForm(false); },
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, string> }) => {
      const res = await fetch(`/api/v1/admin/users/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json.data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); setEditingUser(null); },
  });

  const users = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Manage Users</h2>
          <p className="text-muted-foreground">Add and manage employees</p>
        </div>
        <Button onClick={() => { setShowAddForm(!showAddForm); setEditingUser(null); }}>
          <UserPlus className="h-4 w-4 mr-2" /> Add User
        </Button>
      </div>

      {/* Filters */}
      {deptData && (
        <div className="flex gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium">Department</label>
            <select
              className="block h-10 rounded-md border px-3 text-sm"
              value={departmentId}
              onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
            >
              <option value="">All Departments</option>
              {deptData.map((d: Record<string, unknown>) => (
                <option key={d.id as string} value={d.id as string}>{d.name as string}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Add New Employee</CardTitle></CardHeader>
          <CardContent>
            <UserForm onSubmit={(d) => createUser.mutate(d)} onCancel={() => setShowAddForm(false)} isLoading={createUser.isPending} error={createUser.error?.message} />
          </CardContent>
        </Card>
      )}

      {/* Edit Form */}
      {editingUser && (
        <Card className="border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Edit: {editingUser.name as string}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setEditingUser(null)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <UserForm initialData={editingUser} onSubmit={(d) => updateUser.mutate({ id: editingUser.id as string, data: d })} onCancel={() => setEditingUser(null)} isLoading={updateUser.isPending} error={updateUser.error?.message} isEdit />
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">ID</th>
                <th className="text-left p-3 font-medium">Facility</th>
                <th className="text-left p-3 font-medium">Cost Center</th>
                <th className="text-left p-3 font-medium">Pickup</th>
                <th className="text-left p-3 font-medium">Drop</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: Record<string, unknown>) => (
                <tr key={u.id as string} className="border-t">
                  <td className="p-3 font-medium">{u.name as string}</td>
                  <td className="p-3 font-mono text-xs">{u.employeeId as string}</td>
                  <td className="p-3"><Badge className="bg-blue-100 text-blue-800">{(u.cabFacility as string).replace('_', ' ')}</Badge></td>
                  <td className="p-3">{(u.costCenter as Record<string, string>)?.code || '-'}</td>
                  <td className="p-3 text-muted-foreground text-xs max-w-[100px] truncate">{(u.defaultPickupLocation as string) || '-'}</td>
                  <td className="p-3 text-muted-foreground text-xs max-w-[100px] truncate">{(u.defaultDropLocation as string) || '-'}</td>
                  <td className="p-3"><Badge className={u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="p-3"><Button variant="ghost" size="sm" onClick={() => { setEditingUser(u); setShowAddForm(false); }}><Pencil className="h-3 w-3 mr-1" /> Edit</Button></td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserForm({
  initialData, onSubmit, onCancel, isLoading, error, isEdit = false,
}: {
  initialData?: Record<string, unknown>;
  onSubmit: (data: Record<string, string>) => void;
  onCancel: () => void;
  isLoading: boolean;
  error?: string;
  isEdit?: boolean;
}) {
  const [formData, setFormData] = useState({
    employeeId: (initialData?.employeeId as string) || '',
    name: (initialData?.name as string) || '',
    email: (initialData?.email as string) || '',
    cabFacility: (initialData?.cabFacility as string) || 'BOTH',
    defaultPickupLocation: (initialData?.defaultPickupLocation as string) || '',
    defaultPickupTime: (initialData?.defaultPickupTime as string) || '',
    defaultDropLocation: (initialData?.defaultDropLocation as string) || '',
    defaultDropTime: (initialData?.defaultDropTime as string) || '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ ...formData, employeeId: formData.employeeId.toUpperCase() });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Employee ID *</label>
        <Input placeholder="e.g. EMP004" value={formData.employeeId} onChange={(e) => setFormData({ ...formData, employeeId: e.target.value.toUpperCase() })} required disabled={isEdit} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Full Name *</label>
        <Input placeholder="e.g. John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Email</label>
        <Input type="email" placeholder="e.g. john@company.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Cab Facility *</label>
        <select className="h-10 w-full rounded-md border px-3 text-sm" value={formData.cabFacility} onChange={(e) => setFormData({ ...formData, cabFacility: e.target.value })}>
          <option value="BOTH">Both (Pickup & Drop)</option>
          <option value="PICKUP_ONLY">Pickup Only</option>
          <option value="DROP_ONLY">Drop Only</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Pickup Location</label>
        <Input placeholder="e.g. HQ Main Gate" value={formData.defaultPickupLocation} onChange={(e) => setFormData({ ...formData, defaultPickupLocation: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Pickup Time</label>
        <Input type="time" value={formData.defaultPickupTime} onChange={(e) => setFormData({ ...formData, defaultPickupTime: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Drop Location</label>
        <Input placeholder="e.g. Tech Park B2" value={formData.defaultDropLocation} onChange={(e) => setFormData({ ...formData, defaultDropLocation: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Drop Time</label>
        <Input type="time" value={formData.defaultDropTime} onChange={(e) => setFormData({ ...formData, defaultDropTime: e.target.value })} />
      </div>
      {error ? <div className="md:col-span-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div> : null}
      <div className="md:col-span-2 flex gap-3">
        <Button type="submit" disabled={isLoading}>{isLoading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Add Employee')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
