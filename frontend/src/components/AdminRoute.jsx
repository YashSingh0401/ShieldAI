import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

export function AdminRoute({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('shield_admin_token');
        if (!token) {
          setLoading(false);
          navigate('/admin-login', { replace: true });
          return;
        }
        const data = await api.get('/admin/me');
        // data is AuthResponse; verify email matches the single admin
        if (data.user.email !== 'yashwardhans782@gmail.com') {
          localStorage.removeItem('shield_admin_token');
          localStorage.removeItem('shield_admin_user');
          setLoading(false);
          navigate('/admin-login', { replace: true });
          return;
        }
        setIsAdmin(true);
      } catch (err) {
        console.error("Admin route guard error:", err);
        localStorage.removeItem('shield_admin_token');
        localStorage.removeItem('shield_admin_user');
      }
      setLoading(false);
    };

    checkAdmin();
  }, [navigate, location.pathname]);

  if (loading) {
    return null; // render nothing while checking
  }

  if (!isAdmin) {
    navigate('/admin-login', { replace: true });
    return null;
  }

  return children;
}