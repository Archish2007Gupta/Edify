-- ==============================================================================
-- EDIFY TUTORIAL — SUPABASE DATABASE SCHEMA
-- Shared database schema for Public Website, Teacher Portal & Admin Portal
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. TEACHERS TABLE
-- Stores teacher profiles and maps them to Supabase Auth Users
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    subjects TEXT,
    classes TEXT,
    location TEXT,
    availability TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

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
-- 3. UPDATED_AT AUTOMATIC TRIGGER
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
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Enables security rules for public submissions & authenticated dashboard access
-- ------------------------------------------------------------------------------

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- Allow anyone (public/anon) to submit a new demo request from the public website
DROP POLICY IF EXISTS "Allow public insert to demo_requests" ON public.demo_requests;
CREATE POLICY "Allow public insert to demo_requests" 
ON public.demo_requests 
FOR INSERT 
WITH CHECK (true);

-- Allow public read access to demo requests if needed (or restrict to authenticated users)
DROP POLICY IF EXISTS "Allow public read to demo_requests" ON public.demo_requests;
CREATE POLICY "Allow public read to demo_requests" 
ON public.demo_requests 
FOR SELECT 
USING (true);

-- Allow public/anon update to demo_requests (for status changes / assigning demo)
DROP POLICY IF EXISTS "Allow public update to demo_requests" ON public.demo_requests;
CREATE POLICY "Allow public update to demo_requests" 
ON public.demo_requests 
FOR UPDATE 
USING (true);

-- Allow teachers to read demo requests assigned to their teacher profile ID
DROP POLICY IF EXISTS "Allow teachers to read assigned demo_requests" ON public.demo_requests;
CREATE POLICY "Allow teachers to read assigned demo_requests" 
ON public.demo_requests 
FOR SELECT 
USING (
  assigned_teacher_id IN (
    SELECT id FROM public.teachers WHERE auth_user_id = auth.uid()
  )
);

-- Allow public read/write to teachers for management
DROP POLICY IF EXISTS "Allow public read to teachers" ON public.teachers;
CREATE POLICY "Allow public read to teachers" 
ON public.teachers 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow public insert to teachers" ON public.teachers;
CREATE POLICY "Allow public insert to teachers" 
ON public.teachers 
FOR INSERT 
WITH CHECK (true);
