'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitManualReading(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const districtId = formData.get('district_id') as string
  const stationName = formData.get('station_name') as string
  const readingType = formData.get('reading_type') as string
  const value = parseFloat(formData.get('value') as string)
  const unit = formData.get('unit') as string
  const notes = formData.get('notes') as string

  await supabase.from('manual_reading').insert({
    source: 'pmd_manual',
    station_name: stationName,
    district_id: districtId,
    reading_type: readingType,
    value,
    unit,
    entered_by: user.id,
    notes,
  })

  revalidatePath(`/dashboard/district/${districtId}`)
}