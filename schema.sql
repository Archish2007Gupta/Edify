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
