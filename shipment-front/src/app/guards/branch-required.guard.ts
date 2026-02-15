import { inject } from '@angular/core';
import { CanActivateChildFn, Router, UrlTree } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';

const ALLOW_WITHOUT_BRANCHES = new Set([
  'Branches',
  'profile',
  'changePass',
  'roles',
  'notifications'
]);

export const branchRequiredGuard: CanActivateChildFn = (childRoute) => {
  const router = inject(Router);
  const http = inject(HttpClient);

  const childPath = childRoute.routeConfig?.path || '';
  if (ALLOW_WITHOUT_BRANCHES.has(childPath)) return true;

  const token = localStorage.getItem('token');
  if (!token) return router.createUrlTree(['/']);

  return http.get<any[]>('/api/branches').pipe(
    map((branches) => {
      const count = Array.isArray(branches) ? branches.length : 0;
      if (count > 0) return true;
      return router.createUrlTree(['/home', 'Branches']);
    }),
    catchError(() => of(router.createUrlTree(['/home', 'Branches']) as UrlTree))
  );
};


