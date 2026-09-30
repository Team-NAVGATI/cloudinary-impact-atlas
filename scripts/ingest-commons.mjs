/**
 * Ingest free, licensed Chennai flood / river media from Wikimedia Commons into
 * Cloudinary + Supabase, keeping source URL, license and attribution for traceability.
 *
 *   node scripts/ingest-commons.mjs              # upload (stage 1) + database (stage 2)
 *   node scripts/ingest-commons.mjs --upload     # stage 1 only (writes data/chennai-manifest.json)
 *   node scripts/ingest-commons.mjs --db         # stage 2 only (needs migration 5 applied)
 *   node scripts/ingest-commons.mjs --limit=20   # smaller run
 */
import fs from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';
import { loadEnv, requireEnv, sleep } from './_env.mjs';

loadEnv();
requireEnv([
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
]);

const args = process.argv.slice(2);
const onlyUpload = args.includes('--upload');
const onlyDb = args.includes('--db');
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 70;
const MANIFEST = 'data/chennai-manifest.json';
const UA = 'ImpactAtlas/0.1 (CodeFibonacci hackathon project)';

// Commons category -> how we label the evidence
const SOURCES = [
  { cat: 'Category:Floods in Chennai', phase: 'DURING', event: 'Chennai floods 2015', max: 24 },
  { cat: 'Category:Cyclone Michaung', phase: 'DURING', event: 'Cyclone Michaung 2023', max: 14 },
  { cat: 'Category:Adyar River', phase: 'BEFORE', event: 'Normal conditions', max: 12 },
  { cat: 'Category:Cooum River', phase: 'BEFORE', event: 'Normal conditions', max: 10 },
  { cat: 'Category:Pallikaranai Marsh', phase: 'BEFORE', event: 'Normal conditions', max: 6 },
];

const ZONES = {
  adyar: { name: 'Adyar River', kws: ['adyar', 'saidapet', 'kotturpuram', 'foreshore', 'broken bridge', 'elphinstone', 'maraimalai'] },
  cooum: { name: 'Cooum River', kws: ['cooum', 'koovam', 'napier', 'chepauk', 'anna salai'] },
  velachery: { name: 'Velachery', kws: ['velachery', 'viduthalai', 'madipakkam', 'vijaya nagar'] },
  pallikaranai: { name: 'Pallikaranai Marsh', kws: ['pallikaranai', 'sholinganallur', 'marsh', 'flamingo'] },
  tambaram: { name: 'Tambaram', kws: ['tambaram', 'mudichur', 'varadarajapuram', 'chembarambakkam'] },
  buckingham: { name: 'Buckingham Canal', kws: ['buckingham', 'canal', 'mylapore', 'mandaveli'] },
  'north-chennai': { name: 'North Chennai', kws: ['ennore', 'vyasarpadi', 'tondiarpet', 'basin bridge', 'perambur'] },
};

function matchZone(text) {
  const t = text.toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const [slug, z] of Object.entries(ZONES)) {
    const hits = z.kws.filter((k) => t.includes(k)).length;
    if (hits > bestHits) {
      best = slug;
      bestHits = hits;
    }
  }
  return best;
}

const strip = (s = '') =>
  s.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

async function jget(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const t = await r.text();
    try {
      return JSON.parse(t);
    } catch {
      await sleep(3000 * (i + 1));
    }
  }
  throw new Error('Commons API kept rate limiting: ' + url.slice(0, 90));
}

async function listCategory(cat) {
  await sleep(1500);
  const j = await jget(
    `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmtype=file&cmlimit=200&format=json`
  );
  return (j.query?.categorymembers ?? []).map((m) => m.title);
}

async function imageInfo(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 25) {
    await sleep(1500);
    const chunk = titles.slice(i, i + 25);
    const j = await jget(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(chunk.join('|'))}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600&format=json`
    );
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (ii) out.push({ pageid: p.pageid, title: p.title, ii });
    }
  }
  return out;
}

async function stageUpload(orgId) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  fs.mkdirSync('data', { recursive: true });
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : [];
  const done = new Set(manifest.map((m) => m.commons_pageid));
  let count = manifest.length;

  for (const src of SOURCES) {
    if (count >= limit) break;
    console.log(`\n== ${src.cat}`);
    const titles = await listCategory(src.cat);
    const infos = await imageInfo(titles);
    let taken = 0;
    for (const { pageid, title, ii } of infos) {
      if (taken >= src.max || count >= limit) break;
      if (done.has(pageid)) {
        taken++;
        continue;
      }
      const md = ii.extmetadata || {};
      if (!['image/jpeg', 'image/png'].includes(ii.mime || '')) continue;
      if ((ii.width || 0) < 700) continue;
      if (/map|logo|flag|diagram|satellite|jtwc|cimss|track/i.test(title)) continue;
      const licenseName = md.LicenseShortName?.value || '';
      if (!/^(CC|Public domain|PD|GFDL|Attribution)/i.test(licenseName)) continue;

      const description = strip(md.ImageDescription?.value || '');
      const categories = (md.Categories?.value || '').split('|');
      const objectName = strip(
        md.ObjectName?.value || title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')
      );
      const zoneSlug = matchZone(`${title} ${description} ${categories.join(' ')}`);
      const capturedRaw = md.DateTimeOriginal?.value || md.DateTime?.value || '';
      const captured = /^\d{4}-\d{2}-\d{2}/.test(capturedRaw)
        ? new Date(capturedRaw.slice(0, 10)).toISOString()
        : null;
      const lat = md.GPSLatitude ? Number(md.GPSLatitude.value) : null;
      const lng = md.GPSLongitude ? Number(md.GPSLongitude.value) : null;
      const attribution = strip(md.Artist?.value || 'Unknown').slice(0, 200);

      try {
        await sleep(1800);
        const res = await fetch(ii.thumburl || ii.url, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const up = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                folder: `organizations/${orgId}/media`,
                public_id: `commons_${pageid}`,
                resource_type: 'image',
                overwrite: false,
                tags: ['chennai', 'commons', src.phase.toLowerCase()],
                context: {
                  source: 'Wikimedia Commons',
                  source_url: ii.descriptionurl,
                  license: licenseName,
                  attribution,
                  event: src.event,
                },
              },
              (err, r) => (err ? reject(err) : resolve(r))
            )
            .end(buf);
        });
        manifest.push({
          commons_pageid: pageid,
          title: objectName,
          description,
          categories,
          phase: src.phase,
          event_label: src.event,
          zone_slug: zoneSlug,
          captured_at: captured,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          license: licenseName,
          attribution,
          source_url: ii.descriptionurl,
          cloudinary: {
            public_id: up.public_id,
            asset_id: up.asset_id,
            version: up.version,
            etag: up.etag,
            secure_url: up.secure_url,
            width: up.width,
            height: up.height,
            bytes: up.bytes,
            format: up.format,
          },
        });
        fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
        count++;
        taken++;
        console.log(`  + ${count}/${limit} ${objectName.slice(0, 60)} [${src.phase}${zoneSlug ? ' / ' + zoneSlug : ''}]`);
      } catch (e) {
        console.log(`  ! skip ${title}: ${e.message || e}`);
      }
    }
  }
  console.log(`\nUpload stage complete: ${manifest.length} assets in ${MANIFEST}`);
  return manifest;
}

const REST = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') + '/rest/v1';
const H = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const r = await fetch(REST + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function resolveOrg() {
  const orgs = await rest('/organizations?select=id,name,created_at&order=created_at.asc');
  const org = orgs.find((o) => o.name === 'Chennai Flood-Watch Collective') || orgs[0];
  if (!org) throw new Error('No organization found. Run the earlier migrations first.');
  const mem = await rest(`/organization_members?select=user_id,role&organization_id=eq.${org.id}&order=role.asc`);
  const admin = mem.find((m) => m.role === 'ADMIN') || mem[0];
  if (!admin) throw new Error('Organization has no members.');
  return { orgId: org.id, orgName: org.name, userId: admin.user_id };
}

async function stageDb(manifest, { orgId, userId }) {
  let zones = [];
  try {
    zones = await rest(`/zones?select=id,slug&organization_id=eq.${orgId}`);
  } catch (e) {
    console.error(
      '\nCould not read the `zones` table. Apply supabase/migrations/20260929000005_flood_watch.sql in the Supabase SQL editor first.\n' +
        e.message
    );
    process.exit(2);
  }
  const zoneId = Object.fromEntries(zones.map((z) => [z.slug, z.id]));
  const rows = manifest.map((m) => ({
    organization_id: orgId,
    project_id: null,
    zone_id: m.zone_slug ? zoneId[m.zone_slug] ?? null : null,
    cloudinary_public_id: m.cloudinary.public_id,
    cloudinary_asset_id: m.cloudinary.asset_id,
    cloudinary_url: m.cloudinary.secure_url,
    version: m.cloudinary.version,
    etag: m.cloudinary.etag,
    resource_type: 'image',
    original_filename: m.title.slice(0, 200),
    mime_type: m.cloudinary.format === 'png' ? 'image/png' : 'image/jpeg',
    file_size: m.cloudinary.bytes,
    width: m.cloudinary.width,
    height: m.cloudinary.height,
    title: m.title.slice(0, 200),
    description: m.description ? m.description.slice(0, 1000) : null,
    location: m.zone_slug ? ZONES[m.zone_slug].name : null,
    captured_at: m.captured_at,
    lat: m.lat,
    lng: m.lng,
    phase: m.phase,
    event_label: m.event_label,
    source_name: 'Wikimedia Commons',
    source_url: m.source_url,
    license: m.license,
    attribution: m.attribution,
    tags: ['chennai', m.phase.toLowerCase(), ...(m.zone_slug ? [m.zone_slug] : [])],
    status: 'UPLOADED',
    created_by: userId,
  }));
  for (let i = 0; i < rows.length; i += 25) {
    await rest('/media_assets?on_conflict=organization_id,cloudinary_public_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 25)),
    });
  }
  console.log(`Database stage complete: ${rows.length} media_assets upserted.`);
}

const ctx = await resolveOrg();
console.log(`Organization: ${ctx.orgName} (${ctx.orgId.slice(0, 8)}...)`);
let manifest;
if (onlyDb) manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
else manifest = await stageUpload(ctx.orgId);
if (!onlyUpload) await stageDb(manifest, ctx);
