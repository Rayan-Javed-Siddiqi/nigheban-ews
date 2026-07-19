'use client'

import { submitManualReading } from '@/app/[locale]/dashboard/district-actions'

export default function ManualEntryForm({ districtId }: { districtId: string }) {
  return (
    <form action={submitManualReading} className="space-y-2">
      <input type="hidden" name="district_id" value={districtId} />
      <input name="station_name" placeholder="Station / river name" required className="w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm" />
      <div className="flex gap-2">
        <input name="reading_type" placeholder="Type (e.g. discharge)" required className="w-1/2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm" />
        <input name="value" type="number" step="any" placeholder="Value" required className="w-1/4 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm" />
        <input name="unit" placeholder="Unit" className="w-1/4 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm" />
      </div>
      <input name="notes" placeholder="Notes (optional)" className="w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm" />
      <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white hover:bg-[var(--color-primary-hover)]">
        Submit Reading
      </button>
    </form>
  )
}
