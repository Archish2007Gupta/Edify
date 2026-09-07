-- ==============================================================================
-- EDIFY TUTORIAL — PRODUCTION-HARDENED SUPABASE SECURITY & RLS SCHEMA
-- Shared database schema with 3-Tier RBAC (PUBLIC, TEACHER, ADMIN)
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. TEACHERS TABLE
-- Stores teacher & admin profiles and maps them to Supabase Auth Users
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
    subjects TEXT,
    classes TEXT,
    location TEXT,
    availability TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure role column exists if table was created previously
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin'));

-- ------------------------------------------------------------------------------
-- 2. DEMO REQUESTS TABLE
-- Stores demo class requests from the website and handles assigned teacher workflows
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.demo_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name TEXT NOT NULL,
    parent_name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    class TEXT,
    board TEXT,
    subjects TEXT,
    mode TEXT,
    location TEXT,
    preferred_date DATE,
    preferred_time TEXT,
    message TEXT,
    status TEXT DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Accepted', 'Scheduled', 'Completed', 'Cancelled')),
    assigned_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    demo_date DATE,
    demo_time TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 3. HARDENED SECURITY DEFINER HELPER FUNCTIONS
-- Securely evaluate user roles and current teacher ID using search_path = public
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teachers
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_teacher_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.teachers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- ------------------------------------------------------------------------------
-- 4. SECURE RPC FUNCTION FOR TEACHER STATUS & SCHEDULE UPDATES
-- Safe RPC allowing Teachers to update ONLY permitted fields (status, demo_date, demo_time)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_teacher_demo_request(
    p_request_id UUID,
    p_status TEXT DEFAULT NULL,
    p_demo_date DATE DEFAULT NULL,
    p_demo_time TEXT DEFAULT NULL
)
RETURNS public.demo_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_id UUID;
    v_updated_row public.demo_requests;
    v_current_assigned UUID;
BEGIN
    -- Require authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Fetch current teacher ID
    v_teacher_id := public.get_current_teacher_id();
    IF v_teacher_id IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'User is not a registered teacher' USING ERRCODE = '42501';
    END IF;

    -- Verify request exists and teacher is authorized
    SELECT assigned_teacher_id INTO v_current_assigned
    FROM public.demo_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demo request not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_admin() AND v_current_assigned IS NOT NULL AND v_current_assigned <> v_teacher_id THEN
        RAISE EXCEPTION 'Unauthorized: Request is assigned to another teacher' USING ERRCODE = '42501';
    END IF;

    -- Perform atomic update:
    -- If request was unassigned and status is Accepted / Scheduled / Contacted / Completed, claim assignment for this teacher
    UPDATE public.demo_requests
    SET
        status = COALESCE(p_status, status),
        assigned_teacher_id = CASE
            WHEN NOT public.is_admin() AND assigned_teacher_id IS NULL AND p_status IN ('Accepted', 'Scheduled', 'Contacted', 'Completed') THEN v_teacher_id
            ELSE assigned_teacher_id
        END,
        demo_date = COALESCE(p_demo_date, demo_date),
        demo_time = COALESCE(p_demo_time, demo_time),
        updated_at = now()
    WHERE id = p_request_id
      AND (public.is_admin() OR assigned_teacher_id = v_teacher_id OR assigned_teacher_id IS NULL)
    RETURNING * INTO v_updated_row;

    IF v_updated_row.id IS NULL THEN
        RAISE EXCEPTION 'Demo request not found or access denied' USING ERRCODE = '42501';
    END IF;

    RETURN v_updated_row;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. DATABASE TRIGGERS FOR HARDENED COLUMN PROTECTION
-- ------------------------------------------------------------------------------

-- A. Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_demo_requests_updated_at ON public.demo_requests;
CREATE TRIGGER update_demo_requests_updated_at
BEFORE UPDATE ON public.demo_requests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- B. Prevent non-admins from modifying protected columns on demo_requests
CREATE OR REPLACE FUNCTION public.enforce_teacher_demo_request_column_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can update any field
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Verify row belongs to assigned teacher OR was unassigned
  IF OLD.assigned_teacher_id IS NOT NULL AND OLD.assigned_teacher_id IS DISTINCT FROM public.get_current_teacher_id() THEN
    RAISE EXCEPTION 'Unauthorized: You are not assigned to this demo request' USING ERRCODE = '42501';
  END IF;

  -- If previously unassigned, non-admin teacher can ONLY claim it for themselves (NEW.assigned_teacher_id = current teacher) or leave it unchanged
  IF OLD.assigned_teacher_id IS NULL THEN
    IF NEW.assigned_teacher_id IS NOT NULL AND NEW.assigned_teacher_id IS DISTINCT FROM public.get_current_teacher_id() THEN
      RAISE EXCEPTION 'Unauthorized: Cannot assign request to another teacher' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- If already assigned, non-admin teacher cannot re-assign
    IF NEW.assigned_teacher_id IS DISTINCT FROM OLD.assigned_teacher_id THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can reassign requests' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Block modification to all protected columns for non-admins
  IF NEW.student_name IS DISTINCT FROM OLD.student_name OR
     NEW.parent_name IS DISTINCT FROM OLD.parent_name OR
     NEW.phone IS DISTINCT FROM OLD.phone OR
     NEW.email IS DISTINCT FROM OLD.email OR
     NEW.class IS DISTINCT FROM OLD.class OR
     NEW.board IS DISTINCT FROM OLD.board OR
     NEW.subjects IS DISTINCT FROM OLD.subjects OR
     NEW.mode IS DISTINCT FROM OLD.mode OR
     NEW.location IS DISTINCT FROM OLD.location OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR
     NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Unauthorized: Teachers may only update status, demo_date, demo_time, and claim unassigned requests' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_teacher_demo_request_columns ON public.demo_requests;
CREATE TRIGGER trg_enforce_teacher_demo_request_columns
BEFORE UPDATE ON public.demo_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_teacher_demo_request_column_protection();

-- C. Prevent non-admins from modifying role or identity fields on public.teachers
CREATE OR REPLACE FUNCTION public.enforce_teacher_profile_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can manage any teacher profile and role
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Block role modification by non-admins
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can modify user roles' USING ERRCODE = '42501';
  END IF;

  -- Block modification to identity fields
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot modify profile identity fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_teacher_profile_protection ON public.teachers;
CREATE TRIGGER trg_enforce_teacher_profile_protection
BEFORE UPDATE ON public.teachers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_teacher_profile_protection();

-- D. Sanitize public inserts into demo_requests
CREATE OR REPLACE FUNCTION public.sanitize_public_demo_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If inserted by public / non-admin user:
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    NEW.assigned_teacher_id := NULL;
    NEW.status := 'New';
    NEW.demo_date := NULL;
    NEW.demo_time := NULL;
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_demo_request_insert ON public.demo_requests;
CREATE TRIGGER trg_sanitize_demo_request_insert
BEFORE INSERT ON public.demo_requests
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_public_demo_request_insert();

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES — STRICT 3-TIER ENFORCEMENT
-- ------------------------------------------------------------------------------

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- Clean up existing legacy policies
DROP POLICY IF EXISTS "Allow public insert to demo_requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Allow public read to demo_requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Allow public update to demo_requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Allow teachers to read assigned demo_requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Allow authenticated read demo_requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Allow teacher and admin update demo_requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Allow admin delete demo_requests" ON public.demo_requests;

DROP POLICY IF EXISTS "Allow public read to teachers" ON public.teachers;
DROP POLICY IF EXISTS "Allow public insert to teachers" ON public.teachers;
DROP POLICY IF EXISTS "Allow authenticated read teachers" ON public.teachers;
DROP POLICY IF EXISTS "Allow teacher update own profile" ON public.teachers;
DROP POLICY IF EXISTS "Allow admin manage teachers" ON public.teachers;
DROP POLICY IF EXISTS "Allow admin insert teachers" ON public.teachers;
DROP POLICY IF EXISTS "Allow admin delete teachers" ON public.teachers;

-- ------------------------------------------------------------------------------
-- DEMO_REQUESTS RLS POLICIES
-- ------------------------------------------------------------------------------

-- PUBLIC: Anyone can submit a demo request from the public website
CREATE POLICY "Allow public insert to demo_requests" 
ON public.demo_requests 
FOR INSERT 
WITH CHECK (true);

-- TEACHER & ADMIN READ: Teachers view assigned requests and unassigned new requests; Admins view all requests
CREATE POLICY "Allow authenticated read demo_requests" 
ON public.demo_requests 
FOR SELECT 
TO authenticated
USING (
  public.is_admin() OR 
  assigned_teacher_id = public.get_current_teacher_id() OR
  assigned_teacher_id IS NULL
);

-- ADMIN UPDATE ONLY ON DEMO_REQUESTS TABLE DIRECTLY:
-- (Teachers update via secure RPC update_teacher_demo_request() which runs SECURITY DEFINER)
CREATE POLICY "Allow admin update demo_requests" 
ON public.demo_requests 
FOR UPDATE 
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

-- ADMIN DELETE ONLY: Only admins can delete demo requests
CREATE POLICY "Allow admin delete demo_requests" 
ON public.demo_requests 
FOR DELETE 
TO authenticated
USING (
  public.is_admin()
);

-- ------------------------------------------------------------------------------
-- TEACHERS TABLE RLS POLICIES
-- ------------------------------------------------------------------------------

-- TEACHER & ADMIN READ: Teachers read own profile; Admins read all teacher profiles
CREATE POLICY "Allow authenticated read teachers" 
ON public.teachers 
FOR SELECT 
TO authenticated
USING (
  public.is_admin() OR 
  auth_user_id = auth.uid()
);

-- TEACHER UPDATE OWN PROFILE: Teachers update own profile details (role protected by trigger)
CREATE POLICY "Allow teacher update own profile"
ON public.teachers
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR auth_user_id = auth.uid()
)
WITH CHECK (
  public.is_admin() OR auth_user_id = auth.uid()
);

-- ADMIN MANAGEMENT: Only admins can insert or delete teacher records
CREATE POLICY "Allow admin insert teachers"
ON public.teachers
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Allow admin delete teachers"
ON public.teachers
FOR DELETE
TO authenticated
USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. LEARNING HUB RESOURCES TABLE
-- Stores educational resources authored by teachers and reviewed by admins
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('Topic Notes', 'Chapter Notes', 'Important Questions', 'MCQs', 'Worksheets', 'Formula Sheets', 'Study Guides', 'Other')),
    class_level TEXT NOT NULL,
    subject TEXT NOT NULL,
    chapter TEXT,
    topic TEXT,
    content TEXT,
    cover_image_url TEXT,
    pdf_url TEXT,
    seo_title TEXT,
    seo_description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'under_review', 'published', 'rejected', 'archived')),
    rejection_reason TEXT,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    CONSTRAINT uq_resources_slug UNIQUE (slug)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_resources_teacher_id ON public.resources(teacher_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON public.resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_class_subject ON public.resources(class_level, subject);
CREATE INDEX IF NOT EXISTS idx_resources_slug ON public.resources(slug);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON public.resources(created_at DESC);

-- Automatic updated_at timestamp trigger for resources
DROP TRIGGER IF EXISTS update_resources_updated_at ON public.resources;
CREATE TRIGGER update_resources_updated_at
BEFORE UPDATE ON public.resources
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 8. HARDENED SECURITY & LIFECYCLE TRIGGER FOR RESOURCES
-- Enforces server-side author attribution, publishing locks, and status transitions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_resource_security_and_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_teacher_id UUID;
BEGIN
    -- Require authenticated user
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Admins have unrestricted moderation permissions
    IF public.is_admin() THEN
        -- If an admin publishes the resource, stamp published_at if not set
        IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
            IF NEW.published_at IS NULL THEN
                NEW.published_at := now();
            END IF;
        END IF;

        -- Clear rejection reason when status moves out of rejected
        IF NEW.status <> 'rejected' THEN
            NEW.rejection_reason := NULL;
        END IF;

        RETURN NEW;
    END IF;

    -- ==========================================================================
    -- TEACHER RULES (STRICT SERVER-SIDE RBAC)
    -- ==========================================================================
    v_current_teacher_id := public.get_current_teacher_id();
    IF v_current_teacher_id IS NULL THEN
        RAISE EXCEPTION 'User profile not linked to any registered teacher' USING ERRCODE = '42501';
    END IF;

    -- A. INSERT VALIDATION
    IF TG_OP = 'INSERT' THEN
        -- Force teacher_id to current teacher
        NEW.teacher_id := v_current_teacher_id;

        -- Teachers can ONLY insert as 'draft' or 'under_review'
        IF NEW.status NOT IN ('draft', 'under_review') THEN
            RAISE EXCEPTION 'Unauthorized: Teachers may only create resources with status draft or under_review' USING ERRCODE = '42501';
        END IF;

        -- Prevent spoofing views, published_at, or rejection_reason
        NEW.views := 0;
        NEW.published_at := NULL;
        NEW.rejection_reason := NULL;

        RETURN NEW;
    END IF;

    -- B. UPDATE VALIDATION
    IF TG_OP = 'UPDATE' THEN
        -- Resource must belong to the current teacher
        IF OLD.teacher_id <> v_current_teacher_id THEN
            RAISE EXCEPTION 'Unauthorized: You can only edit your own resources' USING ERRCODE = '42501';
        END IF;

        -- Teacher cannot transfer ownership
        IF NEW.teacher_id <> OLD.teacher_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify resource author' USING ERRCODE = '42501';
        END IF;

        -- Teacher cannot alter primary key or creation timestamp
        IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Unauthorized: Cannot modify immutable resource identifiers' USING ERRCODE = '42501';
        END IF;

        -- Teacher cannot tamper with view counter
        NEW.views := OLD.views;

        -- Teachers cannot directly publish, reject, or archive
        IF NEW.status IN ('published', 'rejected', 'archived') THEN
            RAISE EXCEPTION 'Unauthorized: Only administrators can publish, reject, or archive resources' USING ERRCODE = '42501';
        END IF;

        -- Published resource edit handling:
        -- If a published resource is edited by a teacher, return it to 'under_review'
        -- and freeze its slug to preserve existing public URLs
        IF OLD.status = 'published' THEN
            IF NEW.slug <> OLD.slug THEN
                RAISE EXCEPTION 'Unauthorized: Slugs for published resources cannot be modified' USING ERRCODE = '42501';
            END IF;
            -- Re-route back into review workflow
            NEW.status := 'under_review';
            NEW.published_at := OLD.published_at;
        END IF;

        -- If resource was rejected and teacher is resubmitting for review:
        IF NEW.status = 'under_review' THEN
            NEW.rejection_reason := NULL;
        ELSE
            -- Preserve rejection reason if still in draft
            NEW.rejection_reason := OLD.rejection_reason;
        END IF;

        RETURN NEW;
    END IF;

    -- C. DELETE VALIDATION
    IF TG_OP = 'DELETE' THEN
        IF OLD.teacher_id <> v_current_teacher_id THEN
            RAISE EXCEPTION 'Unauthorized: You can only delete your own resources' USING ERRCODE = '42501';
        END IF;

        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Unauthorized: Teachers may only delete resources that are in draft status' USING ERRCODE = '42501';
        END IF;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_resource_security ON public.resources;
CREATE TRIGGER trg_enforce_resource_security
BEFORE INSERT OR UPDATE OR DELETE ON public.resources
FOR EACH ROW
EXECUTE FUNCTION public.enforce_resource_security_and_lifecycle();

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES FOR RESOURCES
-- ------------------------------------------------------------------------------
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies if re-running
DROP POLICY IF EXISTS "Allow public read published resources" ON public.resources;
DROP POLICY IF EXISTS "Allow authenticated read resources" ON public.resources;
DROP POLICY IF EXISTS "Allow teachers and admins insert resources" ON public.resources;
DROP POLICY IF EXISTS "Allow teachers and admins update resources" ON public.resources;
DROP POLICY IF EXISTS "Allow teachers delete draft resources and admin delete any" ON public.resources;

-- A. PUBLIC / ANONYMOUS READ:
-- Unauthenticated users can strictly view published resources only
CREATE POLICY "Allow public read published resources"
ON public.resources
FOR SELECT
TO anon
USING (status = 'published');

-- B. AUTHENTICATED READ:
-- Admins view all resources; Teachers view their own resources + any published resources
CREATE POLICY "Allow authenticated read resources"
ON public.resources
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR
  teacher_id = public.get_current_teacher_id() OR
  status = 'published'
);

-- C. INSERT:
-- Teachers can insert their own resources (status 'draft' or 'under_review'); Admins can insert any
CREATE POLICY "Allow teachers and admins insert resources"
ON public.resources
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR (
    teacher_id = public.get_current_teacher_id() AND
    status IN ('draft', 'under_review')
  )
);

-- D. UPDATE:
-- Teachers update their own resources; Admins update any resource
CREATE POLICY "Allow teachers and admins update resources"
ON public.resources
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR
  teacher_id = public.get_current_teacher_id()
)
WITH CHECK (
  public.is_admin() OR (
    teacher_id = public.get_current_teacher_id() AND
    status IN ('draft', 'under_review')
  )
);

-- E. DELETE:
-- Teachers can only delete their own draft resources; Admins can delete any resource
CREATE POLICY "Allow teachers delete draft resources and admin delete any"
ON public.resources
FOR DELETE
TO authenticated
USING (
  public.is_admin() OR (
    teacher_id = public.get_current_teacher_id() AND
    status = 'draft'
  )
);

-- ------------------------------------------------------------------------------
-- 10. SUPABASE STORAGE SETUP FOR LEARNING RESOURCES (COVERS & PDFS)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('learning-resources', 'learning-resources', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Public Access for learning-resources'
  ) THEN
    CREATE POLICY "Public Access for learning-resources"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'learning-resources');
  END IF;
END $$;

-- Storage RLS: Authenticated users can upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload learning-resources'
  ) THEN
    CREATE POLICY "Authenticated users can upload learning-resources"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'learning-resources');
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 11. SECURE VIEW COUNTER FUNCTION (PHASE 2)
-- Allows public / anon users to increment views by +1 on published resources only
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_resource_views(p_resource_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.resources
    SET views = COALESCE(views, 0) + 1
    WHERE id = p_resource_id AND status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_resource_views(UUID) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 12. SAMPLE PUBLISHED RESOURCES SEED FOR VERIFICATION
-- Ensures test resources (Ohm's Law and Resistance) exist under Class 10 Physics Electricity
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_teacher_id UUID;
BEGIN
    -- Select the first available teacher or admin
    SELECT id INTO v_teacher_id FROM public.teachers ORDER BY created_at ASC LIMIT 1;

    IF v_teacher_id IS NOT NULL THEN
        -- Seed Resource 1: Ohm's Law
        INSERT INTO public.resources (
            teacher_id, title, slug, description, resource_type, class_level, subject, chapter, topic,
            content, cover_image_url, pdf_url, seo_title, seo_description, status, views, published_at
        ) VALUES (
            v_teacher_id,
            'Ohm''s Law – Definition, Formula & Examples',
            'ohms-law-definition-formula-examples-class-10',
            'Learn the fundamental relationship between voltage, current, and resistance in electrical circuits, with mathematical formulations, V-I graph analysis, and solved numerical problems.',
            'Topic Notes',
            'Class 10',
            'Physics',
            'Electricity',
            'Ohm''s Law',
            '<h2>1. What is Ohm''s Law?</h2><p>Ohm''s law is one of the most fundamental principles in electricity. It was formulated by the German physicist <strong>Georg Simon Ohm</strong> in 1827.</p><p>According to Ohm''s Law: <em>"At constant temperature, the electric current flowing through a conductor is directly proportional to the potential difference across its ends."</em></p><h2>2. Formula & Mathematical Expression</h2><p>Mathematically, if <em>V</em> is the potential difference and <em>I</em> is the current:</p><p><span class="ql-formula" data-value="V \propto I">V \propto I</span></p><p><span class="ql-formula" data-value="V = I \times R">V = I \times R</span></p><p>Where <strong>R</strong> is the constant of proportionality known as the <strong>Resistance</strong> of the conductor. The SI unit of resistance is <strong>Ohm (Ω)</strong>.</p><h2>3. Explanation & Concept</h2><p>Resistance can be thought of as the opposition offered by the atoms of a conductor to the flow of free electrons. When a voltage is applied, free electrons collide with fixed positive ions, slowing their drift velocity.</p><h2>4. V-I Characteristic Graph</h2><p>For an ohmic conductor (like a metallic wire), the graph plotted between Potential Difference (V) on the y-axis and Current (I) on the x-axis is a <strong>straight line passing through the origin</strong>. The slope of this V-I graph represents the resistance of the conductor:</p><p><span class="ql-formula" data-value="\text{Slope} = \frac{\Delta V}{\Delta I} = R">\text{Slope} = \frac{\Delta V}{\Delta I} = R</span></p><h2>5. Solved Example</h2><p><strong>Question:</strong> A heating element is connected to a 220V power supply and draws a current of 5 Amperes. Calculate the resistance of the heating element.</p><p><strong>Solution:</strong></p><ul><li>Given: Potential Difference, <span class="ql-formula" data-value="V = 220\text{ V}">V = 220\text{ V}</span></li><li>Current, <span class="ql-formula" data-value="I = 5\text{ A}">I = 5\text{ A}</span></li><li>Formula: <span class="ql-formula" data-value="R = \frac{V}{I} = \frac{220}{5} = 44\,\Omega">R = \frac{V}{I} = \frac{220}{5} = 44\,\Omega</span></li><li><strong>Answer:</strong> The resistance of the element is <strong>44 Ω</strong>.</li></ul><h2>6. Important Points & Limitations</h2><ul><li>Ohm''s law is valid only when physical conditions like <strong>temperature and pressure remain constant</strong>.</li><li>It does not apply to non-ohmic devices such as semiconductor diodes, transistors, and electrolytes.</li></ul><h2>7. Frequently Asked Questions (FAQs)</h2><p><strong>Q1: What is 1 Ohm?</strong><br>1 Ohm is the resistance of a conductor when a potential difference of 1 Volt produces a current of 1 Ampere through it.</p>',
            NULL,
            'https://example.com/notes/class10-ohms-law.pdf',
            'Ohm''s Law – Definition, Formula & Examples | Class 10 Physics | Edify Tutorial',
            'Master Ohm''s Law for Class 10 Physics. Complete explanation, formula derivation, V-I graphs, and solved numerical questions.',
            'published',
            128,
            now()
        )
        ON CONFLICT (slug) DO UPDATE
        SET status = 'published',
            views = EXCLUDED.views,
            published_at = COALESCE(public.resources.published_at, now());

        -- Seed Resource 2: Resistance
        INSERT INTO public.resources (
            teacher_id, title, slug, description, resource_type, class_level, subject, chapter, topic,
            content, cover_image_url, pdf_url, seo_title, seo_description, status, views, published_at
        ) VALUES (
            v_teacher_id,
            'Resistance – Formula and Explanation',
            'resistance-formula-and-explanation-class-10',
            'Comprehensive guide on electrical resistance, factors affecting resistance of a conductor, resistivity formula, and series vs parallel combinations.',
            'Topic Notes',
            'Class 10',
            'Physics',
            'Electricity',
            'Resistance',
            '<h2>1. What is Electrical Resistance?</h2><p>Electrical resistance is the property of a conductor by virtue of which it opposes the flow of electric charges (electrons) through it.</p><h2>2. Formula for Resistance</h2><p>From Ohm''s law, resistance is the ratio of potential difference to current:</p><p><span class="ql-formula" data-value="R = \frac{V}{I}">R = \frac{V}{I}</span></p><h2>3. Factors on Which Resistance Depends</h2><p>The resistance of a uniform conductor depends on four key factors:</p><ol><li><strong>Length of the conductor (L):</strong> Resistance is directly proportional to length: <span class="ql-formula" data-value="R \propto L">R \propto L</span>.</li><li><strong>Area of cross-section (A):</strong> Resistance is inversely proportional to cross-sectional area: <span class="ql-formula" data-value="R \propto \frac{1}{A}">R \propto \frac{1}{A}</span>.</li><li><strong>Nature of material:</strong> Different materials have different electrical resistivities (<span class="ql-formula" data-value="\rho">\rho</span>).</li><li><strong>Temperature:</strong> Resistance of metallic conductors increases with increase in temperature.</li></ol><h2>4. Combined Formula & Resistivity</h2><p>Combining the above relations:</p><p><span class="ql-formula" data-value="R = \rho \frac{L}{A}">R = \rho \frac{L}{A}</span></p><p>Where <span class="ql-formula" data-value="\rho">\rho</span> is the <strong>electrical resistivity</strong> (or specific resistance) of the material. The SI unit of resistivity is <strong>Ohm-metre (Ω·m)</strong>.</p><h2>5. Solved Example</h2><p><strong>Question:</strong> A wire of length 2 m and cross-sectional area <span class="ql-formula" data-value="1 \times 10^{-6}\text{ m}^2">1 \times 10^{-6}\text{ m}^2</span> has a resistance of 0.04 Ω. Find its resistivity.</p><p><strong>Solution:</strong></p><p><span class="ql-formula" data-value="\rho = \frac{R \times A}{L} = \frac{0.04 \times 10^{-6}}{2} = 2 \times 10^{-8}\,\Omega\cdot\text{m}">\rho = \frac{R \times A}{L} = \frac{0.04 \times 10^{-6}}{2} = 2 \times 10^{-8}\,\Omega\cdot\text{m}</span></p>',
            NULL,
            'https://example.com/notes/class10-resistance.pdf',
            'Resistance – Formula and Explanation | Class 10 Physics | Edify Tutorial',
            'Understand electrical resistance, factors affecting resistance, resistivity, and Ohm''s law for Class 10 CBSE/ICSE board exams.',
            'published',
            84,
            now()
        )
        ON CONFLICT (slug) DO UPDATE
        SET status = 'published',
            views = EXCLUDED.views,
            published_at = COALESCE(public.resources.published_at, now());
    END IF;
END $$;

