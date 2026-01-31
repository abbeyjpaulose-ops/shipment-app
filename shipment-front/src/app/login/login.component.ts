import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule], // ✅ Removed HttpClientModule
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';

  constructor(private http: HttpClient) {}

  login() {
    this.http.post('http://localhost:3000/api/auth/login', {
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
        localStorage.setItem('branch', 'All Branches');
        localStorage.setItem('originLocId', 'all');

        console.log('✅ Login successful for user:', localStorage.getItem('companyType'));        

        this.http.get<any[]>(`http://localhost:3000/api/branches`)
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
      },
      error: (err) => {
        console.error(err);
        alert('Invalid credentials');
      }
    });
  }
}
