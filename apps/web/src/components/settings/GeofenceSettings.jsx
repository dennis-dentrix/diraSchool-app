'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Navigation, Save, Clock, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { geofenceApi, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const RADIUS_OPTIONS = [
  { value: 50,  label: 'Small',  desc: 'Single building or gate',          example: 'e.g. one classroom block' },
  { value: 150, label: 'Medium', desc: 'Several buildings or a small field', example: 'e.g. most day schools' },
  { value: 300, label: 'Large',  desc: 'Wide campus or boarding school',    example: 'e.g. large compounds' },
];

export function GeofenceSettings({ settings, canEdit }) {
  const queryClient = useQueryClient();

  const saved = settings?.geofence ?? {};
  const [lat,             setLat]             = useState(saved.latitude  ?? null);
  const [lng,             setLng]             = useState(saved.longitude ?? null);
  const [radius,          setRadius]          = useState(saved.radius_meters ?? 150);
  const [checkInDeadline, setCheckInDeadline] = useState(settings?.checkInDeadline ?? '08:00');
  const [checkOutTime,    setCheckOutTime]    = useState(settings?.checkOutTime    ?? '17:00');
  const [locating,        setLocating]        = useState(false);
  const [locError,        setLocError]        = useState('');

  const alreadyConfigured = !!(saved.latitude && saved.longitude);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocError('Your browser does not support location detection. Please use Chrome or Firefox.');
      return;
    }
    setLocError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocating(false);
        toast.success('Location detected — confirm on the map below, then save.');
      },
      () => {
        setLocating(false);
        setLocError(
          'Could not get your location. Make sure you allowed location access in your browser, then try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  };

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: async () => {
      const tasks = [];
      if (lat && lng) tasks.push(geofenceApi.save({ latitude: lat, longitude: lng, radius_meters: radius }));
      tasks.push(geofenceApi.saveTimings({ checkInDeadline, checkOutTime }));
      await Promise.all(tasks);
    },
    onSuccess: () => {
      toast.success('Attendance settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">

      {/* ── Step 1: Set location ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-700" />
            Step 1 — Set School Location
          </CardTitle>
          <CardDescription>
            Stand at your school's main entrance or gate, then tap the button below. Your phone or computer will detect where you are.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Already configured notice */}
          {alreadyConfigured && !lat && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Location is already set. You can tap below to update it.
            </div>
          )}

          {/* Detect button */}
          {canEdit && (
            <Button
              onClick={detectLocation}
              disabled={locating}
              size="lg"
              className="w-full sm:w-auto gap-2 bg-cyan-700 hover:bg-cyan-800"
            >
              {locating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Detecting location…</>
                : <><Navigation className="h-4 w-4" /> Detect My Location</>
              }
            </Button>
          )}

          {/* Error feedback */}
          {locError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {locError}
            </div>
          )}

          {/* Map preview */}
          {lat && lng && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Confirm this is your school:</p>
              <div className="overflow-hidden rounded-lg border h-52">
                <iframe
                  title="School location"
                  src={`https://maps.google.com/maps?q=${lat},${lng}&z=18&output=embed`}
                  width="100%"
                  height="100%"
                  className="border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                If the pin is in the wrong place, move to the correct spot and tap "Detect My Location" again.
              </p>
            </div>
          )}

          {!lat && !lng && !canEdit && (
            <p className="text-sm text-muted-foreground">No location configured yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Campus size ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Step 2 — Choose Campus Size</CardTitle>
          <CardDescription>
            Staff must be within this distance of the entrance to check in. When in doubt, pick Medium.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={!canEdit}
                onClick={() => setRadius(opt.value)}
                className={[
                  'rounded-lg border-2 p-4 text-left transition-colors',
                  radius === opt.value
                    ? 'border-cyan-600 bg-cyan-50'
                    : 'border-border bg-background hover:border-slate-300',
                  !canEdit ? 'opacity-60 cursor-default' : 'cursor-pointer',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <span className="text-xs font-mono text-muted-foreground">{opt.value} m</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{opt.desc}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5 italic">{opt.example}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Step 3: Times ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-700" />
            Step 3 — Set Check-In Times
          </CardTitle>
          <CardDescription>
            Staff who check in after the morning deadline will be marked <strong>Late</strong>.
            All times are Kenya time (EAT).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="checkin-deadline">Morning deadline</Label>
              <Input
                id="checkin-deadline"
                type="time"
                value={checkInDeadline}
                disabled={!canEdit}
                onChange={(e) => setCheckInDeadline(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Staff arriving after this are marked late</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-time">End of day</Label>
              <Input
                id="checkout-time"
                type="time"
                value={checkOutTime}
                disabled={!canEdit}
                onChange={(e) => setCheckOutTime(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Expected check-out time</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Save all ─────────────────────────────────────────────────────────── */}
      {canEdit && (
        <Button
          onClick={() => saveAll()}
          disabled={saving || (!lat && !lng && !alreadyConfigured)}
          className="w-full sm:w-auto gap-2"
          size="lg"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Attendance Settings'}
        </Button>
      )}
    </div>
  );
}
