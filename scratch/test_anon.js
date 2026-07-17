const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('URL:', supabaseUrl);
  console.log('Key:', supabaseKey ? 'Present' : 'Missing');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Testing table select...');
  const { data: tableData, error: tableError } = await supabase
    .from('glacial_lake')
    .select('count');
    
  if (tableError) {
    console.error('Table Select Error:', tableError);
  } else {
    console.log('Table Select Success:', tableData);
  }

  console.log('Testing RPC...');
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_glacial_lakes_geojson');
  
  if (rpcError) {
    console.error('RPC Error:', rpcError);
  } else {
    console.log('RPC Success. Num features:', rpcData?.features?.length);
  }
}

test();
