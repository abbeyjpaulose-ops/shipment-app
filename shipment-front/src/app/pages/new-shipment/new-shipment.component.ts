import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-new-shipment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-shipment.component.html',
  styleUrls: ['./new-shipment.component.css']
})
export class NewShipmentComponent implements OnInit, OnDestroy {
  private DRAFT_PREFIX = 'newShipmentDraft';
  private branchCheckInterval: any;

  showClientModal = false;
  showGuestModal = false;
  showProductModal = false;
  clientError = '';
  guestError = '';
  productError = '';
  clientModalTab: 'add' | 'edit' = 'add';
  showClientAddTab = true;
  editClientError = '';

  newClient = {
    clientName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    GSTIN: '',
    phoneNum: '',
    perDis: 0,
    creditType: 'no-credit',
    products: [] as any[],
    deliveryLocations: [{ address: '', city: '', state: '', pinCode: '' }],
    status: 'active',
    branch: '',
    originLocId: ''
  };

  editableClientList: any[] = [];
  selectedEditClientId: string = '';
  editClient: any = {
    _id: '',
    clientName: '',
    GSTIN: '',
    phoneNum: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    branch: '',
    deliveryLocations: [] as any[]
  };

  newGuest = {
    guestName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNum: '',
    perDis: 0
  };

  newProduct = {
    hsnNum: '',
    productName: '',
    status: 'active',
    originLocId: '',
    rates: [
      {
        pickupLocationId: '',
        deliveryLocationId: '',
        rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
      }
    ]
  };

  // Billing
  billingType: 'consignor' | 'different' = 'consignor';
  billingName = '';
  billingAddress = '';
  billingGSTIN = '';
  billingPhone = '';
  billingLocationIndex = '';
  billingLocationId: string | null = null;
  billingPreviousSender = '';
  billingClientId: string | null = null;
  billingSource = '';
  billingAddressOptions: Array<{ label: string; locationId: string | null; address: string }> = [];

  clientList: any[] = [];
  rateAddressClients: any[] = [];
  guestList: any[] = [];
  pkgList: any[] = [];
  productList: any[] = [];
  rateAddressOptions: Array<{ id: string; label: string }> = [];
  private rateAddressLabelById = new Map<string, string>();

  // Pickup
  pickupType: 'branch' | 'consignor' | 'different' = 'branch';
  pickupName = '';
  pickupAddress = '';
  pickupPhone = '';
  pickupPincode = '';
  pickupLocationIndex = '';
  pickupLocationId: string | null = null;
  pickupPreviousSender = '';
  pickupSource = 'branch';

  // Delivery
  deliveryType: 'branch' | 'hub' | 'consignee' | 'different' = 'consignee';
  deliveryTypeName: string = '';
  deliveryName = '';
  deliveryAddress = '';
  deliveryPhone = '';
  deliveryPincode = '';
  deliveryLocationIndex = '';
  deliveryLocationId: string | null = null;
  deliveryPreviousReceiver = '';
  private lastConsigneeName = '';
  deliveryID: string | null = null;
  deliveryBranch = '';
  deliveryHub = '';
  deliveryHubLocationIndex = '';

  consignorTab: 'consignor' | 'guest' = 'consignor';
  consigneeTab: 'consignee' | 'guest' = 'consignee';

  username: string = '';
  isAdmin = String(localStorage.getItem('role') || '').toLowerCase() === 'admin';
  branch: string = localStorage.getItem('branch') || 'All Branches';
  selectedConsignorId: string | null = null;
  consignorId: string | null = null;
  consigneeId: string | null = null;

  consignmentNumber: string = 'nil';
  date: string = new Date().toISOString().split('T')[0];

  consignor: string = '';
  consignorGST: string = '';
  consignorAddress: string = '';
  consignorPhone: string = '';

  consignee: string = '';
  consigneeGST: string = '';
  consigneeAddress: string = '';
  consigneePhone: string = '';

  paymentMode: string = 'To Pay';
  rateUnit: 'box' | 'cm3' | 'kg' = 'box';
  allowAccountCredit = false;
  allowReceiverCredit = false;
  externalRefId: string = '';
  suggestedRates: Record<string, number | null> = {};
  isQuoteLoading = false;
  private quoteTimer: any = null;
  private quoteRequestId = 0;
  private quoteSubtotal = 0;
  showRateOverrideModal = false;
  private suggestionRequestKey = '';
  private suggestionRetryHandle: any = null;
  private suggestionMaxRetries = 2;
  branchDetails: any | null = null;
  branches: any[] = [];
  hubs: any[] = [];
  selectedAllHubId: string = '';
  rateOverrides: Array<{
    productName: string;
    hsnNum?: string;
    enteredRate: number;
    suggestedRate: number | null;
    action: 'override' | 'suggest';
  }> = [];

  ewaybills = [
    {
      number: '',
      date: this.date,
      invoices: [
        {
          number: '',
          value: 0,
          packages: [{ type: '', amount: 0 }],
          products: [{ type: '', amount: 1, ratePer: 0, instock: 1, intransitstock: 0, deliveredstock: 0 }]
        }
      ]
    }
  ];

  charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0, consignorDiscount: 0 };
  applyConsignorDiscount = true;
  maxConsignorDiscount = 0;
  finalAmount: number = 0;
  taxableValue: number = 0;
  igstPercent: number = 0;
  igstAmount: number = 0;
  initialPaid: number = 0;
  showFinalAmountModal: boolean = false;

  shipmentStatus: string = 'Pending';
  shipmentStatusDetails: string = '';
  isSaving = false;
  pendingPricingUpdates: Array<{ productName: string; hsnNum?: string; enteredRate: number }> = [];
  retryPricingAfterSave = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    if (typeof window === 'undefined') return;

    this.username = localStorage.getItem('username') || '';
    this.branch = localStorage.getItem('branch') || 'All Branches';
    this.newClient.branch = this.branch;
    this.newClient.originLocId = localStorage.getItem('originLocId') || 'all';
    this.deliveryBranch = this.branch;
    this.igstPercent = this.getCompanyTaxPercent();
    if (!localStorage.getItem('companyType')) {
      this.loadCompanyTypeFromProfile();
    }

    this.loadDraft(this.branch);
    this.getCurrentConsignmentNumber();
    this.loadLists();
    this.loadBranchDetails();
    this.loadHubDetails();

    // React to branch change (same tab)
    this.branchCheckInterval = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      if (current !== this.branch) {
        const oldBranch = this.branch;
        this.handleBranchChange(current, oldBranch);
      }
    }, 1000);

    // React to branch change (other tab)
    window.addEventListener('storage', this.onStorageChange);
  }

  ngOnDestroy(): void {
    if (this.branchCheckInterval) {
      clearInterval(this.branchCheckInterval);
    }
    window.removeEventListener('storage', this.onStorageChange);
  }

  @HostListener('window:beforeunload')
  onBeforeUnload() {
    this.saveDraft(this.branch);
  }

  private onStorageChange = (e: StorageEvent) => {
    if (e.key === 'branch' && e.newValue) {
      this.handleBranchChange(e.newValue, e.oldValue || this.branch);
    }
    if (e.key === 'companyType') {
      this.igstPercent = this.getCompanyTaxPercent();
      this.applyTaxToAmount(this.taxableValue);
    }
  };

  private loadCompanyTypeFromProfile() {
    const email = localStorage.getItem('email') || '';
    const username = localStorage.getItem('username') || '';
    if (!email && !username) return;
    this.http.get<any>(`/api/profile?user=${username}&email=${email}`)
      .subscribe({
        next: (data) => {
          const profile = Array.isArray(data) ? data[0] : data;
          const raw = profile?.businessType;
          if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
            localStorage.setItem('companyType', String(raw));
            this.igstPercent = this.getCompanyTaxPercent();
            this.applyTaxToAmount(this.taxableValue);
          }
        },
        error: () => {}
      });
  }

  private handleBranchChange(newBranch: string, oldBranch: string) {
    // Save draft for the previous branch
    if (oldBranch) {
      this.saveDraft(oldBranch);
    }
    this.branch = newBranch || 'All Branches';
    if (this.branch !== 'All Hubs') {
      this.selectedAllHubId = '';
    }
    this.newClient.branch = this.branch;
    this.newClient.originLocId = localStorage.getItem('originLocId') || 'all';
    this.editClient.branch = this.branch;
    if (this.deliveryType === 'branch') {
      this.deliveryBranch = this.branch;
    }
    if (this.deliveryType === 'hub') {
      this.deliveryHub = '';
    }
    this.loadDraft(this.branch);
    this.getCurrentConsignmentNumber();
    this.loadLists();
    this.loadBranchDetails();
    this.loadHubDetails();
  }

  private draftKey(branch: string) {
    return `${this.DRAFT_PREFIX}:${branch || 'All Branches'}`;
  }

  private saveDraft(branch: string) {
    if (typeof window === 'undefined') return;
    const key = this.draftKey(branch);
    const draft = {
      billingType: this.billingType,
      billingName: this.billingName,
      billingAddress: this.billingAddress,
      billingGSTIN: this.billingGSTIN,
      billingPhone: this.billingPhone,
      billingLocationId: this.billingLocationId,
      billingPreviousSender: this.billingPreviousSender,
      billingClientId: this.billingClientId,
      billingSource: this.billingSource,
      pickupType: this.pickupType,
      pickupName: this.pickupName,
      pickupAddress: this.pickupAddress,
      pickupPhone: this.pickupPhone,
      pickupPincode: this.pickupPincode,
      pickupLocationId: this.pickupLocationId,
      pickupPreviousSender: this.pickupPreviousSender,
      pickupSource: this.pickupSource,
      deliveryType: this.deliveryType,
      deliveryTypeName: this.getDeliveryTypeForSave(),
      deliveryBranch: this.deliveryBranch,
      deliveryHub: this.deliveryHub,
      deliveryID: this.deliveryID,
      deliveryName: this.deliveryName,
      deliveryAddress: this.deliveryAddress,
      deliveryPhone: this.deliveryPhone,
      deliveryPincode: this.deliveryPincode,
      deliveryHubLocationIndex: this.deliveryHubLocationIndex,
      deliveryLocationId: this.deliveryLocationId,
      deliveryPreviousReceiver: this.deliveryPreviousReceiver,
      consignorTab: this.consignorTab,
      consigneeTab: this.consigneeTab,
      consignor: this.consignor,
      consignorGST: this.consignorGST,
      consignorAddress: this.consignorAddress,
      consignorPhone: this.consignorPhone,
      consignorId: this.consignorId,
      consignee: this.consignee,
      consigneeGST: this.consigneeGST,
      consigneeAddress: this.consigneeAddress,
      consigneePhone: this.consigneePhone,
      consigneeId: this.consigneeId,
      paymentMode: this.paymentMode,
      rateUnit: this.rateUnit,
      externalRefId: this.externalRefId,
      ewaybills: this.ewaybills,
      charges: this.charges,
      applyConsignorDiscount: this.applyConsignorDiscount,
      finalAmount: this.finalAmount,
      initialPaid: this.initialPaid,
      selectedConsignorId: this.selectedConsignorId,
      consignmentNumber: this.consignmentNumber,
      date: this.date
    };
    localStorage.setItem(key, JSON.stringify(draft));
  }

  private loadDraft(branch: string) {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(this.draftKey(branch));
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      Object.assign(this, {
        billingType: draft.billingType ?? this.billingType,
        billingName: draft.billingName ?? this.billingName,
        billingAddress: draft.billingAddress ?? this.billingAddress,
        billingGSTIN: draft.billingGSTIN ?? this.billingGSTIN,
        billingPhone: draft.billingPhone ?? this.billingPhone,
        billingLocationId: draft.billingLocationId ?? this.billingLocationId,
        billingPreviousSender: draft.billingPreviousSender ?? this.billingPreviousSender,
        billingClientId: draft.billingClientId ?? this.billingClientId,
        billingSource: draft.billingSource ?? this.billingSource,
        pickupType: draft.pickupType ?? this.pickupType,
        pickupName: draft.pickupName ?? this.pickupName,
        pickupAddress: draft.pickupAddress ?? this.pickupAddress,
        pickupPhone: draft.pickupPhone ?? this.pickupPhone,
        pickupPincode: draft.pickupPincode ?? this.pickupPincode,
        pickupLocationId: draft.pickupLocationId ?? this.pickupLocationId,
        pickupPreviousSender: draft.pickupPreviousSender ?? this.pickupPreviousSender,
        pickupSource: draft.pickupSource ?? this.pickupSource,
        deliveryType: draft.deliveryType ?? this.deliveryType,
        deliveryTypeName: draft.deliveryTypeName ?? this.deliveryTypeName,
        deliveryBranch: draft.deliveryBranch ?? this.deliveryBranch,
        deliveryHub: draft.deliveryHub ?? this.deliveryHub,
        deliveryID: draft.deliveryID ?? this.deliveryID,
        deliveryName: draft.deliveryName ?? this.deliveryName,
        deliveryAddress: draft.deliveryAddress ?? this.deliveryAddress,
        deliveryPhone: draft.deliveryPhone ?? this.deliveryPhone,
        deliveryPincode: draft.deliveryPincode ?? this.deliveryPincode,
        deliveryHubLocationIndex: draft.deliveryHubLocationIndex ?? this.deliveryHubLocationIndex,
        deliveryLocationId: draft.deliveryLocationId ?? this.deliveryLocationId,
        deliveryPreviousReceiver: draft.deliveryPreviousReceiver ?? this.deliveryPreviousReceiver,
        consignorTab: draft.consignorTab ?? this.consignorTab,
        consigneeTab: draft.consigneeTab ?? this.consigneeTab,
        consignor: draft.consignor ?? this.consignor,
        consignorGST: draft.consignorGST ?? this.consignorGST,
        consignorAddress: draft.consignorAddress ?? this.consignorAddress,
        consignorPhone: draft.consignorPhone ?? this.consignorPhone,
        consignorId: draft.consignorId ?? this.consignorId,
        consignee: draft.consignee ?? this.consignee,
        consigneeGST: draft.consigneeGST ?? this.consigneeGST,
        consigneeAddress: draft.consigneeAddress ?? this.consigneeAddress,
        consigneePhone: draft.consigneePhone ?? this.consigneePhone,
        consigneeId: draft.consigneeId ?? this.consigneeId,
        paymentMode: draft.paymentMode ?? this.paymentMode,
        rateUnit: draft.rateUnit ?? this.rateUnit,
        externalRefId: draft.externalRefId ?? this.externalRefId,
        ewaybills: draft.ewaybills ?? this.ewaybills,
        charges: draft.charges ?? this.charges,
        applyConsignorDiscount: draft.applyConsignorDiscount ?? this.applyConsignorDiscount,
        finalAmount: draft.finalAmount ?? this.finalAmount,
        initialPaid: draft.initialPaid ?? this.initialPaid,
        selectedConsignorId: draft.selectedConsignorId ?? null,
        consignmentNumber: draft.consignmentNumber ?? this.consignmentNumber,
        date: draft.date ?? this.date
      });
      if (this.pickupSource === 'consignor-primary') {
        this.pickupSource = 'consignor:0';
      }
      if (this.billingType === 'different' && this.billingSource) {
        this.onBillingSourceSelect(this.billingSource, true);
        if (this.billingLocationIndex !== '') {
          this.onBillingAddressSelect(this.billingLocationIndex, true);
        }
      }
      this.onPaymentModeChange();
      this.updatePickupFromBranch();
      if (this.deliveryType === 'branch') {
        this.updateDeliveryFromBranch();
        } else if (this.deliveryType === 'hub') {
          this.updateDeliveryFromHub();
        } else if (this.deliveryType === 'consignee') {
          this.updateDeliveryFromConsignee();
        }
        this.scheduleQuote();
      } catch {
        /* ignore bad draft */
      }
  }

  private clearDraft(branch: string) {
    localStorage.removeItem(this.draftKey(branch));
  }

  private loadLists() {
    // Client list
    const originLocId = localStorage.getItem('originLocId') || 'all';
    const productsoriginLocId = originLocId === 'all-hubs' ? 'all' : originLocId;
    this.http.get<any[]>(`/api/clients/clientslist?originLocId=${encodeURIComponent(originLocId)}`)
      .subscribe(res => {
        this.clientList = res;
        this.rebuildRateAddressOptions();
        this.syncBillingDiscount();
        this.updatePaymentModeAvailability();
      });
    this.http.get<any[]>('/api/clients/clientslist?originLocId=all')
      .subscribe(res => {
        this.rateAddressClients = res || [];
        this.rebuildRateAddressOptions();
      });

    // Guest list
    this.http.get<any[]>(`/api/guests/guestslist`)
      .subscribe(res => this.guestList = res);

    // Package list
    this.http.get<any[]>(`/api/pkgs/pkglist`)
      .subscribe(res => this.pkgList = res);

    // Product list (defaults)
    const branch = localStorage.getItem('branch') || '';
    const originFilter = this.getOriginFilterFromoriginLocId(originLocId);
    const params: any = { branch };
    if (originFilter) {
      params.originType = originFilter.originType;
      params.originLocId = originFilter.originLocId;
    } else {
      params.originLocId = productsoriginLocId;
    }
    this.http.get<any[]>('/api/products/productlist', { params })
      .subscribe(res => this.productList = res);
  }

  private getOriginFilterFromoriginLocId(originLocId: string): { originType: 'branch' | 'hub'; originLocId: string } | null {
    if (!originLocId) return null;
    const lower = String(originLocId).trim().toLowerCase();
    if (!lower || lower === 'all') return null;
    if (lower === 'all-hubs') {
      const hubId = this.normalizeHubId(localStorage.getItem('hubId'));
      return hubId ? { originType: 'hub', originLocId: hubId } : null;
    }
    const normalized = this.normalizeHubId(originLocId);
    return normalized ? { originType: 'branch', originLocId: normalized } : null;
  }

  private normalizeHubId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }

  private loadHubDetails() {
    this.http.get<any[]>('/api/hubs')
      .subscribe({
        next: (hubs) => {
          this.hubs = hubs || [];
          this.rebuildRateAddressOptions();
          if (this.deliveryType === 'hub') {
            this.updateDeliveryFromHub();
          }
        },
        error: () => {
          this.hubs = [];
        }
      });
  }

  // E-WAYBILL HELPERS
  addEwaybill() {
    this.ewaybills.push({ number: '', date: this.date, invoices: [] });
    this.scheduleQuote();
  }
  deleteEwaybill(index: number) {
    this.ewaybills.splice(index, 1);
    this.scheduleQuote();
  }

  addInvoice(ewaybillIndex: number) {
    this.ewaybills[ewaybillIndex].invoices.push({ number: '', value: 0, packages: [], products: [] });
    this.scheduleQuote();
  }
  deleteInvoice(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices.splice(invoiceIndex, 1);
    this.scheduleQuote();
  }

  addPackage(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].packages.push({ type: '', amount: 0 });
    this.scheduleQuote();
  }
  deletePackage(ewaybillIndex: number, invoiceIndex: number, packageIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].packages.splice(packageIndex, 1);
    this.scheduleQuote();
  }

  addProduct(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].products.push({
      type: '',
      amount: 1,
      ratePer: 0,
      instock: 1,
      intransitstock: 0,
      deliveredstock: 0
    });
    this.scheduleQuote();
  }
  deleteProduct(ewaybillIndex: number, invoiceIndex: number, productIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].products.splice(productIndex, 1);
    this.scheduleQuote();
  }

  // CALCULATIONS
  scheduleQuote() {
    if (this.quoteTimer) {
      clearTimeout(this.quoteTimer);
    }
    this.quoteTimer = setTimeout(() => this.requestQuote(), 200);
  }

  private requestQuote() {
    const requestId = ++this.quoteRequestId;
    this.isQuoteLoading = true;
    const payload = {
      ewaybills: this.ewaybills,
      charges: this.charges,
      applyConsignorDiscount: this.applyConsignorDiscount
    };
    this.http.post<{ finalAmount: number; subtotal?: number; discountAmount?: number }>(
      '/api/newshipments/quote',
      payload
    )
      .subscribe({
        next: (res) => {
          if (requestId !== this.quoteRequestId) return;
          const baseAmount = Number(res?.finalAmount) || 0;
          this.quoteSubtotal = Number(res?.subtotal) || 0;
          this.applyTaxToAmount(baseAmount);
          this.isQuoteLoading = false;
        },
        error: () => {
          if (requestId !== this.quoteRequestId) return;
          this.isQuoteLoading = false;
        }
      });
  }

  private applyTaxToAmount(baseAmount: number) {
    const safeBase = Number.isFinite(baseAmount) ? baseAmount : 0;
    this.taxableValue = this.roundCurrency(safeBase);
    this.igstPercent = this.getCompanyTaxPercent();
    const effectiveRate = this.getEffectiveIgstPercent();
    this.igstAmount = this.roundCurrency(this.taxableValue * effectiveRate / 100);
    this.finalAmount = this.roundCurrency(this.taxableValue + this.igstAmount);
  }

  private getCompanyTaxPercent(): number {
    const raw = localStorage.getItem('companyType');
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  private isBillingClient(): boolean {
    if (this.billingType === 'consignor') {
      return this.consignorTab === 'consignor';
    }
    const source = String(this.billingSource || '');
    if (source.startsWith('client:')) return true;
    if (source.startsWith('hub:')) return false;
    return Boolean(this.billingClientId);
  }

  private shouldGtaExempt(): boolean {
    if (this.isToPayMode()) {
      return this.consigneeTab === 'consignee';
    }
    return this.isBillingClient();
  }

  private getEffectiveIgstPercent(): number {
    const base = Number(this.igstPercent) || 0;
    if (base === 5 && this.shouldGtaExempt()) {
      return 0;
    }
    return base;
  }

  private recomputeTaxFromCurrentBase() {
    const effectiveRate = this.getEffectiveIgstPercent();
    let base = Number(this.taxableValue) || 0;
    if (!base && Number(this.finalAmount) > 0) {
      const multiplier = 1 + effectiveRate / 100;
      base = multiplier > 0 ? (Number(this.finalAmount) / multiplier) : Number(this.finalAmount);
    }
    this.applyTaxToAmount(base);
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  resetForm() {
    this.billingType = 'consignor';
    this.billingName = '';
    this.billingAddress = '';
    this.billingGSTIN = '';
    this.billingPhone = '';
    this.billingLocationIndex = '';
    this.billingLocationId = null;
    this.billingPreviousSender = '';
    this.billingClientId = null;
    this.billingSource = '';
    this.billingAddressOptions = [];
    this.pickupType = 'branch';
    this.pickupName = '';
    this.pickupAddress = '';
    this.pickupPhone = '';
    this.pickupPincode = '';
    this.pickupLocationIndex = '';
    this.pickupLocationId = null;
    this.pickupPreviousSender = '';
    this.pickupSource = 'branch';
    this.deliveryType = 'consignee';
    this.deliveryTypeName = '';
    this.deliveryBranch = '';
    this.deliveryHub = '';
    this.deliveryName = '';
    this.deliveryAddress = '';
    this.deliveryPhone = '';
    this.deliveryPincode = '';
    this.deliveryLocationIndex = '';
    this.deliveryLocationId = null;
    this.deliveryPreviousReceiver = '';
    this.deliveryID = null;
    this.deliveryHubLocationIndex = '';
    this.consignorTab = 'consignor';
    this.consigneeTab = 'consignee';
    this.selectedConsignorId = null;
    this.consignor = '';
    this.consignorGST = '';
    this.consignorAddress = '';
    this.consignorPhone = '';
    this.consignorId = null;
    this.consignee = '';
    this.consigneeGST = '';
    this.consigneeAddress = '';
    this.consigneePhone = '';
    this.consigneeId = null;
    this.paymentMode = 'To Pay';
    this.rateUnit = 'box';
    this.allowAccountCredit = false;
    this.allowReceiverCredit = false;
    this.externalRefId = '';
    this.ewaybills = [{
      number: '',
      date: this.date,
      invoices: [
        {
          number: '',
          value: 0,
          packages: [{ type: '', amount: 0 }],
          products: [{ type: '', amount: 1, ratePer: 0, instock: 1, intransitstock: 0, deliveredstock: 0 }]
        }
      ]
    }];
    this.charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0, consignorDiscount: 0 };
    this.applyConsignorDiscount = true;
      this.maxConsignorDiscount = 0;
      this.finalAmount = 0;
      this.taxableValue = 0;
      this.igstAmount = 0;
      this.igstPercent = this.getCompanyTaxPercent();
      this.initialPaid = 0;
      this.suggestedRates = {};
      this.saveDraft(this.branch);
      this.scheduleQuote();
      this.updatePickupFromBranch();
    }

  // CONSIGNMENT NUMBER
  getCurrentConsignmentNumber() {
    const originLocId = localStorage.getItem('originLocId') || 'all';
    if (!this.branch || this.branch === 'All Branches' || originLocId === 'all') {
      this.consignmentNumber = 'nil';
      return;
    }
    if (this.branch === 'All Hubs' || originLocId === 'all-hubs') {
      const hubId = String(this.selectedAllHubId || '').trim();
      if (!hubId) {
        this.consignmentNumber = 'nil';
        return;
      }
      this.http.get<{ nextNumber: number, fiscalYear: string }>(
        `/api/newshipments/nextConsignment?username=${encodeURIComponent(this.username)}&originLocId=${encodeURIComponent(hubId)}&originType=hub`
      ).subscribe({
        next: (res) => {
          this.consignmentNumber = res.nextNumber.toString();
          localStorage.setItem('consignmentNumber', this.consignmentNumber);
        },
        error: (err) => console.error('Error fetching consignment number', err)
      });
      return;
    }
    this.http.get<{ nextNumber: number, fiscalYear: string }>(
      `/api/newshipments/nextConsignment?username=${encodeURIComponent(this.username)}&originLocId=${encodeURIComponent(originLocId)}&originType=branch`
    ).subscribe({
      next: (res) => {
        this.consignmentNumber = res.nextNumber.toString();
        localStorage.setItem('consignmentNumber', this.consignmentNumber);
      },
      error: (err) => console.error('Error fetching consignment number', err)
    });
  }

  // SAVE SHIPMENT
  saveShipment() {
    if (this.isSaving) return;
    if (!this.ensureProductAmounts()) return;
    if (Number(this.finalAmount || 0) === 0) {
      this.showFinalAmountModal = true;
      return;
    }
    this.beginSaveFlow();
  }

  confirmFinalAmountSave() {
    this.showFinalAmountModal = false;
    this.beginSaveFlow();
  }

  cancelFinalAmountSave() {
    this.showFinalAmountModal = false;
  }

  private beginSaveFlow() {
    const branch = localStorage.getItem('branch') || '';
    const originLocId = localStorage.getItem('originLocId') || 'all';
    const isAllHubs = branch === 'All Hubs' || originLocId === 'all-hubs';
    if (isAllHubs) {
      this.rateOverrides = [];
      this.showRateOverrideModal = false;
      this.performSave();
      return;
    }
    const overrides = this.collectRateOverrides();
    if (overrides.length) {
      this.rateOverrides = overrides;
      this.showRateOverrideModal = true;
      return;
    }
    this.performSave();
  }

  private performSave() {
    this.isSaving = true;
    this.shipmentStatus = 'Pending';
    const branch = localStorage.getItem('branch') || '';
    let originLocId = localStorage.getItem('originLocId') || 'all';
    const isAllHubs = branch === 'All Hubs' || originLocId === 'all-hubs';
    let effectiveoriginLocId = originLocId;
    let effectiveCurrentoriginLocId = originLocId;
    if (isAllHubs) {
      const hub = this.getSelectedAllHub();
      if (!hub) {
        this.isSaving = false;
        alert('Select at least one hub before saving.');
        return;
      }
      originLocId= String(hub?._id || '').trim();
      effectiveoriginLocId = originLocId;
      effectiveCurrentoriginLocId = originLocId;
      if (!effectiveoriginLocId) {
        this.isSaving = false;
        alert('Selected hub is invalid.');
        return;
      }
    }
    const statusDetailsoriginLocId =
      effectiveCurrentoriginLocId && effectiveCurrentoriginLocId !== 'all'
        ? `$$${effectiveCurrentoriginLocId}`
        : '';
    const shipmentData: any = {
      username: localStorage.getItem('username'),
      branch,
      currentLocationId: effectiveCurrentoriginLocId,
      shipmentStatus: this.shipmentStatus,
      shipmentStatusDetails: statusDetailsoriginLocId,
      consignmentNumber: this.consignmentNumber,
      date: this.date,
      paymentMode: this.paymentMode,
      externalRefId: this.externalRefId,
      taxableValue: this.taxableValue,
      igstPercent: this.igstPercent,
      consignorTab: this.consignorTab,
      consignor: this.consignor,
      consignorGST: this.consignorGST,
      consignorAddress: this.consignorAddress,
      consignorPhone: this.consignorPhone,
      consignorId: this.consignorId,
      consigneeTab: this.consigneeTab,
      consignee: this.consignee,
      consigneeGST: this.consigneeGST,
      consigneeAddress: this.consigneeAddress,
      consigneePhone: this.consigneePhone,
      consigneeId: this.consigneeId,
      originLocId: effectiveoriginLocId,
      billingType: this.billingType,
      billingName: this.billingName,
      billingGSTIN: this.billingGSTIN,
      billingAddress: this.billingAddress,
      billingPhone: this.billingPhone,
      billingLocationId: this.billingLocationId,
      billingClientId: this.billingClientId,
      pickupType: this.pickupType,
      pickupName: this.pickupName,
      pickupAddress: this.pickupAddress,
      pickupPhone: this.pickupPhone,
      pickupPincode: this.pickupPincode,
      pickupLocationId: this.pickupLocationId,
      deliveryType: this.getDeliveryTypeForSave(),
      deliveryID: this.deliveryID,
      deliveryName: this.deliveryName,
        deliveryAddress: this.deliveryAddress,
        deliveryPhone: this.deliveryPhone,
        deliveryPincode: this.deliveryPincode,
        deliveryLocationId: this.deliveryLocationId,
        ewaybills: this.ewaybills,
        charges: this.charges,
        applyConsignorDiscount: this.applyConsignorDiscount,
        finalAmount: this.finalAmount,
        initialPaid: this.initialPaid
      };
    if (isAllHubs) {
      shipmentData.allHubs = true;
      shipmentData.originLocId= originLocId;
    }

    if (this.consignorTab === 'guest') shipmentData.consignorGST = 'GUEST';
    if (this.consigneeTab === 'guest') shipmentData.consigneeGST = 'GUEST';
    if (this.billingType === 'consignor') {
      shipmentData.billingName = this.consignor;
      shipmentData.billingAddress = this.consignorAddress;
      shipmentData.billingGSTIN = this.consignorGST;
      shipmentData.billingPhone = this.consignorPhone;
      shipmentData.billingClientId = this.consignorId;
    }
    if (this.pickupType === 'branch') {
      shipmentData.pickupName = this.pickupName;
      shipmentData.pickupAddress = this.pickupAddress;
      shipmentData.pickupPhone = this.pickupPhone;
    }
    if (this.deliveryType === 'consignee') {
      shipmentData.deliveryName = this.consignee;
      shipmentData.deliveryAddress = this.consigneeAddress;
      shipmentData.deliveryPhone = this.consigneePhone;
    }

    if (shipmentData.branch !== 'All Branches') {
      shipmentData.ewaybills = this.sanitizeEwaybills(shipmentData.ewaybills);
      this.http.post(
        '/api/newshipments/add?summary=true',
        shipmentData,
        { headers: { 'Content-Type': 'application/json' } }
      ).subscribe({
        next: () => {
          alert(`Shipment ${this.consignmentNumber} saved successfully!`);
          if (this.retryPricingAfterSave && this.pendingPricingUpdates.length) {
            this.updateClientPricing(this.pendingPricingUpdates).subscribe({
              next: () => {
                this.pendingPricingUpdates = [];
                this.retryPricingAfterSave = false;
              },
              error: () => {
                this.pendingPricingUpdates = [];
                this.retryPricingAfterSave = false;
              }
            });
          }
          this.getCurrentConsignmentNumber();
          this.resetForm();
          this.clearDraft(this.branch);
          this.isSaving = false;
        },
        error: err => {
          const msg = err?.error?.message || err?.message || 'Bad Request';
          if (msg.includes('E11000')) {
            alert('Consignment number already used. Refreshing number and please try again.');
            this.getCurrentConsignmentNumber();
          } else {
            alert('Error: ' + msg);
          }
          this.isSaving = false;
        }
      });
    } else {
      alert('Please select a branch before saving.');
      this.isSaving = false;
    }
  }

  private collectRateOverrides() {
    const overrides: Array<{
      productName: string;
      hsnNum?: string;
      enteredRate: number;
      suggestedRate: number | null;
      action: 'override' | 'suggest';
    }> = [];
    if (!this.selectedConsignorId) {
      return overrides;
    }
    for (const ewb of this.ewaybills) {
      for (const inv of ewb.invoices || []) {
        for (const prod of inv.products || []) {
          const name = String(prod.type || '').trim();
          if (!name) continue;
          const suggested = this.suggestedRates[name];
          const entered = Number(prod.ratePer) || 0;
          const hasValue =
            prod.ratePer !== null &&
            prod.ratePer !== undefined &&
            String(prod.ratePer).trim() !== '' &&
            entered !== 0;
          if (!hasValue) continue;
          if (suggested === null || suggested === undefined || entered !== Number(suggested)) {
            const match = this.productList.find((p) => p.productName === name);
            const suggestedValue = suggested === null || suggested === undefined ? null : Number(suggested);
            overrides.push({
              productName: name,
              hsnNum: match?.hsnNum,
              enteredRate: entered,
              suggestedRate: suggestedValue,
              action: 'override'
            });
          }
        }
      }
    }
    return overrides;
  }

  confirmRateOverride() {
    this.showRateOverrideModal = false;
    const updates = this.rateOverrides.filter((item) => item.action === 'suggest');
    if (!updates.length) {
      this.performSave();
      return;
    }
    this.ensureRouteLocationIds();
    this.pendingPricingUpdates = updates.map((item) => ({
      productName: item.productName,
      hsnNum: item.hsnNum,
      enteredRate: item.enteredRate
    }));
    this.retryPricingAfterSave = false;
    this.updateClientPricing(this.pendingPricingUpdates).subscribe({
      next: () => {
        this.pendingPricingUpdates = [];
        this.retryPricingAfterSave = false;
        this.performSave();
      },
      error: () => {
        this.retryPricingAfterSave = true;
        this.performSave();
      }
    });
  }

  private updateClientPricing(
    overrides: Array<{ productName: string; hsnNum?: string; enteredRate: number }>
  ): Observable<void> {
    const clientId = this.getClientIdForPricing();
    if (!clientId) {
      return of(void 0);
    }
    this.ensureRouteLocationIds();
    const pickupLocationId = String(this.pickupLocationId || '').trim();
    const deliveryLocationId = String(this.deliveryLocationId || '').trim();
    const updates = new Map<string, { productName: string; hsnNum?: string; ratePer: number }>();
    overrides.forEach((item) => {
      updates.set(item.productName, {
        productName: item.productName,
        hsnNum: item.hsnNum,
        ratePer: item.enteredRate
      });
    });
    const payloadBase = {
      consignmentNumber: String(this.consignmentNumber || '').trim(),
      rateUnit: this.rateUnit,
      updates: Array.from(updates.values())
    };
    const postPricing = (pickupId: string, deliveryId: string) =>
      this.http.post<void>(`/api/clients/${clientId}/pricing`, {
        pickupLocationId: pickupId,
        deliveryLocationId: deliveryId,
        ...payloadBase
      });
    if (
      (pickupLocationId && deliveryLocationId) ||
      (this.pickupType !== 'branch' && this.deliveryType !== 'branch')
    ) {
      return postPricing(pickupLocationId, deliveryLocationId);
    }
    return this.http.get<any[]>('/api/branches').pipe(
      switchMap((branches) => {
        const branchList = branches || [];
        const pickupSource = this.branchDetails ||
          branchList.find((b) => b.branchName === this.branch) ||
          null;
        const pickupId = pickupLocationId || this.getSelectedBranchAddressId(pickupSource) || '';
        const target = this.deliveryBranch || this.branch;
        const deliverySource =
          branchList.find((b) => b.branchName === target) ||
          (this.branchDetails?.branchName === target ? this.branchDetails : null);
        const deliveryId = deliveryLocationId || this.getSelectedBranchAddressId(deliverySource) || '';
        return postPricing(pickupId, deliveryId);
      })
    );
  }

  private ensureRouteLocationIds() {
    if (!this.pickupLocationId) {
      if (this.pickupType === 'branch') {
        const source = this.branchDetails ||
          (this.branches || []).find((b) => b.branchName === this.branch) ||
          null;
        this.pickupLocationId = this.getSelectedBranchAddressId(source);
      } else if (this.pickupSource.startsWith('consignor:')) {
        const locations = this.getPickupConsignorLocations();
        const byIndex = locations[Number(this.pickupLocationIndex)];
        this.pickupLocationId = this.getLocationId(byIndex) || this.getLocationId(locations[0]) || null;
      } else if (this.pickupSource.startsWith('billing:')) {
        const locations = this.getPickupBillingLocations();
        const byIndex = locations[Number(this.pickupLocationIndex)];
        this.pickupLocationId = this.getLocationId(byIndex) || this.getLocationId(locations[0]) || null;
      } else if (this.pickupSource.startsWith('different:')) {
        const locations = this.getPickupDifferentLocations();
        const byIndex = locations[Number(this.pickupLocationIndex)];
        this.pickupLocationId = this.getLocationId(byIndex) || this.getLocationId(locations[0]) || null;
      } else if (this.pickupType === 'consignor') {
        const locations = this.getPickupConsignorLocations();
        const byIndex = locations[Number(this.pickupLocationIndex)];
        this.pickupLocationId = this.getLocationId(byIndex) || this.getLocationId(locations[0]) || null;
      } else if (this.pickupType === 'different') {
        const locations = this.getPickupDifferentLocations();
        const byIndex = locations[Number(this.pickupLocationIndex)];
        this.pickupLocationId = this.getLocationId(byIndex) || this.getLocationId(locations[0]) || null;
      }
    }
    if (!this.deliveryLocationId) {
      if (this.deliveryType === 'branch') {
        const target = this.deliveryBranch || this.branch;
        const selected = (this.branches || []).find(b => b.branchName === target);
        const source = selected || (this.branchDetails?.branchName === target ? this.branchDetails : null);
        this.deliveryLocationId = this.getSelectedBranchAddressId(source);
      } else if (this.deliveryType === 'different') {
        const locations = this.getClientLocationsByName(this.deliveryPreviousReceiver);
        const byId = this.getLocationById(locations, this.deliveryLocationId);
        this.deliveryLocationId = this.getLocationId(byId) || this.deliveryLocationId || null;
      } else if (this.deliveryType === 'hub') {
        const addresses = this.getSelectedHubAddresses();
        const selected = addresses[Number(this.deliveryHubLocationIndex)];
        this.deliveryLocationId = this.getLocationId(selected);
      } else {
        const locations = this.getConsigneeLocations();
        const byId = this.getLocationById(locations, this.deliveryLocationId);
        const byIndex = locations[Number(this.deliveryLocationIndex)];
        this.deliveryLocationId =
          this.getLocationId(byId) ||
          this.getLocationId(byIndex) ||
          this.getLocationId(locations[0]) ||
          null;
      }
    }
  }

  private sanitizeEwaybills(ewaybills: any[]): any[] {
    return (ewaybills || []).map((ewb) => ({
      ...ewb,
      invoices: (ewb.invoices || []).map((inv: any) => ({
        ...inv,
        packages: (inv.packages || []).filter((p: any) => p?.type && Number(p?.amount) > 0),
        products: (inv.products || []).filter((p: any) => p?.type && Number(p?.amount) > 0)
      }))
    }));
  }

  private ensureProductAmounts(): boolean {
    let hasAnyProduct = false;
    for (const ewb of this.ewaybills) {
      let ewbHasProduct = false;
      for (const inv of ewb.invoices || []) {
        const validProducts = (inv.products || []).filter(
          (prod: any) => String(prod?.type || '').trim() && Number(prod?.amount) > 0
        );
        if (!validProducts.length) {
          alert('Please add at least one product to each invoice.');
          return false;
        }
        for (const prod of inv.products || []) {
          const type = String(prod?.type || '').trim();
          const amount = Number(prod?.amount || 0);
          if (!type && !amount) continue;
          if (!type) {
            alert('Please select a product type for all products.');
            return false;
          }
          if (amount <= 0) {
            alert('Please enter a quantity greater than 0 for all products.');
            return false;
          }
          ewbHasProduct = true;
          hasAnyProduct = true;
          if (!prod.instock || prod.instock <= 0) {
            prod.instock = amount;
          }
        }
      }
      if (!ewbHasProduct) {
        alert('Please add at least one product to each e-waybill.');
        return false;
      }
    }
    if (!hasAnyProduct) {
      alert('Please add at least one product before saving.');
      return false;
    }
    return true;
  }

  hasValidProduct(): boolean {
    for (const ewb of this.ewaybills) {
      for (const inv of ewb.invoices || []) {
        for (const prod of inv.products || []) {
          const type = String(prod?.type || '').trim();
          const amount = Number(prod?.amount || 0);
          if (type && amount > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }
  private setPincodeIfEmpty(target: 'pickup' | 'delivery', value?: string) {
    const pin = String(value || '').trim();
    if (!pin) return;
    if (target === 'pickup') {
      if (this.pickupPincode) return;
      this.pickupPincode = pin;
    } else {
      if (this.deliveryPincode) return;
      this.deliveryPincode = pin;
    }
    this.onRouteChange();
  }

  private getClientLocationsByName(name: string): any[] {
    const client = this.clientList.find(x => x.clientName === name);
    return Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
  }

  private normalizeClientName(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  getPickupDifferentClients(): any[] {
    const exclude = new Set<string>();
    if (this.consignorTab === 'consignor') {
      const name = this.normalizeClientName(this.consignor);
      if (name) exclude.add(name);
    }
    if (this.consigneeTab === 'consignee') {
      const name = this.normalizeClientName(this.consignee);
      if (name) exclude.add(name);
    }
    return (this.clientList || []).filter(c => {
      const name = this.normalizeClientName(c?.clientName);
      return name && !exclude.has(name);
    });
  }

  getPickupDifferentLocations(): any[] {
    const client = this.clientList.find(x => x.clientName === this.pickupPreviousSender);
    if (!client) return [];
    const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
    if (locations.length) return locations;
    if (client?.address) {
      return [{
        address: client.address,
        city: client.city,
        state: client.state,
        pinCode: client.pinCode
      }];
    }
    return [];
  }

  getDeliveryDifferentClients(): any[] {
    return this.getPickupDifferentClients();
  }

  getDeliverySelectedClientLocations(): any[] {
    const client = this.clientList.find(x => x.clientName === this.deliveryPreviousReceiver);
    if (!client) return [];
    const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
    if (locations.length) return locations;
    if (client?.address) {
      return [{
        address: client.address,
        city: client.city,
        state: client.state,
        pinCode: client.pinCode
      }];
    }
    return [];
  }

  private getBillingConsignorClient(): any | null {
    if (this.billingType === 'consignor') {
      if (this.consignorTab !== 'consignor') return null;
      return this.clientList.find(x => x.clientName === this.consignor) || null;
    }
    if (this.billingClientId) {
      return this.clientList.find(x => String(x?._id) === String(this.billingClientId)) || null;
    }
    if (this.billingPreviousSender) {
      return this.clientList.find(x => x.clientName === this.billingPreviousSender) || null;
    }
    return null;
  }

  getConsignorLocations(): any[] {
    return this.getClientLocationsByName(this.consignor);
  }

  getBillingConsignorLocations(): any[] {
    if (this.consignorTab === 'guest') {
      const guest = this.guestList.find(x => x.guestName === this.consignor);
      return this.buildFallbackLocation(guest);
    }
    const client = this.clientList.find(x => x.clientName === this.consignor);
    return this.buildClientLocations(client);
  }

  getPickupConsignorLocations(): any[] {
    if (this.consignorTab !== 'consignor') return [];
    return this.getConsignorLocations();
  }

  getPickupBillingLocations(): any[] {
    if (this.billingType !== 'different') return [];
    const resolved = this.getBillingSourceEntity(this.billingSource);
    if (!resolved) return [];
    if (resolved.kind === 'client') {
      const locations = Array.isArray(resolved.entity?.deliveryLocations)
        ? resolved.entity.deliveryLocations
        : [];
      if (locations.length) return locations;
      if (resolved.entity?.address) {
        return [{
          address: resolved.entity.address,
          city: resolved.entity.city,
          state: resolved.entity.state,
          pinCode: resolved.entity.pinCode
        }];
      }
      return [];
    }
    if (resolved.kind === 'hub') {
      return [{
        _id: resolved.entity?._id,
        address: resolved.entity?.address,
        city: resolved.entity?.city,
        state: resolved.entity?.state,
        pinCode: resolved.entity?.pinCode
      }];
    }
    return [];
  }

  getPickupSourceClientId(): string | null {
    if (this.pickupSource.startsWith('consignor:')) {
      const client = this.clientList.find(x => x.clientName === this.consignor);
      return client?._id ? String(client._id) : null;
    }
    if (this.pickupSource.startsWith('billing:')) {
      const resolved = this.getBillingSourceEntity(this.billingSource);
      if (resolved?.kind === 'client' && resolved.entity?._id) {
        return String(resolved.entity._id);
      }
    }
    return null;
  }

  getConsigneeLocations(): any[] {
    return this.getClientLocationsByName(this.consignee);
  }

  getBillingConsigneeLocations(): any[] {
    if (this.consigneeTab === 'guest') {
      const guest = this.guestList.find(x => x.guestName === this.consignee);
      return this.buildFallbackLocation(guest);
    }
    const client = this.clientList.find(x => x.clientName === this.consignee);
    return this.buildClientLocations(client);
  }

  private buildClientLocations(client: any): any[] {
    if (!client) return [];
    const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
    if (locations.length) return locations;
    return this.buildFallbackLocation(client);
  }

  private buildFallbackLocation(entity: any): any[] {
    if (!entity) return [];
    const address = entity?.address || entity?.location || '';
    const city = entity?.city || '';
    const state = entity?.state || '';
    const pinCode = entity?.pinCode ?? entity?.pincode ?? entity?.pin ?? '';
    if (!address && !city && !state && !pinCode) return [];
    return [{ address, city, state, pinCode }];
  }

  formatLocation(loc: any): string {
    const address = loc?.address || loc?.location;
    const parts = [address, loc?.city, loc?.state, this.getLocationPin(loc)].filter(Boolean);
    return parts.join(', ');
  }

  private getLocationPin(loc: any): string {
    return String(loc?.pinCode ?? loc?.pincode ?? loc?.pin ?? '').trim();
  }

  private getLocationId(loc: any): string | null {
    const id = loc?.delivery_id || loc?._id || loc?.id;
    return id ? String(id) : null;
  }

  private getPrimaryLocationId(locations: any[]): string | null {
    if (!Array.isArray(locations) || !locations.length) return null;
    return this.getLocationId(locations[0]);
  }

  private getLocationById(locations: any[], id: string | null): any | null {
    if (!id || !Array.isArray(locations)) return null;
    return locations.find((loc) => this.getLocationId(loc) === id) || null;
  }

  private getClientPinByName(name: string): string {
    const client = this.clientList.find(x => x.clientName === name);
    const pin = String(client?.pinCode ?? client?.pincode ?? client?.pin ?? '').trim();
    if (pin) return pin;
    const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
    return this.getLocationPin(locations[0]);
  }

  private getGuestPinByName(name: string): string {
    const guest = this.guestList.find(x => x.guestName === name);
    return String(guest?.pinCode ?? guest?.pincode ?? '').trim();
  }

  private updatePickupFromConsignor() {
    const client = this.getBillingConsignorClient();
    if (!client) return;
    this.pickupName = client.clientName || '';
    this.pickupPhone = client.phoneNum || '';
    const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
    const primaryLocation = locations[0];
    this.pickupAddress = primaryLocation ? this.formatLocation(primaryLocation) : (client.address || '');
    const pin = primaryLocation ? this.getLocationPin(primaryLocation) : this.getClientPinByName(client.clientName);
    if (pin) {
      this.pickupPincode = pin;
      this.onRouteChange();
    }
    this.pickupLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    this.pickupLocationIndex = '';
    if (!this.pickupSource || this.pickupSource === 'branch' || this.pickupSource === 'consignor-guest') {
      this.pickupSource = locations.length ? 'consignor:0' : 'branch';
    }
  }

  private updateBillingFromConsignor() {
    if (this.consignorTab === 'guest') {
      const guest = this.guestList.find(x => x.guestName === this.consignor);
      if (!guest) return;
      this.billingName = guest.guestName || '';
      this.billingGSTIN = 'GUEST';
      this.billingPhone = guest.phoneNum || '';
      const locations = this.getBillingConsignorLocations();
      const primaryLocation = locations[0];
      this.billingAddress = primaryLocation ? this.formatLocation(primaryLocation) : (guest.address || '');
      this.billingLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
      this.billingLocationIndex = locations.length ? 'consignor:0' : '';
      this.billingClientId = null;
      this.updatePaymentModeAvailability();
      this.syncBillingDiscount();
      return;
    }

    const client = this.clientList.find(x => x.clientName === this.consignor);
    if (!client) return;
    this.billingName = client.clientName || '';
    this.billingGSTIN = client.GSTIN || '';
    this.billingPhone = client.phoneNum || '';
    const locations = this.getBillingConsignorLocations();
    const primaryLocation = locations[0];
    this.billingAddress = primaryLocation ? this.formatLocation(primaryLocation) : (client.address || '');
    this.billingLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    this.billingLocationIndex = locations.length ? 'consignor:0' : '';
    this.billingClientId = client._id || null;
    this.updatePaymentModeAvailability();
    this.syncBillingDiscount();
    this.refreshPricingSuggestions();
  }

  private updateDeliveryFromConsignee() {
    if (this.consigneeTab === 'guest') {
      const guest = this.guestList.find(x => x.guestName === this.consignee);
      if (!guest) return;
      this.deliveryAddress = guest.address || '';
      this.deliveryPincode = String(guest?.pinCode ?? guest?.pincode ?? '').trim();
      this.deliveryLocationId = null;
      this.deliveryLocationIndex = '';
      this.deliveryID = guest._id || null;
      this.onRouteChange();
      this.updateReceiverCreditAvailability();
      return;
    }

    const client = this.clientList.find(x => x.clientName === this.consignee);
    if (!client) return;
    const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
    const primaryLocation = locations[0];
    this.deliveryAddress = primaryLocation ? this.formatLocation(primaryLocation) : (client.address || '');
    const pin = primaryLocation ? this.getLocationPin(primaryLocation) : this.getClientPinByName(client.clientName);
    if (pin) {
      this.deliveryPincode = pin;
      this.onRouteChange();
    }
    this.deliveryLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    this.deliveryLocationIndex = '';
    this.deliveryID = client._id || null;
    this.updateReceiverCreditAvailability();
  }

  setPickupType(type: 'branch' | 'consignor' | 'different') {
    this.pickupType = type;
    if (type === 'branch') {
      this.updatePickupFromBranch();
      return;
    }
    if (type === 'consignor') {
      this.updatePickupFromConsignor();
      return;
    }
    if (this.pickupPreviousSender) {
      this.onPickupPreviousSenderSelect(this.pickupPreviousSender);
    }
  }

  activatePickupPrimary() {
    this.pickupSource = 'branch';
    this.setPickupType('branch');
  }

  onPickupSourceSelect(value: string) {
    this.pickupSource = value;
    if (value === 'branch') {
      this.setPickupType('branch');
      return;
    }
    if (value === 'consignor-guest') {
      this.setPickupType('consignor');
      this.updatePickupFromConsignor();
      return;
    }
    if (value.startsWith('consignor:')) {
      const index = value.split(':')[1] || '';
      this.setPickupType('consignor');
      this.pickupLocationIndex = index;
      this.onPickupLocationSelect(index);
      return;
    }
    if (value.startsWith('billing:')) {
      const index = value.split(':')[1] || '';
      this.setPickupType('consignor');
      this.pickupLocationIndex = index;
      this.onPickupBillingLocationSelect(index);
    }
  }

  setBillingType(type: 'consignor' | 'different') {
    this.billingType = type;
    if (type === 'consignor') {
      this.updateBillingFromConsignor();
      if (this.pickupType === 'consignor' && this.pickupSource.startsWith('consignor:')) {
        this.updatePickupFromConsignor();
      }
      return;
    }
    this.billingSource = '';
    this.billingAddressOptions = [];
    this.billingLocationIndex = '';
    this.billingLocationId = null;
    this.billingPreviousSender = '';
    this.billingClientId = null;
      this.billingName = '';
      this.billingGSTIN = '';
      this.billingPhone = '';
      this.billingAddress = '';
      this.updatePaymentModeAvailability();
      this.syncBillingDiscount();
    }

  onDeliverySelfPickupToggle(event: any) {
    const enabled = Boolean(event?.target?.checked);
    if (enabled) {
      this.deliveryType = 'branch';
      this.deliveryTypeName = 'Customer Self Pickup';
      this.deliveryBranch = this.branch || '';
      this.deliveryHub = '';
      this.deliveryPreviousReceiver = '';
      this.deliveryLocationIndex = '';
      this.deliveryLocationId = null;
      this.deliveryID = null;
      this.updateDeliveryFromBranch();
      this.updateReceiverCreditAvailability();
      return;
    }
    this.deliveryBranch = '';
    this.deliveryHub = '';
    this.deliveryHubLocationIndex = '';
    this.setDeliveryToConsignee();
  }

  onDeliveryDifferentToggle(event: any) {
    const enabled = Boolean(event?.target?.checked);
    if (enabled) {
      this.deliveryType = 'different';
      this.deliveryTypeName = 'Out for delivery too';
      const preferredReceiver = this.deliveryPreviousReceiver || (this.consigneeTab === 'consignee' ? this.consignee : '');
      if (preferredReceiver) {
        this.deliveryPreviousReceiver = preferredReceiver;
        this.onDeliveryPreviousReceiverSelect(preferredReceiver);
      } else {
        this.deliveryName = '';
        this.deliveryAddress = '';
        this.deliveryPhone = '';
        this.deliveryPincode = '';
        this.deliveryLocationIndex = '';
        this.deliveryLocationId = null;
        this.deliveryID = null;
        this.onRouteChange();
        this.updateReceiverCreditAvailability();
      }
      return;
    }
    this.setDeliveryToConsignee();
  }

  private setDeliveryToConsignee() {
    this.deliveryType = 'consignee';
    this.deliveryTypeName = 'Out for delivery too';
    this.deliveryPreviousReceiver = '';
    this.deliveryLocationIndex = '';
    this.deliveryLocationId = null;
    this.deliveryName = '';
    this.deliveryAddress = '';
    this.deliveryPhone = '';
    this.deliveryPincode = '';
    this.deliveryID = null;
    this.updateDeliveryFromConsignee();
    this.onRouteChange();
    this.updateReceiverCreditAvailability();
  }

  setDeliveryType(type: 'branch' | 'hub' | 'consignee' | 'different') {
    this.deliveryType = type;
    if (type === 'branch') {
      if (!this.deliveryBranch) this.deliveryBranch = this.branch;
      this.deliveryHubLocationIndex = '';
      this.updateDeliveryFromBranch();
      return;
    }
    if (type === 'hub') {
      this.deliveryHubLocationIndex = '';
      if (!this.deliveryHub) {
        const hubs = this.getAvailableHubs();
        if (hubs.length === 1) {
          this.deliveryHub = hubs[0].hubName;
        }
      }
      this.updateDeliveryFromHub();
      return;
    }
    if (type === 'consignee') {
      this.updateDeliveryFromConsignee();
      return;
    }
    if (this.deliveryPreviousReceiver) {
      this.onDeliveryPreviousReceiverSelect(this.deliveryPreviousReceiver);
    }
  }

  setDeliveryPickupTab() {
    if (this.deliveryType === 'branch' || this.deliveryType === 'hub') return;
    this.deliveryType = 'branch';
    if (!this.deliveryBranch) this.deliveryBranch = this.branch;
    this.deliveryHubLocationIndex = '';
    this.updateDeliveryFromBranch();
  }

  onDeliveryBranchSelect(name: string) {
    this.deliveryBranch = name;
    this.updateDeliveryFromBranch();
  }

  onDeliveryHubSelect(name: string) {
    this.deliveryHub = name;
    this.updateDeliveryFromHub();
  }

  onDeliveryPickupSelect(value: string) {
    if (!value) return;
    const [kind, name] = value.split(':');
    if (kind === 'hub') {
      this.deliveryType = 'hub';
      this.deliveryHub = name || '';
      this.deliveryHubLocationIndex = '';
      this.updateDeliveryFromHub();
      return;
    }
    if (kind === 'branch') {
      this.deliveryType = 'branch';
      this.deliveryBranch = name || '';
      this.deliveryHubLocationIndex = '';
      this.updateDeliveryFromBranch();
    }
  }

  onHubDeliveryAddressSelect(index: string) {
    if (index === '') return;
    this.deliveryHubLocationIndex = index;
    const hub = this.getSelectedHub();
    if (!hub) return;
    const options = this.getSelectedHubAddresses();
    const selected = options[Number(index)];
    if (!selected) return;
    this.deliveryAddress = this.formatLocation(selected);
    this.deliveryPincode = String(this.getLocationPin(selected) || hub.pinCode || '').trim();
    this.deliveryLocationId = this.getLocationId(selected);
    this.onRouteChange();
  }

  private getDeliveryTypeForSave(): string {
    if (this.deliveryType === 'branch' || this.deliveryType === 'hub') {
      return 'Customer self pick up';
    }
    if (this.deliveryType === 'different') {
      return 'Out for Delivery';
    }
    return this.deliveryType;
  }

  private getBillingSourceEntity(value: string): { kind: 'client' | 'hub'; entity: any } | null {
    if (!value) return null;
    const [kind, id] = value.split(':');
    if (kind === 'client') {
      const entity = this.clientList.find(c => String(c?._id) === String(id)) || null;
      return entity ? { kind: 'client', entity } : null;
    }
    if (kind === 'hub') {
      const entity = (this.hubs || []).find(h => String(h?._id) === String(id)) || null;
      return entity ? { kind: 'hub', entity } : null;
    }
    return null;
  }

  private buildBillingAddressOptions(value: string): Array<{ label: string; locationId: string | null; address: string }> {
    const result: Array<{ label: string; locationId: string | null; address: string }> = [];
    const resolved = this.getBillingSourceEntity(value);
    if (!resolved) return result;
    if (resolved.kind === 'client') {
      const locations = Array.isArray(resolved.entity?.deliveryLocations) ? resolved.entity.deliveryLocations : [];
      locations.forEach((loc: any) => {
        const label = this.formatLocation(loc);
        const locationId = this.getLocationId(loc);
        if (!label) return;
        result.push({ label, locationId, address: label });
      });
      if (!result.length && resolved.entity?.address) {
        const label = String(resolved.entity.address || '').trim();
        if (label) {
          result.push({ label, locationId: null, address: label });
        }
      }
      return result;
    }
    if (resolved.kind === 'hub') {
      const label = this.formatHubAddress(resolved.entity);
      if (label) {
        result.push({ label, locationId: resolved.entity?._id ? String(resolved.entity._id) : null, address: label });
      }
    }
    return result;
  }

  onBillingSourceSelect(value: string, preserve = false) {
    this.billingSource = value;
    const resolved = this.getBillingSourceEntity(value);
    this.billingAddressOptions = this.buildBillingAddressOptions(value);
    if (!preserve) {
      this.billingLocationIndex = '';
      this.billingLocationId = null;
      this.billingPreviousSender = '';
      this.billingClientId = null;
      this.billingName = '';
      this.billingGSTIN = '';
      this.billingPhone = '';
      this.billingAddress = '';
      this.updatePaymentModeAvailability();
    }
    if (!resolved) {
      this.syncBillingDiscount();
      return;
    }
      if (resolved.kind === 'client') {
        this.billingName = resolved.entity.clientName || '';
        this.billingGSTIN = resolved.entity.GSTIN || '';
        this.billingPhone = resolved.entity.phoneNum || '';
        this.billingClientId = resolved.entity._id || null;
        this.billingPreviousSender = resolved.entity.clientName || '';
        this.updatePaymentModeAvailability();
        this.syncBillingDiscount();
        return;
      }
      if (resolved.kind === 'hub') {
        this.billingName = resolved.entity.hubName || '';
        this.billingGSTIN = '';
        this.billingPhone = resolved.entity.phoneNum || '';
        this.billingClientId = resolved.entity._id || null;
        this.billingPreviousSender = resolved.entity.hubName || '';
        this.updatePaymentModeAvailability();
        this.syncBillingDiscount();
      }
  }

  onBillingAddressSelect(index: string, preserve = false) {
    this.billingLocationIndex = index;
    const option = this.billingAddressOptions[Number(index)];
    if (!option) return;
    this.billingAddress = option.address || '';
    this.billingLocationId = option.locationId;
    if (!preserve) {
      this.refreshPricingSuggestions();
    }
  }

  onBillingLocationSelect(index: string) {
    this.billingLocationIndex = index;
    const raw = String(index || '').trim();
    if (!raw) return;
    let kind: 'consignor' | 'consignee' = 'consignor';
    let indexText = raw;
    if (raw.includes(':')) {
      const [prefix, idx] = raw.split(':');
      if (prefix === 'consignee') {
        kind = 'consignee';
      }
      indexText = idx;
    }
    const parsedIndex = Number(indexText);
    if (Number.isNaN(parsedIndex)) return;
    const locations = kind === 'consignee' ? this.getBillingConsigneeLocations() : this.getBillingConsignorLocations();
    const loc = locations[parsedIndex];
    if (!loc) return;
    this.billingAddress = this.formatLocation(loc);
    this.billingLocationId = this.getLocationId(loc);
    this.syncBillingDiscount();
    this.refreshPricingSuggestions();
    if (this.pickupType === 'consignor' && this.pickupSource.startsWith('consignor:')) {
      this.updatePickupFromConsignor();
    }
  }

  private applyBillingAddressDefaultForPaymentMode(): boolean {
    if (this.billingType !== 'consignor') return false;
    if (this.isToPayMode()) {
      const consigneeLocations = this.getBillingConsigneeLocations();
      if (consigneeLocations.length) {
        this.billingLocationIndex = 'consignee:0';
        this.onBillingLocationSelect(this.billingLocationIndex);
        return true;
      }
    }
    const consignorLocations = this.getBillingConsignorLocations();
    if (consignorLocations.length) {
      this.billingLocationIndex = 'consignor:0';
      this.onBillingLocationSelect(this.billingLocationIndex);
      return true;
    }
    return false;
  }

  onBillingPreviousSenderSelect(name: string) {
    const selected = this.clientList.find(c => c.clientName === name);
    if (!selected) return;
    this.billingName = selected.clientName || '';
    this.billingGSTIN = selected.GSTIN || '';
    this.billingPhone = selected.phoneNum || '';
    const locations = Array.isArray(selected.deliveryLocations) ? selected.deliveryLocations : [];
    const primaryLocation = locations[0];
    this.billingAddress = primaryLocation ? this.formatLocation(primaryLocation) : (selected.address || '');
    this.billingLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    this.billingClientId = selected._id || null;
    this.billingLocationIndex = '';
    this.updatePaymentModeAvailability();
    this.syncBillingDiscount();
    this.refreshPricingSuggestions();
    if (this.pickupType === 'consignor' && this.pickupSource.startsWith('consignor:')) {
      this.updatePickupFromConsignor();
    }
  }

  onPickupLocationSelect(index: string) {
    this.pickupLocationIndex = index;
    const locations = this.getBillingConsignorLocations();
    const loc = locations[Number(index)];
    if (!loc) return;
    const client = this.getBillingConsignorClient();
    if (client) {
      this.pickupName = client.clientName || '';
      this.pickupPhone = client.phoneNum || '';
    }
    this.pickupAddress = this.formatLocation(loc);
    this.pickupPincode = this.getLocationPin(loc);
    this.pickupLocationId = this.getLocationId(loc);
    this.pickupSource = `consignor:${index}`;
    this.onRouteChange();
  }

  onPickupBillingLocationSelect(index: string) {
    this.pickupLocationIndex = index;
    const locations = this.getPickupBillingLocations();
    const loc = locations[Number(index)];
    if (!loc) return;
    const resolved = this.getBillingSourceEntity(this.billingSource);
    if (resolved?.kind === 'client') {
      this.pickupName = resolved.entity.clientName || '';
      this.pickupPhone = resolved.entity.phoneNum || '';
    } else if (resolved?.kind === 'hub') {
      this.pickupName = resolved.entity.hubName || '';
      this.pickupPhone = resolved.entity.phoneNum || '';
    }
    this.pickupAddress = this.formatLocation(loc);
    this.pickupPincode = this.getLocationPin(loc);
    this.pickupLocationId = this.getLocationId(loc);
    this.pickupSource = `billing:${index}`;
    this.onRouteChange();
  }

  openPickupEditClient() {
    const clientId = this.getPickupSourceClientId();
    if (!clientId) return;
    this.openClientModalForEdit(clientId);
  }

  onPickupPreviousSenderSelect(name: string) {
    const selected = this.clientList.find(c => c.clientName === name);
    if (!selected) return;
    this.pickupName = selected.clientName || '';
    this.pickupPhone = selected.phoneNum || '';
    const locations = Array.isArray(selected.deliveryLocations) ? selected.deliveryLocations : [];
    const primaryLocation = locations[0];
    this.pickupAddress = primaryLocation ? this.formatLocation(primaryLocation) : (selected.address || '');
    this.pickupPincode = primaryLocation ? this.getLocationPin(primaryLocation) : '';
    this.pickupLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    const options = this.getPickupDifferentLocations();
    this.pickupLocationIndex = options.length ? '0' : '';
    this.pickupSource = options.length ? 'different:0' : this.pickupSource;
    this.onRouteChange();
  }

  onPickupDifferentLocationSelect(index: string) {
    this.pickupLocationIndex = index;
    const locations = this.getPickupDifferentLocations();
    const loc = locations[Number(index)];
    if (!loc) return;
    const client = this.clientList.find(c => c.clientName === this.pickupPreviousSender);
    if (client) {
      this.pickupName = client.clientName || '';
      this.pickupPhone = client.phoneNum || '';
    }
    this.pickupAddress = this.formatLocation(loc);
    this.pickupPincode = this.getLocationPin(loc);
    this.pickupLocationId = this.getLocationId(loc);
    this.pickupSource = `different:${index}`;
    this.onRouteChange();
  }

  onDeliveryLocationSelect(index: string) {
    this.deliveryLocationIndex = index;
    const locations = this.getConsigneeLocations();
    const loc = locations[Number(index)];
    if (!loc) return;
    this.deliveryAddress = this.formatLocation(loc);
    this.deliveryPincode = this.getLocationPin(loc);
    this.deliveryLocationId = this.getLocationId(loc);
    const client = this.clientList.find(x => x.clientName === this.consignee);
    this.deliveryID = client?._id || this.deliveryID;
    this.onRouteChange();
  }

  onDeliveryPreviousReceiverSelect(name: string) {
    const selected = this.clientList.find(c => c.clientName === name);
    if (!selected) return;
    this.deliveryType = 'different';
    this.deliveryName = selected.clientName || '';
    this.deliveryPhone = selected.phoneNum || '';
    const locations = Array.isArray(selected.deliveryLocations) ? selected.deliveryLocations : [];
    const primaryLocation = locations[0];
    this.deliveryAddress = primaryLocation ? this.formatLocation(primaryLocation) : (selected.address || '');
    this.deliveryPincode = primaryLocation ? this.getLocationPin(primaryLocation) : '';
    this.deliveryLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    const options = this.getDeliverySelectedClientLocations();
    this.deliveryLocationIndex = options.length ? '0' : '';
    this.deliveryID = selected._id || null;
    this.onRouteChange();
    this.updateReceiverCreditAvailability();
  }

  onDeliverySelectedLocationSelect(index: string) {
    this.deliveryLocationIndex = index;
    const locations = this.getDeliverySelectedClientLocations();
    const loc = locations[Number(index)];
    if (!loc) return;
    const client = this.clientList.find(c => c.clientName === this.deliveryPreviousReceiver);
    if (client) {
      this.deliveryName = client.clientName || '';
      this.deliveryPhone = client.phoneNum || '';
      this.deliveryID = client._id || null;
    }
    this.deliveryAddress = this.formatLocation(loc);
    this.deliveryPincode = this.getLocationPin(loc);
    this.deliveryLocationId = this.getLocationId(loc);
    this.deliveryType = 'different';
    this.onRouteChange();
    this.updateReceiverCreditAvailability();
  }

  // SELECT HANDLERS
  onConsignorSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consignorGST = c.GSTIN;
      this.consignorAddress = c.address;
      this.consignorPhone = c.phoneNum;
      this.selectedConsignorId = c._id;
      this.consignorId = c._id;
      if (this.pickupType === 'consignor') {
        this.updatePickupFromConsignor();
      }
      if (this.billingType === 'consignor') {
        this.updateBillingFromConsignor();
      } else {
        this.billingLocationId = null;
        this.billingLocationIndex = '';
      }
      this.pickupLocationIndex = '';
      this.refreshPricingSuggestions();
    }
    this.updatePaymentModeAvailability();
  }

  onConsigneeSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consigneeGST = c.GSTIN;
      this.consigneeAddress = c.address;
      this.consigneePhone = c.phoneNum;
      this.consigneeId = c._id;
      if (
        this.deliveryType === 'different' &&
        (!this.deliveryPreviousReceiver || this.deliveryPreviousReceiver === this.lastConsigneeName)
      ) {
        this.deliveryPreviousReceiver = name;
        this.onDeliveryPreviousReceiverSelect(this.deliveryPreviousReceiver);
      }
      if (this.deliveryType === 'consignee') {
        this.updateDeliveryFromConsignee();
      }
      this.deliveryLocationIndex = '';
    }
    this.lastConsigneeName = name || '';
    this.updateReceiverCreditAvailability();
    this.applyBillingAddressDefaultForPaymentMode();
    this.recomputeTaxFromCurrentBase();
  }

  onConsignorGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consignorGST = 'GUEST';
      this.consignorAddress = g.address;
      this.consignorPhone = g.phoneNum;
      this.selectedConsignorId = null;
      this.consignorId = g._id || null;
      if (this.pickupType === 'consignor') {
        this.updatePickupFromConsignor();
      }
      if (this.billingType === 'consignor') {
        this.updateBillingFromConsignor();
      } else {
        this.billingLocationId = null;
        this.billingLocationIndex = '';
      }
      this.pickupLocationIndex = '';
      this.suggestedRates = {};
    }
    this.updatePaymentModeAvailability();
  }

  private syncBillingDiscount() {
    const locationClientId = this.getClientIdByLocationId(this.billingLocationId);
    const billingClientId = String(this.billingClientId || '').trim();
    let client: any | null = null;
    if (locationClientId) {
      client = this.clientList.find(x => String(x?._id) === String(locationClientId)) || null;
    }
    if (!client && billingClientId) {
      client = this.clientList.find(x => String(x?._id) === billingClientId) || null;
    }
    if (!client && this.billingType === 'consignor' && this.consignorTab === 'consignor') {
      const name = (this.consignor || '').trim();
      if (name) {
        client = this.clientList.find(x => x.clientName === name) || null;
      }
    }
    const percent = this.roundCurrency(Number(client?.perDis) || 0);
    this.maxConsignorDiscount = percent;
    if (this.finalAmount > 0 && this.quoteSubtotal > 0) {
      this.syncDiscountFromFinalAmount();
    } else {
      this.charges.consignorDiscount = percent;
    }
  }

  onConsignorDiscountChange(value: any) {
    const raw = Number(value);
    const clamped = Math.max(0, Math.min(Number.isFinite(raw) ? raw : 0, this.maxConsignorDiscount));
    this.charges.consignorDiscount = this.roundCurrency(clamped);
    this.scheduleQuote();
  }

  isDiscountOverLimit(): boolean {
    const current = Number(this.charges?.consignorDiscount) || 0;
    const limit = Number(this.maxConsignorDiscount) || 0;
    return current > limit + 1e-6;
  }

  onFinalAmountChange(value: any) {
    const raw = Number(value);
    const finalAmount = Number.isFinite(raw) ? raw : 0;
    this.finalAmount = this.roundCurrency(finalAmount);
    this.syncDiscountFromFinalAmount();
  }

  private syncDiscountFromFinalAmount() {
    if (this.quoteSubtotal <= 0) return;
    let rate = Number(this.igstPercent) || 0;
    if (rate === 5 && this.isBillingClient()) {
      rate = 0;
    }
    const multiplier = 1 + rate / 100;
    const taxable = multiplier > 0 ? this.finalAmount / multiplier : this.finalAmount;
    this.taxableValue = this.roundCurrency(taxable);
    this.igstAmount = this.roundCurrency(this.finalAmount - this.taxableValue);
    const discountPercent = ((this.quoteSubtotal - this.taxableValue) / this.quoteSubtotal) * 100;
    const safePercent = Number.isFinite(discountPercent) ? discountPercent : 0;
    this.charges.consignorDiscount = this.roundCurrency(Math.max(0, safePercent));
  }

  onRateUnitChange() {
    this.refreshPricingSuggestions();
  }

  onPaymentModeChange() {
    if (this.isToPayMode()) {
      this.shipmentStatus = 'To Pay';
      this.applyBillingAddressDefaultForPaymentMode();
      this.recomputeTaxFromCurrentBase();
      return;
    }
    if (this.shipmentStatus === 'To Pay') {
      this.shipmentStatus = 'Pending';
    }
    this.applyBillingAddressDefaultForPaymentMode();
    this.recomputeTaxFromCurrentBase();
  }

  onRouteChange() {
    this.refreshPricingSuggestions();
  }

  onProductTypeChange(product: any) {
    const suggested = this.getSuggestedRate(product);
    if (suggested === null) return;
    const hasValue =
      product.ratePer !== null &&
      product.ratePer !== undefined &&
      String(product.ratePer).trim() !== '' &&
      Number(product.ratePer) !== 0;
    if (!hasValue) {
      product.ratePer = suggested;
      this.scheduleQuote();
    }
  }

  onConsigneeGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consigneeGST = 'GUEST';
      this.consigneeAddress = g.address;
      this.consigneePhone = g.phoneNum;
      this.consigneeId = g._id || null;
      if (this.deliveryType === 'different' && this.deliveryPreviousReceiver === this.lastConsigneeName) {
        this.deliveryPreviousReceiver = '';
      }
      if (this.deliveryType === 'consignee') {
        this.updateDeliveryFromConsignee();
      }
      this.deliveryLocationIndex = '';
    }
    this.lastConsigneeName = '';
    this.updateReceiverCreditAvailability();
    this.applyBillingAddressDefaultForPaymentMode();
    this.recomputeTaxFromCurrentBase();
  }

  onPackageList(name: string) {
    this.pkgList.find(x => x.pkgName === name);
  }

  onProductList(name: string) {
    this.productList.find(x => x.productName === name);
  }

  formatClientOption(client: any): string {
    const gstin = client?.GSTIN || '-';
    const name = client?.clientName || '-';
    const address = client?.address || '-';
    return `${gstin} | ${name} | ${address}`;
  }

  formatGuestOption(guest: any): string {
    const name = guest?.guestName || '-';
    const address = guest?.address || '-';
    return `- | ${name} | ${address}`;
  }

  private formatBranchAddress(branch: any): string {
    if (!branch) return '';
    const parts = [
      branch.address,
      branch.city,
      branch.state,
      branch.pinCode
    ].filter(Boolean);
    return parts.join(', ');
  }

  private getSelectedBranchAddressId(branch: any): string | null {
    const addresses = Array.isArray(branch?.addresses) ? branch.addresses : [];
    const first = addresses[0] || null;
    if (first) {
      return this.getLocationId(first);
    }
    return branch?._id ? String(branch._id) : null;
  }

  private formatHubAddress(hub: any): string {
    if (!hub) return '';
    const parts = [
      hub.address,
      hub.city,
      hub.state,
      hub.pinCode
    ].filter(Boolean);
    return parts.join(', ');
  }

  private getSelectedHub(): any | null {
    const target = String(this.deliveryHub || '').trim();
    if (!target) return null;
    return (this.hubs || []).find(h => h.hubName === target) || null;
  }

  getSelectedHubAddresses(): any[] {
    const hub = this.getSelectedHub();
    if (!hub) return [];
    const result: any[] = [];
    if (hub.address) {
      result.push({
        address: hub.address,
        city: hub.city,
        state: hub.state,
        pinCode: hub.pinCode
      });
    }
    const extra = Array.isArray(hub.deliveryAddresses) ? hub.deliveryAddresses : [];
    extra.forEach((loc: any) => {
      if (!loc) return;
      result.push({ ...loc, location: loc.location });
    });
    return result;
  }

  private updatePickupFromBranch() {
    if (!this.branchDetails || this.branch === 'All Branches') {
      this.pickupType = 'branch';
      this.pickupName = '';
      this.pickupAddress = '';
      this.pickupPhone = '';
      this.pickupPincode = '';
      this.pickupLocationIndex = '';
      this.pickupLocationId = null;
      this.pickupSource = 'branch';
      return;
    }

    this.pickupType = 'branch';
    this.pickupName = this.branchDetails.branchName || this.branch;
    this.pickupAddress = this.formatBranchAddress(this.branchDetails);
    this.pickupPhone = this.branchDetails.phoneNum || '';
    this.pickupPincode = String(this.branchDetails.pinCode || '').trim();
    this.pickupLocationIndex = '';
    this.pickupLocationId = this.getSelectedBranchAddressId(this.branchDetails);
    this.pickupSource = 'branch';
    this.onRouteChange();
  }

  private updateDeliveryFromBranch() {
    const target = String(this.deliveryBranch || this.branch || '').trim();
    if (!target) {
      this.deliveryName = '';
      this.deliveryAddress = '';
      this.deliveryPhone = '';
      this.deliveryPincode = '';
      this.deliveryLocationIndex = '';
      this.deliveryLocationId = null;
      return;
    }
    const selected = (this.branches || []).find(b => b.branchName === target);
    const source = selected || (this.branchDetails?.branchName === target ? this.branchDetails : null);
    if (!source) {
      return;
    }
    this.deliveryID = source._id || null;
    this.deliveryBranch = source.branchName || target;
    this.deliveryName = source.branchName || target;
    this.deliveryAddress = this.formatBranchAddress(source);
    this.deliveryPhone = source.phoneNum || '';
    this.deliveryPincode = String(source.pinCode || '').trim();
    this.deliveryLocationIndex = '';
    this.deliveryLocationId = this.getSelectedBranchAddressId(source);
    this.onRouteChange();
  }

  private updateDeliveryFromHub() {
    const target = String(this.deliveryHub || '').trim();
    if (!target) {
      this.deliveryID = null;
      this.deliveryName = '';
      this.deliveryAddress = '';
      this.deliveryPhone = '';
      this.deliveryPincode = '';
      this.deliveryHubLocationIndex = '';
      this.deliveryLocationIndex = '';
      this.deliveryLocationId = null;
      return;
    }
    const hub = this.getSelectedHub();
    if (!hub) {
      return;
    }
    this.deliveryID = hub._id || null;
    this.deliveryName = hub.hubName || target;
    const addressOptions = this.getSelectedHubAddresses();
    if (!this.deliveryHubLocationIndex && addressOptions.length) {
      this.deliveryHubLocationIndex = '0';
    }
    const selected = addressOptions[Number(this.deliveryHubLocationIndex)];
    this.deliveryAddress = selected ? this.formatLocation(selected) : (hub.address || '');
    this.deliveryPhone = hub.phoneNum || '';
    this.deliveryPincode = String(this.getLocationPin(selected) || hub.pinCode || '').trim();
    this.deliveryLocationIndex = '';
    this.deliveryLocationId = this.getLocationId(selected);
    this.onRouteChange();
  }

  getAvailableHubs(): any[] {
    const allHubs = this.hubs || [];
    const assignedoriginLocIds = this.isAdmin ? [] : this.getAssignedoriginLocIds();
    const scopedHubs = this.isAdmin
      ? allHubs
      : (assignedoriginLocIds.length
          ? allHubs.filter((h) => assignedoriginLocIds.includes(String(h?.originLocId || '').trim()))
          : []);
    if (this.branch && this.branch !== 'All Branches' && this.branch !== 'All Hubs') {
      const originLocId = String(localStorage.getItem('originLocId') || '').trim();
      return scopedHubs.filter((h) =>
        String(h?.branch || '') === this.branch || (originLocId && String(h?.originLocId || '') === originLocId)
      );
    }
    return scopedHubs;
  }

  private getSelectedAllHub(): any | null {
    const hubId = String(this.selectedAllHubId || '').trim();
    if (!hubId) return null;
    return (this.hubs || []).find(h => String(h?._id || '') === hubId) || null;
  }

  onAllHubsSelect(value: string) {
    this.selectedAllHubId = value;
    this.getCurrentConsignmentNumber();
  }

  getAllHubsOptions(): any[] {
    if (this.isAdmin) return this.hubs || [];
    const originLocIds = this.getAssignedoriginLocIds();
    if (!originLocIds.length) return [];
    return (this.hubs || []).filter((hub: any) =>
      originLocIds.includes(String(hub?.originLocId || '').trim())
    );
  }

  get isAllHubsSelectionRequired(): boolean {
    return this.branch === 'All Hubs' && !String(this.selectedAllHubId || '').trim();
  }

  private getAssignedoriginLocIds(): string[] {
    try {
      const storedIds = JSON.parse(localStorage.getItem('originLocIds') || '[]');
      if (!Array.isArray(storedIds)) return [];
      return storedIds
        .map((id: any) => String(id || '').trim())
        .filter((id: string) => id);
    } catch {
      return [];
    }
  }

  private loadBranchDetails() {
    this.http.get<any[]>('/api/branches')
      .subscribe({
        next: (branches) => {
          this.branches = branches || [];
          this.rebuildRateAddressOptions();
          this.branchDetails = this.branches.find(b => b.branchName === this.branch) || null;
          const storedoriginLocId = localStorage.getItem('originLocId') || 'all';
          const resolvedoriginLocId = this.branchDetails?._id ? String(this.branchDetails._id) : '';
          if (
            this.branch &&
            this.branch !== 'All Branches' &&
            resolvedoriginLocId &&
            (storedoriginLocId === 'all' || !storedoriginLocId)
          ) {
            localStorage.setItem('originLocId', resolvedoriginLocId);
            this.newClient.originLocId = resolvedoriginLocId;
            this.getCurrentConsignmentNumber();
            this.loadLists();
          }
          this.updatePickupFromBranch();
          if (this.deliveryType === 'branch') {
            this.updateDeliveryFromBranch();
          }
        },
        error: () => {
          this.branches = [];
          this.branchDetails = null;
          this.rebuildRateAddressOptions();
          this.updatePickupFromBranch();
        }
      });
  }

  private rebuildRateAddressOptions() {
    const options: Array<{ id: string; label: string }> = [];

    (this.branches || []).forEach((branch: any) => {
      const addresses = Array.isArray(branch?.addresses) ? branch.addresses : [];
      addresses.forEach((addr: any) => {
        const id = String(addr?._id || '').trim();
        if (!id) return;
        const parts = [addr.address, addr.city, addr.state, addr.pinCode].filter(Boolean);
        const label = `Branch: ${branch?.branchName || ''} - ${parts.join(', ')}`;
        options.push({ id, label });
      });
      if (!addresses.length && branch?._id) {
        const parts = [branch.address, branch.city, branch.state, branch.pinCode].filter(Boolean);
        const label = `Branch: ${branch?.branchName || ''} - ${parts.join(', ')}`.trim();
        options.push({ id: String(branch._id), label });
      }
    });

    (this.hubs || []).forEach((hub: any) => {
      const addresses = Array.isArray(hub?.deliveryAddresses) ? hub.deliveryAddresses : [];
      addresses.forEach((addr: any) => {
        const id = String(addr?._id || '').trim();
        if (!id) return;
        const label = `Hub: ${hub?.hubName || ''} - ${addr?.location || ''}`.trim();
        options.push({ id, label });
      });
    });

    (this.rateAddressClients || this.clientList || []).forEach((client: any) => {
      const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
      locations.forEach((loc: any) => {
        const id = String(loc?.delivery_id || loc?._id || '').trim();
        if (!id) return;
        const parts = [loc.address, loc.city, loc.state, loc.pinCode].filter(Boolean);
        const label = `Client: ${client?.clientName || ''} - ${parts.join(', ')}`;
        options.push({ id, label });
      });
    });

    this.rateAddressOptions = options;
    this.rateAddressLabelById = new Map(options.map((o) => [o.id, o.label]));
  }

  private updatePaymentModeAvailability() {
    const billingClientId = String(this.billingClientId || '').trim();
    const client = billingClientId
      ? this.clientList.find(x => String(x?._id) === billingClientId)
      : null;
    const creditType = String(client?.creditType || '').toLowerCase();
    this.allowAccountCredit = creditType === 'credit' || creditType === 'credit allowed';
    this.paymentMode = this.allowAccountCredit ? 'Account Credit' : 'To Pay';
    this.onPaymentModeChange();
    this.updateReceiverCreditAvailability();
  }

  isPaymentModeEnabled(): boolean {
    const hasConsignor = Boolean(String(this.consignor || '').trim());
    const hasConsignee = Boolean(String(this.consignee || '').trim());
    return hasConsignor && hasConsignee;
  }

  private getReceiverCreditClient(): any | null {
    if (this.consigneeTab === 'consignee') {
      if (this.consigneeId) {
        return this.clientList.find(x => String(x?._id) === String(this.consigneeId)) || null;
      }
      if (this.consignee) {
        return this.clientList.find(x => x.clientName === this.consignee) || null;
      }
    }
    if (this.deliveryPreviousReceiver) {
      return this.clientList.find(x => x.clientName === this.deliveryPreviousReceiver) || null;
    }
    if (this.deliveryID) {
      return this.clientList.find(x => String(x?._id) === String(this.deliveryID)) || null;
    }
    return null;
  }

  private updateReceiverCreditAvailability() {
    const client = this.getReceiverCreditClient();
    const creditType = String(client?.creditType || '').toLowerCase();
    this.allowReceiverCredit = creditType === 'credit' || creditType === 'credit allowed';
    if (!this.allowReceiverCredit && this.paymentMode === 'To Pay with account credit') {
      this.paymentMode = 'To Pay';
      this.onPaymentModeChange();
    }
  }

  private isToPayMode(mode: string | null = null): boolean {
    const value = String(mode ?? this.paymentMode);
    return value === 'To Pay' || value === 'To Pay with account credit';
  }

  getSuggestedRate(product: any): number | null {
    const name = String(product?.type || '').trim();
    if (!name) return null;
    const value = this.suggestedRates[name];
    if (value === null || value === undefined) return null;
    return Number(value) || 0;
  }

  private buildSuggestionKey(clientId: string | null): string {
    const originLocId = localStorage.getItem('originLocId') || '';
    return [
      clientId || '',
      originLocId || this.branch || '',
      String(this.pickupLocationId || '').trim(),
      String(this.deliveryLocationId || '').trim(),
      this.rateUnit || ''
    ].join('|');
  }

  private loadPricingSuggestions(clientId: string | null, requestKey: string, attempt = 0) {
    const originLocId = localStorage.getItem('originLocId') || 'all';
    if (!originLocId || originLocId === 'all') return;
    if (!clientId) return;
    if (requestKey !== this.suggestionRequestKey) return;
    const branch = this.branch || '';
    const params = clientId
      ? `originLocId=${encodeURIComponent(originLocId)}&branch=${encodeURIComponent(branch)}&clientId=${clientId}`
      : `originLocId=${encodeURIComponent(originLocId)}&branch=${encodeURIComponent(branch)}`;
    const routeParams = [
      `pickupLocationId=${encodeURIComponent(this.pickupLocationId || '')}`,
      `deliveryLocationId=${encodeURIComponent(this.deliveryLocationId || '')}`,
      `rateUnit=${encodeURIComponent(this.rateUnit)}`
    ].join('&');
    this.http.get<any>(`/api/pricing/suggestions?${params}&${routeParams}`)
      .subscribe({
        next: (res) => {
          if (requestKey !== this.suggestionRequestKey) return;
          if (res?.pricing) {
            this.productList = res.pricing;
            this.suggestedRates = {};
            res.pricing.forEach((p: any) => {
              if (p?.suggestedRate !== null && p?.suggestedRate !== undefined) {
                this.suggestedRates[p.productName] = Number(p.suggestedRate) || 0;
              }
            });
          }
          if (this.suggestionRetryHandle) {
            clearTimeout(this.suggestionRetryHandle);
            this.suggestionRetryHandle = null;
          }
        },
        error: () => {
          if (requestKey !== this.suggestionRequestKey) return;
          if (attempt >= this.suggestionMaxRetries) {
            return;
          }
          const delay = 500 * (attempt + 1);
          if (this.suggestionRetryHandle) {
            clearTimeout(this.suggestionRetryHandle);
          }
          this.suggestionRetryHandle = setTimeout(() => {
            this.suggestionRetryHandle = null;
            this.loadPricingSuggestions(clientId, requestKey, attempt + 1);
          }, delay);
        }
      });
  }

  private getClientIdByLocationId(id: string | null): string | null {
    if (!id) return null;
    const client = this.clientList.find(c =>
      Array.isArray(c?.deliveryLocations) &&
      c.deliveryLocations.some((loc: any) => this.getLocationId(loc) === id)
    );
    return client?._id || null;
  }

  private getClientIdForPricing(): string | null {
    const billingClientId = this.getClientIdByLocationId(this.billingLocationId);
    if (billingClientId) return billingClientId;
    if (this.billingClientId) return this.billingClientId;
    return this.selectedConsignorId;
  }

  getPricingGstinId(): string {
    const clientId = this.getClientIdForPricing();
    const client = this.clientList.find(c => c?._id === clientId);
    const gstin = (client?.GSTIN || '').trim();
    if (gstin) return gstin;
    const billingGstin = String(this.billingGSTIN || '').trim();
    if (billingGstin) return billingGstin;
    return '-';
  }

  private refreshPricingSuggestions() {
    if (this.shouldSuppressPricingSuggestions()) {
      this.suggestedRates = {};
      this.suggestionRequestKey = '';
      if (this.suggestionRetryHandle) {
        clearTimeout(this.suggestionRetryHandle);
        this.suggestionRetryHandle = null;
      }
      return;
    }
    const clientId = this.getClientIdForPricing();
    if (!clientId) {
      this.suggestedRates = {};
      this.suggestionRequestKey = '';
      if (this.suggestionRetryHandle) {
        clearTimeout(this.suggestionRetryHandle);
        this.suggestionRetryHandle = null;
      }
      return;
    }
    const requestKey = this.buildSuggestionKey(clientId);
    this.suggestionRequestKey = requestKey;
    if (this.suggestionRetryHandle) {
      clearTimeout(this.suggestionRetryHandle);
      this.suggestionRetryHandle = null;
    }
    this.loadPricingSuggestions(clientId, requestKey, 0);
  }

  private shouldSuppressPricingSuggestions(): boolean {
    if (this.consignorTab === 'guest') return true;
    const originLocId = String(localStorage.getItem('originLocId') || '').trim();
    const branchName = String(this.branch || '').trim().toLowerCase();
    if (originLocId === 'all-hubs' || branchName === 'all hubs') return true;
    if (this.billingSource && this.billingSource.startsWith('hub:')) return true;
    return false;
  }

  // QUICK ADD CLIENT/GUEST
  openClientModal() {
    if (!this.branch || this.branch === 'All Branches') {
      alert('Select a branch before adding a client.');
      return;
    }
    this.showClientAddTab = true;
    this.clientModalTab = 'add';
    this.newClient = {
      clientName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      GSTIN: '',
      phoneNum: '',
      perDis: 0,
      creditType: 'no-credit',
      products: [],
      deliveryLocations: [{ address: '', city: '', state: '', pinCode: '' }],
      status: 'active',
      branch: this.branch,
      originLocId: localStorage.getItem('originLocId') || 'all'
    };
    this.clientError = '';
    this.editClientError = '';
    this.selectedEditClientId = '';
    this.showClientModal = true;
  }

  openClientModalForEdit(clientId: string) {
    if (!this.branch || this.branch === 'All Branches') {
      alert('Select a branch before editing a client.');
      return;
    }
    if (!clientId) return;
    this.showClientAddTab = false;
    this.clientModalTab = 'edit';
    this.clientError = '';
    this.editClientError = '';
    this.selectedEditClientId = clientId;
    this.showClientModal = true;
    this.loadEditableClients(clientId);
  }

  setClientModalTab(tab: 'add' | 'edit', selectId?: string) {
    this.clientModalTab = tab;
    if (tab === 'edit') {
      this.loadEditableClients(selectId);
    }
  }

  private loadEditableClients(selectId?: string) {
    const originLocId = localStorage.getItem('originLocId') || 'all';
    if (!originLocId || originLocId === 'all') return;
    this.http.get<any[]>(`/api/clients?originLocId=${encodeURIComponent(originLocId)}`)
      .subscribe({
        next: (res) => {
          this.editableClientList = res || [];
          if (selectId) {
            this.selectedEditClientId = selectId;
            this.onEditClientSelect(selectId);
          }
        },
        error: () => { this.editableClientList = []; }
      });
  }

  onEditClientSelect(id: string) {
    const c = this.editableClientList.find(x => x._id === id);
    if (!c) return;
    this.editClient = {
      _id: c._id,
      clientName: c.clientName || '',
      GSTIN: c.GSTIN || '',
      phoneNum: c.phoneNum || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || '',
      pinCode: c.pinCode || '',
      branch: c.branch || '',
      deliveryLocations: Array.isArray(c.deliveryLocations)
        ? c.deliveryLocations.map((d: any) => ({
            address: d.address || '',
            city: d.city || '',
            state: d.state || '',
            pinCode: d.pinCode || ''
          }))
        : []
    };
    if (!this.editClient.deliveryLocations.length) {
      this.editClient.deliveryLocations = [{ address: '', city: '', state: '', pinCode: '' }];
    }
    this.editClientError = '';
  }

  addEditDeliveryLocation() {
    if (!Array.isArray(this.editClient.deliveryLocations)) {
      this.editClient.deliveryLocations = [];
    }
    this.editClient.deliveryLocations.push({ address: '', city: '', state: '', pinCode: '' });
  }

  removeEditDeliveryLocation(index: number) {
    this.editClient.deliveryLocations.splice(index, 1);
  }

  openGuestModal() {
    this.newGuest = {
      guestName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      phoneNum: '',
      perDis: 0
    };
    this.guestError = '';
    this.showGuestModal = true;
  }

  // QUICK ADD PRODUCT
  openProductModal() {
    const originLocId = localStorage.getItem('originLocId') || 'all';
    if (!originLocId || originLocId === 'all') {
      alert('Select a specific branch before adding a product.');
      return;
    }
    this.productError = '';
    this.newProduct = {
      hsnNum: '',
      productName: '',
      status: 'active',
      originLocId,
      rates: [
        {
          pickupLocationId: '',
          deliveryLocationId: '',
          rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
        }
      ]
    };
    this.showProductModal = true;
  }

  closeProductModal() {
    this.showProductModal = false;
  }

  addProductRateRow() {
    if (!Array.isArray(this.newProduct.rates)) {
      this.newProduct.rates = [];
    }
    this.newProduct.rates.push({
      pickupLocationId: '',
      deliveryLocationId: '',
      rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
    });
  }

  removeProductRateRow(index: number) {
    if (!Array.isArray(this.newProduct.rates)) return;
    this.newProduct.rates.splice(index, 1);
  }

  saveNewProduct() {
    this.productError = '';
    const originLocId = localStorage.getItem('originLocId') || 'all';
    if (!originLocId || originLocId === 'all') {
      this.productError = 'Select a specific branch before adding a product.';
      return;
    }
    if (!this.newProduct.hsnNum || !this.newProduct.productName) {
      this.productError = 'Please enter HSN number and product name.';
      return;
    }

    // Allow saving with an empty Rates by Route section by dropping incomplete rows.
    const isValidObjectId = (value: any) => /^[a-f\d]{24}$/i.test(String(value || '').trim());
    const rates = Array.isArray(this.newProduct.rates) ? this.newProduct.rates : [];
    const sanitizedRates = rates.filter((r: any) => {
      const pickupLocationId = String(r?.pickupLocationId || '').trim();
      const deliveryLocationId = String(r?.deliveryLocationId || '').trim();
      const ratePerNum = Number(r?.rate?.ratePerNum || 0);
      const ratePerVolume = Number(r?.rate?.ratePerVolume || 0);
      const ratePerKg = Number(r?.rate?.ratePerKg || 0);
      const hasAnyRate = ratePerNum > 0 || ratePerVolume > 0 || ratePerKg > 0;
      return isValidObjectId(pickupLocationId) && isValidObjectId(deliveryLocationId) && hasAnyRate;
    });
    this.newProduct.rates = sanitizedRates;

    this.newProduct.originLocId = originLocId;
    this.http.post('/api/products/add', this.newProduct, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: () => {
        this.closeProductModal();
        this.loadLists();
      },
      error: (err) => {
        this.productError = err?.error?.message || 'Failed to save product.';
      }
    });
  }

  saveNewClient() {
    this.clientError = '';
    if (!this.newClient.clientName || !this.newClient.address || !this.newClient.GSTIN || !this.newClient.phoneNum || !this.newClient.branch) {
      this.clientError = 'Please fill required fields (name, address, GSTIN, phone, branch).';
      return;
    }
    const isAllHubsSelection =
      this.newClient.branch === 'All Hubs' || this.newClient.originLocId === 'all-hubs';
    this.newClient.originLocId = localStorage.getItem('originLocId') || 'all';
    if (this.newClient.branch === 'All Hubs' || this.newClient.originLocId === 'all-hubs') {
      const hub = this.getSelectedAllHub();
      if (!hub) {
        this.clientError = 'Select a hub before adding a client.';
        return;
      }
      this.newClient.originLocId = String(hub?._id || '').trim();
      this.newClient.branch = String(hub?.hubName || '').trim() || this.newClient.branch;
    }
    if (this.newClient.branch === 'All Branches' || this.newClient.originLocId === 'all') {
      this.clientError = 'Select a specific branch before adding a client.';
      return;
    }
    const payload = isAllHubsSelection
      ? { ...this.newClient, products: [] }
      : this.newClient;
    this.http.post('/api/clients/add', payload).subscribe({
      next: (client: any) => {
        this.clientList = [client, ...this.clientList];
        this.consignor = client.clientName;
        this.onConsignorSelect(this.consignor);
        this.showClientModal = false;
      },
      error: (err) => {
        this.clientError = err?.error?.message || 'Failed to save client.';
      }
    });
  }

  saveEditedClient() {
    this.editClientError = '';
    if (!this.selectedEditClientId) {
      this.editClientError = 'Select a client to edit.';
      return;
    }
    const payload = {
      deliveryLocations: (this.editClient.deliveryLocations || []).filter((d: any) => d?.address)
    };
    this.http.put(`/api/clients/${this.selectedEditClientId}`, payload)
      .subscribe({
        next: () => {
          this.showClientModal = false;
        },
        error: (err) => {
          this.editClientError = err?.error?.message || 'Failed to update client.';
        }
      });
  }

  saveNewGuest() {
    this.guestError = '';
    if (!this.newGuest.guestName || !this.newGuest.address || !this.newGuest.phoneNum) {
      this.guestError = 'Please fill required fields (name, address, phone).';
      return;
    }
    this.http.post('/api/guests/add', this.newGuest).subscribe({
      next: (guest: any) => {
        this.guestList = [guest, ...this.guestList];
        if (this.consignorTab === 'guest') {
          this.consignor = guest.guestName;
          this.onConsignorGuestSelect(this.consignor);
        }
        this.showGuestModal = false;
      },
      error: (err) => {
        this.guestError = err?.error?.message || 'Failed to save guest.';
      }
    });
  }

  closeModals() {
    this.showClientModal = false;
    this.showGuestModal = false;
  }

  addClientProduct() {
    this.newClient.products.push({
      hsnNum: '',
      productName: '',
      ratePerNum: 0,
      ratePerVolume: 0,
      ratePerKg: 0
    });
  }

  removeClientProduct(index: number) {
    this.newClient.products.splice(index, 1);
  }

  addDeliveryLocation() {
    this.newClient.deliveryLocations.push({ address: '', city: '', state: '', pinCode: '' });
  }

  removeDeliveryLocation(index: number) {
    this.newClient.deliveryLocations.splice(index, 1);
  }
}




