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
  dataView: 'summary' | 'transactions' | 'payments' = 'summary';
  paymentData: Record<string, any[]> = {
    clients: [],
    branches: [],
    hubs: [],
    transportPartners: []
  };
  allTransactions: any[] = [];
  allPayments: any[] = [];
  loading = false;
  transactionListLoading = false;
  paymentListLoading = false;
  error = '';
  transactionListError = '';
  paymentListError = '';
  searchText = '';
  transactionSearchText = '';
  paymentSearchText = '';
  statusFilter = 'all';
  transactionStatusFilter = 'all';
  paymentStatusFilter = 'all';
  summaryDirectionFilter = 'all';
  transactionDirectionFilter = 'all';
  paymentDirectionFilter = 'all';
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
    direction?: string;
  } | null = null;
  activeRow: any = null;
  transactions: any[] = [];
  transactionsLoading = false;
  transactionsError = '';
  invoiceOutstanding: any[] = [];
  invoiceOutstandingLoading = false;
  invoiceOutstandingError = '';
  invoiceAllocationDraft: Record<string, string> = {};
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

  setDataView(view: 'summary' | 'transactions' | 'payments'): void {
    this.dataView = view;
    this.error = '';
    this.transactionListError = '';
    this.paymentListError = '';
    this.syncError = '';
    this.backfillError = '';
    if (view === 'transactions') {
      this.loadAllTransactions();
      return;
    }
    if (view === 'payments') {
      this.loadAllPayments();
    }
  }

  onSummaryDirectionChange(): void {
    this.loadPayments();
  }

  onTransactionFiltersChange(): void {
    this.loadAllTransactions();
  }

  onPaymentFiltersChange(): void {
    this.loadAllPayments();
  }

  refreshView(): void {
    if (this.dataView === 'transactions') {
      this.loadAllTransactions();
      return;
    }
    if (this.dataView === 'payments') {
      this.loadAllPayments();
      return;
    }
    this.loadPayments();
  }

  loadPayments(): void {
    this.loading = true;
    this.error = '';
    this.syncError = '';
    this.backfillError = '';
    const params: Record<string, string> = {};
    if (this.summaryDirectionFilter !== 'all') {
      params.direction = this.summaryDirectionFilter;
    }
    this.http.get<any>('/api/payments/summary', { params }).subscribe({
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

  loadAllTransactions(): void {
    this.transactionListLoading = true;
    this.transactionListError = '';
    const params: Record<string, string> = {};
    if (this.transactionStatusFilter !== 'all') {
      params.status = this.transactionStatusFilter;
    }
    if (this.transactionDirectionFilter !== 'all') {
      params.direction = this.transactionDirectionFilter;
    }
    this.http.get<any>('/api/payments/transactions', { params }).subscribe({
      next: (res) => {
        this.allTransactions = Array.isArray(res?.data) ? res.data : [];
        this.transactionListLoading = false;
      },
      error: (err) => {
        console.error('Error loading payment transactions:', err);
        this.transactionListError = err?.error?.message || 'Failed to load payment transactions.';
        this.transactionListLoading = false;
      }
    });
  }

  loadAllPayments(): void {
    this.paymentListLoading = true;
    this.paymentListError = '';
    const params: Record<string, string> = {};
    if (this.paymentStatusFilter !== 'all') {
      params.status = this.paymentStatusFilter;
    }
    if (this.paymentDirectionFilter !== 'all') {
      params.direction = this.paymentDirectionFilter;
    }
    this.http.get<any>('/api/payments/records', { params }).subscribe({
      next: (res) => {
        this.allPayments = Array.isArray(res?.data) ? res.data : [];
        this.paymentListLoading = false;
      },
      error: (err) => {
        console.error('Error loading payment records:', err);
        this.paymentListError = err?.error?.message || 'Failed to load payment records.';
        this.paymentListLoading = false;
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
    const status = String(this.statusFilter || 'all').toLowerCase();
    const direction = String(this.summaryDirectionFilter || 'all').toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = q
        ? String(row.name || '').toLowerCase().includes(q) ||
          String(row.entityId || '').toLowerCase().includes(q)
        : true;
      const rowStatus = this.normalizeStatus(row?.status, 'summary').toLowerCase();
      const rowDirection = String(row?.direction || 'receivable').toLowerCase();
      const matchesStatus = status === 'all' ? true : rowStatus === status;
      const matchesDirection = direction === 'all' ? true : rowDirection === direction;
      return matchesQuery && matchesStatus && matchesDirection;
    });
  }

  getFilteredTransactions(): any[] {
    const rows = this.allTransactions || [];
    const q = this.transactionSearchText.trim().toLowerCase();
    const status = String(this.transactionStatusFilter || 'all').toLowerCase();
    const direction = String(this.transactionDirectionFilter || 'all').toLowerCase();
    return rows.filter((row) => {
      const textFields = [
        row?.entityName,
        row?.entityId,
        row?.entityType,
        row?.referenceNo,
        row?.method
      ];
      const matchesQuery = q
        ? textFields.some((value) => String(value || '').toLowerCase().includes(q))
        : true;
      const rowStatus = this.normalizeStatus(row?.status, 'transaction').toLowerCase();
      const rowDirection = String(row?.direction || 'receivable').toLowerCase();
      const matchesStatus = status === 'all' ? true : rowStatus === status;
      const matchesDirection = direction === 'all' ? true : rowDirection === direction;
      return matchesQuery && matchesStatus && matchesDirection;
    });
  }

  getFilteredPayments(): any[] {
    const rows = this.allPayments || [];
    const q = this.paymentSearchText.trim().toLowerCase();
    const status = String(this.paymentStatusFilter || 'all').toLowerCase();
    const direction = String(this.paymentDirectionFilter || 'all').toLowerCase();
    return rows.filter((row) => {
      const textFields = [
        row?.entityName,
        row?.entityId,
        row?.entityType,
        row?.referenceNo,
        row?.paymentMethod,
        row?.status
      ];
      const matchesQuery = q
        ? textFields.some((value) => String(value || '').toLowerCase().includes(q))
        : true;
      const rowStatus = this.normalizeStatus(row?.status, 'payment').toLowerCase();
      const rowDirection = String(row?.direction || 'receivable').toLowerCase();
      const matchesStatus = status === 'all' ? true : rowStatus === status;
      const matchesDirection = direction === 'all' ? true : rowDirection === direction;
      return matchesQuery && matchesStatus && matchesDirection;
    });
  }

  formatEntityType(value: any): string {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '-';
    if (raw === 'transport_partner') return 'Transport Partner';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  formatReference(value: any): string {
    const raw = String(value || '').trim();
    const code = raw.toUpperCase();
    if (!code) return '-';
    if (code === 'RC-FUEL') return 'Running Cost - Fuel';
    if (code === 'RC-WORKERS') return 'Running Cost - Workers';
    if (code === 'RC-MAINTENANCE') return 'Running Cost - Maintenance';
    return raw;
  }

  normalizeStatus(value: any, context: 'summary' | 'transaction' | 'payment'): string {
    const raw = String(value || '').trim().toLowerCase();
    if (context === 'transaction') {
      return raw === 'voided' ? 'Voided' : 'Posted';
    }
    if (raw === 'paid') return 'Paid';
    return 'Pending';
  }

  getStatusClass(value: any, context: 'summary' | 'transaction' | 'payment'): string {
    const normalized = this.normalizeStatus(value, context).toLowerCase();
    return `status-${normalized}`;
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

  isClientReceivableEntity(): boolean {
    const entityType = String(this.activeEntity?.entityType || '').trim().toLowerCase();
    return entityType === 'client' && !this.isPayableDirection();
  }

  getInvoiceLabel(row: any): string {
    const invoiceNumber = Number(row?.invoiceNumber || 0);
    const display = String(row?.invoiceDisplayNumber || '').trim();
    const code = String(row?.invoiceCode || '').trim();
    if (display) return display;
    if (code) return code;
    if (Number.isFinite(invoiceNumber) && invoiceNumber > 0) return `INV-${invoiceNumber}`;
    return String(row?.invoiceId || '');
  }

  getAllocationInput(invoiceId: any): string {
    const key = String(invoiceId || '').trim();
    return key ? String(this.invoiceAllocationDraft[key] || '') : '';
  }

  onAllocationInput(invoiceId: any, value: any): void {
    const key = String(invoiceId || '').trim();
    if (!key) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      delete this.invoiceAllocationDraft[key];
      return;
    }
    this.invoiceAllocationDraft[key] = String(parsed);
  }

  getAllocationTotal(): number {
    return Object.values(this.invoiceAllocationDraft).reduce((sum, raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) return sum;
      return sum + value;
    }, 0);
  }

  getRemainingAfterAllocation(): number {
    const amount = Number(this.recordForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Math.max(amount - this.getAllocationTotal(), 0);
  }

  getActiveDirection(): 'receivable' | 'payable' {
    const direction = String(this.activeEntity?.direction || '').trim().toLowerCase();
    return direction === 'payable' ? 'payable' : 'receivable';
  }

  isPayableDirection(): boolean {
    return this.getActiveDirection() === 'payable';
  }

  getDirectionLabel(): string {
    return this.isPayableDirection() ? 'Payable' : 'Receivable';
  }

  getDirectionHint(): string {
    return this.isPayableDirection() ? 'Amount to be paid out' : 'Amount to be collected';
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
    this.activeTab = tabKey;

    this.activeEntity = {
      tabKey,
      entityType,
      entityId: String(row?.entityId || ''),
      name: String(row?.name || ''),
      direction: String(row?.direction || '').trim().toLowerCase() || 'receivable'
    };
    this.activeRow = row;
    this.showDrawer = true;
    this.dueAmount = String(row?.totalDue ?? '');
    this.dueError = '';
    this.recordError = '';
    this.invoiceOutstanding = [];
    this.invoiceOutstandingError = '';
    this.invoiceOutstandingLoading = false;
    this.invoiceAllocationDraft = {};
    if (!this.recordForm.transactionDate) {
      this.recordForm.transactionDate = this.formatDateInput(new Date());
    }
    this.loadTransactions();
    this.loadInvoiceOutstanding();
  }

  closeDrawer(): void {
    this.showDrawer = false;
    this.activeEntity = null;
    this.activeRow = null;
    this.transactions = [];
    this.transactionsError = '';
    this.recordError = '';
    this.dueError = '';
    this.invoiceOutstanding = [];
    this.invoiceOutstandingError = '';
    this.invoiceOutstandingLoading = false;
    this.invoiceAllocationDraft = {};
  }

  loadTransactions(): void {
    if (!this.activeEntity) return;
    this.transactionsLoading = true;
    this.transactionsError = '';
    const { entityType, entityId, direction } = this.activeEntity;
    const params: Record<string, string> = {};
    if (direction) params.direction = direction;
    this.http
      .get<any>(`/api/payments/${entityType}/${entityId}/transactions`, { params })
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

  loadInvoiceOutstanding(): void {
    if (!this.activeEntity || !this.isClientReceivableEntity()) {
      this.invoiceOutstanding = [];
      this.invoiceOutstandingError = '';
      this.invoiceOutstandingLoading = false;
      this.invoiceAllocationDraft = {};
      return;
    }
    const { entityType, entityId } = this.activeEntity;
    this.invoiceOutstandingLoading = true;
    this.invoiceOutstandingError = '';
    this.http
      .get<any>(`/api/payments/${entityType}/${entityId}/invoices/outstanding`)
      .subscribe({
        next: (res) => {
          const rows = Array.isArray(res?.data) ? res.data : [];
          const serverMessage = String(res?.message || '').trim();
          this.invoiceOutstanding = rows;
          this.invoiceOutstandingError = !rows.length && serverMessage ? serverMessage : '';
          const nextDraft: Record<string, string> = {};
          rows.forEach((row: any) => {
            const key = String(row?.invoiceId || '').trim();
            if (!key) return;
            const existing = Number(this.invoiceAllocationDraft[key]);
            if (!Number.isFinite(existing) || existing <= 0) return;
            const balance = Number(row?.totalBalance || 0);
            const clamped = Math.min(existing, Math.max(balance, 0));
            if (clamped > 0) nextDraft[key] = String(clamped);
          });
          this.invoiceAllocationDraft = nextDraft;
          this.invoiceOutstandingLoading = false;
        },
        error: (err) => {
          console.error('Error loading invoice outstanding:', err);
          this.invoiceOutstanding = [];
          const rawError = err?.error;
          const serverMessage = String(rawError?.message || '').trim();
          const textError = typeof rawError === 'string' ? rawError : '';
          const endpointMissing = /Cannot\s+GET\s+\/api\/payments\/.+\/invoices\/outstanding/i.test(textError);
          this.invoiceOutstandingError = serverMessage ||
            (endpointMissing ? 'Invoice outstanding endpoint unavailable. Restart backend server.' : '') ||
            'Failed to load invoice outstanding.';
          this.invoiceOutstandingLoading = false;
          this.invoiceAllocationDraft = {};
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

    const allocationTotal = this.getAllocationTotal();
    if (allocationTotal > amount + 0.0001) {
      this.recordError = 'Allocated total cannot exceed payment amount.';
      return;
    }

    this.transactionsLoading = true;
    const payload: any = {
      amount,
      transactionDate: this.recordForm.transactionDate,
      method: this.recordForm.method,
      referenceNo: this.recordForm.referenceNo,
      notes: this.recordForm.notes
    };
    const { entityType, entityId, direction } = this.activeEntity;
    if (direction) payload.direction = direction;
    if (this.isClientReceivableEntity() && allocationTotal > 0) {
      payload.allocations = (this.invoiceOutstanding || [])
        .map((row) => {
          const invoiceId = String(row?.invoiceId || '').trim();
          const value = Number(this.invoiceAllocationDraft[invoiceId]);
          if (!invoiceId || !Number.isFinite(value) || value <= 0) return null;
          return {
            invoiceId,
            amount: value
          };
        })
        .filter(Boolean);
    }
    this.http
      .post<any>(`/api/payments/${entityType}/${entityId}/transactions`, payload)
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
          this.invoiceAllocationDraft = {};
          this.recordError = '';
          this.transactionsLoading = false;
          this.loadPayments();
          this.loadInvoiceOutstanding();
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
    this.http.post<any>('/api/payments/sync/generated-invoices', {}).subscribe({
      next: () => {
        this.syncLoading = false;
        this.loadPayments();
        if (this.dataView === 'transactions') {
          this.loadAllTransactions();
        } else if (this.dataView === 'payments') {
          this.loadAllPayments();
        }
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
    this.http.post<any>('/api/payments/transactions/backfill-invoice-ids', {})
      .subscribe({
        next: (res) => {
          this.backfillLoading = false;
          const updated = Number(res?.updated) || 0;
          if (updated) {
            this.loadPayments();
            if (this.dataView === 'transactions') {
              this.loadAllTransactions();
            } else if (this.dataView === 'payments') {
              this.loadAllPayments();
            }
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
    const { entityType, entityId, direction } = this.activeEntity;
    this.transactionsLoading = true;
    const payload: any = { totalDue };
    if (direction) payload.direction = direction;
    this.http
      .post<any>(`/api/payments/${entityType}/${entityId}/summary/due`, payload)
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
          this.loadInvoiceOutstanding();
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
      .post<any>(`/api/payments/${entityType}/${entityId}/transactions/${tx._id}/void`, {
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

  private mapEntityTypeToTabKey(entityType: any): string {
    const type = String(entityType || '').trim().toLowerCase();
    if (type === 'client') return 'clients';
    if (type === 'branch') return 'branches';
    if (type === 'hub') return 'hubs';
    if (type === 'transport_partner') return 'transportPartners';
    return 'clients';
  }

  openEntityFromLinkedRow(row: any): void {
    const entityType = String(row?.entityType || '').trim().toLowerCase();
    const entityId = String(row?.entityId || '').trim();
    if (!entityType || !entityId) return;
    const tabKey = this.mapEntityTypeToTabKey(entityType);
    this.openDrawer(tabKey, {
      entityId,
      name: String(row?.entityName || row?.name || entityId),
      direction: String(row?.direction || 'receivable').trim().toLowerCase(),
      totalDue: Number(row?.totalDue ?? row?.amountDue ?? 0),
      totalPaid: Number(row?.totalPaid ?? row?.amountPaid ?? 0),
      totalBalance: Number(row?.totalBalance ?? row?.balance ?? 0),
      status: this.normalizeStatus(row?.status, 'summary')
    });
  }

  canOpenInvoice(row: any): boolean {
    const invoiceId = String(row?.invoiceId || '').trim();
    const allocationInvoiceId = String(row?.allocations?.[0]?.invoiceId || '').trim();
    const referenceNo = String(row?.referenceNo || '').trim();
    return Boolean(invoiceId || allocationInvoiceId) || /^INV-/i.test(referenceNo);
  }

  openInvoiceFromRow(row: any): void {
    const invoiceId = String(row?.invoiceId || row?.allocations?.[0]?.invoiceId || '').trim();
    const referenceNo = String(row?.referenceNo || '').trim();
    const params = new URLSearchParams();
    if (invoiceId) {
      params.set('invoiceId', invoiceId);
    } else if (referenceNo) {
      params.set('q', referenceNo);
    }
    const query = params.toString();
    const target = `/home/Invoiced${query ? `?${query}` : ''}`;
    window.location.assign(target);
  }
}

