import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule], // Removed HttpClientModule
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';

  constructor(private http: HttpClient) {}

  private getLoginErrorMessage(err: HttpErrorResponse): string {
    const backendMessage =
      typeof err?.error?.message === 'string'
        ? err.error.message.trim()
        : '';

    if (backendMessage) return backendMessage;
    if (err.status === 0) return 'Cannot reach the API server. Check backend deployment and /api routing.';
    if (err.status === 404) return 'API route not found. Configure production /api routing.';
    if (err.status === 429) return 'Too many login attempts. Please try again later.';
    if (err.status >= 500) return 'Server error while logging in. Please try again.';
    return err.status ? `Login failed (${err.status}).` : 'Login failed.';
  }

  login() {
    this.http.post('/api/auth/login', {
      username: this.username,
      password: this.password
    }).subscribe({
      next: (res: any) => {
        const username = res.username;
        const email = res.email;
        const role = res.role;
        const token = res.token;
        const branches = res.branches;
        const originLocIds = res.originLocIds;
        const branchNames = res.branchNames;
        const gstin = res.GSTIN;
        const gstinId = res.GSTIN_ID;
        localStorage.setItem('username', username);
        localStorage.setItem('email', email);
        if (role) localStorage.setItem('role', role);
        if (token) localStorage.setItem('token', token);
        if (gstin) localStorage.setItem('GSTIN', gstin);
        if (gstinId !== undefined && gstinId !== null) localStorage.setItem('GSTIN_ID', String(gstinId));
        if (Array.isArray(branchNames)) {
          localStorage.setItem('branches', JSON.stringify(branchNames));
        } else if (Array.isArray(branches)) {
          localStorage.setItem('branches', JSON.stringify(branches));
        }
        if (Array.isArray(originLocIds)) {
          localStorage.setItem('originLocIds', JSON.stringify(originLocIds));
        }

        const normalizedRole = String(role || '').trim().toLowerCase();
        if (normalizedRole === 'super-admin') {
          localStorage.removeItem('branches');
          localStorage.removeItem('branch');
          localStorage.removeItem('originLocId');
          localStorage.removeItem('originLocIds');
          window.location.href = '/super-admin';
          return;
        }

        localStorage.setItem('branch', 'All Branches');
        localStorage.setItem('originLocId', 'all');

        let didProceed = false;
        const proceedOnce = () => {
          if (didProceed) return;
          didProceed = true;
          this.http.get<any[]>(`/api/branches`)
            .subscribe({
              next: (branches) => {
                if (!branches || branches.length === 0) {
                  window.location.href = '/home/Branches';
                } else {
                  window.location.href = '/home/dashboard';
                }
              },
              error: () => {
                window.location.href = '/home/Branches';
              }
            });
        };

        this.http.get<any>(`/api/profile?user=${username}&email=${email}`)
          .subscribe({
            next: (data) => {
              const profile = Array.isArray(data) ? data[0] : data;
              const businessType = profile?.businessType;
              if (businessType !== undefined && businessType !== null && String(businessType).trim() !== '') {
                localStorage.setItem('companyType', String(businessType));
              }
              proceedOnce();
            },
            error: () => {
              proceedOnce();
            }
          });
      },
      error: (err: HttpErrorResponse) => {
        console.error('Login request failed:', err);
        alert(this.getLoginErrorMessage(err));
      }
    });
  }
}

