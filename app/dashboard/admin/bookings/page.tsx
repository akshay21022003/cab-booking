'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatTime } from '@/lib/utils';
import { getAdminBookings, getAdminDepartments } from '@/lib/actions';

export default function AdminBookingsPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  // Include today's date so data refreshes on day change
  const todayKey = new Date().toISOString().split('T')[0];

  const { data: deptResponse } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => getAdminDepartments(),
  });
  const deptData = deptResponse?.isSuperAdmin ? deptResponse.data : null;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bookings', todayKey, page, startDate, endDate, departmentId],
    queryFn: () => getAdminBookings({ page, startDate: startDate || undefined, endDate: endDate || undefined, departmentId: departmentId || undefined }).then(r => { if (!r.success) throw new Error(r.error?.message); return r; }),
    staleTime: 0,
  });

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">All Bookings</h2>
        <p className="text-muted-foreground">View department bookings for facility coordination</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1"><label className="text-xs font-medium">From</label><Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-40" /></div>
        <div className="space-y-1"><label className="text-xs font-medium">To</label><Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="w-40" /></div>
        {deptData && (
          <div className="space-y-1"><label className="text-xs font-medium">Department</label>
            <select className="block h-10 rounded-md border px-3 text-sm" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
              <option value="">All Departments</option>
              {(deptData as Record<string, unknown>[]).map((d) => <option key={d.id as string} value={d.id as string}>{d.name as string}</option>)}
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="text-left p-3 font-medium">Employee</th><th className="text-left p-3 font-medium">Date</th><th className="text-left p-3 font-medium">Type</th><th className="text-left p-3 font-medium">Pickup</th><th className="text-left p-3 font-medium">Drop</th><th className="text-left p-3 font-medium">Change</th></tr></thead>
            <tbody>
              {(data?.data as Record<string, unknown>[] | undefined)?.map((booking) => {
                const hasPendingChange = Array.isArray(booking.changeRequests) && booking.changeRequests.length > 0;
                return (
                  <tr key={booking.id as string} className="border-t">
                    <td className="p-3"><div className="font-medium">{(booking.user as Record<string, string>)?.email}</div></td>
                    <td className="p-3">{formatDate(booking.bookingDate as string)}</td>
                    <td className="p-3"><Badge className="bg-blue-100 text-blue-800">{booking.bookingType as string}</Badge></td>
                    <td className="p-3">{booking.pickupLocation ? <div><div className="truncate max-w-[130px]">{booking.pickupLocation as string}</div><div className="text-xs text-muted-foreground">{formatTime(booking.pickupTime as string)}</div></div> : <span className="text-muted-foreground">-</span>}</td>
                    <td className="p-3">{booking.dropLocation ? <div><div className="truncate max-w-[130px]">{booking.dropLocation as string}</div><div className="text-xs text-muted-foreground">{formatTime(booking.dropTime as string)}</div></div> : <span className="text-muted-foreground">-</span>}</td>
                    <td className="p-3">{hasPendingChange ? <Badge className="bg-orange-100 text-orange-800">Pending</Badge> : <span className="text-muted-foreground">-</span>}</td>
                  </tr>
                );
              })}
              {(!data?.data || (data.data as unknown[]).length === 0) && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No bookings found.</td></tr>}
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
