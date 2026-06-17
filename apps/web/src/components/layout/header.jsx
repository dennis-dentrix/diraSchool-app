'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Bell, LogOut, Settings, Loader2, CheckCheck, UserPen, LogIn, CheckCircle2, Search } from 'lucide-react';
import { SearchDialog } from './search-dialog';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { authApi, notificationsApi, checkInsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { TakeTourMenuItem } from '@/components/tour/TourTrigger';
import { useSocketNotifications } from '@/hooks/use-socket-notifications';
import { useAuthStore } from '@/store/auth.store';
import { useLogout } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

const CHECK_IN_ROLES = [
  'teacher', 'department_head', 'secretary', 'accountant',
  'headteacher', 'deputy_headteacher', 'director',
];
const SOFT_ENFORCE_ROLES = ['headteacher', 'deputy_headteacher', 'director'];

function TermChip({ termLabel, termWeek, termTotalWeeks, termProgressPct, schoolDayStatus, tomorrowHoliday }) {
  if (!termLabel && !schoolDayStatus) return null;

  return (
    <div className="hidden md:flex items-center gap-2 shrink-0">
      {termLabel && (
        <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1">
          <span className="text-xs font-medium text-foreground">{termLabel.split(' · ')[0]}</span>
          {termProgressPct != null && (
            <div className="w-14 h-1 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, termProgressPct)}%` }}
              />
            </div>
          )}
          {termWeek != null && termTotalWeeks != null && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              wk {termWeek}/{termTotalWeeks}
            </span>
          )}
        </div>
      )}
      {tomorrowHoliday && (
        <span className="text-[11px] font-medium text-warn border border-warn/30 bg-warn/8 rounded-full px-2.5 py-1">
          Holiday tomorrow
        </span>
      )}
      {schoolDayStatus && !tomorrowHoliday && (
        <span className="text-[11px] font-medium text-muted-foreground border border-border rounded-full px-2.5 py-1 max-w-[200px] truncate">
          {schoolDayStatus}
        </span>
      )}
    </div>
  );
}

export function Header({
  onMenuClick,
  title,
  schoolName,
  termLabel,
  termWeek,
  termTotalWeeks,
  termProgressPct,
  schoolDayStatus,
  tomorrowHoliday,
}) {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const { logout: doLogout } = useLogout();
  const [profileOpen, setProfileOpen]   = useState(false);
  const [profileForm, setProfileForm]   = useState({ firstName: '', lastName: '', phone: '' });
  const [searchOpen, setSearchOpen]     = useState(false);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  const isFetching = useIsFetching();
  const {
    notifications,
    unreadCount,
    markRead:    markReadSocket,
    markAllRead: markAllReadSocket,
  } = useSocketNotifications({ enabled: !!user && user.role !== 'superadmin' });

  const { mutate: markAllRead, isPending: markingAllRead } = useMutation({
    mutationFn: markAllReadSocket,
  });
  const { mutate: markRead } = useMutation({
    mutationFn: markReadSocket,
  });

  // ── Check-in ──────────────────────────────────────────────────────────────
  const canCheckIn = !!user && CHECK_IN_ROLES.includes(user.role);
  const [ciState, setCiState] = useState('idle');

  const { data: todayCheckIns } = useQuery({
    queryKey: ['checkins-today'],
    queryFn: async () => {
      const res = await checkInsApi.today();
      return res.data?.checkIns ?? res.data?.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: canCheckIn,
  });

  const morningIn  = todayCheckIns?.find((c) => c.check_in_type === 'morning_in');
  const eveningOut = todayCheckIns?.find((c) => c.check_in_type === 'evening_out');
  const checkInType = morningIn && !eveningOut ? 'evening_out' : 'morning_in';
  const allDoneToday = !!(morningIn && eveningOut);

  const checkedInTime = morningIn
    ? new Date(morningIn.timestamp ?? morningIn.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
    : null;

  const { mutate: submitCi } = useMutation({
    mutationFn: (data) => checkInsApi.checkIn(data),
    onSuccess: () => {
      setCiState('idle');
      queryClient.invalidateQueries({ queryKey: ['checkins-today'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-dashboard'] });
    },
    onError: (err) => {
      const errData = err?.response?.data;
      if (errData?.code === 'OFF_SITE_REASON_REQUIRED' && SOFT_ENFORCE_ROLES.includes(user?.role)) {
        toast.warning('You appear to be off-site. Open the dashboard to submit an off-site reason.');
        setCiState('idle');
        return;
      }
      toast.error(errData?.message ?? getErrorMessage(err));
      setCiState('idle');
    },
  });

  const handleHeaderCheckIn = useCallback(() => {
    if (ciState !== 'idle' || allDoneToday) return;
    setCiState('locating');
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      setCiState('idle');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude, accuracy } }) => {
        setCiState('submitting');
        submitCi({ latitude, longitude, accuracy, check_in_type: checkInType, client_timestamp: new Date().toISOString() });
      },
      (err) => {
        toast.error(err.code === 1 ? 'Location access denied.' : 'Could not get your location.');
        setCiState('idle');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  }, [ciState, allDoneToday, checkInType, submitCi]);

  const { mutate: saveProfile, isPending: savingProfile } = useMutation({
    mutationFn: (data) => authApi.updateMe(data),
    onSuccess: (res) => {
      const updatedUser = res.data?.user ?? res.data?.data?.user;
      if (updatedUser && setUser) setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('Profile updated');
      setProfileOpen(false);
    },
    onError: (err) => showApiError(err),
  });

  return (
    <header className="h-12 border-b border-border bg-background flex items-center gap-3 px-4 shrink-0 sticky top-0 z-40">
      {/* Loading bar */}
      {isFetching > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-primary/20">
          <div className="h-full w-1/3 bg-primary animate-pulse rounded-full" />
        </div>
      )}

      {/* Mobile menu toggle */}
      <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 shrink-0" onClick={onMenuClick}>
        <Menu className="h-4 w-4" />
      </Button>

      {/* Page title */}
      <h1 className="font-display text-sm font-semibold tracking-tight text-foreground shrink-0">
        {title}
      </h1>

      {/* Term chip — desktop */}
      <TermChip
        termLabel={termLabel}
        termWeek={termWeek}
        termTotalWeeks={termTotalWeeks}
        termProgressPct={termProgressPct}
        schoolDayStatus={schoolDayStatus}
        tomorrowHoliday={tomorrowHoliday}
      />

      <div className="flex-1" />

      {/* Search — desktop full field */}
      <button
        type="button"
        aria-label="Search (⌘K)"
        onClick={() => setSearchOpen(true)}
        className="hidden lg:flex items-center gap-2 h-8 w-56 rounded-md border border-border bg-background px-3 text-xs text-muted-foreground shadow-[inset_0_1px_2px_hsl(var(--border)/0.5)] hover:border-foreground/25 hover:shadow-[inset_0_1px_2px_hsl(var(--border)/0.8)] transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
        <span className="flex-1 text-left truncate">Quick search…</span>
        <kbd className="font-mono text-[9px] tabular-nums leading-none shrink-0 bg-muted border border-border/70 rounded px-1.5 py-0.5 text-muted-foreground/70">
          ⌘K
        </kbd>
      </button>

      {/* Search — mobile icon only */}
      <button
        type="button"
        aria-label="Search"
        onClick={() => setSearchOpen(true)}
        className="lg:hidden h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-4 w-4" />
      </button>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Right side actions */}
      <div className="flex items-center gap-1.5">
        {/* Check-in button */}
        {canCheckIn && (
          allDoneToday ? (
            <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-full px-3 py-1 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
              <span className="font-mono tabular-nums">{checkedInTime ?? 'Done'}</span>
            </span>
          ) : (
            <Button
              size="sm"
              variant={morningIn ? 'outline' : 'default'}
              className={`gap-1.5 h-8 px-3 text-xs font-medium shrink-0 ${
                morningIn
                  ? 'border-border text-foreground hover:bg-muted'
                  : 'bg-foreground text-background hover:bg-foreground/90'
              }`}
              disabled={ciState !== 'idle'}
              onClick={handleHeaderCheckIn}
              data-tour="checkin-button"
            >
              {ciState === 'locating' || ciState === 'submitting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : morningIn ? (
                <><LogOut className="h-3.5 w-3.5" /><span className="hidden sm:inline">Check Out</span></>
              ) : (
                <><LogIn className="h-3.5 w-3.5" /><span className="hidden sm:inline">Check In</span></>
              )}
            </Button>
          )
        )}

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-bad text-white text-[9px] leading-4 text-center font-mono tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80 max-h-[420px] overflow-y-auto" align="end">
            <DropdownMenuLabel className="font-normal flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Notifications</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={markingAllRead || unreadCount === 0}
                onClick={() => markAllRead()}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet</div>
            ) : notifications.map((n) => (
              <DropdownMenuItem
                key={n._id}
                className="items-start py-2.5 cursor-pointer"
                onClick={() => {
                  if (!n.readAt) markRead(n._id);
                  if (n.link) router.push(n.link);
                }}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground whitespace-normal">{n.message}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                    {!n.readAt ? ' · Unread' : ''}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Avatar / user menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {user ? getInitials(user.firstName, user.lastName) : '??'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                {schoolName && <p className="text-xs text-muted-foreground truncate">{schoolName}</p>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              setProfileForm({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phone: user?.phone ?? '' });
              setProfileOpen(true);
            }}>
              <UserPen className="mr-2 h-4 w-4" />
              Edit Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <TakeTourMenuItem />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => doLogout()} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Profile edit dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0712 345 678"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button>
            <Button
              disabled={savingProfile}
              onClick={() => saveProfile({
                firstName: profileForm.firstName || undefined,
                lastName: profileForm.lastName || undefined,
                phone: profileForm.phone || undefined,
              })}
            >
              {savingProfile ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
