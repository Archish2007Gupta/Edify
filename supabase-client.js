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

      if (!options.isAdmin && options.teacherId) {
        query = query.or("assigned_teacher_id.eq." + options.teacherId + ",assigned_teacher_id.is.null");
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

  /* ─────────────────────────────────────────────────────────────────────────
   * LEARNING HUB / EDUCATIONAL RESOURCES SERVICES
   * Service functions for teachers and administrators to manage resources.
   * ─────────────────────────────────────────────────────────────────────── */

  /**
   * Helper: Generate a URL-friendly slug from title and class level.
   * Example: "Ohm's Law & Circuits", "Class 10" -> "ohms-law-circuits-class-10"
   */
  window.generateSlug = function (title, classLevel) {
    if (!title) return "";
    var base = title.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (classLevel) {
      var clsNorm = classLevel.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      // Only append if not already in slug
      if (clsNorm && base.indexOf(clsNorm) === -1) {
        base = base + "-" + clsNorm;
      }
    }
    return base;
  };

  /**
   * Fetch educational resources with filtering.
   * @param {Object} [options] - Filters: { teacherId, status, classLevel, subject, search, isAdmin }
   * @returns {Promise<{success: boolean, data: Array, error?: any}>}
   */
  window.getResources = async function (options) {
    if (!window.supabaseClient) {
      return { success: false, data: [], error: new Error("Supabase client not initialized") };
    }
    try {
      options = options || {};
      var query = window.supabaseClient
        .from("resources")
        .select("*, teachers:teacher_id(id, name, email, subjects)")
        .order("updated_at", { ascending: false });

      if (options.teacherId && !options.isAdmin) {
        query = query.eq("teacher_id", options.teacherId);
      }

      if (options.status) {
        if (Array.isArray(options.status)) {
          query = query.in("status", options.status);
        } else if (options.status !== "all") {
          query = query.eq("status", options.status);
        }
      }

      if (options.classLevel) {
        query = query.eq("class_level", options.classLevel);
      }

      if (options.subject) {
        query = query.eq("subject", options.subject);
      }

      if (options.resourceType) {
        query = query.eq("resource_type", options.resourceType);
      }

      if (options.search) {
        var s = options.search.trim();
        query = query.or("title.ilike.%" + s + "%,chapter.ilike.%" + s + "%,topic.ilike.%" + s + "%,description.ilike.%" + s + "%");
      }

      var result = await query;
      if (result.error) {
        console.error("[Learning Hub] Fetch resources error:", result.error);
        return { success: false, data: [], error: result.error };
      }
      return { success: true, data: result.data || [] };
    } catch (err) {
      console.error("[Learning Hub] Fetch resources exception:", err);
      return { success: false, data: [], error: err };
    }
  };

  /**
   * Fetch a single resource by UUID with teacher information.
   * @param {string} id - UUID
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.getResourceById = async function (id) {
    if (!window.supabaseClient || !id) {
      return { success: false, error: new Error("Invalid resource ID") };
    }
    try {
      var result = await window.supabaseClient
        .from("resources")
        .select("*, teachers:teacher_id(id, name, email, subjects)")
        .eq("id", id)
        .single();

      if (result.error) {
        console.error("[Learning Hub] Fetch resource error:", result.error);
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data };
    } catch (err) {
      console.error("[Learning Hub] Fetch resource exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Create a new educational resource.
   * @param {Object} resourceData
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.createResource = async function (resourceData) {
    if (!window.supabaseClient) {
      return { success: false, error: new Error("Supabase client not initialized") };
    }
    try {
      var slug = (resourceData.slug || window.generateSlug(resourceData.title, resourceData.class_level)).trim();
      var payload = {
        teacher_id: resourceData.teacher_id,
        title: resourceData.title,
        slug: slug,
        description: resourceData.description || null,
        resource_type: resourceData.resource_type || "Topic Notes",
        class_level: resourceData.class_level,
        subject: resourceData.subject,
        chapter: resourceData.chapter || null,
        topic: resourceData.topic || null,
        content: resourceData.content || null,
        cover_image_url: resourceData.cover_image_url || null,
        pdf_url: resourceData.pdf_url || null,
        seo_title: resourceData.seo_title || resourceData.title,
        seo_description: resourceData.seo_description || resourceData.description || null,
        status: resourceData.status || "draft"
      };

      var result = await window.supabaseClient
        .from("resources")
        .insert([payload])
        .select()
        .single();

      if (result.error) {
        console.error("[Learning Hub] Create resource error:", result.error);
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data };
    } catch (err) {
      console.error("[Learning Hub] Create resource exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Update an existing educational resource.
   * @param {string} id - UUID
   * @param {Object} updateData
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.updateResource = async function (id, updateData) {
    if (!window.supabaseClient || !id) {
      return { success: false, error: new Error("Invalid resource ID") };
    }
    try {
      var payload = Object.assign({}, updateData);
      delete payload.id;
      delete payload.created_at;
      delete payload.teachers;

      var result = await window.supabaseClient
        .from("resources")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (result.error) {
        console.error("[Learning Hub] Update resource error:", result.error);
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data };
    } catch (err) {
      console.error("[Learning Hub] Update resource exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Delete a draft resource.
   * @param {string} id - UUID
   * @returns {Promise<{success: boolean, error?: any}>}
   */
  window.deleteResource = async function (id) {
    if (!window.supabaseClient || !id) {
      return { success: false, error: new Error("Invalid resource ID") };
    }
    try {
      var result = await window.supabaseClient
        .from("resources")
        .delete()
        .eq("id", id);

      if (result.error) {
        console.error("[Learning Hub] Delete resource error:", result.error);
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (err) {
      console.error("[Learning Hub] Delete resource exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Submit a resource for admin review.
   * Transitions status from 'draft' or 'rejected' to 'under_review'.
   * @param {string} id - UUID
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.submitResourceForReview = async function (id) {
    return window.updateResource(id, { status: "under_review" });
  };

  /**
   * Moderation action by Admin (Approve / Reject / Archive).
   * @param {string} id - UUID
   * @param {Object} reviewData - { status: 'published'|'rejected'|'archived', rejectionReason?: string }
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.reviewResource = async function (id, reviewData) {
    if (!window.supabaseClient || !id || !reviewData) {
      return { success: false, error: new Error("Invalid review parameters") };
    }
    var updatePayload = {
      status: reviewData.status
    };
    if (reviewData.status === "rejected") {
      updatePayload.rejection_reason = reviewData.rejectionReason || "Please review and revise the submitted content.";
    } else if (reviewData.status === "published") {
      updatePayload.rejection_reason = null;
      updatePayload.published_at = new Date().toISOString();
    }
    return window.updateResource(id, updatePayload);
  };

  /**
   * Upload an optional file (cover image or PDF) to Supabase Storage.
   * First attempts 'learning-resources' bucket using 'covers/<filename>' or 'pdfs/<filename>'.
   * If unavailable and folder is 'covers' or 'pdfs', falls back to dedicated 'covers' or 'pdfs' bucket.
   * @param {File} file - Browser File object
   * @param {string} folder - 'covers' | 'pdfs'
   * @returns {Promise<{success: boolean, publicUrl?: string, error?: any}>}
   */
  window.uploadResourceFile = async function (file, folder) {
    if (!window.supabaseClient || !file) {
      return { success: false, error: new Error("Invalid file or client not initialized") };
    }
    try {
      folder = folder || "general";
      var cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      var fileName = Date.now() + "_" + cleanName;
      var targetBucket = "learning-resources";
      var filePath = folder + "/" + fileName;

      var uploadResult = await window.supabaseClient.storage
        .from(targetBucket)
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      // If learning-resources upload failed and folder is 'covers' or 'pdfs', fallback to dedicated bucket
      if (uploadResult.error && (folder === "covers" || folder === "pdfs")) {
        console.info("[Learning Hub Storage] Primary bucket notice, trying dedicated '" + folder + "' bucket...");
        targetBucket = folder;
        filePath = fileName;
        uploadResult = await window.supabaseClient.storage
          .from(targetBucket)
          .upload(filePath, file, { cacheControl: "3600", upsert: true });
      }

      if (uploadResult.error) {
        console.warn("[Learning Hub Storage] Upload error:", uploadResult.error);
        return { success: false, error: uploadResult.error };
      }

      var urlResult = window.supabaseClient.storage
        .from(targetBucket)
        .getPublicUrl(filePath);

      var publicUrl = urlResult.data ? urlResult.data.publicUrl : "";
      return { success: true, publicUrl: publicUrl };
    } catch (err) {
      console.error("[Learning Hub Storage] Upload exception:", err);
      return { success: false, error: err };
    }
  };

  // ============================================================================
  // PHASE 2: PUBLIC LEARNING HUB CLIENT FUNCTIONS
  // ============================================================================

  var DEFAULT_SEED_RESOURCES = [
    {
      id: "seed-ohm-1",
      title: "Ohm's Law – Definition, Formula & Examples",
      slug: "ohms-law-class-10",
      description: "Learn the fundamental relationship between voltage, current, and resistance in electrical circuits, with mathematical formulations, V-I graph analysis, and solved numerical problems.",
      resource_type: "Topic Notes",
      class_level: "Class 10",
      subject: "Physics",
      chapter: "Electricity",
      topic: "Ohm's Law",
      content: `<h2>1. What is Ohm's Law?</h2><p>Ohm's law is one of the most fundamental principles in electricity. It was formulated by the German physicist <strong>Georg Simon Ohm</strong> in 1827.</p><p>According to Ohm's Law: <em>"At constant temperature, the electric current flowing through a conductor is directly proportional to the potential difference across its ends."</em></p><h2>2. Formula & Mathematical Expression</h2><p>Mathematically, if <em>V</em> is the potential difference and <em>I</em> is the current:</p><p><span class="ql-formula" data-value="V \\propto I">V \\propto I</span></p><p><span class="ql-formula" data-value="V = I \\times R">V = I \\times R</span></p><p>Where <strong>R</strong> is the constant of proportionality known as the <strong>Resistance</strong> of the conductor. The SI unit of resistance is <strong>Ohm (Ω)</strong>.</p><h2>3. Explanation & Concept</h2><p>Resistance can be thought of as the opposition offered by the atoms of a conductor to the flow of free electrons. When a voltage is applied, free electrons collide with fixed positive ions, slowing their drift velocity.</p><h2>4. V-I Characteristic Graph</h2><p>For an ohmic conductor (like a metallic wire), the graph plotted between Potential Difference (V) on the y-axis and Current (I) on the x-axis is a <strong>straight line passing through the origin</strong>. The slope of this V-I graph represents the resistance of the conductor:</p><p><span class="ql-formula" data-value="\\text{Slope} = \\frac{\\Delta V}{\\Delta I} = R">\\text{Slope} = \\frac{\\Delta V}{\\Delta I} = R</span></p><h2>5. Solved Example</h2><p><strong>Question:</strong> A heating element is connected to a 220V power supply and draws a current of 5 Amperes. Calculate the resistance of the heating element.</p><p><strong>Solution:</strong></p><ul><li>Given: Potential Difference, <span class="ql-formula" data-value="V = 220\\text{ V}">V = 220\\text{ V}</span></li><li>Current, <span class="ql-formula" data-value="I = 5\\text{ A}">I = 5\\text{ A}</span></li><li>Formula: <span class="ql-formula" data-value="R = \\frac{V}{I} = \\frac{220}{5} = 44\\,\\Omega">R = \\frac{V}{I} = \\frac{220}{5} = 44\\,\\Omega</span></li><li><strong>Answer:</strong> The resistance of the element is <strong>44 Ω</strong>.</li></ul><h2>6. Important Points & Limitations</h2><ul><li>Ohm's law is valid only when physical conditions like <strong>temperature and pressure remain constant</strong>.</li><li>It does not apply to non-ohmic devices such as semiconductor diodes, transistors, and electrolytes.</li></ul><h2>7. Frequently Asked Questions (FAQs)</h2><p><strong>Q1: What is 1 Ohm?</strong><br>1 Ohm is the resistance of a conductor when a potential difference of 1 Volt produces a current of 1 Ampere through it.</p>`,
      cover_image_url: null,
      pdf_url: "https://example.com/notes/class10-ohms-law.pdf",
      seo_title: "Ohm's Law – Definition, Formula & Examples | Class 10 Physics | Edify Tutorial",
      seo_description: "Master Ohm's Law for Class 10 Physics. Complete explanation, formula derivation, V-I graphs, and solved numerical questions.",
      status: "published",
      views: 142,
      published_at: "2026-09-01T10:00:00.000Z",
      created_at: "2026-09-01T10:00:00.000Z",
      teachers: { name: "Er. Rohit Verma", subjects: "Physics, Mathematics" }
    },
    {
      id: "seed-ohm-2",
      title: "Resistance – Formula and Explanation",
      slug: "resistance-formula-and-explanation-class-10",
      description: "Comprehensive guide on electrical resistance, factors affecting resistance of a conductor, resistivity formula, and series vs parallel combinations.",
      resource_type: "Topic Notes",
      class_level: "Class 10",
      subject: "Physics",
      chapter: "Electricity",
      topic: "Resistance",
      content: `<h2>1. What is Electrical Resistance?</h2><p>Electrical resistance is the property of a conductor by virtue of which it opposes the flow of electric charges (electrons) through it.</p><h2>2. Formula for Resistance</h2><p>From Ohm's law, resistance is the ratio of potential difference to current:</p><p><span class="ql-formula" data-value="R = \\frac{V}{I}">R = \\frac{V}{I}</span></p><h2>3. Factors on Which Resistance Depends</h2><p>The resistance of a uniform conductor depends on four key factors:</p><ol><li><strong>Length of the conductor (L):</strong> Resistance is directly proportional to length: <span class="ql-formula" data-value="R \\propto L">R \\propto L</span>.</li><li><strong>Area of cross-section (A):</strong> Resistance is inversely proportional to cross-sectional area: <span class="ql-formula" data-value="R \\propto \\frac{1}{A}">R \\propto \\frac{1}{A}</span>.</li><li><strong>Nature of material:</strong> Different materials have different electrical resistivities (<span class="ql-formula" data-value="\\rho">\\rho</span>).</li><li><strong>Temperature:</strong> Resistance of metallic conductors increases with increase in temperature.</li></ol><h2>4. Combined Formula & Resistivity</h2><p>Combining the above relations:</p><p><span class="ql-formula" data-value="R = \\rho \\frac{L}{A}">R = \\rho \\frac{L}{A}</span></p><p>Where <span class="ql-formula" data-value="\\rho">\\rho</span> is the <strong>electrical resistivity</strong> (or specific resistance) of the material. The SI unit of resistivity is <strong>Ohm-metre (Ω·m)</strong>.</p><h2>5. Solved Example</h2><p><strong>Question:</strong> A wire of length 2 m and cross-sectional area <span class="ql-formula" data-value="1 \\times 10^{-6}\\text{ m}^2">1 \\times 10^{-6}\\text{ m}^2</span> has a resistance of 0.04 Ω. Find its resistivity.</p><p><strong>Solution:</strong></p><p><span class="ql-formula" data-value="\\rho = \\frac{R \\times A}{L} = \\frac{0.04 \\times 10^{-6}}{2} = 2 \\times 10^{-8}\\,\\Omega\\cdot\\text{m}">\\rho = \\frac{R \\times A}{L} = \\frac{0.04 \\times 10^{-6}}{2} = 2 \\times 10^{-8}\\,\\Omega\\cdot\\text{m}</span></p>`,
      cover_image_url: null,
      pdf_url: "https://example.com/notes/class10-resistance.pdf",
      seo_title: "Resistance – Formula and Explanation | Class 10 Physics | Edify Tutorial",
      seo_description: "Understand electrical resistance, factors affecting resistance, resistivity, and Ohm's law for Class 10 CBSE/ICSE board exams.",
      status: "published",
      views: 98,
      published_at: "2026-09-02T11:30:00.000Z",
      created_at: "2026-09-02T11:30:00.000Z",
      teachers: { name: "Er. Rohit Verma", subjects: "Physics, Mathematics" }
    }
  ];

  function filterSeedResources(options) {
    options = options || {};
    var list = DEFAULT_SEED_RESOURCES.slice();

    if (options.classLevel) {
      list = list.filter(function (r) { return r.class_level.toLowerCase() === options.classLevel.toLowerCase(); });
    }
    if (options.subject) {
      list = list.filter(function (r) { return r.subject.toLowerCase() === options.subject.toLowerCase(); });
    }
    if (options.chapter) {
      list = list.filter(function (r) { return (r.chapter || "").toLowerCase() === options.chapter.toLowerCase(); });
    }
    if (options.resourceType) {
      list = list.filter(function (r) { return (r.resource_type || "").toLowerCase() === options.resourceType.toLowerCase(); });
    }
    if (options.excludeId) {
      list = list.filter(function (r) { return r.id !== options.excludeId; });
    }
    if (options.search) {
      var s = options.search.toLowerCase();
      list = list.filter(function (r) {
        return r.title.toLowerCase().indexOf(s) !== -1 ||
          (r.description && r.description.toLowerCase().indexOf(s) !== -1) ||
          (r.chapter && r.chapter.toLowerCase().indexOf(s) !== -1) ||
          (r.topic && r.topic.toLowerCase().indexOf(s) !== -1) ||
          r.subject.toLowerCase().indexOf(s) !== -1 ||
          r.class_level.toLowerCase().indexOf(s) !== -1;
      });
    }

    if (options.sortBy === "popular") {
      list.sort(function (a, b) { return (b.views || 0) - (a.views || 0); });
    } else {
      list.sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at); });
    }

    if (options.limit && options.limit > 0) {
      list = list.slice(0, options.limit);
    }
    return list;
  }

  /**
   * Fetch published resources for public viewing.
   * Strips private teacher data and strictly filters status = 'published'.
   * @param {Object} [options] - { classLevel, subject, chapter, resourceType, search, sortBy ('latest'|'popular'), limit, excludeId }
   * @returns {Promise<{success: boolean, data: Array, count?: number, error?: any}>}
   */
  window.getPublicResources = async function (options) {
    options = options || {};
    if (!window.supabaseClient) {
      return { success: true, data: filterSeedResources(options) };
    }
    try {
      var query = window.supabaseClient
        .from("resources")
        .select("id, title, slug, description, resource_type, class_level, subject, chapter, topic, cover_image_url, pdf_url, views, published_at, created_at, teachers:teacher_id(name, subjects)")
        .eq("status", "published");

      if (options.classLevel) {
        query = query.eq("class_level", options.classLevel);
      }

      if (options.subject) {
        query = query.eq("subject", options.subject);
      }

      if (options.chapter) {
        query = query.eq("chapter", options.chapter);
      }

      if (options.resourceType) {
        query = query.eq("resource_type", options.resourceType);
      }

      if (options.excludeId) {
        query = query.neq("id", options.excludeId);
      }

      if (options.search) {
        var s = options.search.trim();
        query = query.or("title.ilike.%" + s + "%,chapter.ilike.%" + s + "%,topic.ilike.%" + s + "%,description.ilike.%" + s + "%,subject.ilike.%" + s + "%,class_level.ilike.%" + s + "%,resource_type.ilike.%" + s + "%");
      }

      if (options.sortBy === "popular") {
        query = query.order("views", { ascending: false }).order("published_at", { ascending: false });
      } else {
        query = query.order("published_at", { ascending: false });
      }

      if (options.limit && options.limit > 0) {
        query = query.limit(options.limit);
      }

      var result = await query;
      if (result.error) {
        console.warn("[Public Learning Hub] Supabase query notice, using seed data fallback:", result.error.message);
        return { success: true, data: filterSeedResources(options) };
      }
      var data = result.data || [];
      if (data.length === 0 && !options.search && !options.classLevel && !options.subject) {
        // If live DB has no published resources yet, fallback to seed resources for demonstration
        data = filterSeedResources(options);
      }
      return { success: true, data: data };
    } catch (err) {
      console.warn("[Public Learning Hub] Exception, using seed data fallback:", err);
      return { success: true, data: filterSeedResources(options) };
    }
  };

  /**
   * Fetch a single published resource by its human-readable slug or UUID ID.
   * @param {string} identifier - Slug or UUID
   * @returns {Promise<{success: boolean, data?: object, error?: any}>}
   */
  window.getPublishedResourceBySlug = async function (identifier) {
    if (!identifier) {
      return { success: false, error: new Error("Invalid resource identifier") };
    }
    var cleanId = identifier.trim().toLowerCase();
    var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    // Check seed fallback first if matching
    var matchedSeed = DEFAULT_SEED_RESOURCES.find(function (r) {
      return r.slug === cleanId || r.id === cleanId || cleanId.indexOf(r.slug) !== -1 || r.slug.indexOf(cleanId) !== -1;
    });

    if (!window.supabaseClient) {
      if (matchedSeed) return { success: true, data: matchedSeed };
      return { success: false, error: new Error("Resource not found") };
    }

    try {
      var query = window.supabaseClient
        .from("resources")
        .select("id, title, slug, description, resource_type, class_level, subject, chapter, topic, content, cover_image_url, pdf_url, seo_title, seo_description, views, published_at, created_at, updated_at, teachers:teacher_id(name, subjects)")
        .eq("status", "published");

      if (isUuid) {
        query = query.eq("id", cleanId);
      } else {
        query = query.eq("slug", cleanId);
      }

      var result = await query.single();

      if (result.error) {
        if (matchedSeed) {
          return { success: true, data: matchedSeed };
        }
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data };
    } catch (err) {
      if (matchedSeed) {
        return { success: true, data: matchedSeed };
      }
      return { success: false, error: err };
    }
  };

  /**
   * Increment view counter securely through the Supabase RPC function.
   * @param {string} resourceId - UUID
   * @returns {Promise<{success: boolean, error?: any}>}
   */
  window.incrementResourceViews = async function (resourceId) {
    if (!window.supabaseClient || !resourceId) {
      return { success: false, error: new Error("Invalid resource ID") };
    }
    try {
      var result = await window.supabaseClient.rpc("increment_resource_views", {
        p_resource_id: resourceId
      });

      if (result.error) {
        console.warn("[Learning Hub] Increment views RPC error:", result.error);
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (err) {
      console.warn("[Learning Hub] Increment views exception:", err);
      return { success: false, error: err };
    }
  };

  /**
   * Fetch hierarchy of published resources (classes, subjects, chapters) dynamically.
   * @returns {Promise<{success: boolean, data: {classes: Array, subjects: Array, chaptersByClassSubject: Object, totalPublished: number}, error?: any}>}
   */
  window.getLearningHubHierarchy = async function () {
    if (!window.supabaseClient) {
      return { success: false, data: { classes: [], subjects: [], chaptersByClassSubject: {}, totalPublished: 0 }, error: new Error("Supabase client not initialized") };
    }
    try {
      var result = await window.supabaseClient
        .from("resources")
        .select("id, class_level, subject, chapter, topic, resource_type, views, published_at")
        .eq("status", "published");

      var records = [];
      if (result && !result.error && result.data && result.data.length > 0) {
        records = result.data;
      } else {
        records = DEFAULT_SEED_RESOURCES;
      }

      var classMap = {};
      var subjectMap = {};
      var chaptersByClassSubject = {};

      records.forEach(function (rec) {
        var cls = rec.class_level || "Other";
        var sub = rec.subject || "General";
        var ch = (rec.chapter || "").trim();

        // Count for class
        if (!classMap[cls]) {
          classMap[cls] = { name: cls, count: 0, subjects: {} };
        }
        classMap[cls].count++;
        classMap[cls].subjects[sub] = (classMap[cls].subjects[sub] || 0) + 1;

        // Count for subject
        if (!subjectMap[sub]) {
          subjectMap[sub] = { name: sub, count: 0, classes: {} };
        }
        subjectMap[sub].count++;
        subjectMap[sub].classes[cls] = (subjectMap[sub].classes[cls] || 0) + 1;

        // Group by class and subject
        var key = cls.toLowerCase().replace(/[^a-z0-9]/g, "-") + "/" + sub.toLowerCase().replace(/[^a-z0-9]/g, "-");
        if (!chaptersByClassSubject[key]) {
          chaptersByClassSubject[key] = {
            classLevel: cls,
            subject: sub,
            chapters: {},
            total: 0
          };
        }
        chaptersByClassSubject[key].total++;
        if (ch) {
          if (!chaptersByClassSubject[key].chapters[ch]) {
            chaptersByClassSubject[key].chapters[ch] = { name: ch, resources: [] };
          }
          chaptersByClassSubject[key].chapters[ch].resources.push(rec);
        } else {
          var unassigned = "General Topics";
          if (!chaptersByClassSubject[key].chapters[unassigned]) {
            chaptersByClassSubject[key].chapters[unassigned] = { name: unassigned, resources: [] };
          }
          chaptersByClassSubject[key].chapters[unassigned].resources.push(rec);
        }
      });

      // Sort classes numerically if Class X, otherwise alphabetically
      function sortClassNames(a, b) {
        var numA = parseInt((a.name.match(/\d+/) || [0])[0], 10);
        var numB = parseInt((b.name.match(/\d+/) || [0])[0], 10);
        if (numA && numB) return numA - numB;
        return a.name.localeCompare(b.name);
      }

      var classesList = Object.values(classMap).sort(sortClassNames);
      var subjectsList = Object.values(subjectMap).sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        data: {
          classes: classesList,
          subjects: subjectsList,
          chaptersByClassSubject: chaptersByClassSubject,
          totalPublished: records.length
        }
      };
    } catch (err) {
      console.error("[Learning Hub Hierarchy] Exception:", err);
      return { success: false, data: { classes: [], subjects: [], chaptersByClassSubject: {}, totalPublished: 0 }, error: err };
    }
  };

  /**
   * Fetch related published resources for an individual article.
   * Prioritizes same class + subject + chapter, with fallback to same class + subject.
   * @param {Object} resource - Current resource object
   * @param {number} [limit=4]
   * @returns {Promise<Array>}
   */
  window.getRelatedResources = async function (resource, limit) {
    if (!resource || !window.supabaseClient) return [];
    limit = limit || 4;
    try {
      // 1. First attempt: match same chapter
      if (resource.chapter) {
        var chResult = await window.getPublicResources({
          classLevel: resource.class_level,
          subject: resource.subject,
          chapter: resource.chapter,
          excludeId: resource.id,
          limit: limit
        });
        if (chResult.success && chResult.data.length >= limit) {
          return chResult.data;
        }
        var found = chResult.success ? chResult.data : [];
        // 2. Fill remaining from same class + subject
        var subResult = await window.getPublicResources({
          classLevel: resource.class_level,
          subject: resource.subject,
          excludeId: resource.id,
          limit: limit * 2
        });
        if (subResult.success) {
          var seenIds = new Set(found.map(function (r) { return r.id; }));
          subResult.data.forEach(function (r) {
            if (!seenIds.has(r.id) && found.length < limit) {
              seenIds.add(r.id);
              found.push(r);
            }
          });
        }
        return found;
      } else {
        var genResult = await window.getPublicResources({
          classLevel: resource.class_level,
          subject: resource.subject,
          excludeId: resource.id,
          limit: limit
        });
        return genResult.success ? genResult.data : [];
      }
    } catch (err) {
      console.warn("[Learning Hub Related] Exception:", err);
      return [];
    }
  };

  /**
   * Generate sitemap.xml representation for all published resources.
   * @param {string} [baseUrl] - Base URL of the website
   * @returns {Promise<string>}
   */
  window.generateSitemapXml = async function (baseUrl) {
    baseUrl = baseUrl || "https://www.edifytutorial.com";
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

    var res = await window.getPublicResources({ limit: 1000 });
    var items = res.success ? res.data : [];

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // 1. Website Homepage
    xml += '  <url>\n    <loc>' + baseUrl + '/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n';

    // 2. Core static hub URL
    xml += '  <url>\n    <loc>' + baseUrl + '/learning-hub</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n';

    var classSet = new Set();
    var classSubjectSet = new Set();

    items.forEach(function (item) {
      var clsSlug = (item.class_level || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      var subSlug = (item.subject || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (clsSlug) classSet.add(clsSlug);
      if (clsSlug && subSlug) classSubjectSet.add(clsSlug + "/" + subSlug);
    });

    // 3. Class landing pages
    classSet.forEach(function (cls) {
      xml += '  <url>\n    <loc>' + baseUrl + '/learning-hub/' + cls + '</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n';
    });

    // 4. Class + Subject landing pages
    classSubjectSet.forEach(function (cs) {
      xml += '  <url>\n    <loc>' + baseUrl + '/learning-hub/' + cs + '</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n';
    });

    // 5. Individual Published Resources
    items.forEach(function (item) {
      var clsSlug = (item.class_level || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      var subSlug = (item.subject || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      var url = baseUrl + '/learning-hub/' + clsSlug + '/' + subSlug + '/' + encodeURIComponent(item.slug);
      var rawDate = item.updated_at || item.published_at;
      var lastMod = rawDate ? rawDate.split("T")[0] : null;

      xml += '  <url>\n';
      xml += '    <loc>' + url + '</loc>\n';
      if (lastMod) {
        xml += '    <lastmod>' + lastMod + '</lastmod>\n';
      }
      xml += '    <changefreq>monthly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    });

    xml += '</urlset>';
    return xml;
  };

})();
