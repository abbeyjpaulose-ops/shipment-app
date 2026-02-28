import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

type CompanyRow = {
  gstinId: number;
  GSTIN: string;
  email: string;
  username: string;
  role: string;
  companyName: string;
  companyType: string;
  phoneNumber: string;
  billingAddress: string;
  profileCount: number;
  branchCount: number;
  hubCount: number;
  createdAt: string;
};

type SuperAdminRow = {
  gstinId: number;
  email: string;
  username: string;
  companyName: string;
  createdAt: string;
};

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './super-admin.component.html',
  styleUrls: ['./super-admin.component.css']
})
export class SuperAdminComponent implements OnInit {
  loading = false;
  loadingSuperAdmins = false;
  saving = false;
  updatingSuperAdminId: number | null = null;
  deletingId: number | null = null;
  error = '';
  success = '';
  rows: CompanyRow[] = [];
  superAdmins: SuperAdminRow[] = [];
  superAdminPasswords: Record<number, string> = {};

  form = {
    email: '',
    username: '',
    password: '',
    role: 'admin',
    gstin: '',
    companyName: '',
    billingAddress: '',
    companyType: 'Courier',
    taxPercent: '12',
    creditDays: '30',
    phoneNumber: ''
  };

  constructor(private http: HttpClient) {}

  private resolveError(err: any, fallback: string): string {
    const raw = err?.error;
    const objectMessage = String(raw?.message || '').trim();
    const textMessage = typeof raw === 'string' ? raw.trim() : '';
    const combined = objectMessage || textMessage;
    const endpointMissing =
      /Cannot\s+GET\s+\/api\/super-admin\/companies/i.test(textMessage) ||
      /Cannot\s+GET\s+\/api\/super-admin\/super-admins/i.test(textMessage) ||
      /Cannot\s+PATCH\s+\/api\/super-admin\/super-admins\/\d+\/password/i.test(textMessage) ||
      /Cannot\s+POST\s+\/api\/super-admin\/companies/i.test(textMessage) ||
      /Cannot\s+DELETE\s+\/api\/super-admin\/companies/i.test(textMessage) ||
      Number(err?.status) === 404;

    if (endpointMissing) {
      return 'Super-admin endpoint unavailable. Restart backend server.';
    }
    if (combined) return combined;
    const errMessage = String(err?.message || '').trim();
    return errMessage || fallback;
  }

  ngOnInit(): void {
    this.loadCompanies();
    this.loadSuperAdmins();
  }

  loadCompanies(): void {
    this.loading = true;
    this.error = '';
    this.http.get<any>('/api/super-admin/companies').subscribe({
      next: (res) => {
        this.rows = Array.isArray(res?.data) ? res.data : [];
        this.loading = false;
      },
      error: (err) => {
        this.error = this.resolveError(err, 'Failed to load companies');
        this.loading = false;
      }
    });
  }

  loadSuperAdmins(): void {
    this.loadingSuperAdmins = true;
    this.http.get<any>('/api/super-admin/super-admins').subscribe({
      next: (res) => {
        this.superAdmins = Array.isArray(res?.data) ? res.data : [];
        const activeIds = new Set(this.superAdmins.map((row) => Number(row?.gstinId)).filter((id) => Number.isFinite(id)));
        Object.keys(this.superAdminPasswords).forEach((key) => {
          const id = Number(key);
          if (!activeIds.has(id)) delete this.superAdminPasswords[id];
        });
        this.loadingSuperAdmins = false;
      },
      error: (err) => {
        this.error = this.resolveError(err, 'Failed to load super-admin list');
        this.loadingSuperAdmins = false;
      }
    });
  }

  updateSuperAdminPassword(row: SuperAdminRow): void {
    const gstinId = Number(row?.gstinId);
    if (!Number.isFinite(gstinId)) return;
    if (this.updatingSuperAdminId !== null) return;

    const password = String(this.superAdminPasswords[gstinId] || '');
    if (password.length < 6) {
      this.error = 'Password must be at least 6 characters.';
      this.success = '';
      return;
    }

    this.updatingSuperAdminId = gstinId;
    this.error = '';
    this.success = '';
    this.http.patch<any>(`/api/super-admin/super-admins/${gstinId}/password`, { password }).subscribe({
      next: () => {
        this.superAdminPasswords[gstinId] = '';
        this.success = `Password updated for ${row.username || row.email || 'super-admin'}.`;
        this.updatingSuperAdminId = null;
      },
      error: (err) => {
        this.error = this.resolveError(err, 'Failed to update super-admin password');
        this.updatingSuperAdminId = null;
      }
    });
  }

  createCompany(): void {
    if (this.saving) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    const payload = {
      email: this.form.email,
      username: this.form.username,
      password: this.form.password,
      role: this.form.role,
      gstin: this.form.gstin,
      companyName: this.form.companyName,
      billingAddress: this.form.billingAddress,
      companyType: this.form.companyType,
      taxPercent: Number(this.form.taxPercent || 0),
      creditDays: Number(this.form.creditDays || 0),
      phoneNumber: this.form.phoneNumber
    };
    this.http.post<any>('/api/super-admin/companies', payload).subscribe({
      next: () => {
        this.success = 'Company created';
        this.form.email = '';
        this.form.username = '';
        this.form.password = '';
        this.form.gstin = '';
        this.form.companyName = '';
        this.form.billingAddress = '';
        this.form.phoneNumber = '';
        this.saving = false;
        this.loadCompanies();
      },
      error: (err) => {
        this.error = this.resolveError(err, 'Failed to create company');
        this.saving = false;
      }
    });
  }

  deleteCompany(row: CompanyRow): void {
    if (!row?.gstinId || this.deletingId !== null) return;
    const ok = window.confirm(`Delete company ${row.companyName || row.GSTIN}? This cannot be undone.`);
    if (!ok) return;

    this.deletingId = row.gstinId;
    this.error = '';
    this.success = '';
    this.http.delete<any>(`/api/super-admin/companies/${row.gstinId}`).subscribe({
      next: () => {
        this.success = 'Company deleted';
        this.deletingId = null;
        this.loadCompanies();
      },
      error: (err) => {
        this.error = this.resolveError(err, 'Failed to delete company');
        this.deletingId = null;
      }
    });
  }

  logout(): void {
    this.http.post('/api/auth/logout', {}).subscribe({
      next: () => {
        localStorage.clear();
        window.location.href = '/';
      },
      error: () => {
        localStorage.clear();
        window.location.href = '/';
      }
    });
  }
}

