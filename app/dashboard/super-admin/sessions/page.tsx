'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Trash2 } from 'lucide-react';
import { getSuperAdminSessions, revokeSessionAction, revokeAllUserSessionsAction } from '@/lib/actions';

export default function SessionsPage() {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sa-sessions'],
    queryFn: () => getSuperAdminSessions().then(r => r.data || []),
    staleTime: 0,
  });

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => revokeSessionAction(sessionId).then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sa-sessions'] }),
  });

  const revokeAllForUser = useMutation({
    mutationFn: (userId: string) => revokeAllUserSessionsAction(userId).then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sa-sessions'] }),
  });

  const groupedByUser: Record<string, { user: { email: string }; sessions: Array<Record<string, unknown>> }> = {};
  for (const session of ((sessions || []) as Record<string, unknown>[])) {
    const userId = session.userId as string;
    if (!groupedByUser[userId]) { groupedByUser[userId] = { user: session.user as { email: string }, sessions: [] }; }
    groupedByUser[userId].sessions.push(session);
  }

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">Session Management</h2><p className="text-muted-foreground">View active sessions and revoke access. Sessions persist until revoked here.</p></div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Shield className="h-4 w-4" /><span>{((sessions || []) as unknown[]).length} active session(s) across {Object.keys(groupedByUser).length} user(s)</span></div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />)}</div>
      ) : Object.keys(groupedByUser).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No active sessions.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByUser).map(([userId, { user, sessions: userSessions }]) => (
            <Card key={userId}><CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div><span className="font-medium">{user.email}</span><Badge className="ml-2 bg-blue-100 text-blue-800">{userSessions.length} session(s)</Badge></div>
                <Button variant="destructive" size="sm" onClick={() => revokeAllForUser.mutate(userId)} disabled={revokeAllForUser.isPending}>Revoke All</Button>
              </div>
              <div className="space-y-2">
                {userSessions.map((s) => (
                  <div key={s.id as string} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-sm">
                    <div><span className="font-mono text-xs text-muted-foreground">{(s.token as string).slice(0, 8)}...{(s.token as string).slice(-8)}</span><span className="text-xs text-muted-foreground ml-3">Created: {new Date(s.createdAt as string).toLocaleString()}</span></div>
                    <Button variant="ghost" size="sm" onClick={() => revokeSession.mutate(s.id as string)} disabled={revokeSession.isPending} className="text-destructive h-7"><Trash2 className="h-3 w-3 mr-1" /> Revoke</Button>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
