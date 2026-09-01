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
   * Service function to insert a demo class request into public.demo_requests.
   * Note: Public users do NOT have SELECT permission; insert succeeds without .select().
   * @param {Object} data - Payload containing demo request details
   * @returns {Promise<{success: boolean, error?: any}>}
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
        .insert([payload]);

      console.log("[Supabase Public Insert Response]", result);

      if (result.error) {
        console.error("Demo request submission error:", result.error);
        return { success: false, error: result.error };
      }

      return { success: true };
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
        if (result.error.message === "Email not confirmed" || result.error.error_code === "email_not_confirmed") {
          return {
            success: false,
            error: new Error("Email not confirmed in Supabase. Please go to Supabase Dashboard -> Authentication -> Users and click 'Confirm Email' next to your email.")
          };
        }
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
   * ADMIN-ONLY: Fetch all unassigned new demo requests (status = 'New').
   * Note: Enforced by PostgreSQL RLS (will return empty array for non-admin teachers).
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
      console.log("[Admin Data] Pending demo requests:", result);
      if (result.error) {
        console.error("[Admin Data] Pending requests error:", result.error);
        return { success: false, data: [], error: result.error };
      }
      return { success: true, data: result.data || [] };
    } catch (err) {
      console.error("[Admin Data] Pending requests exception:", err);
      return { success: false, data: [], error: err };
    }
  };

  /**
   * Update demo request status and schedule.
   * Teachers execute secure PostgreSQL RPC `update_teacher_demo_request` exclusively (FAIL SECURE - NO FALLBACK).
   * Admins execute privileged assignment/reassignment.
   */
  window.updateDemoRequestStatus = async function (requestId, newStatus, teacherId, demoDate, demoTime, targetTeacherId) {
    if (!window.supabaseClient || !requestId) return { success: false };
    try {
      // 1. If targetTeacherId is specified (Admin assignment/reassignment), use standard update (protected by RLS)
      if (targetTeacherId !== undefined) {
        var adminPayload = { status: newStatus, assigned_teacher_id: targetTeacherId };
        if (newStatus === "Scheduled") {
          if (demoDate) adminPayload.demo_date = demoDate;
          if (demoTime) adminPayload.demo_time = demoTime;
        }
        var adminRes = await window.supabaseClient
          .from("demo_requests")
          .update(adminPayload)
          .eq("id", requestId)
          .select()
          .single();
        if (adminRes.error) {
          console.error("[Admin Data] Update error:", adminRes.error);
          return { success: false, error: adminRes.error };
        }
        return { success: true, data: adminRes.data };
      }

      // 2. Call secure PostgreSQL RPC for Teacher status/schedule updates (FAIL SECURE - NO FALLBACK)
      var rpcRes = await window.supabaseClient.rpc("update_teacher_demo_request", {
        p_request_id: requestId,
        p_status: newStatus,
        p_demo_date: demoDate || null,
        p_demo_time: demoTime || null
      });

      if (rpcRes.error) {
        console.error("[Teacher Data] RPC update error:", rpcRes.error);
        return { success: false, error: rpcRes.error };
      }

      console.log("[Teacher Data] RPC status update response:", rpcRes);
      return { success: true, data: rpcRes.data };
    } catch (err) {
      console.error("[Teacher Data] Status update exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Fetch demo requests from public.demo_requests based on user role and options.
   * @param {Object} [options] - Filter options (e.g. teacherId, isAdmin, status)
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

      if (!options.isAdmin) {
        if (options.teacherId) {
          query = query.eq("assigned_teacher_id", options.teacherId);
        }
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

  /**
   * Fetch all teachers from public.teachers (Admin function).
   * @returns {Promise<{success: boolean, data: Array, error?: any}>}
   */
  window.getAllTeachers = async function () {
    if (!window.supabaseClient) return { success: false, data: [] };
    try {
      var result = await window.supabaseClient
        .from("teachers")
        .select("*")
        .order("name", { ascending: true });
      if (result.error) {
        console.error("[Admin Service] Fetch teachers error:", result.error);
        return { success: false, data: [], error: result.error };
      }
      return { success: true, data: result.data || [] };
    } catch (err) {
      console.error("[Admin Service] Fetch teachers exception:", err);
      return { success: false, data: [], error: err };
    }
  };

  /**
   * Subscribe to real-time changes on public.demo_requests table via Supabase Realtime.
   * @param {function} callback - Callback function invoked on postgres change events
   * @returns {object|null} Channel subscription instance
   */
  window.subscribeToDemoRequests = function (callback) {
    if (!window.supabaseClient) return null;
    try {
      var channel = window.supabaseClient
        .channel("public:demo_requests_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "demo_requests" },
          function (payload) {
            console.log("[Supabase Realtime] Event payload:", payload);
            if (typeof callback === "function") {
              callback(payload);
            }
          }
        )
        .subscribe(function (status) {
          console.log("[Supabase Realtime] Channel status:", status);
        });
      return channel;
    } catch (err) {
      console.error("[Supabase Realtime] Subscription exception:", err);
      return null;
    }
  };

  /**
   * Assign a teacher to a demo request row in public.demo_requests (Admin service function).
   * @param {string} requestId - UUID of public.demo_requests
   * @param {string|null} teacherId - UUID of public.teachers
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.assignTeacherToDemoRequest = async function (requestId, teacherId) {
    if (!window.supabaseClient || !requestId) return { success: false };
    try {
      var updatePayload = { assigned_teacher_id: teacherId };
      if (teacherId) {
        updatePayload.status = "Accepted";
      }
      var result = await window.supabaseClient
        .from("demo_requests")
        .update(updatePayload)
        .eq("id", requestId)
        .select()
        .single();
      console.log("[Admin Service] Teacher assignment response:", result);
      if (result.error) {
        console.error("[Admin Service] Teacher assignment error:", result.error);
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data };
    } catch (err) {
      console.error("[Admin Service] Teacher assignment exception:", err);
      return { success: false, error: err };
    }
  };

})();
