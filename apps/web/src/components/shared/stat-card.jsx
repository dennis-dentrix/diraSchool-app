import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const TONE_DOT = {
  blue:    'bg-primary',
  green:   'bg-ok',
  red:     'bg-bad',
  rose:    'bg-bad',
  amber:   'bg-warn',
  orange:  'bg-warn',
  yellow:  'bg-warn',
  purple:  'bg-primary/70',
  violet:  'bg-primary/70',
  neutral: 'bg-muted-foreground/30',
};

const COLOR_TO_TONE = {
  blue:   'blue',
  green:  'green',
  red:    'red',
  purple: 'purple',
  orange: 'amber',
  yellow: 'amber',
};

export function StatCard({
  label,
  value,
  hint,
  tone,
  badge,
  title,
  description,
  icon: Icon,
  trend,
  color,
  loading,
  onClick,
  actionLabel = 'View details',
  className,
}) {
  const resolvedLabel = label ?? title;
  const resolvedHint  = hint  ?? description;
  const resolvedTone  = tone  ?? (color ? COLOR_TO_TONE[color] : 'neutral') ?? 'neutral';
  const dot           = TONE_DOT[resolvedTone] ?? 'bg-muted-foreground/30';
  const interactive   = typeof onClick === 'function';

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-border bg-card px-4 py-3 space-y-2', className)}>
        <Skeleton className="h-2 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    );
  }

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.() : undefined}
      aria-label={interactive ? `${resolvedLabel} — ${actionLabel}` : undefined}
      className={cn(
        'rounded-lg border border-border bg-card px-4 py-3',
        interactive && 'cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', dot)} />
        <p className="text-[11px] font-medium text-muted-foreground truncate leading-none">
          {resolvedLabel}
        </p>
        {badge != null && (
          <span className="ml-auto font-mono text-[10px] tabular-nums bg-muted text-muted-foreground rounded px-1.5 py-0.5 leading-none shrink-0">
            {badge}
          </span>
        )}
        {Icon && <Icon className="ml-auto h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </div>

      {/* Value */}
      <p className="text-xl font-semibold tabular-nums text-foreground leading-tight tracking-tight">
        {value ?? '—'}
      </p>

      {/* Hint */}
      {resolvedHint && (
        <p className="mt-1 text-xs text-muted-foreground leading-snug">{resolvedHint}</p>
      )}

      {trend != null && (
        <p className={cn('mt-1 text-xs font-medium tabular-nums', trend >= 0 ? 'text-ok' : 'text-bad')}>
          {trend >= 0 ? '+' : ''}{trend}% vs last term
        </p>
      )}
    </div>
  );
}
