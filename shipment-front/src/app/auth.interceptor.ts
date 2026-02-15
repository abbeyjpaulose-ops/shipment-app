import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return next(req.clone({ withCredentials: true }));
  }

  return next(req.clone({
    withCredentials: true,
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  }));
};
