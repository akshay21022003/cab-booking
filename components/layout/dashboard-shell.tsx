'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SessionUser, Role } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Car,
  Users,
  FileSpreadsheet,
  Bell,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Building2,
  DollarSign,
  Shield,
} from 'lucide-react';

interface DashboardShellProps {
  user: SessionUser;
  children: React.ReactNode;
}

interface NavSection {
  title: string;
  items: { href: string; label: string; icon: React.ElementType }[];
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navSections = getNavSections(user.highestRole);

  async function handleLogout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col h-screen sticky top-0">
        {/* Brand */}
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            ClariCab
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-3 mb-2">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User info + Logout */}
        <div className="p-3 border-t bg-muted/30">
          <div className="px-3 mb-2">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.employeeId}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto h-screen bg-muted/20 p-6">{children}</main>
    </div>
  );
}

function getNavSections(role: string): NavSection[] {
  const sections: NavSection[] = [];

  // Everyone gets My Bookings
  sections.push({
    title: 'Employee',
    items: [
      { href: '/dashboard/user', label: 'My Bookings', icon: Car },
    ],
  });

  // Admin section
  if (role === Role.DEPARTMENT_ADMIN || role === Role.SUPER_ADMIN) {
    sections.push({
      title: 'Admin',
      items: [
        { href: '/dashboard/admin/bookings', label: 'All Bookings', icon: ClipboardList },
        { href: '/dashboard/admin/change-requests', label: 'Change Requests', icon: Bell },
        { href: '/dashboard/admin/users', label: 'Users', icon: Users },
        { href: '/dashboard/admin/export', label: 'Export', icon: FileSpreadsheet },
      ],
    });
  }

  // Super Admin section
  if (role === Role.SUPER_ADMIN) {
    sections.push({
      title: 'System',
      items: [
        { href: '/dashboard/super-admin/departments', label: 'Departments', icon: Building2 },
        { href: '/dashboard/super-admin/cost-centers', label: 'Cost Centers', icon: DollarSign },
        { href: '/dashboard/super-admin/sessions', label: 'Sessions', icon: Shield },
      ],
    });
  }

  return sections;
}
