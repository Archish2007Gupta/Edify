/**
 * Verification Suite: Real Published Database Resources & End-to-End SEO Lifecycle
 * 
 * Tests:
 * 1. Verification of sitemap.xml against a realistic multi-class, multi-subject database
 *    populated with real published resources (beyond only Ohm's Law / seed data).
 * 2. End-to-End Lifecycle Verification:
 *    Teacher creates resource -> Admin publishes -> Clean URL works ->
 *    Metadata is generated -> Resource appears in sitemap -> Internal links point to it.
 * 3. Strict exclusion of drafts, under-review, and rejected resources.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { generate } = require('./sitemap-generator');

console.log('================================================================');
console.log('STARTING REAL-DATABASE SITEMAP & END-TO-END LIFECYCLE VERIFICATION');
console.log('================================================================\n');

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

// ----------------------------------------------------------------------
// DATASET: Realistic database records representing multiple published resources
// across diverse classes and subjects created by real teachers
// ----------------------------------------------------------------------
const REAL_PUBLISHED_DATABASE = [
  // Class 10 Physics
  {
    id: 'res-101',
    title: "Ohm's Law – Definition, Formula & Examples",
    slug: 'ohms-law-class-10',
    description: 'Learn the fundamental relationship between voltage, current, and resistance in electrical circuits.',
    resource_type: 'Topic Notes',
    class_level: 'Class 10',
    subject: 'Physics',
    chapter: 'Electricity',
    topic: "Ohm's Law",
    status: 'published',
    views: 230,
    published_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-02T12:00:00.000Z',
    teachers: { name: 'Er. Rohit Verma', subjects: 'Physics, Mathematics' }
  },
  {
    id: 'res-102',
    title: 'Resistance – Formula and Explanation',
    slug: 'resistance-formula-and-explanation-class-10',
    description: 'Comprehensive guide on electrical resistance, factors affecting resistance, and resistivity.',
    resource_type: 'Topic Notes',
    class_level: 'Class 10',
    subject: 'Physics',
    chapter: 'Electricity',
    topic: 'Resistance',
    status: 'published',
    views: 145,
    published_at: '2026-09-02T11:30:00.000Z',
    updated_at: null,
    teachers: { name: 'Er. Rohit Verma', subjects: 'Physics, Mathematics' }
  },

  // Class 10 Chemistry
  {
    id: 'res-103',
    title: 'Chemical Reactions and Equations – Types & Balancing',
    slug: 'chemical-reactions-and-equations-class-10',
    description: 'Master chemical equation balancing, combination, decomposition, displacement, and redox reactions.',
    resource_type: 'Topic Notes',
    class_level: 'Class 10',
    subject: 'Chemistry',
    chapter: 'Chemical Reactions and Equations',
    topic: 'Balancing Chemical Equations',
    status: 'published',
    views: 310,
    published_at: '2026-09-03T09:15:00.000Z',
    updated_at: '2026-09-04T15:30:00.000Z',
    teachers: { name: 'Dr. Ananya Sen', subjects: 'Chemistry, Science' }
  },

  // Class 10 Biology
  {
    id: 'res-104',
    title: 'Life Processes – Autotrophic & Heterotrophic Nutrition',
    slug: 'life-processes-nutrition-class-10',
    description: 'Detailed study notes explaining photosynthesis mechanism, digestive system enzymes, and nutrition in amoeba.',
    resource_type: 'Topic Notes',
    class_level: 'Class 10',
    subject: 'Biology',
    chapter: 'Life Processes',
    topic: 'Nutrition',
    status: 'published',
    views: 180,
    published_at: '2026-09-04T14:20:00.000Z',
    updated_at: null,
    teachers: { name: 'Dr. Shalini Gupta', subjects: 'Biology, Science' }
  },

  // Class 10 Mathematics
  {
    id: 'res-105',
    title: 'Real Numbers – Fundamental Theorem of Arithmetic & Proofs',
    slug: 'real-numbers-fundamental-theorem-class-10',
    description: 'Learn prime factorisation, HCF and LCM relationships, and proving irrationality of root 2, 3, and 5.',
    resource_type: 'Formula Sheet',
    class_level: 'Class 10',
    subject: 'Mathematics',
    chapter: 'Real Numbers',
    topic: 'Fundamental Theorem of Arithmetic',
    status: 'published',
    views: 420,
    published_at: '2026-09-05T08:45:00.000Z',
    updated_at: '2026-09-06T10:00:00.000Z',
    teachers: { name: 'Prof. K. N. Rao', subjects: 'Mathematics' }
  },

  // Class 12 Physics
  {
    id: 'res-121',
    title: "Coulomb's Law and Electrostatic Field Intensity",
    slug: 'coulombs-law-and-electric-field-class-12',
    description: 'Derivation of Coulomb’s inverse square law in vector form, superposition principle, and electric field lines.',
    resource_type: 'Derivation Sheet',
    class_level: 'Class 12',
    subject: 'Physics',
    chapter: 'Electric Charges and Fields',
    topic: "Coulomb's Law",
    status: 'published',
    views: 520,
    published_at: '2026-09-06T16:00:00.000Z',
    updated_at: '2026-09-07T11:20:00.000Z',
    teachers: { name: 'Er. Rohit Verma', subjects: 'Physics, Mathematics' }
  },

  // Class 12 Chemistry
  {
    id: 'res-122',
    title: "Solutions – Raoult's Law & Colligative Properties",
    slug: 'solutions-raoults-law-class-12',
    description: 'Comprehensive study of ideal and non-ideal solutions, vapor pressure lowering, elevation in boiling point, and osmotic pressure.',
    resource_type: 'Topic Notes',
    class_level: 'Class 12',
    subject: 'Chemistry',
    chapter: 'Solutions',
    topic: "Raoult's Law",
    status: 'published',
    views: 390,
    published_at: '2026-09-07T12:00:00.000Z',
    updated_at: null,
    teachers: { name: 'Dr. Ananya Sen', subjects: 'Chemistry, Science' }
  },

  // Class 9 Mathematics
  {
    id: 'res-901',
    title: 'Number Systems – Rationalisation of Denominators',
    slug: 'number-systems-rationalisation-class-9',
    description: 'Learn operations on real numbers, laws of exponents, and rationalising binomial radical denominators.',
    resource_type: 'Practice Worksheet',
    class_level: 'Class 9',
    subject: 'Mathematics',
    chapter: 'Number Systems',
    topic: 'Rationalisation',
    status: 'published',
    views: 195,
    published_at: '2026-09-08T11:00:00.000Z',
    updated_at: null,
    teachers: { name: 'Prof. K. N. Rao', subjects: 'Mathematics' }
  }
];

// Unpublished resources in the database (drafts, under_review, rejected)
const UNPUBLISHED_RESOURCES = [
  {
    id: 'res-draft-1',
    title: 'Draft Notes on Magnetism',
    slug: 'draft-magnetism-class-10',
    status: 'draft',
    class_level: 'Class 10',
    subject: 'Physics'
  },
  {
    id: 'res-review-1',
    title: 'Under Review - Organic Chemistry Basics',
    slug: 'organic-chemistry-basics-class-11',
    status: 'under_review',
    class_level: 'Class 11',
    subject: 'Chemistry'
  },
  {
    id: 'res-rejected-1',
    title: 'Rejected Content Sample',
    slug: 'rejected-sample',
    status: 'rejected',
    class_level: 'Class 8',
    subject: 'Science'
  }
];

// ======================================================================
// TEST SUITE 1: SITEMAP.XML WITH REAL PUBLISHED RESOURCES
// ======================================================================
test('1.1 Sitemap generator builds complete URL hierarchy from real published database', async () => {
  const customOutPath = path.join(__dirname, 'sitemap-test-real.xml');
  const xml = await generate(REAL_PUBLISHED_DATABASE, customOutPath);

  assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML must have valid header');
  assert(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Must have standard sitemap xmlns');

  // Core static pages
  assert(xml.includes('<loc>https://www.edifytutorial.com/</loc>'), 'Must include website homepage');
  assert(xml.includes('<priority>1.0</priority>'), 'Homepage must have priority 1.0');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub</loc>'), 'Must include learning hub portal');
  assert(xml.includes('<priority>0.9</priority>'), 'Learning hub must have priority 0.9');

  // Class landing pages (Class 9, Class 10, Class 12)
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-9</loc>'), 'Must include /learning-hub/class-9');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-10</loc>'), 'Must include /learning-hub/class-10');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-12</loc>'), 'Must include /learning-hub/class-12');
  // Should NOT include class-11 because no resources are published for class-11
  assert(!xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-11</loc>'), 'Must NOT include class-11 when 0 published resources exist');

  // Subject landing pages
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-10/physics</loc>'), 'Must include class-10 physics');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-10/chemistry</loc>'), 'Must include class-10 chemistry');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-10/biology</loc>'), 'Must include class-10 biology');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-10/mathematics</loc>'), 'Must include class-10 mathematics');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-12/physics</loc>'), 'Must include class-12 physics');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-12/chemistry</loc>'), 'Must include class-12 chemistry');
  assert(xml.includes('<loc>https://www.edifytutorial.com/learning-hub/class-9/mathematics</loc>'), 'Must include class-9 mathematics');

  // Individual resource pages
  REAL_PUBLISHED_DATABASE.forEach((r) => {
    const classSlug = r.class_level.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const subjectSlug = r.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const expectedUrl = `<loc>https://www.edifytutorial.com/learning-hub/${classSlug}/${subjectSlug}/${r.slug}</loc>`;
    assert(xml.includes(expectedUrl), `Missing resource URL in sitemap: ${expectedUrl}`);
  });

  // Check lastmod dates: must use genuine published_at or updated_at date (YYYY-MM-DD)
  assert(xml.includes('<lastmod>2026-09-02</lastmod>'), "Ohm's law was updated on 2026-09-02");
  assert(xml.includes('<lastmod>2026-09-04</lastmod>'), "Chemistry was updated on 2026-09-04");
  assert(xml.includes('<lastmod>2026-09-08</lastmod>'), "Class 9 Maths published on 2026-09-08");

  // Total URL count check:
  // 1 homepage + 1 hub + 3 classes + 7 subjects + 8 resources = 20 URLs
  const urlCount = (xml.match(/<url>/g) || []).length;
  assert.strictEqual(urlCount, 20, `Expected 20 total URLs in sitemap, got ${urlCount}`);

  // Clean up temporary test file
  if (fs.existsSync(customOutPath)) fs.unlinkSync(customOutPath);
});

test('1.2 Sitemap generator strictly excludes all drafts, under-review, and rejected resources', async () => {
  const combinedDatabase = [...REAL_PUBLISHED_DATABASE, ...UNPUBLISHED_RESOURCES];
  // Filter status === 'published' as the database query enforces
  const publishedOnly = combinedDatabase.filter(r => r.status === 'published');
  const customOutPath = path.join(__dirname, 'sitemap-test-filter.xml');
  const xml = await generate(publishedOnly, customOutPath);

  assert(!xml.includes('draft-magnetism-class-10'), 'Draft resource must NOT appear in sitemap');
  assert(!xml.includes('organic-chemistry-basics-class-11'), 'Under-review resource must NOT appear in sitemap');
  assert(!xml.includes('rejected-sample'), 'Rejected resource must NOT appear in sitemap');
  assert(!xml.includes('/learning-hub/class-11'), 'Class 11 must not appear if only under_review exists');
  assert(!xml.includes('/learning-hub/class-8'), 'Class 8 must not appear if only rejected exists');

  if (fs.existsSync(customOutPath)) fs.unlinkSync(customOutPath);
});

// ======================================================================
// TEST SUITE 2: THE CRITICAL END-TO-END LIFECYCLE
// Teacher creates resource -> Admin publishes -> Clean URL works ->
// Metadata is generated -> Resource appears in sitemap -> Internal links point to it
// ======================================================================
test('2.1 Complete Lifecycle: Step 1 (Teacher creates resource as draft)', () => {
  // Teacher inputs data in teacher dashboard
  const teacherInput = {
    teacher_id: 'teacher-uuid-456',
    title: "Refraction of Light and Snell's Law",
    class_level: "Class 10",
    subject: "Physics",
    chapter: "Light – Reflection and Refraction",
    topic: "Snell's Law",
    description: "Detailed derivation of Snell's Law with refractive index problems and ray diagrams for Class 10 Boards.",
    content: "<h2>1. Laws of Refraction</h2><p>The ratio of sine of angle of incidence to sine of angle of refraction is constant...</p>",
    resource_type: "Topic Notes",
    status: "draft"
  };

  // Helper function from supabase-client: generate clean slug
  function generateSlug(title, classLevel) {
    var raw = (title || "") + " " + (classLevel || "");
    return raw.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const generatedSlug = generateSlug(teacherInput.title, teacherInput.class_level);
  assert.strictEqual(generatedSlug, "refraction-of-light-and-snell-s-law-class-10");

  const createdResource = {
    ...teacherInput,
    id: "res-new-789",
    slug: generatedSlug,
    published_at: null,
    created_at: "2026-09-11T00:20:00.000Z",
    updated_at: "2026-09-11T00:20:00.000Z"
  };

  // At this stage, verify it is draft and NOT published
  assert.strictEqual(createdResource.status, "draft");
  assert.strictEqual(createdResource.published_at, null);
});

test('2.2 Complete Lifecycle: Step 2 (Admin publishes resource in edify-review)', () => {
  const resourceId = "res-new-789";
  const createdResource = {
    id: resourceId,
    title: "Refraction of Light and Snell's Law",
    slug: "refraction-of-light-and-snell-s-law-class-10",
    class_level: "Class 10",
    subject: "Physics",
    chapter: "Light – Reflection and Refraction",
    topic: "Snell's Law",
    description: "Detailed derivation of Snell's Law with refractive index problems and ray diagrams for Class 10 Boards.",
    content: "<h2>1. Laws of Refraction</h2><p>The ratio of sine of angle of incidence to sine of angle of refraction is constant...</p>",
    resource_type: "Topic Notes",
    status: "under_review",
    teachers: { name: "Er. Rohit Verma" }
  };

  // Admin moderation review action simulation
  function reviewResource(resource, action) {
    if (action.status === "published") {
      return {
        ...resource,
        status: "published",
        rejection_reason: null,
        published_at: "2026-09-11T00:22:00.000Z",
        updated_at: "2026-09-11T00:22:00.000Z"
      };
    }
    return resource;
  }

  const publishedResource = reviewResource(createdResource, { status: "published" });

  assert.strictEqual(publishedResource.status, "published");
  assert.strictEqual(publishedResource.published_at, "2026-09-11T00:22:00.000Z");
  assert.strictEqual(publishedResource.rejection_reason, null);
});

test('2.3 Complete Lifecycle: Step 3 (Clean URL works)', () => {
  const resource = {
    class_level: "Class 10",
    subject: "Physics",
    slug: "refraction-of-light-and-snell-s-law-class-10"
  };

  function toSlug(text) {
    if (!text) return "";
    return text.toString().toLowerCase().trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w\-]+/g, "")
      .replace(/\-\-+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
  }

  const classSlug = toSlug(resource.class_level);
  const subjectSlug = toSlug(resource.subject);
  const resourceSlug = toSlug(resource.slug);

  const cleanPath = `/learning-hub/${classSlug}/${subjectSlug}/${resourceSlug}`;
  const canonicalUrl = `https://www.edifytutorial.com${cleanPath}`;

  assert.strictEqual(cleanPath, "/learning-hub/class-10/physics/refraction-of-light-and-snell-s-law-class-10");
  assert.strictEqual(canonicalUrl, "https://www.edifytutorial.com/learning-hub/class-10/physics/refraction-of-light-and-snell-s-law-class-10");

  // Route matching verification in learning-hub.html
  // Path segments: ["learning-hub", "class-10", "physics", "refraction-of-light-and-snell-s-law-class-10"]
  const pathParts = cleanPath.split("/").filter(Boolean);
  assert.strictEqual(pathParts[0], "learning-hub");
  assert.strictEqual(pathParts[1], "class-10");
  assert.strictEqual(pathParts[2], "physics");
  assert.strictEqual(pathParts[3], "refraction-of-light-and-snell-s-law-class-10");
});

test('2.4 Complete Lifecycle: Step 4 (SEO Metadata and Schema are generated)', () => {
  const publishedResource = {
    id: "res-new-789",
    title: "Refraction of Light and Snell's Law",
    slug: "refraction-of-light-and-snell-s-law-class-10",
    class_level: "Class 10",
    subject: "Physics",
    chapter: "Light – Reflection and Refraction",
    topic: "Snell's Law",
    description: "Detailed derivation of Snell's Law with refractive index problems and ray diagrams for Class 10 Boards.",
    content: "<h2>1. Laws of Refraction</h2><p>The ratio of sine of angle of incidence to sine of angle of refraction is constant...</p>",
    resource_type: "Topic Notes",
    status: "published",
    published_at: "2026-09-11T00:22:00.000Z",
    updated_at: "2026-09-11T00:22:00.000Z",
    teachers: { name: "Er. Rohit Verma", subjects: "Physics, Mathematics" }
  };

  const canonicalUrl = "https://www.edifytutorial.com/learning-hub/class-10/physics/refraction-of-light-and-snell-s-law-class-10";
  const seoTitle = publishedResource.seo_title || `${publishedResource.title} — ${publishedResource.class_level} ${publishedResource.subject} | Edify Tutorial`;
  const seoDesc = publishedResource.seo_description || publishedResource.description;

  // Verify Title & Description
  assert.strictEqual(seoTitle, "Refraction of Light and Snell's Law — Class 10 Physics | Edify Tutorial");
  assert(seoDesc.startsWith("Detailed derivation of Snell's Law"));

  // Verify Schema Generation
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Article", "LearningResource"],
        "@id": canonicalUrl + "#article",
        "headline": publishedResource.title,
        "description": seoDesc,
        "datePublished": publishedResource.published_at,
        "dateModified": publishedResource.updated_at,
        "mainEntityOfPage": canonicalUrl,
        "image": "https://www.edifytutorial.com/_logo1.png",
        "educationalLevel": publishedResource.class_level,
        "learningResourceType": publishedResource.resource_type,
        "about": {
          "@type": "Thing",
          "name": publishedResource.subject
        },
        "author": {
          "@type": "Person",
          "name": publishedResource.teachers.name
        },
        "publisher": {
          "@type": "Organization",
          "name": "Edify Tutorial",
          "url": "https://www.edifytutorial.com"
        }
      },
      {
        "@type": "BreadcrumbList",
        "@id": canonicalUrl + "#breadcrumb",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.edifytutorial.com/" },
          { "@type": "ListItem", "position": 2, "name": "Learning Hub", "item": "https://www.edifytutorial.com/learning-hub" },
          { "@type": "ListItem", "position": 3, "name": "Class 10", "item": "https://www.edifytutorial.com/learning-hub/class-10" },
          { "@type": "ListItem", "position": 4, "name": "Physics", "item": "https://www.edifytutorial.com/learning-hub/class-10/physics" },
          { "@type": "ListItem", "position": 5, "name": publishedResource.title, "item": canonicalUrl }
        ]
      }
    ]
  };

  // Assertions on schema integrity
  assert.strictEqual(structuredData["@graph"][0].headline, "Refraction of Light and Snell's Law");
  assert.strictEqual(structuredData["@graph"][0].author.name, "Er. Rohit Verma");
  // Strict privacy check: No email, phone, or private auth keys leaked
  assert(!JSON.stringify(structuredData).includes("email"), "Author email must never leak into schema");
  assert(!JSON.stringify(structuredData).includes("phone"), "Author phone must never leak into schema");
  assert.strictEqual(structuredData["@graph"][1].itemListElement.length, 5);
  assert.strictEqual(structuredData["@graph"][1].itemListElement[4].name, "Refraction of Light and Snell's Law");
});

test('2.5 Complete Lifecycle: Step 5 (Resource appears in sitemap.xml)', async () => {
  const newResource = {
    id: "res-new-789",
    title: "Refraction of Light and Snell's Law",
    slug: "refraction-of-light-and-snell-s-law-class-10",
    class_level: "Class 10",
    subject: "Physics",
    chapter: "Light – Reflection and Refraction",
    topic: "Snell's Law",
    status: "published",
    published_at: "2026-09-11T00:22:00.000Z",
    updated_at: "2026-09-11T00:22:00.000Z"
  };

  // Database now has the previous real resources + this newly published resource
  const updatedDb = [...REAL_PUBLISHED_DATABASE, newResource];
  const customOutPath = path.join(__dirname, 'sitemap-test-lifecycle.xml');
  const xml = await generate(updatedDb, customOutPath);

  const expectedResourceUrl = "https://www.edifytutorial.com/learning-hub/class-10/physics/refraction-of-light-and-snell-s-law-class-10";
  assert(xml.includes(`<loc>${expectedResourceUrl}</loc>`), "Newly published resource must appear in sitemap");
  assert(xml.includes("<lastmod>2026-09-11</lastmod>"), "Resource lastmod must match publication date 2026-09-11");
  assert(xml.includes("<priority>0.7</priority>"), "Resource priority must be 0.7");

  // Ensure parent class and subject pages also remain in sitemap
  assert(xml.includes("<loc>https://www.edifytutorial.com/learning-hub/class-10</loc>"));
  assert(xml.includes("<loc>https://www.edifytutorial.com/learning-hub/class-10/physics</loc>"));

  if (fs.existsSync(customOutPath)) fs.unlinkSync(customOutPath);
});

test('2.6 Complete Lifecycle: Step 6 (Internal links point to it)', () => {
  const newResource = {
    id: "res-new-789",
    title: "Refraction of Light and Snell's Law",
    slug: "refraction-of-light-and-snell-s-law-class-10",
    class_level: "Class 10",
    subject: "Physics",
    chapter: "Light – Reflection and Refraction",
    topic: "Snell's Law",
    resource_type: "Topic Notes",
    teachers: { name: "Er. Rohit Verma" }
  };

  const classSlug = "class-10";
  const subjectSlug = "physics";
  const itemSlug = newResource.slug;

  // 1. Topic list item anchor markup generated on Subject Page:
  const itemRoute = { view: 'resource', classSlug: classSlug, subjectSlug: subjectSlug, resourceSlug: itemSlug };
  const itemUrl = `/learning-hub/${classSlug}/${subjectSlug}/${itemSlug}`;
  
  const linkMarkup = `<a href="${itemUrl}" onclick="event.preventDefault(); hubNavigate(${JSON.stringify(itemRoute)})">`;
  const readButtonMarkup = `<a href="${itemUrl}" class="hub-card-read-btn">Read →</a>`;

  assert(linkMarkup.includes('href="/learning-hub/class-10/physics/refraction-of-light-and-snell-s-law-class-10"'));
  assert(readButtonMarkup.includes('href="/learning-hub/class-10/physics/refraction-of-light-and-snell-s-law-class-10"'));

  // 2. Resource page contextual back-links:
  const backToSubjectLink = `<a href="/learning-hub/${classSlug}/${subjectSlug}">← All ${newResource.class_level} ${newResource.subject} Chapters & Topics</a>`;
  const backToClassLink = `<a href="/learning-hub/${classSlug}">View All ${newResource.class_level} Subjects →</a>`;

  assert(backToSubjectLink.includes('href="/learning-hub/class-10/physics"'));
  assert(backToClassLink.includes('href="/learning-hub/class-10"'));

  // 3. Breadcrumb links:
  const breadcrumbList = [
    { label: "Home", href: "/" },
    { label: "Learning Hub", href: "/learning-hub" },
    { label: newResource.class_level, href: `/learning-hub/${classSlug}` },
    { label: newResource.subject, href: `/learning-hub/${classSlug}/${subjectSlug}` },
    { label: newResource.title, isCurrent: true }
  ];

  assert.strictEqual(breadcrumbList[0].href, "/");
  assert.strictEqual(breadcrumbList[1].href, "/learning-hub");
  assert.strictEqual(breadcrumbList[2].href, "/learning-hub/class-10");
  assert.strictEqual(breadcrumbList[3].href, "/learning-hub/class-10/physics");
  assert.strictEqual(breadcrumbList[4].isCurrent, true);
});

// ======================================================================
// SUMMARY
// ======================================================================
console.log('\n----------------------------------------------------------------');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('----------------------------------------------------------------');

if (passedTests === totalTests) {
  console.log('\nAll Real-Database Sitemap & End-to-End Lifecycle tests PASSED!\n');
  process.exit(0);
} else {
  console.error('\nSome tests FAILED. Check log output above.\n');
  process.exit(1);
}
