const GITHUB_OWNER = "llmfmym";
const GITHUB_REPOSITORY = "apk-builder";
const GITHUB_BRANCH = "main";

const GITHUB_API = "https://api.github.com";
const CONFIG_FILE = "build-config.json";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders()
  });
}

async function githubRequest(path, env, options = {}) {
  if (!env.GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN secret is not configured in Cloudflare."
    );
  }

  return fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function getFileSha(env) {
  const response = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/contents/${CONFIG_FILE}?ref=${GITHUB_BRANCH}`,
    env
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Cannot read ${CONFIG_FILE}: ${response.status} ${text}`
    );
  }

  const data = await response.json();
  return data.sha;
}

function encodeBase64UTF8(text) {
  const bytes = new TextEncoder().encode(text);

  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

async function updateBuildConfig(config, env) {
  const content = JSON.stringify(config, null, 2);

  const encoded = encodeBase64UTF8(content);

  const sha = await getFileSha(env);

  const body = {
    message: "Update APK builder configuration",
    content: encoded,
    branch: GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/contents/${CONFIG_FILE}`,
    env,
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Cannot update ${CONFIG_FILE}: ${response.status} ${text}`
    );
  }

  return await response.json();
}

async function findWorkflow(env) {
  const response = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/actions/workflows?per_page=100`,
    env
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Cannot list GitHub workflows: ${response.status} ${text}`
    );
  }

  const data = await response.json();
  const workflows = data.workflows || [];

  if (!workflows.length) {
    throw new Error("No GitHub Actions workflow was found.");
  }

  let workflow = workflows.find(
    w => w.name === "Build Custom APK"
  );

  if (!workflow) {
    workflow = workflows.find(
      w => w.state === "active"
    );
  }

  if (!workflow) {
    throw new Error(
      "No active GitHub Actions workflow was found."
    );
  }

  return workflow;
}

async function runWorkflow(env) {
  const workflow = await findWorkflow(env);

  const response = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/actions/workflows/${workflow.id}/dispatches`,
    env,
    {
      method: "POST",
      body: JSON.stringify({
        ref: GITHUB_BRANCH
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Cannot start GitHub Actions: ${response.status} ${text}`
    );
  }

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowPath: workflow.path
  };
}

export default {
  async fetch(request, env) {

    /*
     * CORS
     */

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);

    /*
     * API TEST
     */

    if (
      request.method === "GET" &&
      url.pathname === "/api/test"
    ) {
      return json({
        ok: true,
        message: "APK Builder API is working"
      });
    }

    /*
     * BUILD API
     */

    if (
      request.method === "POST" &&
      url.pathname === "/api/build"
    ) {
      try {
        const body = await request.json();

        const appName = String(
          body.appName || ""
        ).trim();

        const siteUrl = String(
          body.siteUrl || ""
        ).trim();

        const htmlCode = String(
          body.htmlCode || ""
        );

        if (!appName) {
          return json(
            {
              ok: false,
              error: "appName is required"
            },
            400
          );
        }

        if (
          !siteUrl &&
          !htmlCode.trim()
        ) {
          return json(
            {
              ok: false,
              error:
                "siteUrl or htmlCode is required"
            },
            400
          );
        }

        const config = {
          appName,
          siteUrl,
          htmlCode
        };

        /*
         * ذخیره تنظیمات در GitHub
         */

        const commit =
          await updateBuildConfig(
            config,
            env
          );

        /*
         * اجرای GitHub Actions
         */

        const workflow =
          await runWorkflow(env);

        return json({
          ok: true,
          message:
            "APK build started successfully.",
          commit: {
            sha:
              commit.commit?.sha || null
          },
          workflow
        });

      } catch (error) {
        console.error(error);

        return json(
          {
            ok: false,
            error:
              error.message ||
              "Unknown error"
          },
          500
        );
      }
    }

    /*
     * تمام درخواست‌های غیر API
     * از www/index.html و سایر فایل‌ها پاسخ می‌گیرند.
     */

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      "ASSETS binding is not configured.",
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain"
        }
      }
    );
  }
};
