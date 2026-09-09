const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function getToken() {
  const adminToken = localStorage.getItem('shield_admin_token');
  const sessionToken = localStorage.getItem('shield_session_token');
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return adminToken || sessionToken;
  }
  return sessionToken || adminToken;
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('shield_session_token', token);
  } else {
    localStorage.removeItem('shield_session_token');
  }
}

export function getStoredUser() {
  const raw = localStorage.getItem('shield_user');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('shield_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('shield_user');
  }
}

async function request(endpoint, options = {}) {
  const { body, method = 'GET', headers = {}, formData } = options;

  const config = {
    method,
    headers: { ...headers },
  };

  const token = getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  if (formData) {
    config.body = formData;
  } else if (body) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, config);

  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    let errorBody = null;
    let isQuotaExceeded = res.status === 402;
    let isAuthError = res.status === 401;
    try {
      const errData = await res.json();
      errorBody = errData;
      if (errData && errData.detail) {
        if (typeof errData.detail === 'string') {
          errorMessage = errData.detail;
        } else if (typeof errData.detail === 'object') {
          if (errData.detail.message) {
            errorMessage = errData.detail.message;
          }
          if (errData.detail.code === 'quota_exceeded') {
            isQuotaExceeded = true;
          }
          if (errData.detail.code === 'auth_error' || res.status === 401) {
            isAuthError = true;
          }
        }
      }
    } catch {
      try {
        errorMessage = await res.text();
      } catch {
        errorMessage = `Request failed with status ${res.status}`;
      }
    }
    const err = new Error(
      typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)
    );
    err.status = res.status;
    err.body = errorBody;
    err.detail = errorBody?.detail;
    err.isQuotaExceeded = isQuotaExceeded;
    err.isAuthError = isAuthError;
    throw err;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (endpoint, params) => {
    let url = endpoint;
    if (params) {
      const cleanParams = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = v;
        }
      }
      const qs = new URLSearchParams(cleanParams).toString();
      if (qs) url += `?${qs}`;
    }
    return request(url, { method: 'GET' });
  },

  post: (endpoint, body) =>
    request(endpoint, { method: 'POST', body }),

  upload: (endpoint, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(endpoint, { method: 'POST', formData });
  },
};