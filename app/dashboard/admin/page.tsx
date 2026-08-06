'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Car, AlertCircle, Users } from 'lucide-react';
import { getAdminBookings, getAdminChangeRequests, getAdminUsers } from '@/lib/actions';

export default function AdminDashboardPage() {
  // Include today's date so overview stats refresh on day change
  const todayKey = new Date().toISOString().split('T')[0];

  const { data: bookingsData } = useQuery({
    queryKey: ['admin-bookings-overview', todayKey],
    queryFn: () => getAdminBookings({ page: 1 }),
    staleTime: 0,
  });

  const { data: changeRequestsData } = useQuery({
    queryKey: ['admin-pending-changes', todayKey],
    queryFn: () => getAdminChangeRequests({ status: 'PENDING' }),
    staleTime: 0,
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin-users-count'],
    queryFn: () => getAdminUsers({}),
  });

  const totalBookings = (bookingsData?.pagination as { total: number } | undefined)?.total || 0;
  const pendingChanges = (changeRequestsData?.data as unknown[] | undefined)?.length || 0;
  const totalUsers = (usersData?.data as unknown[] | undefined)?.length || 0;

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">Admin Dashboard</h2><p className="text-muted-foreground">Overview of department activity</p></div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Bookings" value={totalBookings} icon={Car} description="Active bookings" />
        <StatCard title="Pending Changes" value={pendingChanges} icon={AlertCircle} description="Need your review" />
        <StatCard title="Employees" value={totalUsers} icon={Users} description="In department" />
      </div>

      {pendingChanges > 0 && (
        <Card className="border-orange-200 bg-orange-50"><CardContent className="p-4">
          <p className="text-sm font-medium text-orange-800">You have {pendingChanges} pending change request(s) that need review.</p>
          <a href="/dashboard/admin/change-requests" className="text-sm text-orange-600 hover:underline mt-1 inline-block">Review now →</a>
        </CardContent></Card>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, description }: { title: string; value: number; icon: React.ElementType; description: string }) {
  return (
    <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">{description}</p></CardContent></Card>
  );
}
