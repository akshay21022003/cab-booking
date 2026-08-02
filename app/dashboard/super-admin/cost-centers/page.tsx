'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

export default function CostCentersPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', code: '', departmentId: '' });
  const queryClient = useQueryClient();

  const { data: costCenters, isLoading } = useQuery({
    queryKey: ['sa-cost-centers'],
    queryFn: async () => {
      const res = await fetch('/api/v1/super-admin/cost-centers');
      return (await res.json()).data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['sa-departments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/super-admin/departments');
      return (await res.json()).data || [];
    },
  });

  const createCC = useMutation({
    mutationFn: async (data: { name: string; code: string; departmentId: string }) => {
      const res = await fetch('/api/v1/super-admin/cost-centers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sa-cost-centers'] });
      setShowAdd(false);
      setFormData({ name: '', code: '', departmentId: '' });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/v1/super-admin/cost-centers/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sa-cost-centers'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cost Centers</h2>
          <p className="text-muted-foreground">Manage cost centers per department</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-2" /> Add Cost Center
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={(e) => { e.preventDefault(); createCC.mutate(formData); }}
              className="grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              <Input placeholder="Name (e.g. IT Operations)" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              <Input placeholder="Code (e.g. IT-003)" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} required />
              <select
                className="h-10 rounded-md border px-3 text-sm"
                value={formData.departmentId}
                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                required
              >
                <option value="">Select Department</option>
                {(departments || []).map((d: Record<string, unknown>) => (
                  <option key={d.id as string} value={d.id as string}>{d.name as string}</option>
                ))}
              </select>
              <div className="md:col-span-3 flex gap-3">
                <Button type="submit" disabled={createCC.isPending}>{createCC.isPending ? 'Creating...' : 'Create'}</Button>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
              {createCC.error ? <p className="md:col-span-3 text-sm text-destructive">{createCC.error.message}</p> : null}
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Code</th>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Department</th>
                <th className="text-left p-3 font-medium">Users</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(costCenters || []).map((cc: Record<string, unknown>) => {
                const counts = cc._count as { users: number };
                return (
                  <tr key={cc.id as string} className="border-t">
                    <td className="p-3 font-mono font-medium">{cc.code as string}</td>
                    <td className="p-3">{cc.name as string}</td>
                    <td className="p-3">{(cc.department as Record<string, string>)?.name}</td>
                    <td className="p-3">{counts.users}</td>
                    <td className="p-3">
                      <Badge className={cc.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {cc.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => toggleActive.mutate({ id: cc.id as string, isActive: !cc.isActive })}
                      >
                        {cc.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {(!costCenters || costCenters.length === 0) && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No cost centers.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
