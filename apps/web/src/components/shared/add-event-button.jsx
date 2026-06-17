'use client';

import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { settingsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Self-contained "Add Event" button + dialog.
 * Drop it anywhere — it handles its own state and cache invalidation.
 * After saving it invalidates ['school-settings'] and ['header-settings'] automatically.
 */
export function AddEventButton({ size = 'sm', variant = 'outline', label = 'Add Event', extraInvalidateKeys = [] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', description: '' });
  const queryClient     = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => settingsApi.addHoliday({ name: form.name, date: form.date, description: form.description || undefined }),
    onSuccess: () => {
      toast.success('Event added to calendar');
      queryClient.invalidateQueries({ queryKey: ['school-settings'] });
      queryClient.invalidateQueries({ queryKey: ['header-settings'] });
      extraInvalidateKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      setOpen(false);
      setForm({ name: '', date: '', description: '' });
    },
    onError: (err) => showApiError(err),
  });

  const handleOpen = () => {
    // Pre-fill date to today for convenience
    const today = new Date().toISOString().slice(0, 10);
    setForm({ name: '', date: today, description: '' });
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Plus className="h-3 w-3" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Calendar Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-name">Event Name *</Label>
              <Input
                id="ev-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Madaraka Day"
                onKeyDown={(e) => e.key === 'Enter' && form.name && form.date && mutate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-date">Date *</Label>
              <Input
                id="ev-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">
                Description
                <span className="text-muted-foreground font-normal ml-1 text-xs">(optional)</span>
              </Label>
              <Input
                id="ev-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Public holiday"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.name.trim() || !form.date || isPending}
              onClick={() => mutate()}
            >
              {isPending ? 'Adding…' : 'Add Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
