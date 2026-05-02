import { cn } from '@/lib/utils';

export function PageHeader({ title, description, children, className, as: Heading = 'h1' }) {
  return (
    <div className={cn('flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-6', className)}>
      <div className="min-w-0">
        <Heading className="text-xl sm:text-2xl font-bold break-words">{title}</Heading>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">{children}</div>}
    </div>
  );
}
