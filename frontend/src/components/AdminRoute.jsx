import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

export function AdminRoute({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('shield_admin_token') || localStorage.getItem('shield_session_token');
        if (!token) {
          if (isMounted) {
            setLoading(false);
            navigate('/admin-login', { replace: true });
          }
          return;
        }
        const data = await api.get('/admin/me');
        if (data.user?.email !== 'yashwardhans782@gmail.com') {
          localStorage.removeItem('shield_admin_token');
          localStorage.removeItem('shield_admin_user');
          if (isMounted) {
            setLoading(false);
            navigate('/admin-login', { replace: true });
          }
          return;
        }
        if (isMounted) {
          setIsAdmin(true);
          setLoading(false);
        }
      } catch (err) {
        console.error("Admin route guard error:", err);
        localStorage.removeItem('shield_admin_token');
        localStorage.removeItem('shield_admin_user');
        if (isMounted) {
          setLoading(false);
          navigate('/admin-login', { replace: true });
        }
      }
    };

    checkAdmin();
    return () => { isMounted = false; };
  }, [navigate, location.pathname]);

  if (loading) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  return children;
}