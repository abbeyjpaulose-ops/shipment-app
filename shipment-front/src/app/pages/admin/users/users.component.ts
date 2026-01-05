import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit {
  tabs = [
    { key: 'clients', label: 'Clients' },
    { key: 'branches', label: 'Branches' },
    { key: 'hubs', label: 'Hubs' },
    { key: 'transportPartners', label: 'Transport Partners' }
  ];
  activeTab = 'clients';
  paymentData: Record<string, any[]> = {
    clients: [],
    branches: [],
    hubs: [],
    transportPartners: []
  };
  loading = false;
  error = '';
  searchText = '';
  statusFilter = 'all';
  totals = {
    due: 0,
    paid: 0,
    balance: 0,
    entities: 0
  };
  showDrawer = false;
  activeEntity: {
    tabKey: string;
    entityType: string;
    entityId: string;
    name: string;
  } | null = null;
  activeRow: any = null;
  transactions: any[] = [];
  transactionsLoading = false;
  transactionsError = '';
  recordForm = {
    amount: '',
    transactionDate: '',
    method: '',
    referenceNo: '',
    notes: ''
  };
  recordError = '';
  dueAmount = '';
  dueError = '';
  syncLoading = false;
  syncError = '';
  backfillLoading = false;
  backfillError = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadPayments();
  }

  setActiveTab(key: string) {
    this.activeTab = key;
  }

  loadPayments(): void {
    this.loading = true;
    this.error = '';
    this.syncError = '';
    this.backfillError = '';
    this.http.get<any>('http://localhost:3000/api/payments/summary').subscribe({
      next: (res) => {
        const data = res?.data || {};
        this.paymentData = {
          clients: Array.isArray(data.clients) ? data.clients : [],
          branches: Array.isArray(data.branches) ? data.branches : [],
          hubs: Array.isArray(data.hubs) ? data.hubs : [],
          transportPartners: Array.isArray(data.transportPartners) ? data.transportPartners : []
        };
        this.computeTotals();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading payments summary:', err);
        this.error = 'Failed to load payments. Please try again.';
        this.loading = false;
      }
    });
  }

  private computeTotals(): void {
    const allRows = Object.values(this.paymentData).flat();
    this.totals = allRows.reduce(
      (acc, row) => {
        acc.due += Number(row.totalDue || 0);
        acc.paid += Number(row.totalPaid || 0);
        acc.balance += Number(row.totalBalance || 0);
        acc.entities += 1;
        return acc;
      },
      { due: 0, paid: 0, balance: 0, entities: 0 }
    );
  }

  getRowsForTab(tabKey: string): any[] {
    const rows = this.paymentData[tabKey] || [];
    const q = this.searchText.trim().toLowerCase();
    const status = this.statusFilter;
    return rows.filter((row) => {
      const matchesQuery = q
        ? String(row.name || '').toLowerCase().includes(q) ||
          String(row.entityId || '').toLowerCase().includes(q)
        : true;
      const matchesStatus = status === 'all'
        ? true
        : String(row.status || '').toLowerCase() === status;
      return matchesQuery && matchesStatus;
    });
  }

  formatAmount(value: any): string {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  }

  formatDate(value: any): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  openDrawer(tabKey: string, row: any): void {
    const entityTypeMap: Record<string, string> = {
      clients: 'client',
      branches: 'branch',
      hubs: 'hub',
      transportPartners: 'transport_partner'
    };
    const entityType = entityTypeMap[tabKey];
    if (!entityType) return;

    this.activeEntity = {
      tabKey,
      entityType,
      entityId: String(row?.entityId || ''),
      name: String(row?.name || '')
    };
    this.activeRow = row;
    this.showDrawer = true;
    this.dueAmount = String(row?.totalDue ?? '');
    this.dueError = '';
    this.recordError = '';
    if (!this.recordForm.transactionDate) {
      this.recordForm.transactionDate = this.formatDateInput(new Date());
    }
    this.loadTransactions();
  }

  closeDrawer(): void {
    this.showDrawer = false;
    this.activeEntity = null;
    this.activeRow = null;
    this.transactions = [];
    this.transactionsError = '';
    this.recordError = '';
    this.dueError = '';
  }

  loadTransactions(): void {
    if (!this.activeEntity) return;
    this.transactionsLoading = true;
    this.transactionsError = '';
    const { entityType, entityId } = this.activeEntity;
    this.http
      .get<any>(`http://localhost:3000/api/payments/${entityType}/${entityId}/transactions`)
      .subscribe({
        next: (res) => {
          this.transactions = Array.isArray(res?.transactions) ? res.transactions : [];
          if (res?.summary) {
            this.activeRow = {
              ...this.activeRow,
              ...res.summary
            };
            this.dueAmount = String(res.summary.totalDue ?? '');
          }
          this.transactionsLoading = false;
        },
        error: (err) => {
          console.error('Error loading transactions:', err);
          this.transactionsError = 'Failed to load transactions.';
          this.transactionsLoading = false;
        }
      });
  }

  submitPayment(): void {
    if (!this.activeEntity || this.transactionsLoading) return;
    const amount = Number(this.recordForm.amount || 0);
    this.recordError = '';
    if (!Number.isFinite(amount) || amount <= 0) {
      this.recordError = 'Enter a valid amount.';
      return;
    }
    if (!this.recordForm.transactionDate) {
      this.recordError = 'Select a payment date.';
      return;
    }
    if (!this.recordForm.method) {
      this.recordError = 'Select a payment method.';
      return;
    }

    this.transactionsLoading = true;
    const payload = {
      amount,
      transactionDate: this.recordForm.transactionDate,
      method: this.recordForm.method,
      referenceNo: this.recordForm.referenceNo,
      notes: this.recordForm.notes
    };
    const { entityType, entityId } = this.activeEntity;
    this.http
      .post<any>(`http://localhost:3000/api/payments/${entityType}/${entityId}/transactions`, payload)
      .subscribe({
        next: (res) => {
          if (res?.transaction) {
            this.transactions = [res.transaction, ...this.transactions];
          }
          if (res?.summary) {
            this.activeRow = {
              ...this.activeRow,
              ...res.summary
            };
          }
          this.recordForm.amount = '';
          this.recordForm.referenceNo = '';
          this.recordForm.notes = '';
          this.recordError = '';
          this.transactionsLoading = false;
          this.loadPayments();
        },
        error: (err) => {
          console.error('Error recording payment:', err);
          this.transactionsError = 'Failed to record payment.';
          this.recordError = err?.error?.message || 'Failed to record payment.';
          this.transactionsLoading = false;
        }
      });
  }

  syncFromInvoices(): void {
    if (this.syncLoading) return;
    this.syncError = '';
    this.backfillError = '';
    this.syncLoading = true;
    this.http.post<any>('http://localhost:3000/api/payments/sync/generated-invoices', {}).subscribe({
      next: () => {
        this.syncLoading = false;
        this.loadPayments();
      },
      error: (err) => {
        console.error('Error syncing payments:', err);
        this.syncError = err?.error?.message || 'Failed to sync payments.';
        this.syncLoading = false;
      }
    });
  }

  backfillInvoiceTransactions(): void {
    if (this.backfillLoading) return;
    this.backfillError = '';
    this.backfillLoading = true;
    this.http.post<any>('http://localhost:3000/api/payments/transactions/backfill-invoice-ids', {})
      .subscribe({
        next: (res) => {
          this.backfillLoading = false;
          const updated = Number(res?.updated) || 0;
          if (updated) {
            this.loadPayments();
          }
        },
        error: (err) => {
          console.error('Error backfilling invoice transactions:', err);
          this.backfillError = err?.error?.message || 'Failed to backfill invoice transactions.';
          this.backfillLoading = false;
        }
      });
  }

  updateDueAmount(): void {
    if (!this.activeEntity || this.transactionsLoading) return;
    const totalDue = Number(this.dueAmount);
    this.dueError = '';
    if (!Number.isFinite(totalDue) || totalDue < 0) {
      this.dueError = 'Enter a valid due amount.';
      return;
    }
    const { entityType, entityId } = this.activeEntity;
    this.transactionsLoading = true;
    this.http
      .post<any>(`http://localhost:3000/api/payments/${entityType}/${entityId}/summary/due`, { totalDue })
      .subscribe({
        next: (res) => {
          if (res?.summary) {
            this.activeRow = {
              ...this.activeRow,
              ...res.summary
            };
            this.dueAmount = String(res.summary.totalDue ?? '');
          }
          this.dueError = '';
          this.transactionsLoading = false;
          this.loadPayments();
        },
        error: (err) => {
          console.error('Error updating due amount:', err);
          this.dueError = err?.error?.message || 'Failed to update due amount.';
          this.transactionsLoading = false;
        }
      });
  }

  voidTransaction(tx: any): void {
    if (!this.activeEntity || this.transactionsLoading) return;
    if (!tx?._id) return;
    const confirmVoid = window.confirm('Void this transaction? This cannot be undone.');
    if (!confirmVoid) return;
    const voidReason = String(tx?.voidReason || '').trim();
    const { entityType, entityId } = this.activeEntity;
    this.transactionsLoading = true;
    this.http
      .post<any>(`http://localhost:3000/api/payments/${entityType}/${entityId}/transactions/${tx._id}/void`, {
        voidReason
      })
      .subscribe({
        next: (res) => {
          if (res?.transaction) {
            this.transactions = this.transactions.map((t) =>
              String(t._id) === String(res.transaction._id) ? res.transaction : t
            );
          }
          if (res?.summary) {
            this.activeRow = {
              ...this.activeRow,
              ...res.summary
            };
          }
          this.transactionsLoading = false;
          this.loadPayments();
        },
        error: (err) => {
          console.error('Error voiding transaction:', err);
          this.transactionsError = err?.error?.message || 'Failed to void transaction.';
          this.transactionsLoading = false;
        }
      });
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
