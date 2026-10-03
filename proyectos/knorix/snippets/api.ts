const API = process.env.NEXT_PUBLIC_API_URL;


// Función auxiliar que hace fetch con manejo de errores
async function request(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('accessToken')
    : null;


  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...options,
  });


  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Error en la petición');
  }


  return res.json();
}


// ── AUTH ─────────────────────────────────────────────────
export const authApi = {
  register: (data: any) => request('/auth/register', {
    method: 'POST', body: JSON.stringify(data),
  }),
  login: (data: any) => request('/auth/login', {
    method: 'POST', body: JSON.stringify(data),
  }),
};


// ── USERS ────────────────────────────────────────────────
export const usersApi = {
  getMe: () => request('/users/me'),
  updateMe: (data: any) => request('/users/me', {
    method: 'PATCH', body: JSON.stringify(data),
  }),
};


// ── COURSES ──────────────────────────────────────────────
export const coursesApi = {
  getAll: (params?: any) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/courses${qs}`);
  },
  getBySlug: (slug: string) => request(`/courses/${slug}`),
  getMyCourses: () => request('/courses/my'),
  create: (data: any) => request('/courses', {
    method: 'POST', body: JSON.stringify(data),
  }),
};

