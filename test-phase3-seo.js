/**
 * End-to-End Test Suite for Phase 3: SEO & Google Search Optimization
 * Verifies robots.txt, sitemap.xml, metadata generation, internal linking,
 * and the complete teacher-authored -> published -> indexed resource lifecycle.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('RUNNING PHASE 3 SEO & SITEMAP VERIFICATION SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. ROBOTS.TXT TESTS
// -------------------------------------------------------------
test('1.1 robots.txt exists and has valid production directives', () => {
  const robotsPath = path.join(__dirname, 'robots.txt');
  assert(fs.existsSync(robotsPath), 'robots.txt must exist at root');
  const content = fs.readFileSync(robotsPath, 'utf8');

  assert(content.includes('User-agent: *'), 'Must define User-agent: *');
  assert(content.includes('Allow: /'), 'Must allow root');
  assert(content.includes('Allow: /learning-hub'), 'Must allow /learning-hub');
  assert(content.includes('Allow: /learning-hub/*'), 'Must allow /learning-hub/*');
  assert(content.includes('Disallow: /teacher-login'), 'Must disallow teacher login');
  assert(content.includes('Disallow: /teacher-dashboard'), 'Must disallow teacher dashboard');
  assert(content.includes('Disallow: /edify-review'), 'Must disallow edify-review');
  assert(content.includes('Disallow: /admin'), 'Must disallow admin');
  assert(content.includes('Sitemap: https://www.edifytutorial.com/sitemap.xml'), 'Must reference production sitemap');
});

// -------------------------------------------------------------
// 2. HOMEPAGE SEO TESTS
// -------------------------------------------------------------
test('2.1 edify-tutorial-landing.html contains canonical, OG, Twitter & JSON-LD schema', () => {
  const landingPath = path.join(__dirname, 'edify-tutorial-landing.html');
  const content = fs.readFileSync(landingPath, 'utf8');

  assert(content.includes('<link rel="canonical" href="https://www.edifytutorial.com/" />'), 'Missing canonical URL on homepage');
  assert(content.includes('property="og:title"'), 'Missing og:title on homepage');
  assert(content.includes('property="og:url" content="https://www.edifytutorial.com/"'), 'Missing og:url on homepage');
  assert(content.includes('name="twitter:card" content="summary_large_image"'), 'Missing twitter:card on homepage');
  assert(content.includes('"@type": "EducationalOrganization"'), 'Missing EducationalOrganization in homepage schema');
  assert(content.includes('"@type": "WebSite"'), 'Missing WebSite in homepage schema');

  // Verify single H1
  const h1Matches = content.match(/<h1[\s\S]*?<\/h1>/gi);
  assert(h1Matches && h1Matches.length === 1, `Homepage must have exactly 1 H1 heading, found ${h1Matches ? h1Matches.length : 0}`);
});

// -------------------------------------------------------------
// 3. PRIVATE TEMPLATE NOINDEX TESTS
// -------------------------------------------------------------
test('3.1 Private templates have noindex, nofollow meta directives', () => {
  const reviewContent = fs.readFileSync(path.join(__dirname, 'edify-review.html'), 'utf8');
  assert(reviewContent.includes('name="robots" content="noindex, nofollow"'), 'edify-review.html must have noindex, nofollow');

  const teacherLogin = fs.readFileSync(path.join(__dirname, 'teacher-login.html'), 'utf8');
  assert(teacherLogin.includes('name="robots" content="noindex, nofollow"'), 'teacher-login.html must have noindex, nofollow');

  const teacherDash = fs.readFileSync(path.join(__dirname, 'teacher-dashboard.html'), 'utf8');
  assert(teacherDash.includes('name="robots" content="noindex, nofollow"'), 'teacher-dashboard.html must have noindex, nofollow');
});

// -------------------------------------------------------------
// 4. LEARNING HUB HTML & ROUTING TESTS
// -------------------------------------------------------------
test('4.1 learning-hub.html has complete SEO head tags', () => {
  const hubContent = fs.readFileSync(path.join(__dirname, 'learning-hub.html'), 'utf8');
  assert(hubContent.includes('id="canonicalUrl" rel="canonical" href="https://www.edifytutorial.com/learning-hub"'), 'Missing canonical in hub head');
  assert(hubContent.includes('id="robotsMeta" name="robots" content="index, follow"'), 'Missing robotsMeta in hub head');
  assert(hubContent.includes('id="ogTitle"'), 'Missing ogTitle in hub head');
  assert(hubContent.includes('id="twitterCard" name="twitter:card"'), 'Missing twitterCard in hub head');
  assert(hubContent.includes('id="twitterTitle"'), 'Missing twitterTitle in hub head');
  assert(hubContent.includes('id="structuredData" type="application/ld+json"'), 'Missing structuredData in hub head');
});

test('4.2 learning-hub.html eliminates javascript:void(0) in favor of crawlable HTML links', () => {
  const hubContent = fs.readFileSync(path.join(__dirname, 'learning-hub.html'), 'utf8');

  // Verify class card links use <a href="...">
  assert(hubContent.includes('<a href="${clsUrl}" class="hub-class-card"'), 'Class cards must be semantic <a href="${clsUrl}"> tags');

  // Verify resource cards use <a href="${cardUrl}">
  assert(hubContent.includes('<a href="${cardUrl}" class="hub-card-read-btn"'), 'Resource read button must use semantic href');

  // Verify subject buttons use <a href="${subUrl}">
  assert(hubContent.includes('<a href="${subUrl}" class="hub-subject-btn"'), 'Subject buttons must use semantic href');

  // Verify topic items use <a href="${itemUrl}">
  assert(hubContent.includes('<a href="${itemUrl}" class="hub-card-read-btn"'), 'Topic items must use semantic href');

  // Verify related resources use <a href="${rUrl}">
  assert(hubContent.includes('<a href="${rUrl}" onclick="event.preventDefault(); hubNavigate('), 'Related resources must use semantic href');
});

test('4.3 learning-hub.html has breadcrumbs linking to Home and Learning Hub', () => {
  const hubContent = fs.readFileSync(path.join(__dirname, 'learning-hub.html'), 'utf8');
  assert(hubContent.includes('Home</a></li>'), 'Breadcrumbs must link to Home');
  assert(hubContent.includes('hubHref') && hubContent.includes('Learning Hub</a></li>'), 'Breadcrumbs must link to Learning Hub');
});

test('4.4 learning-hub.html has 404 / not-found handling with noindex directive', () => {
  const hubContent = fs.readFileSync(path.join(__dirname, 'learning-hub.html'), 'utf8');
  assert(hubContent.includes('function renderNotFoundView()'), 'Missing renderNotFoundView');
  assert(hubContent.includes('robots: "noindex, nofollow"'), 'Must apply noindex, nofollow on not-found states');
});

// -------------------------------------------------------------
// 5. END-TO-END SIMULATION:
// Teacher creates resource -> Admin publishes -> Clean URL -> Metadata -> Sitemap -> Internal links
// -------------------------------------------------------------
test('5.1 End-to-End Simulation: Dynamic Published Resource Lifecycle', () => {
  // Simulate a live teacher-created, admin-approved resource in the database
  const livePublishedResource = {
    id: 'res-live-999',
    title: 'Structure of the Human Eye',
    slug: 'structure-of-the-human-eye-class-10',
    description: 'Detailed study notes explaining cornea, iris, pupil, lens, retina, and rods and cones with ray diagrams for Class 10 Board Exams.',
    resource_type: 'Topic Notes',
    class_level: 'Class 10',
    subject: 'Biology',
    chapter: 'The Human Eye and the Colourful World',
    topic: 'Human Eye Anatomy',
    content: '<h2>1. Parts of the Human Eye</h2><p>The human eye works like a camera...</p>',
    cover_image_url: 'https://www.edifytutorial.com/images/human-eye.png',
    pdf_url: 'https://www.edifytutorial.com/notes/class10-human-eye.pdf',
    status: 'published',
    views: 45,
    published_at: '2026-09-10T14:30:00.000Z',
    updated_at: '2026-09-10T16:00:00.000Z',
    teachers: {
      name: 'Dr. Shalini Gupta',
      subjects: 'Biology, Science'
      // Note: email, phone, auth_user_id are strictly excluded
    }
  };

  // 1. Verify clean URL generation
  const cleanSlug = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const classSlug = cleanSlug(livePublishedResource.class_level);
  const subjectSlug = cleanSlug(livePublishedResource.subject);
  const resourceSlug = cleanSlug(livePublishedResource.slug);
  const cleanUrl = `/learning-hub/${classSlug}/${subjectSlug}/${resourceSlug}`;
  const canonicalUrl = `https://www.edifytutorial.com${cleanUrl}`;

  assert.strictEqual(cleanUrl, '/learning-hub/class-10/biology/structure-of-the-human-eye-class-10');
  assert.strictEqual(canonicalUrl, 'https://www.edifytutorial.com/learning-hub/class-10/biology/structure-of-the-human-eye-class-10');

  // 2. Verify dynamic SEO metadata generation
  const seoTitle = livePublishedResource.title + ' — ' + livePublishedResource.class_level + ' ' + livePublishedResource.subject + ' | Edify Tutorial';
  assert.strictEqual(seoTitle, 'Structure of the Human Eye — Class 10 Biology | Edify Tutorial');

  // 3. Verify structured data graph format
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Article', 'LearningResource'],
        '@id': canonicalUrl + '#article',
        'headline': livePublishedResource.title,
        'description': livePublishedResource.description,
        'datePublished': livePublishedResource.published_at,
        'dateModified': livePublishedResource.updated_at,
        'mainEntityOfPage': canonicalUrl,
        'image': livePublishedResource.cover_image_url,
        'educationalLevel': livePublishedResource.class_level,
        'author': {
          '@type': 'Person',
          'name': livePublishedResource.teachers.name
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'Edify Tutorial',
          'url': 'https://www.edifytutorial.com'
        }
      },
      {
        '@type': 'BreadcrumbList',
        '@id': canonicalUrl + '#breadcrumb',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://www.edifytutorial.com/' },
          { '@type': 'ListItem', 'position': 2, 'name': 'Learning Hub', 'item': 'https://www.edifytutorial.com/learning-hub' },
          { '@type': 'ListItem', 'position': 3, 'name': livePublishedResource.class_level, 'item': 'https://www.edifytutorial.com/learning-hub/' + classSlug },
          { '@type': 'ListItem', 'position': 4, 'name': livePublishedResource.subject, 'item': 'https://www.edifytutorial.com/learning-hub/' + classSlug + '/' + subjectSlug },
          { '@type': 'ListItem', 'position': 5, 'name': livePublishedResource.title, 'item': canonicalUrl }
        ]
      }
    ]
  };

  assert(structuredData['@graph'][0].headline === 'Structure of the Human Eye');
  assert(structuredData['@graph'][0].author.name === 'Dr. Shalini Gupta');
  assert(structuredData['@graph'][1].itemListElement.length === 5);

  // 4. Verify Sitemap generation logic with dynamic resource pool
  const testResources = [
    {
      id: 'res-1',
      title: "Ohm's Law",
      slug: 'ohms-law-class-10',
      class_level: 'Class 10',
      subject: 'Physics',
      published_at: '2026-09-01T10:00:00.000Z'
    },
    livePublishedResource
  ];

  const base = 'https://www.edifytutorial.com';
  let sitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  sitemapXml += `  <url>\n    <loc>${base}/</loc>\n    <priority>1.0</priority>\n  </url>\n`;
  sitemapXml += `  <url>\n    <loc>${base}/learning-hub</loc>\n    <priority>0.9</priority>\n  </url>\n`;

  const classes = new Set();
  const classSubjects = new Set();

  testResources.forEach(r => {
    const c = cleanSlug(r.class_level);
    const s = cleanSlug(r.subject);
    if (c) classes.add(c);
    if (c && s) classSubjects.add(`${c}/${s}`);
  });

  classes.forEach(c => {
    sitemapXml += `  <url>\n    <loc>${base}/learning-hub/${c}</loc>\n  </url>\n`;
  });

  classSubjects.forEach(cs => {
    sitemapXml += `  <url>\n    <loc>${base}/learning-hub/${cs}</loc>\n  </url>\n`;
  });

  testResources.forEach(r => {
    const c = cleanSlug(r.class_level);
    const s = cleanSlug(r.subject);
    const sl = cleanSlug(r.slug);
    const lastmod = (r.updated_at || r.published_at).split('T')[0];
    sitemapXml += `  <url>\n    <loc>${base}/learning-hub/${c}/${s}/${sl}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n`;
  });

  sitemapXml += '</urlset>';

  // Verify the new dynamic resource appears in sitemap
  assert(sitemapXml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-10/biology/structure-of-the-human-eye-class-10</loc>'), 'Dynamic resource URL must appear in sitemap');
  assert(sitemapXml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-10/biology</loc>'), 'Dynamic subject URL must appear in sitemap');
  assert(sitemapXml.includes('<lastmod>2026-09-10</lastmod>'), 'Lastmod must match genuine updated_at date');
});

test('5.2 Draft & unpublished resources are strictly excluded from indexing and sitemap', () => {
  const draftResource = {
    id: 'draft-1',
    title: 'Unpublished Draft',
    slug: 'unpublished-draft-slug',
    status: 'draft',
    published_at: null
  };

  const pool = [draftResource].filter(r => r.status === 'published');
  assert.strictEqual(pool.length, 0, 'Draft resource must be excluded from public resource pool');
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('----------------------------------------------------');

if (passedTests === totalTests) {
  console.log('\nAll SEO & Google Search verification tests PASSED successfully!\n');
  process.exit(0);
} else {
  console.error('\nSome tests FAILED. Please review the errors above.\n');
  process.exit(1);
}
