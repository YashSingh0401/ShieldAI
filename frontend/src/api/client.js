const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function getToken() {
  return localStorage.getItem('shield_session_token');
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
    try {
      const errData = await res.json();
      if (errData.detail) errorMessage = errData.detail;
      } catch {
        try {
          errorMessage = await res.text();
        } catch {
          errorMessage = `Request failed with status ${res.status}`;
        }
      }
    throw new Error(errorMessage);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (endpoint, params) => {
    let url = endpoint;
    if (params) {
      const qs = new URLSearchParams(params).toString();
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
