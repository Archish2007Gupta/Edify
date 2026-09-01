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
})();
