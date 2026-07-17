import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  // This query generates a Polygon covering the entire world,
  // with a 'hole' punched out matching the union of all monitored districts.
  const { data, error } = await supabase.rpc('get_district_mask_geojson')

  if (error) {
    // If RPC doesn't exist, we fallback to a direct query
    // But since we can't run raw SQL from the client, we should create the RPC first.
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
