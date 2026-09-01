-- ==============================================================================
-- EDIFY TUTORIAL — SUPABASE DATABASE SCHEMA
-- Shared database schema with 3-Tier Security (PUBLIC, TEACHER, ADMIN)
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
-- 3. SECURITY DEFINER HELPER FUNCTIONS
-- Securely evaluate user roles and current teacher ID for RLS policies
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.teachers
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_teacher_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM public.teachers
    WHERE auth_user_id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 4. UPDATED_AT AUTOMATIC TRIGGER
-- Automatically updates updated_at whenever a demo request row is modified
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES — STRICT 3-TIER ROLE ENFORCEMENT
-- Enforces permissions for PUBLIC, TEACHER, and ADMIN roles at DB level
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
DROP POLICY IF EXISTS "Allow admin manage teachers" ON public.teachers;

-- ------------------------------------------------------------------------------
-- DEMO_REQUESTS POLICIES
-- ------------------------------------------------------------------------------

-- PUBLIC: Anyone can submit a demo request from the public website
CREATE POLICY "Allow public insert to demo_requests" 
ON public.demo_requests 
FOR INSERT 
WITH CHECK (true);

-- TEACHER & ADMIN READ: Teachers view assigned requests; Admins view all requests
CREATE POLICY "Allow authenticated read demo_requests" 
ON public.demo_requests 
FOR SELECT 
TO authenticated
USING (
  public.is_admin() OR 
  assigned_teacher_id = public.get_current_teacher_id()
);

-- TEACHER & ADMIN UPDATE: Teachers update assigned requests; Admins update any request
CREATE POLICY "Allow teacher and admin update demo_requests" 
ON public.demo_requests 
FOR UPDATE 
TO authenticated
USING (
  public.is_admin() OR 
  assigned_teacher_id = public.get_current_teacher_id()
)
WITH CHECK (
  public.is_admin() OR 
  assigned_teacher_id = public.get_current_teacher_id()
);

-- ADMIN DELETE: Only admins can delete demo requests
CREATE POLICY "Allow admin delete demo_requests" 
ON public.demo_requests 
FOR DELETE 
TO authenticated
USING (
  public.is_admin()
);

-- ------------------------------------------------------------------------------
-- TEACHERS TABLE POLICIES
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

-- ADMIN MANAGEMENT: Only admins can insert, update, or delete teacher records
CREATE POLICY "Allow admin manage teachers" 
ON public.teachers 
FOR ALL 
TO authenticated
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);
