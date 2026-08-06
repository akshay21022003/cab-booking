'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatTime } from '@/lib/utils';
import { CheckCircle, XCircle } from 'lucide-react';
import { getAdminChangeRequests, getAdminDepartments, approveChangeRequestAction, rejectChangeRequestAction } from '@/lib/actions';

export default function AdminChangeRequestsPage() {
  const [page, setPage] = useState(1);
  const [departmentId, setDepartmentId] = useState('');
  const queryClient = useQueryClient();

  // Include today's date so pending requests refresh on day change
  const todayKey = new Date().toISOString().split('T')[0];

  const { data: deptResponse } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => getAdminDepartments(),
  });
  const deptData = deptResponse?.isSuperAdmin ? deptResponse.data : null;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-change-requests', todayKey, page, departmentId],
    queryFn: () => getAdminChangeRequests({ page, status: 'PENDING', departmentId: departmentId || undefined }).then(r => { if (!r.success) throw new Error(r.error?.message); return r; }),
    staleTime: 0,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveChangeRequestAction(id, 'Approved').then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-change-requests'] }); queryClient.invalidateQueries({ queryKey: ['admin-bookings'] }); },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectChangeRequestAction(id, 'Rejected').then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-change-requests'] }),
  });

  const changeRequests = (data?.data || []) as Record<string, unknown>[];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">Change Requests</h2><p className="text-muted-foreground">Review and approve/reject employee change requests</p></div>

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

      {isLoading && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-md" />)}</div>}

      {!isLoading && changeRequests.length === 0 && (
        <Card><CardContent className="p-12 text-center text-muted-foreground"><CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" /><p>No pending change requests. All caught up!</p></CardContent></Card>
      )}

      {changeRequests.map((cr) => {
        const booking = cr.booking as Record<string, unknown>;
        const crUser = cr.user as Record<string, string>;
        const fieldMap: Record<string, string> = { PICKUP_LOCATION: 'pickupLocation', DROP_LOCATION: 'dropLocation', PICKUP_TIME: 'pickupTime', DROP_TIME: 'dropTime' };
        const originalField = fieldMap[cr.requestedField as string];
        const originalValue = originalField ? (booking[originalField] as string) || 'N/A' : 'N/A';

        return (
          <Card key={cr.id as string} className="border-orange-200"><CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2"><span className="font-medium">{crUser.email}</span><Badge className="bg-orange-100 text-orange-800">Pending</Badge></div>
                <div className="text-sm"><span className="text-muted-foreground">Booking:</span> {formatDate(booking.bookingDate as string)}{booking.pickupTime ? ` at ${formatTime(booking.pickupTime as string)}` : ''} ({booking.bookingType as string})</div>
                <div className="text-sm bg-muted p-2 rounded">
                  {['CANCEL_BOOKING', 'CANCEL_PICKUP', 'CANCEL_DROP'].includes(cr.requestedField as string) ? (
                    <span className="text-destructive font-medium">{cr.requestedField === 'CANCEL_BOOKING' ? 'Cancel entire booking' : cr.requestedField === 'CANCEL_PICKUP' ? 'Cancel pickup only' : 'Cancel drop only'}</span>
                  ) : (
                    <><span className="text-muted-foreground">Change </span><span className="font-medium">{(cr.requestedField as string).replace(/_/g, ' ').toLowerCase()}</span><br /><span className="text-muted-foreground">From: </span><span>{originalValue}</span><br /><span className="text-muted-foreground">To: </span><span className="font-medium">{cr.requestedValue as string}</span></>
                  )}
                </div>
                {cr.reason ? <div className="text-sm text-muted-foreground">Reason: {cr.reason as string}</div> : null}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={() => approveMutation.mutate(cr.id as string)} disabled={approveMutation.isPending || rejectMutation.isPending}><CheckCircle className="h-4 w-4 mr-1" /> Approve</Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => rejectMutation.mutate(cr.id as string)} disabled={approveMutation.isPending || rejectMutation.isPending}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
              </div>
            </div>
          </CardContent></Card>
        );
      })}

      {pagination && (pagination as { pages: number }).pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Showing {((pagination as { page: number }).page - 1) * (pagination as { limit: number }).limit + 1}-{Math.min((pagination as { page: number }).page * (pagination as { limit: number }).limit, (pagination as { total: number }).total)} of {(pagination as { total: number }).total}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= (pagination as { pages: number }).pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>
        </div>
      )}
    </div>
  );
}
