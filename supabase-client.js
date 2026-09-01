/**
 * Reusable Supabase Client Initializer for Edify Tutorial
 * Sets up window.supabaseClient using VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */
(function () {
  var env = window.ENV || {};
  var supabaseUrl = env.VITE_SUPABASE_URL || window.VITE_SUPABASE_URL || "";
  var supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || window.VITE_SUPABASE_ANON_KEY || "";

  if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
    console.warn("[Supabase Client] Supabase JS SDK not loaded. Ensure @supabase/supabase-js script tag is included.");
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.indexOf("your-supabase-project") !== -1) {
    console.info("[Supabase Client] Placeholder credentials detected. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in env.js to connect to your live project.");
  }

  try {
    window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    console.log("[Supabase Client] Client initialized successfully on window.supabaseClient");
  } catch (err) {
    console.error("[Supabase Client] Initialization error:", err);
  }

  /**
   * Service function to insert a demo class request into public.demo_requests
   * @param {Object} data - Payload containing demo request details
   * @returns {Promise<{success: boolean, data?: Array, error?: any}>}
   */
  window.submitDemoRequest = async function (data) {
    if (!window.supabaseClient) {
      console.warn("[Supabase Service] Client not ready. Please check VITE_SUPABASE_* keys in env.js.");
      return { success: false, error: new Error("Supabase client not initialized") };
    }

    var payload = {
      student_name: data.student_name || data.parent_name || "Student",
      parent_name: data.parent_name || null,
      phone: data.phone,
      email: data.email || null,
      class: data.class || null,
      board: data.board || null,
      subjects: data.subjects || null,
      mode: data.mode || "Home",
      location: data.location || null,
      preferred_date: data.preferred_date || null,
      preferred_time: data.preferred_time || null,
      message: data.message || null,
      status: "New"
    };

    try {
      var result = await window.supabaseClient
        .from("demo_requests")
        .insert([payload])
        .select();

      console.log("[Supabase Insert Response]", result);

      if (result.error) {
        console.error("Demo request submission error:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true, data: result.data };
    } catch (err) {
      console.error("Demo request submission error:", err);
      return { success: false, error: err };
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────
   * TEACHER AUTH & DATA HELPERS
   * Shared functions for teacher-login.html and teacher-dashboard.html.
   * All functions use window.supabaseClient initialised above with
   * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from env.js.
   * ─────────────────────────────────────────────────────────────────────── */

  /**
   * Sign in a teacher with email + password via Supabase Auth.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.teacherSignIn = async function (email, password) {
    if (!window.supabaseClient) {
      return { success: false, error: new Error("Supabase client not initialized") };
    }
    try {
      var result = await window.supabaseClient.auth.signInWithPassword({ email: email, password: password });
      console.log("[Teacher Auth] Sign-in response:", result);
      if (result.error) {
        console.error("[Teacher Auth] Sign-in error:", result.error);
        return { success: false, error: result.error };
      }

      // Verify that a corresponding teacher profile exists in public.teachers
      var user = result.data ? result.data.user : null;
      if (user) {
        var profile = await window.getTeacherProfile(user.id);
        if (!profile) {
          console.warn("[Teacher Auth] No matching row in public.teachers for auth_user_id:", user.id);
          // Sign out unlinked user session
          await window.supabaseClient.auth.signOut();
          return {
            success: false,
            error: new Error("No teacher profile found matching this account. Please ask the administrator to link your account in public.teachers.")
          };
        }
        return { success: true, data: result.data, profile: profile };
      }

      return { success: true, data: result.data };
    } catch (err) {
      console.error("[Teacher Auth] Sign-in exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Sign out the current teacher session.
   */
  window.teacherSignOut = async function () {
    if (!window.supabaseClient) return;
    try {
      await window.supabaseClient.auth.signOut();
      console.log("[Teacher Auth] Signed out successfully.");
    } catch (err) {
      console.error("[Teacher Auth] Sign-out error:", err);
    }
  };

  /**
   * Return the current Supabase session, or null if not signed in.
   * @returns {Promise<object|null>}
   */
  window.getTeacherSession = async function () {
    if (!window.supabaseClient) return null;
    try {
      var result = await window.supabaseClient.auth.getSession();
      return (result.data && result.data.session) ? result.data.session : null;
    } catch (err) {
      console.error("[Teacher Auth] Session fetch error:", err);
      return null;
    }
  };

  /**
   * Fetch a teacher's profile row from public.teachers by their Supabase auth UID.
   * @param {string} authUserId - UUID from auth.users
   * @returns {Promise<object|null>}
   */
  window.getTeacherProfile = async function (authUserId) {
    if (!window.supabaseClient || !authUserId) return null;
    try {
      var result = await window.supabaseClient
        .from("teachers")
        .select("*")
        .eq("auth_user_id", authUserId)
        .single();
      if (result.error && result.error.code !== "PGRST116") {
        console.error("[Teacher Auth] Profile fetch error:", result.error);
      }
      return result.data || null;
    } catch (err) {
      console.error("[Teacher Auth] Profile fetch exception:", err);
      return null;
    }
  };

  /**
   * Fetch demo requests assigned to a specific teacher (Accepted / Contacted / Scheduled / Completed).
   * @param {string} teacherId - UUID from public.teachers
   * @returns {Promise<{success: boolean, data: Array, error?: any}>}
   */
  window.getAssignedDemoRequests = async function (teacherId) {
    if (!window.supabaseClient || !teacherId) return { success: true, data: [] };
    try {
      var result = await window.supabaseClient
        .from("demo_requests")
        .select("*")
        .eq("assigned_teacher_id", teacherId)
        .in("status", ["Accepted", "Contacted", "Scheduled", "Completed"])
        .order("created_at", { ascending: false });
      console.log("[Teacher Data] Assigned demo requests:", result);
      if (result.error) {
        console.error("[Teacher Data] Assigned requests error:", result.error);
        return { success: false, data: [], error: result.error };
      }
      return { success: true, data: result.data || [] };
    } catch (err) {
      console.error("[Teacher Data] Assigned requests exception:", err);
      return { success: false, data: [], error: err };
    }
  };

  /**
   * Fetch all new (unassigned, status = 'New') demo requests.
   * @returns {Promise<{success: boolean, data: Array, error?: any}>}
   */
  window.getPendingDemoRequests = async function () {
    if (!window.supabaseClient) return { success: false, data: [] };
    try {
      var result = await window.supabaseClient
        .from("demo_requests")
        .select("*")
        .eq("status", "New")
        .order("created_at", { ascending: false });
      console.log("[Teacher Data] Pending demo requests:", result);
      if (result.error) {
        console.error("[Teacher Data] Pending requests error:", result.error);
        return { success: false, data: [], error: result.error };
      }
      return { success: true, data: result.data || [] };
    } catch (err) {
      console.error("[Teacher Data] Pending requests exception:", err);
      return { success: false, data: [], error: err };
    }
  };

  /**
   * Update the status of a demo request and optionally assign a teacher.
   * @param {string} requestId  - UUID of the demo_requests row
   * @param {string} newStatus  - One of: New | Contacted | Accepted | Scheduled | Completed | Cancelled
   * @param {string|null} teacherId - UUID of public.teachers (assigned when status → Accepted)
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.updateDemoRequestStatus = async function (requestId, newStatus, teacherId) {
    if (!window.supabaseClient || !requestId) return { success: false };
    try {
      var updatePayload = { status: newStatus };
      if (teacherId && newStatus === "Accepted") {
        updatePayload.assigned_teacher_id = teacherId;
      }
      var result = await window.supabaseClient
        .from("demo_requests")
        .update(updatePayload)
        .eq("id", requestId)
        .select()
        .single();
      console.log("[Teacher Data] Status update response:", result);
      if (result.error) {
        console.error("[Teacher Data] Status update error:", result.error);
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data };
    } catch (err) {
      console.error("[Teacher Data] Status update exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Fetch demo requests from public.demo_requests.
   * @param {Object} [options] - Filter options (e.g. teacherId, status)
   * @returns {Promise<{success: boolean, data: Array, error?: any}>}
   */
  window.getDemoRequests = async function (options) {
    if (!window.supabaseClient) {
      return { success: false, data: [], error: new Error("Supabase client not initialized") };
    }
    try {
      options = options || {};
      var query = window.supabaseClient
        .from("demo_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (options.teacherId) {
        query = query.eq("assigned_teacher_id", options.teacherId);
      }
      if (options.status) {
        query = query.eq("status", options.status);
      }

      var result = await query;
      console.log("[Supabase Fetch Demo Requests]", result);

      if (result.error) {
        console.error("[Supabase Fetch Demo Requests Error]", result.error);
        return { success: false, data: [], error: result.error };
      }

      return { success: true, data: result.data || [] };
    } catch (err) {
      console.error("[Supabase Fetch Demo Requests Exception]", err);
      return { success: false, data: [], error: err };
    }
  };

})();
