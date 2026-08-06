'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, AlertTriangle } from 'lucide-react';
import { formatDate, formatTime } from '@/lib/utils';
import { getMyBookings, getMyProfile, createBookingAction, createChangeRequestAction } from '@/lib/actions';

export default function UserDashboardPage() {
  const [showForm, setShowForm] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [olderPage, setOlderPage] = useState(1);
  const queryClient = useQueryClient();

  // Include today's date in query keys so cache invalidates on day change
  const todayKey = new Date().toISOString().split('T')[0];

  const { data: userData } = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => getMyProfile().then(r => { if (!r.success) throw new Error(r.error?.message); return r.data; }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-bookings-upcoming', todayKey],
    queryFn: () => getMyBookings(false).then(r => { if (!r.success) throw new Error(r.error?.message); return r; }),
    staleTime: 0,
  });

  const { data: olderData, isLoading: olderLoading } = useQuery({
    queryKey: ['my-bookings-older', todayKey, olderPage],
    queryFn: () => getMyBookings(true, olderPage).then(r => { if (!r.success) throw new Error(r.error?.message); return r; }),
    enabled: showOlder,
    staleTime: 0,
  });

  const createBooking = useMutation({
    mutationFn: (formData: Record<string, string | null>) => createBookingAction(formData as { bookingDate: string; bookingType: string; pickupLocation?: string | null; pickupTime?: string | null; dropLocation?: string | null; dropTime?: string | null }).then(r => { if (!r.success) throw new Error(r.error?.message); return r.data; }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-bookings-upcoming'] }); queryClient.invalidateQueries({ queryKey: ['my-bookings-older'] }); setShowForm(false); },
  });

  const cabFacility = userData?.cabFacility || 'BOTH';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">My Bookings</h2>
          <p className="text-muted-foreground">
            Facility: <span className="font-medium">{(cabFacility as string).replace('_', ' ').toLowerCase()}</span>
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Booking
        </Button>
      </div>

      {showForm && (
        <BookingForm
          cabFacility={cabFacility as string}
          defaults={userData as Record<string, unknown> | undefined}
          onSubmit={(data) => createBooking.mutate(data)}
          onCancel={() => setShowForm(false)}
          isLoading={createBooking.isPending}
          error={createBooking.error?.message}
        />
      )}

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">This Week & Next Week</h3>
        {isLoading && <BookingsSkeleton />}
        {error && <div className="text-sm text-destructive p-4 bg-destructive/10 rounded-md">Failed to load bookings: {(error as Error).message}</div>}
        {data?.data && (data.data as unknown[]).length === 0 && !showForm && (
          <Card><CardContent className="p-8 text-center text-muted-foreground"><p>No upcoming bookings. Click "New Booking" to book a cab.</p></CardContent></Card>
        )}
        {data?.data && (data.data as unknown[]).length > 0 && (
          <div className="space-y-3">
            {(data.data as Record<string, unknown>[]).map((booking) => (
              <BookingCard key={booking.id as string} booking={booking} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        {!showOlder ? (
          <Button variant="ghost" size="sm" onClick={() => setShowOlder(true)}>View past bookings →</Button>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Past Bookings</h3>
            {olderLoading && <BookingsSkeleton />}
            {olderData?.data && (olderData.data as unknown[]).length === 0 && <p className="text-sm text-muted-foreground">No past bookings.</p>}
            {olderData?.data && (olderData.data as unknown[]).length > 0 && (
              <div className="space-y-3">
                {(olderData.data as Record<string, unknown>[]).map((booking) => (
                  <BookingCard key={booking.id as string} booking={booking} />
                ))}
              </div>
            )}
            {olderData?.pagination && (olderData.pagination as { pages: number }).pages > 1 && (
              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={olderPage <= 1} onClick={() => setOlderPage((p) => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {(olderData.pagination as { page: number }).page} of {(olderData.pagination as { pages: number }).pages}</span>
                <Button variant="outline" size="sm" disabled={olderPage >= (olderData.pagination as { pages: number }).pages} onClick={() => setOlderPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BookingForm({ cabFacility, defaults, onSubmit, onCancel, isLoading, error }: { cabFacility: string; defaults: Record<string, unknown> | undefined; onSubmit: (data: Record<string, string | null>) => void; onCancel: () => void; isLoading: boolean; error?: string }) {
  const availableTypes: { value: string; label: string }[] = [];
  if (cabFacility === 'PICKUP_ONLY') { availableTypes.push({ value: 'PICKUP', label: 'Pickup' }); }
  else if (cabFacility === 'DROP_ONLY') { availableTypes.push({ value: 'DROP', label: 'Drop' }); }
  else { availableTypes.push({ value: 'BOTH', label: 'Pickup & Drop' }, { value: 'PICKUP', label: 'Pickup Only' }, { value: 'DROP', label: 'Drop Only' }); }

  const [bookingType, setBookingType] = useState(availableTypes[0].value);
  const [formData, setFormData] = useState({
    bookingDate: '', pickupLocation: (defaults?.defaultPickupLocation as string) || '', pickupTime: (defaults?.defaultPickupTime as string) || '',
    dropLocation: (defaults?.defaultDropLocation as string) || '', dropTime: (defaults?.defaultDropTime as string) || '',
  });
  const showPickup = bookingType === 'PICKUP' || bookingType === 'BOTH';
  const showDrop = bookingType === 'DROP' || bookingType === 'BOTH';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ bookingDate: formData.bookingDate, bookingType, pickupLocation: showPickup ? formData.pickupLocation : null, pickupTime: showPickup ? formData.pickupTime : null, dropLocation: showDrop ? formData.dropLocation : null, dropTime: showDrop ? formData.dropTime : null });
  }

  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <Card><CardHeader><CardTitle className="text-lg">New Booking</CardTitle></CardHeader><CardContent>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><label htmlFor="bookingDate" className="text-sm font-medium">Date</label><Input id="bookingDate" type="date" min={today} max={maxDate} value={formData.bookingDate} onChange={(e) => setFormData({ ...formData, bookingDate: e.target.value })} required /></div>
        <div className="space-y-2"><label htmlFor="bookingType" className="text-sm font-medium">Booking Type</label><select id="bookingType" className="h-10 w-full rounded-md border px-3 text-sm" value={bookingType} onChange={(e) => setBookingType(e.target.value)}>{availableTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        {showPickup && (<><div className="space-y-2"><label htmlFor="pickupLocation" className="text-sm font-medium">Pickup Location</label><Input id="pickupLocation" placeholder="e.g. HQ Main Gate" value={formData.pickupLocation} onChange={(e) => setFormData({ ...formData, pickupLocation: e.target.value })} required /></div><div className="space-y-2"><label htmlFor="pickupTime" className="text-sm font-medium">Pickup Time</label><Input id="pickupTime" type="time" value={formData.pickupTime} onChange={(e) => setFormData({ ...formData, pickupTime: e.target.value })} required /></div></>)}
        {showDrop && (<><div className="space-y-2"><label htmlFor="dropLocation" className="text-sm font-medium">Drop Location</label><Input id="dropLocation" placeholder="e.g. Tech Park B2" value={formData.dropLocation} onChange={(e) => setFormData({ ...formData, dropLocation: e.target.value })} required /></div><div className="space-y-2"><label htmlFor="dropTime" className="text-sm font-medium">Drop Time</label><Input id="dropTime" type="time" value={formData.dropTime} onChange={(e) => setFormData({ ...formData, dropTime: e.target.value })} required /></div></>)}
        {error && <div className="md:col-span-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
        <div className="md:col-span-2 flex gap-3"><Button type="submit" disabled={isLoading}>{isLoading ? 'Booking...' : 'Book Cab'}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
      </form>
    </CardContent></Card>
  );
}

function BookingCard({ booking }: { booking: Record<string, unknown> }) {
  const [showChangeForm, setShowChangeForm] = useState(false);
  const queryClient = useQueryClient();
  const hasPendingChange = Array.isArray(booking.changeRequests) && booking.changeRequests.length > 0;
  const bookingType = booking.bookingType as string;
  const bookingId = booking.id as string;

  const raiseException = useMutation({
    mutationFn: (data: { requestedField: string; requestedValue: string | null; reason: string }) => createChangeRequestAction(bookingId, data).then(r => { if (!r.success) throw new Error(r.error?.message); return r.data; }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-bookings'] }); queryClient.invalidateQueries({ queryKey: ['my-bookings-upcoming'] }); queryClient.invalidateQueries({ queryKey: ['my-change-requests'] }); setShowChangeForm(false); },
  });

  return (
    <Card><CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{formatDate(booking.bookingDate as string)}</span>
            <Badge className="bg-blue-100 text-blue-800">{bookingType}</Badge>
            {hasPendingChange ? <Badge className="bg-orange-100 text-orange-800">Change Pending</Badge> : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {(bookingType === 'PICKUP' || bookingType === 'BOTH') && booking.pickupLocation ? <span>Pickup: {booking.pickupLocation as string} at {formatTime(booking.pickupTime as string)}</span> : null}
            {bookingType === 'BOTH' ? <span> → </span> : null}
            {(bookingType === 'DROP' || bookingType === 'BOTH') && booking.dropLocation ? <span>Drop: {booking.dropLocation as string} at {formatTime(booking.dropTime as string)}</span> : null}
          </div>
        </div>
        {!hasPendingChange ? <Button variant="outline" size="sm" onClick={() => setShowChangeForm(!showChangeForm)} className="text-orange-600 border-orange-300 hover:bg-orange-50"><AlertTriangle className="h-3 w-3 mr-1" />Raise Exception</Button> : null}
      </div>
      {showChangeForm ? <ChangeRequestForm booking={booking} onSubmit={(data) => raiseException.mutate(data)} onCancel={() => setShowChangeForm(false)} isLoading={raiseException.isPending} error={raiseException.error?.message} /> : null}
    </CardContent></Card>
  );
}

function ChangeRequestForm({ booking, onSubmit, onCancel, isLoading, error }: { booking: Record<string, unknown>; onSubmit: (data: { requestedField: string; requestedValue: string | null; reason: string }) => void; onCancel: () => void; isLoading: boolean; error?: string }) {
  const bookingType = booking.bookingType as string;
  const fieldOptions: { value: string; label: string }[] = [];
  if (bookingType === 'PICKUP' || bookingType === 'BOTH') { fieldOptions.push({ value: 'PICKUP_LOCATION', label: 'Change Pickup Location' }, { value: 'PICKUP_TIME', label: 'Change Pickup Time' }); }
  if (bookingType === 'DROP' || bookingType === 'BOTH') { fieldOptions.push({ value: 'DROP_LOCATION', label: 'Change Drop Location' }, { value: 'DROP_TIME', label: 'Change Drop Time' }); }
  if (bookingType === 'BOTH') { fieldOptions.push({ value: 'CANCEL_PICKUP', label: 'Cancel Pickup Only' }, { value: 'CANCEL_DROP', label: 'Cancel Drop Only' }); }
  fieldOptions.push({ value: 'CANCEL_BOOKING', label: 'Cancel Entire Booking' });

  const [requestedField, setRequestedField] = useState(fieldOptions[0].value);
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const isCancelAction = ['CANCEL_BOOKING', 'CANCEL_PICKUP', 'CANCEL_DROP'].includes(requestedField);
  const isTimeField = requestedField === 'PICKUP_TIME' || requestedField === 'DROP_TIME';

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); onSubmit({ requestedField, requestedValue: isCancelAction ? null : requestedValue, reason }); }

  return (
    <div className="mt-4 pt-4 border-t">
      <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />Raise Exception / Change Request</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1"><label className="text-xs font-medium">What do you want to change?</label><select className="h-9 w-full rounded-md border px-3 text-sm" value={requestedField} onChange={(e) => { setRequestedField(e.target.value); setRequestedValue(''); }}>{fieldOptions.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
          {!isCancelAction ? <div className="space-y-1"><label className="text-xs font-medium">New Value</label><Input type={isTimeField ? 'time' : 'text'} placeholder={isTimeField ? '' : 'e.g. New location'} value={requestedValue} onChange={(e) => setRequestedValue(e.target.value)} required className="h-9" /></div> : null}
        </div>
        <div className="space-y-1"><label className="text-xs font-medium">Reason (optional)</label><Input placeholder="Why do you need this change?" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" /></div>
        {error ? <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</div> : null}
        <div className="flex gap-2"><Button type="submit" size="sm" disabled={isLoading}>{isLoading ? 'Submitting...' : 'Submit Request'}</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
      </form>
    </div>
  );
}

function BookingsSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="p-4"><div className="animate-pulse space-y-2"><div className="h-4 bg-muted rounded w-1/3" /><div className="h-3 bg-muted rounded w-2/3" /></div></CardContent></Card>)}</div>;
}
