'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Building2, Shield, DollarSign } from 'lucide-react';
import { getSuperAdminDepartments, getSuperAdminCostCenters, getSuperAdminSessions } from '@/lib/actions';

export default function SuperAdminPage() {
  const { data: deptData } = useQuery({
    queryKey: ['sa-departments'],
    queryFn: () => getSuperAdminDepartments().then(r => r.data || []),
  });

  const { data: ccData } = useQuery({
    queryKey: ['sa-cost-centers'],
    queryFn: () => getSuperAdminCostCenters().then(r => r.data || []),
  });

  const { data: sessionsData } = useQuery({
    queryKey: ['sa-sessions'],
    queryFn: () => getSuperAdminSessions().then(r => r.data || []),
  });

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">System Administration</h2><p className="text-muted-foreground">Manage departments, cost centers, and sessions</p></div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/dashboard/super-admin/departments"><Card className="hover:border-primary/50 transition-colors cursor-pointer"><CardHeader><Building2 className="h-8 w-8 text-primary mb-2" /><CardTitle className="text-lg">Departments</CardTitle><CardDescription>{(deptData as unknown[] | undefined)?.length || 0} department(s)</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">Create, edit, assign admins</p></CardContent></Card></Link>
        <Link href="/dashboard/super-admin/cost-centers"><Card className="hover:border-primary/50 transition-colors cursor-pointer"><CardHeader><DollarSign className="h-8 w-8 text-primary mb-2" /><CardTitle className="text-lg">Cost Centers</CardTitle><CardDescription>{(ccData as unknown[] | undefined)?.length || 0} cost center(s)</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">Create and manage cost centers</p></CardContent></Card></Link>
        <Link href="/dashboard/super-admin/sessions"><Card className="hover:border-primary/50 transition-colors cursor-pointer"><CardHeader><Shield className="h-8 w-8 text-primary mb-2" /><CardTitle className="text-lg">Sessions</CardTitle><CardDescription>{(sessionsData as unknown[] | undefined)?.length || 0} active session(s)</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">View and revoke user sessions</p></CardContent></Card></Link>
      </div>
    </div>
  );
}
