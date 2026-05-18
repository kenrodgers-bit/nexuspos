import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '../db/schema';
import { useAppStore } from '../store/appStore';

export const ProtectedRoute = ({ children, role, roles }: { children: ReactNode; role?: Role; roles?: Role[] }) => {
  const user = useAppStore((state) => state.currentUser);
  const locked = useAppStore((state) => state.locked);
  if (!user || locked) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};
