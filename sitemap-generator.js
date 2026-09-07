/**
 * Edify Tutorial — Learning Hub Sitemap Generator
 * Fetches all published educational resources from Supabase and generates a valid sitemap.xml.
 * Can be run via Node.js or imported into build automations.
 *
 * Usage:
 *   node sitemap-generator.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load config from env.js or process.env
let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
let supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const siteBaseUrl = process.env.SITE_URL || 'https://www.edifytutorial.com';

if (!supabaseUrl || !supabaseAnonKey) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, 'env.js'), 'utf8');
    const urlMatch = envContent.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/i);
    const keyMatch = envContent.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
    if (urlMatch) supabaseUrl = urlMatch[0];
    if (keyMatch) supabaseAnonKey = keyMatch[0];
  } catch (e) {
    console.warn('Could not read env.js, using environment variables if set.');
  }
}

async function fetchPublishedResources() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is missing');
  }

  const endpoint = `${supabaseUrl}/rest/v1/resources?select=id,title,slug,class_level,subject,chapter,topic,published_at,updated_at&status=eq.published&order=published_at.desc`;

  return new Promise((resolve) => {
    const url = new URL(endpoint);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            resolve([]);
          }
        } else {
          console.warn(`Supabase API notice (${res.statusCode}): The 'public.resources' table may not be migrated yet in Supabase.`);
          console.log('Using approved seed resources for sitemap generation until schema.sql is executed in Supabase.');
          resolve([
            {
              id: 'seed-res-1',
              title: "Ohm's Law – Definition, Formula & Examples",
              slug: 'ohms-law-class-10',
              class_level: 'Class 10',
              subject: 'Physics',
              chapter: 'Electricity',
              topic: "Ohm's Law",
              published_at: new Date().toISOString()
            },
            {
              id: 'seed-res-2',
              title: 'Resistance – Formula and Explanation',
              slug: 'resistance-formula-and-explanation-class-10',
              class_level: 'Class 10',
              subject: 'Physics',
              chapter: 'Electricity',
              topic: 'Resistance',
              published_at: new Date().toISOString()
            }
          ]);
        }
      });
    });

    req.on('error', (err) => {
      console.warn('Network error reaching Supabase:', err.message);
      resolve([]);
    });
    req.end();
  });
}

function cleanSlug(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function generate() {
  console.log('Generating sitemap for Edify Learning Hub...');
  try {
    const resources = await fetchPublishedResources();
    console.log(`Found ${resources.length} published resources.`);

    const base = siteBaseUrl.replace(/\/+$/, '');
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static public portal URL
    xml += '  <url>\n';
    xml += `    <loc>${base}/learning-hub</loc>\n`;
    xml += '    <changefreq>daily</changefreq>\n';
    xml += '    <priority>0.9</priority>\n';
    xml += '  </url>\n';

    const classes = new Set();
    const classSubjects = new Set();

    resources.forEach((r) => {
      const c = cleanSlug(r.class_level);
      const s = cleanSlug(r.subject);
      if (c) classes.add(c);
      if (c && s) classSubjects.add(`${c}/${s}`);
    });

    // Class landing pages
    classes.forEach((c) => {
      xml += '  <url>\n';
      xml += `    <loc>${base}/learning-hub/${c}</loc>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    });

    // Class + Subject landing pages
    classSubjects.forEach((cs) => {
      xml += '  <url>\n';
      xml += `    <loc>${base}/learning-hub/${cs}</loc>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    });

    // Individual Resource pages
    resources.forEach((r) => {
      const c = cleanSlug(r.class_level);
      const s = cleanSlug(r.subject);
      const slug = cleanSlug(r.slug);
      const lastmod = (r.published_at || r.updated_at || new Date().toISOString()).split('T')[0];

      xml += '  <url>\n';
      xml += `    <loc>${base}/learning-hub/${c}/${s}/${slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += '    <changefreq>monthly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    });

    xml += '</urlset>\n';

    const outPath = path.join(__dirname, 'sitemap.xml');
    fs.writeFileSync(outPath, xml, 'utf8');
    console.log(`Successfully generated sitemap at ${outPath} with ${classes.size + classSubjects.size + resources.length + 1} URLs.`);
  } catch (err) {
    console.error('Error generating sitemap:', err.message);
  }
}

if (require.main === module) {
  generate();
}

module.exports = { generate, fetchPublishedResources };
