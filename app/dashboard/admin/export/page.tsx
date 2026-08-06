'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FileSpreadsheet, Download } from 'lucide-react';

export default function AdminExportPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      if (includeCancelled) params.set('include_cancelled', 'true');

      const res = await fetch(`/api/v1/admin/bookings/export?${params.toString()}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Export failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookings-export-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Export Bookings</h2>
        <p className="text-muted-foreground">Generate Excel files for the facility team</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Export Settings
          </CardTitle>
          <CardDescription>Download booking data for facility team coordination.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2 flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeCancelled}
                  onChange={(e) => setIncludeCancelled(e.target.checked)}
                  className="rounded"
                />
                Include cancelled
              </label>
            </div>
          </div>

          <div className="mt-6">
            <Button onClick={handleExport} disabled={isExporting} size="lg">
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Generating...' : 'Download Excel'}
            </Button>
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            <p>Includes: Employee email, cab facility, booking type, locations, times, cost center.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
