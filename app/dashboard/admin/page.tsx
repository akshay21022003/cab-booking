'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Car, AlertCircle, Users } from 'lucide-react';

export default function AdminDashboardPage() {
  const { data: bookingsData } = useQuery({
    queryKey: ['admin-bookings-overview'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/bookings?page=1');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json;
    },
  });

  const { data: changeRequestsData } = useQuery({
    queryKey: ['admin-pending-changes'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/change-requests?status=PENDING');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json;
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin-users-count'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/users');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json;
    },
  });

  const totalBookings = bookingsData?.pagination?.total || 0;
  const pendingChanges = changeRequestsData?.data?.length || 0;
  const totalUsers = usersData?.data?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <p className="text-muted-foreground">Overview of department activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Bookings" value={totalBookings} icon={Car} description="Active bookings" />
        <StatCard title="Pending Changes" value={pendingChanges} icon={AlertCircle} description="Need your review" />
        <StatCard title="Employees" value={totalUsers} icon={Users} description="In department" />
      </div>

      {pendingChanges > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-orange-800">
              You have {pendingChanges} pending change request(s) that need review.
            </p>
            <a
              href="/dashboard/admin/change-requests"
              className="text-sm text-orange-600 hover:underline mt-1 inline-block"
            >
              Review now →
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, description,
}: {
  title: string; value: number; icon: React.ElementType; description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
