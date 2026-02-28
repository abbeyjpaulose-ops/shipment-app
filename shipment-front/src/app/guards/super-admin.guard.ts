import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const superAdminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = String(localStorage.getItem('token') || '').trim();
  const username = String(localStorage.getItem('username') || '').trim();
  const email = String(localStorage.getItem('email') || '').trim();
  const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
  const hasSession = Boolean(token || username || email || role);

  if (!hasSession) return router.createUrlTree(['/']);
  if (role !== 'super-admin') return router.createUrlTree(['/home', 'dashboard']);
  return true;
};
