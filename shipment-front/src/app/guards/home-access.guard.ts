import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const homeAccessGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = String(localStorage.getItem('token') || '').trim();
  const role = String(localStorage.getItem('role') || '').trim().toLowerCase();

  if (!token) return router.createUrlTree(['/']);
  if (role === 'super-admin') return router.createUrlTree(['/super-admin']);
  return true;
};

