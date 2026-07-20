'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Expire alert candidates that have been 'pending' for more than 72 hours.
 * Called from the alerts page or a scheduled job.
 */
export async function expireStaleAlerts() {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('alert_candidate')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id')

  if (error) throw new Error(error.message)

  revalidatePath('/en/dashboard/alerts')
  revalidatePath('/ur/dashboard/alerts')
  return { expired: data?.length ?? 0 }
}
