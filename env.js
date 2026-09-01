/**
 * Edify Tutorial Environment Configuration
 * Exposes VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the client application.
 */
(function () {
  window.ENV = window.ENV || {};
  
  // Set default environment configuration from VITE_SUPABASE_* variables
  window.ENV.VITE_SUPABASE_URL = window.ENV.VITE_SUPABASE_URL || "https://hiqfhosjzfnngpsabuxu.supabase.co";
  window.ENV.VITE_SUPABASE_ANON_KEY = window.ENV.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcWZob3NqemZubmdwc2FidXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwOTcxMTUsImV4cCI6MjEwMzY3MzExNX0.nupV0-RsG4uCvXRfWc1t04inVNkGFvJns_AiX6SnER4";
})();

