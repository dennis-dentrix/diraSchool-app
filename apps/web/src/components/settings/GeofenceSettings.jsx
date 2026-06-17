'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Navigation, Save, Clock, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { geofenceApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const GeofencePinMap = dynamic(
  () => import('./GeofencePinMap').then((mod) => mod.GeofencePinMap),
  {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map...</div>,
  }
);

const clampRadius = (value) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 150;
  return Math.min(500, Math.max(50, Math.round(next)));
};

const formatCoordinate = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(6) : null;

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

  const hasPinnedLocation = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const alreadyConfigured = Number.isFinite(Number(saved.latitude)) && Number.isFinite(Number(saved.longitude));

  const setPinnedLocation = ({ latitude, longitude }) => {
    setLat(latitude);
    setLng(longitude);
  };

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
        toast.success('School pin set from your current location.');
      },
      () => {
        setLocating(false);
        setLocError(
          'Could not get your location. Allow location access or place the pin on the map.'
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  };

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: async () => {
      const tasks = [];
      if (hasPinnedLocation) {
        tasks.push(geofenceApi.save({
          latitude: Number(lat),
          longitude: Number(lng),
          radius_meters: clampRadius(radius),
        }));
      }
      tasks.push(geofenceApi.saveTimings({ checkInDeadline, checkOutTime }));
      await Promise.all(tasks);
    },
    onSuccess: () => {
      toast.success('Attendance settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => showApiError(err),
  });

  return (
    <div className="space-y-4">

      {/* ── Location and radius ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-700" />
            Check-in Location
          </CardTitle>
          <CardDescription>Set the school pin and check-in radius.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alreadyConfigured && hasPinnedLocation && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              School location is configured.
            </div>
          )}

          {locError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {locError}
            </div>
          )}

          <div className="overflow-hidden rounded-md border h-72 sm:h-80">
            <GeofencePinMap
              latitude={lat}
              longitude={lng}
              radius={radius}
              canEdit={canEdit}
              onChange={setPinnedLocation}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {hasPinnedLocation
                ? `Pin: ${formatCoordinate(lat)}, ${formatCoordinate(lng)}`
                : 'Place the pin on the school compound.'}
            </div>
            {canEdit && (
              <Button
                onClick={detectLocation}
                disabled={locating}
                variant="outline"
                className="w-full sm:w-auto gap-2"
              >
                {locating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Locating...</>
                  : <><Navigation className="h-4 w-4" /> Use Current Location</>
                }
              </Button>
            )}
          </div>

          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="geofence-radius">Radius</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="geofence-radius-value"
                  type="number"
                  min="50"
                  max="500"
                  step="10"
                  value={radius}
                  disabled={!canEdit}
                  onChange={(event) => setRadius(clampRadius(event.target.value))}
                  className="h-9 w-24"
                />
                <span className="text-sm text-muted-foreground">m</span>
              </div>
            </div>
            <Input
              id="geofence-radius"
              type="range"
              min="50"
              max="500"
              step="10"
              value={radius}
              disabled={!canEdit}
              onChange={(event) => setRadius(clampRadius(event.target.value))}
              className="h-2 cursor-pointer p-0"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50 m</span>
              <span>500 m</span>
            </div>
          </div>

          {!hasPinnedLocation && !canEdit && (
            <p className="text-sm text-muted-foreground">No check-in location configured yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Times ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-700" />
            Check-in Times
          </CardTitle>
          <CardDescription>Set the daily staff attendance times.</CardDescription>
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
          disabled={saving || (!hasPinnedLocation && !alreadyConfigured)}
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
