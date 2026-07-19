const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Testing get_districts_geojson...');
  const { data, error } = await supabase.rpc('get_districts_geojson');
  
  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Success. Num features:', data?.features?.length);
    if (data?.features === null) {
      console.log('Features is null!');
    }
  }
}

test();
