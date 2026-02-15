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

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './super-admin.component.html',
  styleUrls: ['./super-admin.component.css']
})
export class SuperAdminComponent implements OnInit {
  loading = false;
  saving = false;
  deletingId: number | null = null;
  error = '';
  success = '';
  rows: CompanyRow[] = [];

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

