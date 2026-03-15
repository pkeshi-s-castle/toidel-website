const stateCookieName = "decap_oauth_state";

function htmlResponse(status, body) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function scriptPage(origin, payload, hasError) {
  const eventType = hasError ? "error" : "success";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Decap Auth</title>
  </head>
  <body>
    <script>
      (function () {
        const targetOrigin = ${JSON.stringify(origin)};
        const message = "authorization:github:${eventType}:" + JSON.stringify(${JSON.stringify(payload)});
        if (window.opener) {
          window.opener.postMessage("authorizing:github", targetOrigin);
          window.opener.postMessage(message, targetOrigin);
        }
        window.close();
      })();
    </script>
    <p>You can close this window.</p>
  </body>
</html>`;
}

function parseCookies(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = {};
  cookieHeader.split(";").forEach((part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return;
    }
    cookies[key] = rest.join("=");
  });
  return cookies;
}

async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    const message = payload.error_description || payload.error || "GitHub token exchange failed";
    throw new Error(message);
  }

  return payload.access_token;
}

export async function onRequest(context) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const returnedError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  if (returnedError) {
    return htmlResponse(400, scriptPage(requestUrl.origin, { message: returnedError }, true));
  }

  if (!code || !state) {
    return htmlResponse(400, scriptPage(requestUrl.origin, { message: "Missing code or state" }, true));
  }

  const cookies = parseCookies(request);
  if (!cookies[stateCookieName] || cookies[stateCookieName] !== state) {
    return htmlResponse(400, scriptPage(requestUrl.origin, { message: "Invalid OAuth state" }, true));
  }

  const clientId = env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return htmlResponse(500, scriptPage(requestUrl.origin, { message: "Missing OAuth env vars" }, true));
  }

  try {
    const redirectUri = `${requestUrl.origin}/api/callback`;
    const token = await exchangeCode({ code, clientId, clientSecret, redirectUri });

    const body = scriptPage(
      requestUrl.origin,
      {
        token,
        provider: "github",
      },
      false,
    );

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": `${stateCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      },
    });
  } catch (error) {
    return htmlResponse(400, scriptPage(requestUrl.origin, { message: error.message }, true));
  }
}
