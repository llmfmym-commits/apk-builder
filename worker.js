const ALLOWED_ORIGIN = "*";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);

    // تست Worker
    if (url.pathname === "/api/test") {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "APK Builder API is working"
        }),
        {
          status: 200,
          headers: corsHeaders
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "APK Builder API"
      }),
      {
        status: 200,
        headers: corsHeaders
      }
    );
  }
};
