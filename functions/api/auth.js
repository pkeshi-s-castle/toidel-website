const stateCookieName = "decap_oauth_state";

function randomState() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function requiredEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const requestUrl = new URL(request.url);
    const state = randomState();

    const clientId = requiredEnv(env, "GITHUB_OAUTH_CLIENT_ID");
    const redirectUri = `${requestUrl.origin}/api/callback`;
    const scope = env.GITHUB_OAUTH_SCOPE || "repo";

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);

    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizeUrl.toString(),
        "Set-Cookie": `${stateCookieName}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(`Decap auth error: ${error.message}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
