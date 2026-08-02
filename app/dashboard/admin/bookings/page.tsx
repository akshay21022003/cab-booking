'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatTime } from '@/lib/utils';

export default function AdminBookingsPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  // Fetch departments for super admin filter
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
  if (startDate) queryParams.set('start_date', startDate);
  if (endDate) queryParams.set('end_date', endDate);
  if (departmentId) queryParams.set('department_id', departmentId);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bookings', page, startDate, endDate, departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/bookings?${queryParams.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json;
    },
  });

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">All Bookings</h2>
        <p className="text-muted-foreground">View department bookings for facility coordination</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium">From</label>
          <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">To</label>
          <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="w-40" />
        </div>
        {deptData && (
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
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Employee</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Pickup</th>
                <th className="text-left p-3 font-medium">Drop</th>
                <th className="text-left p-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {data?.data?.map((booking: Record<string, unknown>) => {
                const hasPendingChange = Array.isArray(booking.changeRequests) && booking.changeRequests.length > 0;
                return (
                  <tr key={booking.id as string} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{(booking.user as Record<string, string>)?.name}</div>
                      <div className="text-xs text-muted-foreground">{(booking.user as Record<string, string>)?.employeeId}</div>
                    </td>
                    <td className="p-3">{formatDate(booking.bookingDate as string)}</td>
                    <td className="p-3"><Badge className="bg-blue-100 text-blue-800">{booking.bookingType as string}</Badge></td>
                    <td className="p-3">
                      {booking.pickupLocation ? (
                        <div><div className="truncate max-w-[130px]">{booking.pickupLocation as string}</div><div className="text-xs text-muted-foreground">{formatTime(booking.pickupTime as string)}</div></div>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-3">
                      {booking.dropLocation ? (
                        <div><div className="truncate max-w-[130px]">{booking.dropLocation as string}</div><div className="text-xs text-muted-foreground">{formatTime(booking.dropTime as string)}</div></div>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-3">
                      {hasPendingChange ? <Badge className="bg-orange-100 text-orange-800">Pending</Badge> : <span className="text-muted-foreground">-</span>}
                    </td>
                  </tr>
                );
              })}
              {(!data?.data || data.data.length === 0) && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No bookings found.</td></tr>
              )}
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
