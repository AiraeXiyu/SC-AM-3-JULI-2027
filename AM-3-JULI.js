/**
 * ============================================================
 * ⚡ MOTION ENGINE
 * Native Reverse-Engineered Alight Motion Pro API
 * Developer : XIYU CODEX
 * Version   : 1.0.0
 * ============================================================
 */


// FIREBASE API
const API_KEY =
  process.env.FIREBASE_API_KEY ||
  "AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0";

const IDT = "https://www.googleapis.com/identitytoolkit/v3/relyingparty";

const VERIFY_URL =
  process.env.AM_VERIFY_URL ||
  "https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase";

const PURCHASE_TOKEN =
  process.env.AM_PURCHASE_TOKEN ||
  "mmgaobamlahbbeccfplmbkbb.AO-J1OzqG0or_GJJIx-ms8GrTm-jaglCRfhQSRPUZKpl2YspYS-oN7_94uv8RC5vQbvd_Ios2pPDStZ2n7F0hLE3FiOU7HS3R6Fquulv5xLXFECSv4ctElw";

const FIREBASE_INSTANCE_ID_TOKEN =
  process.env.FIREBASE_INSTANCE_ID_TOKEN ||
  "cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI";

const ANDROID_HEADERS = {
  "content-type": "application/json",
  "x-android-package": "com.alightcreative.motion",
  "x-android-cert": "ECA6BF91B8715A6F810ED0BBFC65B6CD578F52A8",
  "user-agent":
    "dalvik/2.1.0 (linux; u; android 15; 23127pn0cc build/bp1a.250505.005)"
};

const VERIFY_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "user-agent": "okhttp/3.12.1",
  "accept-encoding": "gzip"
};

async function postIdentityToolkit(path, payload, key = API_KEY) {
  if (!key || typeof key !== "string") {
    throw new Error("Firebase API key is missing.");
  }

  const response = await fetch(
    `${IDT}/${path}?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: ANDROID_HEADERS,
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json().catch(() => ({}));

  return { response, data };
}

async function sendMagicLink(email) {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const { response, data } = await postIdentityToolkit(
      "getOobConfirmationCode",
      {
        requestType: 6,
        email: normalizedEmail,
        androidInstallApp: true,
        canHandleCodeInApp: true,
        continueUrl:
          "https://alightcreative.com?ui_sid=0366624874&ui_sd=0",
        iosBundleId: "com.alightcreative.motion",
        androidPackageName: "com.alightcreative.motion",
        androidMinimumVersion: "585",
        clientType: "CLIENT_TYPE_ANDROID"
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        error:
          data?.error?.message ||
          "Upstream authentication request failed",
        upstream: data
      };
    }

    return {
      ok: true,
      email: normalizedEmail,
      upstream: data
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Authentication provider request failed"
    };
  }
}

function extractCode(raw) {
  if (!raw) return null;

  let value = String(raw).replace(/&amp;/g, "&");

  try {
    value = decodeURIComponent(value);
  } catch (_) {}

  try {
    const url = new URL(value);
    let code = url.searchParams.get("oobCode");

    if (!code) {
      const nested =
        url.searchParams.get("link") ||
        url.searchParams.get("q") ||
        url.searchParams.get("url");

      if (nested) {
        try {
          code = new URL(nested).searchParams.get("oobCode");
        } catch (_) {}
      }
    }

    if (code) {
      return code.replace(/[^a-zA-Z0-9_-]/g, "");
    }
  } catch (_) {}

  const match = value.match(/[?&]oobCode=([a-zA-Z0-9_-]+)/i);

  if (match) return match[1];

  const trimmed = String(raw).trim();

  return /^[a-zA-Z0-9_-]{10,}$/.test(trimmed) &&
    !trimmed.includes("://")
    ? trimmed
    : null;
}

async function authUser(email, rawLink) {
  const code = extractCode(rawLink);

  if (!code) {
    return {
      ok: false,
      why: "oobCode tidak ditemukan di magicLink."
    };
  }

  let linkKey = null;

  const match = String(rawLink)
    .replace(/&amp;/g, "&")
    .match(/[?&]apiKey=([^&]+)/i);

  if (match) {
    try {
      linkKey = decodeURIComponent(match[1]);
    } catch (_) {
      linkKey = match[1];
    }
  }

  const keys =
    linkKey && linkKey !== API_KEY
      ? [API_KEY, linkKey]
      : [API_KEY];

  let lastError = "Magic-link verification failed.";

  for (const key of keys) {
    try {
      const { response, data } = await postIdentityToolkit(
        "emailLinkSignin",
        {
          email: email.trim().toLowerCase(),
          oobCode: code,
          clientType: "CLIENT_TYPE_ANDROID"
        },
        key
      );

      if (!response.ok) {
        lastError = data?.error?.message || JSON.stringify(data);
        continue;
      }

      let user = null;

      try {
        const account = await postIdentityToolkit(
          "getAccountInfo",
          { idToken: data.idToken },
          key
        );

        user = account.data?.users?.[0] || null;
      } catch (_) {}

      return {
        ok: true,
        email: email.trim().toLowerCase(),
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        uid: data.localId,
        isNewUser: !!data.isNewUser,
        user: user
          ? {
              localId: user.localId,
              email: user.email,
              emailVerified: !!user.emailVerified,
              displayName: user.displayName || null
            }
          : null
      };
    } catch (error) {
      lastError = error.message || String(error);
    }
  }

  return {
    ok: false,
    why: lastError
  };
}

// Pertahankan generator order ID dari source asli.
function generateOrderId(customPrefix = null) {
  const randomDigits = (length) => {
    let result = "";

    while (result.length < length) {
      result += Math.floor(Math.random() * 10).toString();
    }

    return result.slice(0, length);
  };

  const gpa =
    `GPA.${randomDigits(4)}-${randomDigits(4)}-` +
    `${randomDigits(4)}-${randomDigits(5)}`;

  if (!customPrefix || !String(customPrefix).trim()) {
    return `XIYU CODEX-${gpa}`;
  }

  const clean = String(customPrefix).trim();

  if (clean.includes("GPA.")) return clean;

  return `${clean}-${gpa}`;
}

async function activatePro(idToken, customOrderId = null) {
  const orderId = generateOrderId(customOrderId);

  const payload = {
    data: {
      productId: "am.full.sub.annual.19q4",
      token: PURCHASE_TOKEN,
      skuType: "subs",
      orderId
    }
  };

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        ...VERIFY_HEADERS,
        authorization: `Bearer ${idToken}`,
        "firebase-instance-id-token": FIREBASE_INSTANCE_ID_TOKEN
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (
      !response.ok ||
      (
        data?.result?.status !== "success" &&
        !data?.result?.valid
      )
    ) {
      return {
        ok: false,
        order: orderId,
        httpStatus: response.status,
        why: JSON.stringify(data),
        result: data
      };
    }

    return {
      ok: true,
      order: orderId,
      result: data
    };
  } catch (error) {
    return {
      ok: false,
      order: orderId,
      why: error.message || String(error)
    };
  }
}

module.exports = {
  sendMagicLink,
  authUser,
  activatePro,
  generateOrderId
};


// UTILS
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload, null, 2));
}

function base(status, extra = {}) {
  return {
    status,
    developer: "XIYU",
    service: "XIYU API PRIVATE",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    ...extra
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error("Request body must be valid JSON")); }
    });
    req.on("error", reject);
  });
}

module.exports = { sendJson, base, readBody };

// SEND API AM
const { sendJson, base, readBody } = require("./_utils");
const { sendMagicLink } = require("./_firebase");
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, base("error", { error: "Method not allowed. Use POST with JSON." })); }
  let body; try { body = await readBody(req); } catch (err) { return sendJson(res, 400, base("error", { error: err.message })); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, base("error", { error: "A valid email field is required." }));
  try {
    const result = await sendMagicLink(email);
    if (!result.ok) return sendJson(res, result.httpStatus && result.httpStatus >= 400 ? 502 : 400, base("error", { message: "Magic link could not be sent.", error: result.error, upstream: result.upstream || undefined }));
    return sendJson(res, 200, base("success", { message: "Magic-link request accepted by the authentication provider.", data: { email: email.toLowerCase() } }));
  } catch (err) { return sendJson(res, 502, base("error", { error: err.message || "Authentication provider request failed." })); }
};

/VERIFY API AM
const { sendJson, base, readBody } = require("./_utils");
const { authUser, activatePro } = require("./_firebase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, base("error", { error: "Method not allowed. Use POST with JSON." }));
  }
  let body;
  try { body = await readBody(req); }
  catch (error) { return sendJson(res, 400, base("error", { error: error.message })); }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const magicLink = typeof body.magicLink === "string" ? body.magicLink.trim() : (typeof body.link === "string" ? body.link.trim() : "");
  const customOrderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !magicLink) {
    return sendJson(res, 400, base("error", {
      error: "Both valid email and magicLink fields are required.",
      expected: { email: "user@example.com", magicLink: "https://...", orderId: "XIYU CODEX" }
    }));
  }

  try {
    const auth = await authUser(email, magicLink);
    if (!auth.ok) return sendJson(res, 400, base("error", { message: "Magic-link verification failed.", error: auth.why }));

    const premium = await activatePro(auth.idToken, customOrderId || null);
    const now = new Date();
    const expiryMillis = premium?.result?.result?.expiryTimeMillis;
    const validUntil = expiryMillis ? new Date(Number(expiryMillis)) : (() => {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() + 1);
      return date;
    })();

    const account = {
      uid: auth.uid || null,
      email: auth.user?.email || auth.email || email.toLowerCase(),
      status: premium.ok ? "ACTIVE" : "INACTIVE",
      membershipStatus: premium.ok ? "PREMIUM_ACTIVE" : "LOGIN_ONLY",
      planName: "Alight Motion Pro / Member",
      subscriptionType: "Yearly VIP License",
      orderId: premium.order,
      activatedAt: now.toISOString(),
      validUntil: validUntil.toISOString(),
      expiryTimestamp: validUntil.getTime(),
      isNewUser: auth.isNewUser,
      profile: auth.user || null
    };

    if (!premium.ok) {
      return sendJson(res, 400, base("error", {
        message: "Email-link authentication succeeded, but Premium activation failed.",
        data: { email: account.email, orderId: premium.order, account, activationError: premium.why, upstreamStatus: premium.httpStatus || null, upstream: premium.result || null }
      }));
    }
    return sendJson(res, 200, base("success", {
      message: "Alight Motion Pro activation request succeeded.",
      data: { email: account.email, orderId: premium.order, account, premiumDetails: premium.result }
    }));
  } catch (error) {
    return sendJson(res, 502, base("error", { error: error.message || "Authentication or Premium provider request failed." }));
  }
};

// VERIFY API AM 2
module.exports = require("./verif");

// HEALTH
const { sendJson, base } = require("./_utils");

module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, base("error", { error: "Method not allowed" }));
  }
  return sendJson(res, 200, base("ok", { kernel: "Active" }));
};

// HISTORY
const { sendJson, base } = require("./_utils");

module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, base("error", { error: "Method not allowed" }));
  }
  return sendJson(res, 200, base("success", {
    total_saved: 0,
    accounts: [],
    note: "No account history is stored by this safe starter project."
  }));
};

// INFO
const { sendJson, base } = require("./_utils");
module.exports = (req, res) => {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return sendJson(res, 405, base("error", { error: "Method not allowed" })); }
  const origin = `https://${req.headers.host || "your-project.vercel.app"}`;
  return sendJson(res, 200, base("online", { base_url: origin, endpoints: [
    { path: "/api/send", method: "POST", description: "Request an email magic link" },
    { path: "/api/verif", method: "POST", description: "Verify/sign in with a magic link" },
    { path: "/api/verify", method: "POST", description: "Alias for /api/verif" },
    { path: "/api/history", method: "GET", description: "History status" },
    { path: "/api/health", method: "GET", description: "Health check" },
    { path: "/api/stats", method: "GET", description: "Service statistics" }
  ] }));
};

//STATS
const { sendJson, base } = require("./_utils");
module.exports = (req, res) => {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return sendJson(res, 405, base("error", { error: "Method not allowed" })); }
  return sendJson(res, 200, base("success", { status: "Operational", total_endpoints: 7, persistent_storage: false, note: "Serverless runtime; no account tokens or authentication history are stored." }));
};
