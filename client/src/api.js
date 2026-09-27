const TOKEN_KEY = "accessToken";
const USER_KEY = "authUser";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession({ accessToken, user }) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function errorMessage(data, fallback) {
  if (data?.error?.message) return data.error.message;
  if (typeof data?.error === "string") return data.error;
  if (data?.message) return data.message;
  return fallback;
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.json) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    ...options,
    headers,
    body: options.json ? JSON.stringify(options.json) : options.body,
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (res.status === 401) {
    clearSession();
  }

  if (!res.ok) {
    const err = new Error(errorMessage(data, "Ошибка запроса"));
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }

  return data;
}
