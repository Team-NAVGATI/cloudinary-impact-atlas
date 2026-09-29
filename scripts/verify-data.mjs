import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xonpeigylxhcnmlerelt.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvbnBlaWd5bHhoY25tbGVyZWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDUyNzUsImV4cCI6MjEwNjIyMTI3NX0.1yRFl4cVQ8yNmEcbaeJHAFEp8VDjPiNiWAdOIiSvgmk';

const supabase = createClient(url, key);

async function run() {
  console.log('Fetching media assets and joined project data...');
  const { data: assets, error } = await supabase
    .from('media_assets')
    .select(`
      id,
      original_filename,
      cloudinary_public_id,
      cloudinary_url,
      project_id,
      status,
      created_at,
      projects (
        id,
        name,
        status
      ),
      organizations (
        id,
        name
      )
    `)
    .eq('original_filename', 'test.jpg');

  if (error) {
    console.error('Error querying media_assets:', error);
    return;
  }

  console.log('Found records:', JSON.stringify(assets, null, 2));

  for (const asset of assets) {
    const isAssigned = asset.project_id && asset.projects && asset.project_id === asset.projects.id;
    console.log(`\nVerification for Asset "${asset.original_filename}" (ID: ${asset.id}):`);
    console.log(`- Project ID in media_assets: ${asset.project_id}`);
    console.log(`- Joined Project Name:        ${asset.projects?.name}`);
    console.log(`- Verification Status:        ${isAssigned ? 'SUCCESS (project_id contains project ID)' : 'FAILED'}`);
  }
}

run();
