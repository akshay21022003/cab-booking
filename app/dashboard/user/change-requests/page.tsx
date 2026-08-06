'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatTime } from '@/lib/utils';
import { Trash2, Inbox } from 'lucide-react';
import { getMyChangeRequests, deleteChangeRequestAction } from '@/lib/actions';

export default function UserChangeRequestsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-change-requests', page],
    queryFn: () => getMyChangeRequests(page).then(r => { if (!r.success) throw new Error(r.error?.message); return r; }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChangeRequestAction(id).then(r => { if (!r.success) throw new Error(r.error?.message); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });

  const changeRequests = (data?.data || []) as Record<string, unknown>[];
  const pagination = data?.pagination;

  function getStatusBadge(status: string) {
    switch (status) {
      case 'PENDING': return <Badge className="bg-orange-100 text-orange-800">Pending</Badge>;
      case 'APPROVED': return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'REJECTED': return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Change Requests</h2>
        <p className="text-muted-foreground">View and manage your booking change requests</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      )}

      {!isLoading && changeRequests.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No change requests yet.</p>
          </CardContent>
        </Card>
      )}

      {changeRequests.map((cr) => {
        const booking = cr.booking as Record<string, unknown>;
        const status = cr.status as string;
        const isPending = status === 'PENDING';

        const fieldMap: Record<string, string> = {
          PICKUP_LOCATION: 'pickupLocation', DROP_LOCATION: 'dropLocation',
          PICKUP_TIME: 'pickupTime', DROP_TIME: 'dropTime',
        };
        const originalField = fieldMap[cr.requestedField as string];
        const originalValue = originalField ? (booking[originalField] as string) || 'N/A' : 'N/A';

        return (
          <Card key={cr.id as string} className={isPending ? 'border-orange-200' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(status)}
                    <span className="text-sm text-muted-foreground">
                      {formatDate(cr.createdAt as string)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Booking:</span>{' '}
                    {formatDate(booking.bookingDate as string)}
                    {booking.pickupTime ? ` at ${formatTime(booking.pickupTime as string)}` : ''}{' '}
                    ({booking.bookingType as string})
                  </div>
                  <div className="text-sm bg-muted p-2 rounded">
                    {['CANCEL_BOOKING', 'CANCEL_PICKUP', 'CANCEL_DROP'].includes(cr.requestedField as string) ? (
                      <span className="text-destructive font-medium">
                        {cr.requestedField === 'CANCEL_BOOKING' ? 'Cancel entire booking'
                          : cr.requestedField === 'CANCEL_PICKUP' ? 'Cancel pickup only'
                          : 'Cancel drop only'}
                      </span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">Change </span>
                        <span className="font-medium">{(cr.requestedField as string).replace(/_/g, ' ').toLowerCase()}</span>
                        <br />
                        <span className="text-muted-foreground">From: </span><span>{originalValue}</span>
                        <br />
                        <span className="text-muted-foreground">To: </span><span className="font-medium">{cr.requestedValue as string}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {isPending && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(cr.id as string)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {pagination && (pagination as { pages: number }).pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {((pagination as { page: number }).page - 1) * (pagination as { limit: number }).limit + 1}-
            {Math.min((pagination as { page: number }).page * (pagination as { limit: number }).limit, (pagination as { total: number }).total)} of {(pagination as { total: number }).total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= (pagination as { pages: number }).pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
