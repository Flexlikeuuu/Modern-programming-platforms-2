const TOKEN_KEY = "accessToken";
const USER_KEY = "authUser";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
};

export const saveSession = ({ accessToken, user }) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.json) headers["Content-Type"] = "application/json";

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

  if (res.status === 401) clearSession();

  if (!res.ok) {
    const message = data?.error?.message || (typeof data?.error === "string" ? data.error : data?.message) || "Ошибка запроса";
    const err = new Error(message);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }

  return data;
}
