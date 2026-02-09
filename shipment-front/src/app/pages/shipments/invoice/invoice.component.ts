import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { BranchService } from '../../../services/branch.service';

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice.component.html',
  styleUrls: ['./invoice.component.css']
})
export class InvoiceComponent implements OnInit, OnDestroy {
  invoices: any[] = [];
  deliveredInvoices: any[] = [];
  preInvoicedInvoices: any[] = [];
  preInvoices: any[] = [];
  filteredDelivered: any[] = [];
  filteredPreInvoiced: any[] = [];
  filteredPreInvoices: any[] = [];
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  consignmentBillingSearch: string = '';
  preInvoiceCategoryFilter: 'all' | 'B' | 'C' = 'all';
  selectedInvoice: any = null;
  showInvoiceModal = false;
  branch: string = localStorage.getItem('branch') || 'All Branches';
  originLocId: string = localStorage.getItem('originLocId') || 'all';
  hubs: any[] = [];
  branches: any[] = [];
  clientList: any[] = [];
  private clientById = new Map<string, any>();
  private hubById = new Map<string, any>();
  private branchSub?: Subscription;
  companyName: string = '';
  companyAddress: string = '';
  showPreInvoicePreview = false;
  preInvoicePreviewHtml: SafeHtml = '';

  editingInvoice: any = null;   // �o. Track the invoice being edited
  showEditPopup: boolean = false;
  showGenerateInvoicePopup: boolean = false;
  generateInvoiceSource: 'preInvoiced' | 'preInvoices' = 'preInvoiced';
  constructor(
    private http: HttpClient,
    private branchService: BranchService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.branch = this.branchService.currentBranch || this.branch;
    this.originLocId = localStorage.getItem('originLocId') || 'all';
    this.branchSub = this.branchService.branch$.subscribe(branch => {
      if (branch !== this.branch) {
        this.branch = branch;
        this.originLocId = localStorage.getItem('originLocId') || 'all';
        this.loadClients();
        this.loadInvoices();
        this.loadPreInvoices();
      }
    });
    window.addEventListener('storage', this.onStorageChange);
    this.loadCompanyProfile();
    this.loadBranches(() => this.loadHubs(() => {
      this.loadClients();
      this.loadInvoices();
      this.loadPreInvoices();
    }));
  }
  ngOnDestroy(): void {
    this.branchSub?.unsubscribe();
    window.removeEventListener('storage', this.onStorageChange);
  }

  private loadBranches(onDone?: () => void) {
    this.http.get<any[]>('http://localhost:3000/api/branches').subscribe({
      next: (branches) => {
        this.branches = Array.isArray(branches) ? branches : [];
        if (onDone) onDone();
      },
      error: () => {
        this.branches = [];
        if (onDone) onDone();
      }
    });
  }

  private loadHubs(onDone?: () => void) {
    this.http.get<any[]>('http://localhost:3000/api/hubs').subscribe({
      next: (hubs) => {
        this.hubs = Array.isArray(hubs) ? hubs : [];
        this.hubById = new Map();
        this.hubs.forEach((hub: any) => {
          const id = this.normalizeId(hub?._id);
          if (id) this.hubById.set(id, hub);
        });
        if (onDone) onDone();
      },
      error: () => {
        this.hubs = [];
        this.hubById = new Map();
        if (onDone) onDone();
      }
    });
  }

  private loadClients(onDone?: () => void) {
    const originLocId = localStorage.getItem('originLocId') || this.originLocId || 'all';
    this.http.get<any[]>('http://localhost:3000/api/clients/clientslist', {
      params: { originLocId }
    }).subscribe({
      next: (clients) => {
        this.clientList = Array.isArray(clients) ? clients : [];
        this.clientById = new Map();
        this.clientList.forEach((client: any) => {
          const id = this.normalizeId(client?._id);
          if (id) this.clientById.set(id, client);
        });
        if (onDone) onDone();
      },
      error: () => {
        this.clientList = [];
        this.clientById = new Map();
        if (onDone) onDone();
      }
    });
  }

  private loadCompanyProfile() {
    const email = localStorage.getItem('email') || '';
    const username = localStorage.getItem('username') || '';
    if (!email && !username) return;
    this.http.get<any>(`http://localhost:3000/api/profile?user=${username}&email=${email}`)
      .subscribe({
        next: (data) => {
          const profile = Array.isArray(data) ? data[0] : data;
          this.companyName = String(profile?.company || profile?.name || '').trim();
          this.companyAddress = String(profile?.address || '').trim();
        },
        error: () => {
          this.companyName = this.companyName || '';
          this.companyAddress = this.companyAddress || '';
        }
      });
  }

  loadInvoices() {
    const storedOriginLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    const branchLabel = String(localStorage.getItem('branch') || '').trim();
    const selectedBranchId = this.resolveSelectedBranchId(storedOriginLocId, branchLabel);
    const normalizedOriginId = selectedBranchId || this.normalizeId(storedOriginLocId);
    const hasBranchSelection = storedOriginLocId && storedOriginLocId !== 'all' && storedOriginLocId !== 'all-hubs';
    const hasHubsForBranch = hasBranchSelection &&
      this.hubs.some((h) => this.normalizeId(h?.originLocId) === normalizedOriginId);
    const originLocIdParam = (hasBranchSelection && (!this.isObjectId(storedOriginLocId) || hasHubsForBranch))
      ? 'all'
      : storedOriginLocId;
    this.http.get<any>('http://localhost:3000/api/newshipments', {
      params: {
        username: localStorage.getItem('username') || '',
        originLocId: originLocIdParam
      }
    }).subscribe({
      next: (res) => {
        const raw = Array.isArray(res) ? res : (res?.value || []);
        // �o. Only show shipments with status 'Delivered'
        //onsole.log('�Y"� IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIInvoices loaded:', res);
                const normalized = (raw || []).map((s: any) => ({
          ...s,
          _normalizedStatus: this.normalizeStatus(s?.shipmentStatus)
        }));
        const nonDeleted = normalized.filter((s: any) => !this.isDeletedStatus(s?.shipmentStatus));
        this.invoices = nonDeleted;
        this.deliveredInvoices = nonDeleted;
        this.preInvoicedInvoices = nonDeleted.filter((s: any) => s._normalizedStatus === 'pre-invoiced');
        this.applyFilters();
        console.log('A??,f??A? Filtered Delivered consignments:', this.filteredDelivered);
        console.log('A??,f??A? Filtered Pre-Invoiced consignments:', this.filteredPreInvoiced);
      },
      error: (err) => console.error('�O Error loading invoices:', err)
    });
  }

  private loadPreInvoices() {
    if (!this.hasSpecificBranchSelection()) {
      this.preInvoices = [];
      this.filteredPreInvoices = [];
      return;
    }
    const storedOriginLocId = this.originLocId || localStorage.getItem('originLocId') || '';
    const branchLabel = String(localStorage.getItem('branch') || '').trim();
    const selectedBranchId = this.resolveSelectedBranchId(String(storedOriginLocId || ''), branchLabel);
    const normalizedOriginId = this.normalizeId(storedOriginLocId);
    const hubMatch = this.hubs.find((h: any) => this.normalizeId(h?._id) === normalizedOriginId);
    const hubOriginId = this.normalizeId(hubMatch?.originLocId);
    const originLocIdParam = selectedBranchId ||
      hubOriginId ||
      (this.isObjectId(normalizedOriginId) ? normalizedOriginId : '');
    if (!originLocIdParam) {
      this.preInvoices = [];
      this.filteredPreInvoices = [];
      return;
    }
    this.http.get<any>('http://localhost:3000/api/newshipments/preInvoices', {
      params: { originLocId: originLocIdParam }
    }).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.preInvoices || []);
        const safe = Array.isArray(list) ? list : [];
        this.preInvoices = safe.map((p: any) => ({ ...p, selected: false }));
        this.applyFilters();
      },
      error: (err) => {
        console.error('Error loading pre-invoices:', err);
        this.preInvoices = [];
        this.filteredPreInvoices = [];
      }
    });
  }

  private onStorageChange = (e: StorageEvent) => {
    if (e.key === 'branch' || e.key === 'originLocId') {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.branch || currentId !== this.originLocId) {
        this.branch = current;
        this.originLocId = currentId;
        this.loadClients();
        this.loadInvoices();
        this.loadPreInvoices();
      }
    }
  };

  hasSpecificBranchSelection(): boolean {
    const originLocId = String(this.originLocId || localStorage.getItem('originLocId') || '').trim();
    return Boolean(originLocId && originLocId !== 'all' && originLocId !== 'all-hubs');
  }

  private normalizeStatus(status: any): string {
    const value = String(status || '').trim().toLowerCase();
    if (!value) return '';
    if (value === 'dpending') return 'delivered';
    if (value.includes('delivered')) return 'delivered';
    if (value === 'pre invoiced' || value === 'preinvoiced' || value.includes('pre-invoiced')) {
      return 'pre-invoiced';
    }
    return value;
  }

  private isDeletedStatus(status: any): boolean {
    return String(status || '').trim().toLowerCase().includes('deleted');
  }

  private isInvoiceOnProcess(shipment: any): boolean {
    return String(shipment?.invoiceStatus || '').trim().toLowerCase() === 'onprocess';
  }

  isInvoicePreInvoiced(shipment: any): boolean {
    const value = String(shipment?.invoiceStatus || '').trim().toLowerCase();
    if (!value) return false;
    return value === 'pre-invoiced' || value === 'pre invoiced' || value === 'preinvoiced';
  }

  getDisplayStatus(status: any): string {
    const value = String(status || '').trim();
    const lower = value.toLowerCase();
    if (!value) return '';
    if (lower === 'dpending') return 'Delivered';
    if (lower.includes('delivered')) return 'Delivered';
    if (lower === 'pre invoiced' || lower === 'preinvoiced' || lower.includes('pre-invoiced')) {
      return 'Pre-Invoiced';
    }
    return value;
  }
  private normalizeId(value: any): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    if (value?.$oid) return String(value.$oid).trim();
    return String(value).trim();
  }

  private isObjectId(value: string): boolean {
    return /^[a-f\d]{24}$/i.test(String(value || '').trim());
  }

  private resolveSelectedBranchId(originLocId: string, branchLabel: string): string {
    const normalizedOrigin = this.normalizeId(originLocId);
    if (this.isObjectId(normalizedOrigin)) return normalizedOrigin;
    const label = String(branchLabel || originLocId || '').trim().toLowerCase();
    if (!label) return '';
    const match = (this.branches || []).find((b: any) => {
      const prefix = String(b?.prefix || '').trim().toLowerCase();
      const name = String(b?.branchName || '').trim().toLowerCase();
      return (prefix && prefix === label) || (name && name === label);
    });
    return match ? this.normalizeId(match?._id) : '';
  }

  private matchesBranchLabel(currentBranch: string, branchLabel: string): boolean {
    const current = String(currentBranch || '').trim().toLowerCase();
    const label = String(branchLabel || '').trim().toLowerCase();
    if (!current || !label) return false;
    if (label === current) return true;
    if (label.startsWith(`${current}-`)) return true;
    const labelPrefix = label.split('-')[0].trim();
    return Boolean(labelPrefix) && labelPrefix === current;
  }

  private matchesSelectedBranch(shipment: any): boolean {
    const originLocId = String(this.originLocId || localStorage.getItem('originLocId') || '').trim();
    const branchLabel = String(localStorage.getItem('branch') || '').trim();
    const originId = this.normalizeId(shipment?.originLocId || shipment?.branch || shipment?.branchName);
    const originLabel = String(shipment?.branchName || shipment?.branch || '').trim();

    if (originLocId && originLocId !== 'all' && originLocId !== 'all-hubs') {
      const normalizedOrigin = this.resolveSelectedBranchId(originLocId, branchLabel) || this.normalizeId(originLocId);
      if (originId && originId === normalizedOrigin) return true;
      const hubMatch = this.hubs.find((h) => this.normalizeId(h?._id) === originId);
      const hubBranchId = this.normalizeId(hubMatch?.originLocId);
      if (hubBranchId && hubBranchId === normalizedOrigin) return true;
      const labelTarget = (branchLabel && branchLabel !== 'All Branches' && branchLabel !== 'All Hubs')
        ? branchLabel
        : originLocId;
      if (labelTarget) {
        const labelLower = String(labelTarget || '').trim().toLowerCase();
        const originLower = originLabel.toLowerCase();
        return originLower === labelLower || this.matchesBranchLabel(originLabel, String(labelTarget || ''));
      }
      return false;
    }
    if (originLocId === 'all' || originLocId === 'all-hubs') {
      return true;
    }
    if (branchLabel && branchLabel !== 'All Branches' && branchLabel !== 'All Hubs') {
      const labelLower = branchLabel.toLowerCase();
      const originLower = originLabel.toLowerCase();
      return originLower === labelLower || this.matchesBranchLabel(originLabel, branchLabel);
    }
    return true;
  }

  getBillingEntity(shipment: any): string {
    if (!shipment) return '';
    const billingType = String(shipment?.billingType || '').trim().toLowerCase();
    if (!billingType || billingType === 'consignor') {
      return shipment?.consignor || '';
    }
    const fromData = String(shipment?.billingName || '').trim();
    if (fromData) return fromData;
    const billingId = this.normalizeId(shipment?.billingClientId);
    if (billingId) {
      const client = this.clientById.get(billingId);
      if (client?.clientName) return client.clientName;
      const hub = this.hubById.get(billingId);
      if (hub?.hubName) return hub.hubName;
    }
    return '';
  }

  getPreInvoiceBillingEntity(pre: any): string {
    if (!pre) return '';
    const fromData = String(pre?.billingEntityName || pre?.billingName || '').trim();
    if (fromData) return fromData;
    const billingId = this.normalizeId(pre?.billingEntityId || pre?.billingClientId);
    if (billingId) {
      const client = this.clientById.get(billingId);
      if (client?.clientName) return client.clientName;
      const hub = this.hubById.get(billingId);
      if (hub?.hubName) return hub.hubName;
    }
    return '';
  }

  private formatAddress(parts: any[]): string {
    return (parts || [])
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  private getClientAddress(client: any): string {
    if (!client) return '';
    const direct = String(client?.address || '').trim();
    const first = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations[0] : null;
    const address = direct || String(first?.address || first?.location || '').trim();
    const city = String(first?.city || client?.city || '').trim();
    const state = String(first?.state || client?.state || '').trim();
    const pinCode = String(first?.pinCode || client?.pinCode || '').trim();
    return this.formatAddress([address, city, state, pinCode]);
  }

  private getHubAddress(hub: any): string {
    if (!hub) return '';
    const address = String(hub?.address || '').trim();
    const city = String(hub?.city || '').trim();
    const state = String(hub?.state || '').trim();
    const pinCode = String(hub?.pinCode || '').trim();
    return this.formatAddress([address, city, state, pinCode]);
  }

  getPreInvoiceBillingEntityAddress(pre: any): string {
    if (!pre) return '';
    const fromData = String(pre?.billingEntityAddress || pre?.billingAddress || '').trim();
    if (fromData) return fromData;
    const billingId = this.normalizeId(pre?.billingEntityId || pre?.billingClientId);
    if (billingId) {
      const client = this.clientById.get(billingId);
      if (client) return this.getClientAddress(client);
      const hub = this.hubById.get(billingId);
      if (hub) return this.getHubAddress(hub);
    }
    return '';
  }

  getPreInvoiceTaxableTotal(pre: any): number {
    return (pre?.consignments || []).reduce(
      (sum: number, c: any) => sum + Number(c?.taxableValue || 0),
      0
    );
  }

  getPreInvoiceFinalTotal(pre: any): number {
    return (pre?.consignments || []).reduce(
      (sum: number, c: any) => sum + Number(c?.finalAmount || 0),
      0
    );
  }

  getPreInvoiceDisplayNumber(pre: any): string {
    const fiscal = this.getFiscalYearLabel(pre?.createdAt);
    const category = this.getPreInvoiceBillingCategory(pre);
    const prefix = this.getPreInvoiceBranchPrefix(pre);
    const number = pre?.preInvoiceNumber ?? '';
    const suffix = prefix
      ? (number ? `${prefix}/${number}` : `${prefix}`)
      : `${number}`;
    return `${fiscal}/${category}/${suffix}`;
  }

  private getPreInvoiceIgstHeaderRate(pre: any): number {
    const rates = (pre?.consignments || [])
      .map((c: any) => Number(c?.igstPercent ?? 0))
      .filter((r: number) => Number.isFinite(r));
    if (!rates.length) return 0;
    return Math.max(...rates);
  }

  private getFiscalYearLabel(dateInput: any): string {
    const date = dateInput ? new Date(dateInput) : new Date();
    if (Number.isNaN(date.getTime())) {
      return this.buildFiscalLabel(new Date());
    }
    return this.buildFiscalLabel(date);
  }

  private buildFiscalLabel(date: Date): string {
    const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    const next = year + 1;
    const ny = String(next).slice(-2);
    return `${ny}`;
  }

  private getPreInvoiceBranchPrefix(pre: any): string {
    const originId = this.normalizeId(pre?.originLocId);
    const branchMatch = (this.branches || []).find((b: any) =>
      this.normalizeId(b?._id) === originId
    );
    let prefix = String(branchMatch?.prefix || '').trim();
    if (!prefix) {
      prefix = String(branchMatch?.branchName || '').trim();
    }
    return prefix;
  }

  private getPreInvoiceBillingCategory(pre: any): string {
    const stored = String(pre?.billingCategory || '').trim().toUpperCase();
    if (stored === 'B' || stored === 'C') return stored;
    const type = String(pre?.billingEntityType || '').trim().toLowerCase();
    if (type === 'guest') return 'C';
    if (type) return 'B';
    const billingId = this.normalizeId(pre?.billingEntityId || pre?.billingClientId);
    if (billingId) {
      if (this.clientById.has(billingId)) return 'B';
      if (this.hubById.has(billingId)) return 'B';
    }
    return 'C';
  }

  private getPreInvoiceStyles(): string {
    return `
      .preinvoice-preview { font-family: Arial, sans-serif; padding: 20px; }
      .preinvoice-preview h2 { margin-bottom: 0; }
      .preinvoice-preview table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .preinvoice-preview th,
      .preinvoice-preview td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
      .preinvoice-preview th { background-color: #f2f2f2; }
      .preinvoice-preview .page-break { page-break-after: always; }
      .preinvoice-preview .muted { color: #6b7280; font-size: 12px; }
      .preinvoice-preview .company-block { margin: 6px 0 12px; }
      .preinvoice-preview .company-name { font-weight: 700; }
      .preinvoice-preview .header-grid { display: grid; grid-template-columns: 1.1fr 0.8fr 1.1fr; gap: 16px; align-items: start; margin-bottom: 14px; }
      .preinvoice-preview .header-card { border: 1px solid #ccc; padding: 10px; min-height: 110px; }
      .preinvoice-preview .header-title { text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; }
      .preinvoice-preview .meta-table { border-collapse: collapse; margin: 0 auto; width: auto; }
      .preinvoice-preview .meta-table th,
      .preinvoice-preview .meta-table td { border: 1px solid #777; padding: 6px 10px; font-size: 12px; text-align: left; }
      .preinvoice-preview .bill-to-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
      .preinvoice-preview .bill-to-name { font-weight: 600; }
      .preinvoice-preview .summary-row { margin-top: 12px; display: flex; gap: 16px; align-items: flex-start; }
      .preinvoice-preview .notes-block { flex: 1 1 50%; font-size: 12px; color: #111827; }
      .preinvoice-preview .note-line { margin-bottom: 6px; }
      .preinvoice-preview .totals-block { flex: 0 0 50%; }
      .preinvoice-preview .totals-table { border-collapse: collapse; width: 100%; margin-left: auto; }
      .preinvoice-preview .totals-table th,
      .preinvoice-preview .totals-table td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; }
      .preinvoice-preview .totals-table th { background-color: #f8fafc; font-weight: 600; text-align: left; }
      .preinvoice-preview .totals-table td { text-align: right; }
      .preinvoice-preview .amount-words { margin-top: 10px; font-size: 12px; font-style: italic; }
    `;
  }

  private buildPreInvoiceSection(pre: any): string {
    const billing = this.getPreInvoiceBillingEntity(pre);
    const billingAddress = this.getPreInvoiceBillingEntityAddress(pre);
    const companyName = this.companyName || 'Company';
    const businessType = String(localStorage.getItem('companyType') || '').trim() || '0';
    const igstHeaderRate = this.getPreInvoiceIgstHeaderRate(pre);
    let totalOdc = 0;
    let totalUnloading = 0;
    let totalDocket = 0;
    let totalOther = 0;
    let totalCcc = 0;
    let totalDiscount = 0;
    let totalInitialPaid = 0;
    let totalTaxable = 0;
    let totalIgst = 0;
    let totalFinal = 0;
    const consignmentRows = (pre?.consignments || [])
      .map((c: any, rowIndex: number) => {
        const charges = c?.charges || {};
        const odc = Number(charges?.odc || 0);
        const unloading = Number(charges?.unloading || 0);
        const docket = Number(charges?.docket || 0);
        const other = Number(charges?.other || 0);
        const ccc = Number(charges?.ccc || 0);
        const discount = Number(charges?.consignorDiscount || 0);
        const initialPaid = Number(c?.initialPaid || 0);
        const taxableValue = Number(c?.taxableValue || 0);
        const igstRate = Number(c?.igstPercent ?? igstHeaderRate ?? 0);
        const igstAmount = taxableValue * (igstRate / 100);
        const finalAmount = Number(c?.finalAmount || 0) || (taxableValue + igstAmount);
        totalOdc += odc;
        totalUnloading += unloading;
        totalDocket += docket;
        totalOther += other;
        totalCcc += ccc;
        totalDiscount += discount;
        totalInitialPaid += initialPaid;
        totalTaxable += taxableValue;
        totalIgst += igstAmount;
        totalFinal += Number(finalAmount);
        return `
        <tr>
          <td>${rowIndex + 1}</td>
          <td>${c.consignmentNumber || ''}</td>
          <td>${odc.toFixed(2)}</td>
          <td>${unloading.toFixed(2)}</td>
          <td>${docket.toFixed(2)}</td>
          <td>${other.toFixed(2)}</td>
          <td>${ccc.toFixed(2)}</td>
            <td>${discount.toFixed(2)}</td>
            <td>${initialPaid.toFixed(2)}</td>
            <td>${taxableValue.toFixed(2)}</td>
            <td>${igstAmount.toFixed(2)}</td>
            <td>${Number(finalAmount).toFixed(2)}</td>
        </tr>
      `;
      }).join('');

    const createdAt = pre?.createdAt ? new Date(pre.createdAt).toLocaleDateString() : '';

    return `
      <div class="header-grid">
        <div class="header-card">
          <div class="company-name">${companyName}</div>
          ${this.companyAddress ? `<div>${this.companyAddress}</div>` : ''}
        </div>
        <div>
          <div class="header-title">PRE-INVOICE RECORDS</div>
          <table class="meta-table">
            <tr>
              <th>Pre-Invoice No</th>
              <td>${this.getPreInvoiceDisplayNumber(pre)}</td>
            </tr>
            <tr>
              <th>Date</th>
              <td>${createdAt}</td>
            </tr>
          </table>
        </div>
        <div class="header-card">
          <div class="bill-to-label">Bill To..</div>
          <div class="bill-to-name">${billing || ''}</div>
          ${billingAddress ? `<div>${billingAddress}</div>` : ''}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Sl No.</th>
            <th>Consignment No.</th>
            <th>ODC</th>
            <th>Unloading</th>
            <th>Docket</th>
            <th>Other</th>
            <th>CCC</th>
            <th>Discount</th>
            <th>Initial Paid</th>
            <th>Taxable Value</th>
            <th>IGST (${igstHeaderRate || 0}%)</th>
            <th>Final Amount</th>
          </tr>
        </thead>
        <tbody>
          ${consignmentRows || '<tr><td colspan="12" class="muted">No consignments</td></tr>'}
        </tbody>
      </table>
      <div class="summary-row">
        <div class="notes-block">
          <div class="note-line">-Interest @ 18 % will be charged if not paid within 7 days of Invoice date.</div>
          <div class="note-line">-Please Draw Cheque/DD in favour of “${companyName}”.</div>
          <div class="note-line">-Note: We are Registered under GST/GTA.Vide Notification No:13/2017 GST.GST @${businessType} % to be paid by Consignor/conginee as this comes under Reverse Charge Mechanism (RCM)</div>
        </div>
        <div class="totals-block">
          <table class="totals-table">
            <tbody>
              <tr><th>ODC:</th><td>${totalOdc.toFixed(2)}</td></tr>
              <tr><th>Unloading:</th><td>${totalUnloading.toFixed(2)}</td></tr>
              <tr><th>Docket:</th><td>${totalDocket.toFixed(2)}</td></tr>
              <tr><th>Other:</th><td>${totalOther.toFixed(2)}</td></tr>
              <tr><th>CCC:</th><td>${totalCcc.toFixed(2)}</td></tr>
              <tr><th>Discount:</th><td>${totalDiscount.toFixed(2)}</td></tr>
              <tr><th>Initial Paid:</th><td>${totalInitialPaid.toFixed(2)}</td></tr>
              <tr><th>Taxable Value:</th><td>${totalTaxable.toFixed(2)}</td></tr>
              <tr><th>IGST (${igstHeaderRate || 0}%):</th><td>${totalIgst.toFixed(2)}</td></tr>
              <tr><th>Final Amount:</th><td>${totalFinal.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="amount-words"><strong>Amount in Words :</strong> ${this.numberToWords(totalFinal)}</div>
    `;
  }

  private numberToWords(amount: number): string {
    const units = [
      'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const twoDigits = (num: number): string => {
      if (num < 20) return units[num];
      const t = Math.floor(num / 10);
      const u = num % 10;
      return u ? `${tens[t]} ${units[u]}` : tens[t];
    };

    const threeDigits = (num: number): string => {
      const h = Math.floor(num / 100);
      const r = num % 100;
      if (!h) return twoDigits(r);
      if (!r) return `${units[h]} Hundred`;
      return `${units[h]} Hundred ${twoDigits(r)}`;
    };

    const toIndianWords = (num: number): string => {
      if (num === 0) return 'Zero';
      let n = num;
      const parts: string[] = [];
      const crore = Math.floor(n / 10000000);
      if (crore) {
        parts.push(`${threeDigits(crore)} Crore`);
        n %= 10000000;
      }
      const lakh = Math.floor(n / 100000);
      if (lakh) {
        parts.push(`${threeDigits(lakh)} Lakh`);
        n %= 100000;
      }
      const thousand = Math.floor(n / 1000);
      if (thousand) {
        parts.push(`${threeDigits(thousand)} Thousand`);
        n %= 1000;
      }
      if (n) {
        parts.push(threeDigits(n));
      }
      return parts.join(' ');
    };

    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const rupees = Math.floor(safeAmount);
    const paise = Math.round((safeAmount - rupees) * 100);
    const rupeeWords = toIndianWords(rupees);
    if (paise > 0) {
      return `${rupeeWords} Rupees and ${twoDigits(paise)} Paise`;
    }
    return `${rupeeWords} Rupees`;
  }

  private buildPreInvoiceDocument(preInvoices: any[], includeWrapper: boolean): string {
    let html = includeWrapper
      ? `
        <html>
          <head>
            <style>${this.getPreInvoiceStyles()}</style>
          </head>
          <body class="preinvoice-preview">
      `
      : `
        <style>${this.getPreInvoiceStyles()}</style>
        <div class="preinvoice-preview">
      `;

    preInvoices.forEach((pre, index) => {
      html += this.buildPreInvoiceSection(pre);
      if (index < preInvoices.length - 1) {
        html += `<div class="page-break"></div>`;
      }
    });

    html += includeWrapper ? `</body></html>` : `</div>`;
    return html;
  }

  openPreInvoicePreview(pre: any) {
    const html = this.buildPreInvoiceDocument([pre], false);
    this.preInvoicePreviewHtml = this.sanitizer.bypassSecurityTrustHtml(html);
    this.showPreInvoicePreview = true;
  }

  closePreInvoicePreview() {
    this.showPreInvoicePreview = false;
    this.preInvoicePreviewHtml = '';
  }

  isPreInvoiceDeleted(pre: any): boolean {
    return String(pre?.status || '').trim().toLowerCase() === 'deleted';
  }

  applyFilters() {
    if (!this.hasSpecificBranchSelection()) {
      this.filteredDelivered = [];
      this.filteredPreInvoiced = [];
      this.filteredPreInvoices = [];
      return;
    }
    const matches = (s: any) =>
      this.matchesSelectedBranch(s) &&
      (this.searchText
        ? s.consignmentNumber?.includes(this.searchText) || this.getBillingEntity(s).includes(this.searchText)
        : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor
        ? this.getBillingEntity(s).toLowerCase().includes(this.filterConsignor.toLowerCase())
        : true);
    const consignmentBillingFilter = String(this.consignmentBillingSearch || '').trim().toLowerCase();
    const matchesConsignment = (s: any) =>
      matches(s) &&
      (!consignmentBillingFilter || this.getBillingEntity(s).toLowerCase().includes(consignmentBillingFilter));

    this.filteredDelivered = this.deliveredInvoices.filter(
      (s) => matchesConsignment(s) && (this.isInvoiceOnProcess(s) || this.isInvoicePreInvoiced(s))
    );
    this.filteredDelivered.forEach((s) => {
      if (this.isInvoicePreInvoiced(s)) s.selected = false;
    });
    this.filteredPreInvoiced = this.preInvoicedInvoices.filter(matchesConsignment);

    const search = String(this.searchText || '').trim().toLowerCase();
    const billingFilter = String(this.filterConsignor || '').trim().toLowerCase();
    const filterDate = this.filterDate;
    const categoryFilter = this.preInvoiceCategoryFilter;
    const matchesPre = (p: any) => {
      const billingName = this.getPreInvoiceBillingEntity(p).toLowerCase();
      const number = String(p?.preInvoiceNumber || '').toLowerCase();
      const billingCategory = this.getPreInvoiceBillingCategory(p);
      const consignmentNumbers = (p?.consignments || [])
        .map((c: any) => String(c?.consignmentNumber || '').toLowerCase())
        .filter(Boolean);
      const created = p?.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : '';
      const matchesSearch = !search ||
        billingName.includes(search) ||
        number.includes(search) ||
        consignmentNumbers.some((c: string) => c.includes(search));
      const matchesBilling = !billingFilter || billingName.includes(billingFilter);
      const matchesDate = !filterDate || (created === filterDate);
      const matchesCategory = categoryFilter === 'all' || billingCategory === categoryFilter;
      return matchesSearch && matchesBilling && matchesDate && matchesCategory;
    };
    this.filteredPreInvoices = this.preInvoices.filter((p) => matchesPre(p));
  }

  toggleAllDeliveredSelection(event: any) {
    const checked = event.target.checked;
    this.filteredDelivered.forEach(i => {
      if (this.isInvoicePreInvoiced(i)) return;
      i.selected = checked;
    });
  }

  toggleAllPreInvoicedSelection(event: any) {
    const checked = event.target.checked;
    this.filteredPreInvoiced.forEach(i => i.selected = checked);
  }

  toggleAllPreInvoicesSelection(event: any) {
    const checked = event.target.checked;
    this.filteredPreInvoices.forEach(i => {
      if (this.isPreInvoiceDeleted(i)) return;
      i.selected = checked;
    });
  }
  openInvoiceDetails(invoice: any) {
    this.selectedInvoice = invoice;
    this.showInvoiceModal = true;
  }

  closeInvoiceDetails() {
    this.showInvoiceModal = false;
    this.selectedInvoice = null;
  }

  // �o. Function to mark selected Delivered consignments as Invoiced
  invoiceSelected() {
    const selectedConsignments = this.filteredDelivered
      .filter(i => i.selected && !this.isInvoicePreInvoiced(i));

    if (selectedConsignments.length === 0) {
      console.warn('No consignments selected for invoicing.');
      return;
    }

    const billingIds = selectedConsignments
      .map((c) => this.normalizeId(c?.billingClientId))
      .filter(Boolean);
    if (billingIds.length !== selectedConsignments.length) {
      alert('Missing Billing Entity');
      return;
    }
    const uniqueBilling = new Set(billingIds);
    if (uniqueBilling.size > 1) {
      alert('Different Billing Entity');
      return;
    }

    const consignmentNumbers = selectedConsignments
      .map((c) => String(c?.consignmentNumber || '').trim())
      .filter(Boolean);

    this.http.post('http://localhost:3000/api/newshipments/preInvoices', {
      consignmentNumbers
    }).subscribe({
      next: () => {
        this.filteredDelivered.forEach(i => i.selected = false);
        this.loadInvoices();
        this.loadPreInvoices();
      },
      error: (err) => {
        console.error('Error creating pre-invoice:', err);
        alert(err?.error?.message || 'Error creating pre-invoice');
      }
    });
  }

  editInvoice(invoice: any) {
    console.log('Edit invoice:', invoice);
    const cloned = JSON.parse(JSON.stringify(invoice || {}));
    if (Array.isArray(cloned.ewaybills) && cloned.ewaybills.length) {
      cloned.invoices = this.flattenInvoices(cloned.ewaybills);
    } else {
      cloned.invoices = cloned.invoices || [];
    }
    this.editingInvoice = cloned;
    this.captureOriginalDelivered(this.editingInvoice);
    this.showEditPopup = true;
  }

  private flattenInvoices(ewaybills: any[]): any[] {
    return (ewaybills || []).flatMap((ewb) => ewb.invoices || []);
  }

  private captureOriginalDelivered(invoice: any) {
    (invoice?.invoices || []).forEach((inv: any) => {
      (inv.products || []).forEach((prod: any) => {
        prod._originalDelivered = Number(prod.deliveredstock) || 0;
      });
    });
  }

  deleteDelivered() {
    this.deleteConsignments(this.filteredDelivered);
  }

  deletePreInvoiced() {
    this.deleteConsignments(this.filteredPreInvoiced);
  }

  deletePreInvoices() {
    const selected = (this.filteredPreInvoices || []).filter(
      (p: any) => p.selected && !this.isPreInvoiceDeleted(p)
    );
    if (!selected.length) {
      alert('No pre-invoices selected.');
      return;
    }
    const preInvoiceIds = selected
      .map((p: any) => String(p?._id || '').trim())
      .filter(Boolean);
    if (!preInvoiceIds.length) {
      alert('Missing pre-invoice ids.');
      return;
    }
    this.http.request('delete', 'http://localhost:3000/api/newshipments/preInvoices', {
      body: { preInvoiceIds }
    }).subscribe({
      next: () => {
        this.filteredPreInvoices.forEach((p) => p.selected = false);
        this.loadInvoices();
        this.loadPreInvoices();
      },
      error: (err) => {
        console.error('Error deleting pre-invoices:', err);
        alert(err?.error?.message || 'Error deleting pre-invoices');
      }
    });
  }

  deleteInvoice() {
    this.deleteConsignments([...this.filteredDelivered, ...this.filteredPreInvoiced]);
  }

  finalizePreInvoiced() {
    const selectedConsignments = (this.filteredPreInvoiced || []).filter(i => i.selected);

    if (selectedConsignments.length === 0) {
      console.warn('No consignments selected for invoicing.');
      return;
    }

    selectedConsignments.forEach(consignment => {
      const updatedConsignment = { ...consignment, shipmentStatus: 'Invoiced' };

      this.http.put(`http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`, updatedConsignment)
        .subscribe({
          next: () => {
            console.log(`Consignment ${consignment.consignmentNumber} updated to Invoiced`);
            this.loadInvoices();
          },
          error: (err) => {
            console.error(`Error updating consignment ${consignment.consignmentNumber}:`, err);
          }
        });
    });

    this.filteredPreInvoiced.forEach(i => i.selected = false);
  }

  private getSelectedPreInvoicedConsignments(): any[] {
    return (this.filteredPreInvoiced || []).filter((i) => i.selected);
  }

  private getSelectedPreInvoices(): any[] {
    return (this.filteredPreInvoices || []).filter(
      (p) => p.selected && !this.isPreInvoiceDeleted(p)
    );
  }

  private extractConsignmentNumbersFromPreInvoices(preInvoices: any[]): string[] {
    const numbers = new Set<string>();
    (preInvoices || []).forEach((pre) => {
      (pre?.consignments || []).forEach((c: any) => {
        const number = String(c?.consignmentNumber || '').trim();
        if (number) numbers.add(number);
      });
    });
    return Array.from(numbers);
  }

  openGenerateInvoicePopup(source: 'preInvoiced' | 'preInvoices' = 'preInvoiced') {
    this.generateInvoiceSource = source;
    const selected = source === 'preInvoices'
      ? this.getSelectedPreInvoices()
      : this.getSelectedPreInvoicedConsignments();
    if (selected.length === 0) {
      const message = source === 'preInvoices'
        ? 'No pre-invoices selected.'
        : 'No consignments selected for invoicing.';
      alert(message);
      return;
    }
    this.showGenerateInvoicePopup = true;
  }

  confirmGenerateInvoice() {
    const source = this.generateInvoiceSource || 'preInvoiced';
    const selected = source === 'preInvoices'
      ? this.getSelectedPreInvoices()
      : this.getSelectedPreInvoicedConsignments();
    const consignmentNumbers = source === 'preInvoices'
      ? this.extractConsignmentNumbersFromPreInvoices(selected)
      : selected.map((s) => String(s?.consignmentNumber || '').trim()).filter(Boolean);
    if (consignmentNumbers.length === 0) {
      const message = source === 'preInvoices'
        ? 'No consignments found in the selected pre-invoices.'
        : 'No consignments selected for invoicing.';
      alert(message);
      this.showGenerateInvoicePopup = false;
      return;
    }

    this.http.post('http://localhost:3000/api/newshipments/generateInvoices', {
      consignmentNumbers
    }).subscribe({
      next: () => {
        this.showGenerateInvoicePopup = false;
        if (source === 'preInvoices') {
          this.filteredPreInvoices.forEach((p) => p.selected = false);
          this.loadPreInvoices();
        } else {
          this.filteredPreInvoiced.forEach((i) => i.selected = false);
        }
        this.loadInvoices();
      },
      error: (err) => {
        console.error('Error generating invoices:', err);
        this.showGenerateInvoicePopup = false;
      }
    });
  }

  cancelGenerateInvoice() {
    this.showGenerateInvoicePopup = false;
    this.generateInvoiceSource = 'preInvoiced';
  }
  private deleteConsignments(list: any[]) {
    const selectedConsignments = (list || []).filter(i => i.selected);

    if (selectedConsignments.length === 0) {
      console.warn('No consignments selected for invoicing.');
      return;
    }

    selectedConsignments.forEach(consignment => {
      const updatedConsignment = { ...consignment, shipmentStatus: ' Cancelled-'+consignment.shipmentStatus };

      this.http.put(`http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`, updatedConsignment)
        .subscribe({
          next: () => {
            console.log(`Consignment ${consignment.consignmentNumber} updated to Invoiced`);
            this.loadInvoices();
          },
          error: (err) => {
            console.error(`Error updating consignment ${consignment.consignmentNumber}:`, err);
          }
        });
    });

    (list || []).forEach(i => i.selected = false);
  }

  printDelivered() {
    this.printConsignments(this.filteredDelivered);
  }

  printPreInvoiced() {
    this.printConsignments(this.filteredPreInvoiced);
  }

  printInvoice() {
    this.printConsignments([...this.filteredDelivered, ...this.filteredPreInvoiced]);
  }

  private printConsignments(list: any[]) {
    const selected = (list || []).filter(inv => inv.selected);

    if (selected.length === 0) {
      alert('No invoices selected.');
      return;
    }

    fetch('assets/invoice-template.html')
      .then(res => res.text())
      .then(template => {
        let fullHtml = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h2 { margin-bottom: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .page-break { page-break-after: always; }
            .totals { margin-top: 15px; font-weight: bold; }
          </style>
        </head>
        <body>
    `;

        selected.forEach((inv, index) => {
          let subtotal = 0;
          const rows = (inv.invoices || []).map((i: any) =>
            (i.products || []).map((p: any) => {
              const lineTotal = (p.price || 0) * (p.deliveredstock || 0);
              subtotal += lineTotal;
              return `
          <tr>
          <td>${inv.consignmentNumber}</td>
          <td>${inv.shipmentStatus}</td>
          <td>${inv.consignor}</td>
          <td>${inv.deliveryAddress}</td>
          <td>${p.type}</td>
          <td>${p.deliveredstock}</td>
          <td>${p.price || 0}</td>
          <td>${lineTotal.toFixed(2)}</td>
          </tr>
          `;
            }).join('')
          ).join('');

          const ctype = localStorage.getItem('companyType') || 'default';
          const gst = inv.finalAmount * (parseInt(ctype, 10) / 100);
          const grandTotal = inv.finalAmount + gst;
          const htmlContent = template
            .replace('{{consignmentNumber}}', inv.consignmentNumber)
            .replace('{{consignor}}', inv.consignor)
            .replace('{{deliveryAddress}}', inv.deliveryAddress)
            .replace('{{status}}', inv.shipmentStatus)
            .replace('{{rows}}', rows)
            .replace('{{subtotal}}', subtotal.toFixed(2))
            .replace('{{gst}}', gst.toFixed(2))
            .replace('{{grandTotal}}', grandTotal.toFixed(2));

          fullHtml += htmlContent;

          if (index < selected.length - 1) {
            fullHtml += `<div class="page-break"></div>`;
          }
        });

        fullHtml += `</body></html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(fullHtml);
          printWindow.document.close();
          printWindow.print();
        }
      })
      .catch(err => console.error('Error loading invoice template:', err));
  }

  printPreInvoices() {
    const selected = (this.filteredPreInvoices || []).filter((p: any) => p.selected);
    if (!selected.length) {
      alert('No pre-invoices selected.');
      return;
    }

    const fullHtml = this.buildPreInvoiceDocument(selected, true);

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      printWindow.print();
    }
  }
}
