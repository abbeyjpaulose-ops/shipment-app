import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './logs.component.html',
  styleUrls: ['./logs.component.css']
})
export class LogsComponent implements OnInit {
  auditLogs: any[] = [];
  auditLoading = false;
  auditError = '';
  auditFilters: any = {
    startDate: '',
    endDate: '',
    action: '',
    user: '',
    limit: '500'
  };
  auditPage = 1;
  auditTotal = 0;
  auditTotalPages = 1;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    if (this.isAdmin()) {
      this.loadAuditLogs();
    }
  }

  isAdmin(): boolean {
    const role = String(localStorage.getItem('role') || '').toLowerCase();
    return role === 'admin';
  }

  loadAuditLogs() {
    if (!this.isAdmin()) return;
    this.auditError = '';
    this.auditLoading = true;
    const token = localStorage.getItem('token');
    if (!token) {
      this.auditError = 'Missing auth token. Please log in again.';
      this.auditLoading = false;
      return;
    }
    const params: any = {
      limit: this.auditFilters.limit || '500',
      page: String(this.auditPage || 1)
    };
    if (this.auditFilters.startDate) params.startDate = this.auditFilters.startDate;
    if (this.auditFilters.endDate) params.endDate = this.auditFilters.endDate;
    if (this.auditFilters.action) params.action = this.auditFilters.action;
    if (this.auditFilters.user) params.user = this.auditFilters.user;

    this.http.get<any>('http://localhost:3000/api/audit-logs', {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      params
    }).subscribe({
      next: (res) => {
        this.auditLogs = Array.isArray(res?.logs) ? res.logs : [];
        this.auditTotal = Number(res?.total) || 0;
        this.auditPage = Number(res?.page) || this.auditPage;
        const limitNum = Number(this.auditFilters.limit) || 500;
        this.auditTotalPages = Math.max(1, Math.ceil(this.auditTotal / limitNum));
        this.auditLoading = false;
      },
      error: (err) => {
        console.error('Error loading audit logs:', err);
        this.auditLogs = [];
        this.auditError = err?.error?.message || 'Failed to load audit logs.';
        this.auditLoading = false;
      }
    });
  }

  clearAuditFilters() {
    this.auditFilters = {
      startDate: '',
      endDate: '',
      action: '',
      user: '',
      limit: '500'
    };
    this.auditPage = 1;
    this.loadAuditLogs();
  }

  changeAuditPage(delta: number) {
    const totalPages = this.auditTotalPages || 1;
    const next = Math.min(totalPages, Math.max(1, (this.auditPage || 1) + delta));
    if (next === this.auditPage) return;
    this.auditPage = next;
    this.loadAuditLogs();
  }

  exportAuditLogsJson() {
    const content = JSON.stringify(this.auditLogs || [], null, 2);
    this.downloadBlob(content, 'audit-logs.json', 'application/json');
  }

  exportAuditLogsCsv() {
    const rows = (this.auditLogs || []).map((log: any) => ({
      time: log.createdAt || '',
      action: log.action || '',
      user: log.actorUsername || log.actorEmail || '',
      before: JSON.stringify(log.before || {}),
      after: JSON.stringify(log.after || log.metadata || {})
    }));
    const header = ['time', 'action', 'user', 'before', 'after'];
    const csv = [header.join(',')]
      .concat(rows.map((r) => header.map((h) => this.escapeCsv(String((r as any)[h] || ''))).join(',')))
      .join('\n');
    this.downloadBlob(csv, 'audit-logs.csv', 'text/csv');
  }

  private escapeCsv(value: string) {
    const escaped = value.replace(/\"/g, '""');
    if (/[\",\n]/.test(escaped)) return `"${escaped}"`;
    return escaped;
  }

  private downloadBlob(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
