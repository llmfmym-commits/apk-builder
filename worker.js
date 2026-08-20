export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // تست Worker
    if (url.pathname === "/api/test") {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "APK Builder API is working"
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // فعلاً بقیه درخواست‌ها را به فایل‌های سایت بده
    return env.ASSETS.fetch(request);
  }
};
