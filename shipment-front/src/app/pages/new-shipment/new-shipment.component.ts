import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

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
  clientError = '';
  guestError = '';
  clientModalTab: 'add' | 'edit' = 'add';
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
    branch: ''
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

  clientList: any[] = [];
  guestList: any[] = [];
  pkgList: any[] = [];
  productList: any[] = [];

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
  deliveryType: 'consignee' | 'different' = 'consignee';
  deliveryName = '';
  deliveryAddress = '';
  deliveryPhone = '';
  deliveryPincode = '';
  deliveryLocationIndex = '';
  deliveryLocationId: string | null = null;
  deliveryPreviousReceiver = '';
  deliveryClientId: string | null = null;

  consignorTab: 'consignor' | 'guest' = 'consignor';
  consigneeTab: 'consignee' | 'guest' = 'consignee';

  username: string = '';
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
  externalRefId: string = '';
  suggestedRates: Record<string, number | null> = {};
  showRateOverrideModal = false;
  branchDetails: any | null = null;
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

  shipmentStatus: string = 'Pending';
  shipmentStatusDetails: string = '';
  isSaving = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    if (typeof window === 'undefined') return;

    this.username = localStorage.getItem('username') || '';
    this.branch = localStorage.getItem('branch') || 'All Branches';
    this.newClient.branch = this.branch;

    this.loadDraft(this.branch);
    this.getCurrentConsignmentNumber();
    this.loadLists();
    this.loadBranchDetails();

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
  };

  private handleBranchChange(newBranch: string, oldBranch: string) {
    // Save draft for the previous branch
    if (oldBranch) {
      this.saveDraft(oldBranch);
    }
    this.branch = newBranch || 'All Branches';
    this.newClient.branch = this.branch;
    this.editClient.branch = this.branch;
    this.loadDraft(this.branch);
    this.getCurrentConsignmentNumber();
    this.loadLists();
    this.loadBranchDetails();
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
      pickupType: this.pickupType,
      pickupName: this.pickupName,
      pickupAddress: this.pickupAddress,
      pickupPhone: this.pickupPhone,
      pickupPincode: this.pickupPincode,
      pickupLocationId: this.pickupLocationId,
      pickupPreviousSender: this.pickupPreviousSender,
      pickupSource: this.pickupSource,
      deliveryType: this.deliveryType,
      deliveryName: this.deliveryName,
      deliveryAddress: this.deliveryAddress,
      deliveryPhone: this.deliveryPhone,
      deliveryPincode: this.deliveryPincode,
      deliveryLocationId: this.deliveryLocationId,
      deliveryPreviousReceiver: this.deliveryPreviousReceiver,
      deliveryClientId: this.deliveryClientId,
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
        pickupType: draft.pickupType ?? this.pickupType,
        pickupName: draft.pickupName ?? this.pickupName,
        pickupAddress: draft.pickupAddress ?? this.pickupAddress,
        pickupPhone: draft.pickupPhone ?? this.pickupPhone,
        pickupPincode: draft.pickupPincode ?? this.pickupPincode,
        pickupLocationId: draft.pickupLocationId ?? this.pickupLocationId,
        pickupPreviousSender: draft.pickupPreviousSender ?? this.pickupPreviousSender,
        pickupSource: draft.pickupSource ?? this.pickupSource,
        deliveryType: draft.deliveryType ?? this.deliveryType,
        deliveryName: draft.deliveryName ?? this.deliveryName,
        deliveryAddress: draft.deliveryAddress ?? this.deliveryAddress,
        deliveryPhone: draft.deliveryPhone ?? this.deliveryPhone,
        deliveryPincode: draft.deliveryPincode ?? this.deliveryPincode,
        deliveryLocationId: draft.deliveryLocationId ?? this.deliveryLocationId,
        deliveryPreviousReceiver: draft.deliveryPreviousReceiver ?? this.deliveryPreviousReceiver,
        deliveryClientId: draft.deliveryClientId ?? this.deliveryClientId,
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
        selectedConsignorId: draft.selectedConsignorId ?? null,
        consignmentNumber: draft.consignmentNumber ?? this.consignmentNumber,
        date: draft.date ?? this.date
      });
      this.onPaymentModeChange();
      this.updatePickupFromBranch();
    } catch {
      /* ignore bad draft */
    }
  }

  private clearDraft(branch: string) {
    localStorage.removeItem(this.draftKey(branch));
  }

  private loadLists() {
    // Client list
    this.http.get<any[]>(`http://localhost:3000/api/clients/clientslist?branch=${encodeURIComponent(this.branch)}`)
      .subscribe(res => {
        this.clientList = res;
        this.syncConsignorDiscount();
        this.updatePaymentModeAvailability(this.consignor);
      });

    // Guest list
    this.http.get<any[]>(`http://localhost:3000/api/guests/guestslist`)
      .subscribe(res => this.guestList = res);

    // Package list
    this.http.get<any[]>(`http://localhost:3000/api/pkgs/pkglist`)
      .subscribe(res => this.pkgList = res);

    // Product list (defaults)
    this.http.get<any[]>(`http://localhost:3000/api/products/productlist`)
      .subscribe(res => this.productList = res);
  }

  // E-WAYBILL HELPERS
  addEwaybill() {
    this.ewaybills.push({ number: '', date: this.date, invoices: [] });
  }
  deleteEwaybill(index: number) { this.ewaybills.splice(index, 1); }

  addInvoice(ewaybillIndex: number) {
    this.ewaybills[ewaybillIndex].invoices.push({ number: '', value: 0, packages: [], products: [] });
  }
  deleteInvoice(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices.splice(invoiceIndex, 1);
  }

  addPackage(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].packages.push({ type: '', amount: 0 });
  }
  deletePackage(ewaybillIndex: number, invoiceIndex: number, packageIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].packages.splice(packageIndex, 1);
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
  }
  deleteProduct(ewaybillIndex: number, invoiceIndex: number, productIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].products.splice(productIndex, 1);
  }

  // CALCULATIONS
  calculateFinalAmount() {
    let invoiceTotal = 0;
    let packageTotal = 0;
    this.ewaybills.forEach(ewb => {
      invoiceTotal += ewb.invoices.reduce((sum, inv) => {
        const productTotal = (inv.products || []).reduce((pSum: number, p: any) => {
          const qty = Number(p?.amount) || 0;
          const rate = Number(p?.ratePer) || 0;
          return pSum + (qty * rate);
        }, 0);
        const invoiceValue = Number(inv?.value) || 0;
        return sum + (productTotal > 0 ? productTotal : invoiceValue);
      }, 0);
      packageTotal += ewb.invoices.reduce((sum, inv) =>
        sum + (inv.packages || []).reduce((pSum: number, p: any) => pSum + (Number(p?.amount) || 0), 0), 0);
    });
    const chargeTotal = Object.entries(this.charges)
      .filter(([key]) => key !== 'consignorDiscount')
      .reduce((sum, [, c]) => sum + (Number(c) || 0), 0);
    const subtotal = invoiceTotal + packageTotal + chargeTotal;
    const discountPercent = Number(this.charges.consignorDiscount) || 0;
    const discountAmount = this.applyConsignorDiscount ? (subtotal * discountPercent) / 100 : 0;
    this.finalAmount = subtotal - discountAmount;
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
    this.deliveryName = '';
    this.deliveryAddress = '';
    this.deliveryPhone = '';
    this.deliveryPincode = '';
    this.deliveryLocationIndex = '';
    this.deliveryLocationId = null;
    this.deliveryPreviousReceiver = '';
    this.deliveryClientId = null;
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
    this.suggestedRates = {};
    this.saveDraft(this.branch);
    this.updatePickupFromBranch();
  }

  // CONSIGNMENT NUMBER
  getCurrentConsignmentNumber() {
    if (!this.branch || this.branch === 'All Branches') {
      this.consignmentNumber = 'nil';
      return;
    }
    this.http.get<{ nextNumber: number, fiscalYear: string }>(
      `http://localhost:3000/api/newshipments/nextConsignment?username=${encodeURIComponent(this.username)}&branch=${encodeURIComponent(this.branch)}`
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
    if (this.paymentMode === 'To Pay') {
      this.shipmentStatus = 'To Pay';
    }
    const shipmentData: any = {
      username: localStorage.getItem('username'),
      branch: localStorage.getItem('branch'),
      shipmentStatus: this.shipmentStatus,
      shipmentStatusDetails: `${localStorage.getItem('username')}$$${this.date}$$${this.shipmentStatus}`,
      consignmentNumber: this.consignmentNumber,
      date: this.date,
      paymentMode: this.paymentMode,
      externalRefId: this.externalRefId,
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
      deliveryType: this.deliveryType,
      deliveryName: this.deliveryName,
      deliveryAddress: this.deliveryAddress,
      deliveryPhone: this.deliveryPhone,
      deliveryPincode: this.deliveryPincode,
      deliveryLocationId: this.deliveryLocationId,
      deliveryClientId: this.deliveryClientId,
      ewaybills: this.ewaybills,
      charges: this.charges,
      finalAmount: this.finalAmount
    };

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
        'http://localhost:3000/api/newshipments/add?summary=true',
        shipmentData,
        { headers: { 'Content-Type': 'application/json' } }
      ).subscribe({
        next: () => {
          alert(`Shipment ${this.consignmentNumber} saved successfully!`);
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
    this.ensureRoutePincodes();
    const pickupPin = String(this.pickupPincode || '').trim();
    const deliveryPin = String(this.deliveryPincode || '').trim();
    if (!pickupPin || !deliveryPin) {
      alert('Pickup and delivery pincode are required to save suggested rates.');
      this.performSave();
      return;
    }
    this.updateClientPricing(updates).subscribe({
      next: () => this.performSave(),
      error: () => {
        alert('Failed to update client pricing. Saving shipment with entered rates.');
        this.performSave();
      }
    });
  }

  private updateClientPricing(
    overrides: Array<{ productName: string; hsnNum?: string; enteredRate: number }>
  ): Observable<void> {
    if (!this.selectedConsignorId) {
      return of(void 0);
    }
    this.ensureRoutePincodes();
    const updates = new Map<string, { productName: string; hsnNum?: string; ratePer: number }>();
    overrides.forEach((item) => {
      updates.set(item.productName, {
        productName: item.productName,
        hsnNum: item.hsnNum,
        ratePer: item.enteredRate
      });
    });
    const payload = {
      pickupPincode: String(this.pickupPincode || '').trim(),
      deliveryPincode: String(this.deliveryPincode || '').trim(),
      rateUnit: this.rateUnit,
      updates: Array.from(updates.values())
    };
    return this.http.post<void>(`http://localhost:3000/api/clients/${this.selectedConsignorId}/pricing`, payload);
  }

  private ensureRoutePincodes() {
    if (!this.pickupPincode) {
      const fallbackPin = String(this.branchDetails?.pinCode || '').trim();
      if (fallbackPin) this.pickupPincode = fallbackPin;
    }
    if (!this.deliveryPincode) {
      if (this.deliveryType === 'different') {
        const locations = this.getClientLocationsByName(this.deliveryPreviousReceiver);
        const byId = this.getLocationById(locations, this.deliveryLocationId);
        const fallbackPin =
          this.getLocationPin(byId) ||
          this.getLocationPin(locations[0]);
        if (fallbackPin) this.deliveryPincode = fallbackPin;
      } else {
        const locations = this.getConsigneeLocations();
        const byId = this.getLocationById(locations, this.deliveryLocationId);
        const byIndex = locations[Number(this.deliveryLocationIndex)];
        const deliveryPin = this.consigneeTab === 'guest'
          ? this.getGuestPinByName(this.consignee)
          : this.getClientPinByName(this.consignee);
        const fallbackPin =
          this.getLocationPin(byId) ||
          this.getLocationPin(byIndex) ||
          deliveryPin ||
          this.getLocationPin(locations[0]);
        if (fallbackPin) this.deliveryPincode = fallbackPin;
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
    for (const ewb of this.ewaybills) {
      for (const inv of ewb.invoices || []) {
        for (const prod of inv.products || []) {
          if (!prod.amount || prod.amount <= 0) {
            alert('Please enter a quantity greater than 0 for all products.');
            return false;
          }
          if (!prod.instock || prod.instock <= 0) {
            prod.instock = prod.amount;
          }
        }
      }
    }
    return true;
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

  getConsignorLocations(): any[] {
    return this.getClientLocationsByName(this.consignor);
  }

  getConsigneeLocations(): any[] {
    return this.getClientLocationsByName(this.consignee);
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
    if (this.consignorTab === 'guest') {
      const guest = this.guestList.find(x => x.guestName === this.consignor);
      if (!guest) return;
      this.pickupName = guest.guestName || '';
      this.pickupPhone = guest.phoneNum || '';
      this.pickupAddress = guest.address || '';
      this.pickupPincode = String(guest?.pinCode ?? guest?.pincode ?? '').trim();
      this.pickupLocationId = null;
      this.pickupLocationIndex = '';
      this.pickupSource = 'consignor-guest';
      this.onRouteChange();
      return;
    }

    const client = this.clientList.find(x => x.clientName === this.consignor);
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
      this.pickupSource = 'consignor-primary';
    }
  }

  private updateBillingFromConsignor() {
    if (this.consignorTab === 'guest') {
      const guest = this.guestList.find(x => x.guestName === this.consignor);
      if (!guest) return;
      this.billingName = guest.guestName || '';
      this.billingGSTIN = 'GUEST';
      this.billingPhone = guest.phoneNum || '';
      this.billingAddress = guest.address || '';
      this.billingLocationId = null;
      this.billingLocationIndex = '';
      this.billingClientId = null;
      return;
    }

    const client = this.clientList.find(x => x.clientName === this.consignor);
    if (!client) return;
    this.billingName = client.clientName || '';
    this.billingGSTIN = client.GSTIN || '';
    this.billingPhone = client.phoneNum || '';
    const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
    const primaryLocation = locations[0];
    this.billingAddress = primaryLocation ? this.formatLocation(primaryLocation) : (client.address || '');
    this.billingLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    this.billingLocationIndex = '';
    this.billingClientId = client._id || null;
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
      this.onRouteChange();
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
    if (value === 'consignor-primary') {
      this.setPickupType('consignor');
      this.updatePickupFromConsignor();
      return;
    }
    if (value.startsWith('consignor:')) {
      const index = value.split(':')[1] || '';
      this.setPickupType('consignor');
      this.pickupLocationIndex = index;
      this.onPickupLocationSelect(index);
    }
  }

  setBillingType(type: 'consignor' | 'different') {
    this.billingType = type;
    if (type === 'consignor') {
      this.updateBillingFromConsignor();
      return;
    }
    if (this.billingLocationIndex !== '') {
      this.onBillingLocationSelect(this.billingLocationIndex);
    }
  }

  setDeliveryType(type: 'consignee' | 'different') {
    this.deliveryType = type;
    if (type === 'consignee') {
      this.updateDeliveryFromConsignee();
      return;
    }
    if (this.deliveryPreviousReceiver) {
      this.onDeliveryPreviousReceiverSelect(this.deliveryPreviousReceiver);
    }
  }

  onBillingLocationSelect(index: string) {
    this.billingLocationIndex = index;
    const locations = this.getConsignorLocations();
    const loc = locations[Number(index)];
    if (!loc) return;
    this.billingAddress = this.formatLocation(loc);
    this.billingLocationId = this.getLocationId(loc);
    this.refreshPricingSuggestions();
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
    this.refreshPricingSuggestions();
  }

  onPickupLocationSelect(index: string) {
    this.pickupLocationIndex = index;
    const locations = this.getConsignorLocations();
    const loc = locations[Number(index)];
    if (!loc) return;
    this.pickupAddress = this.formatLocation(loc);
    this.pickupPincode = this.getLocationPin(loc);
    this.pickupLocationId = this.getLocationId(loc);
    this.pickupSource = `consignor:${index}`;
    this.onRouteChange();
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
    this.pickupLocationIndex = '';
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
    this.onRouteChange();
  }

  onDeliveryPreviousReceiverSelect(name: string) {
    const selected = this.clientList.find(c => c.clientName === name);
    if (!selected) return;
    this.deliveryName = selected.clientName || '';
    this.deliveryPhone = selected.phoneNum || '';
    const locations = Array.isArray(selected.deliveryLocations) ? selected.deliveryLocations : [];
    const primaryLocation = locations[0];
    this.deliveryAddress = primaryLocation ? this.formatLocation(primaryLocation) : (selected.address || '');
    this.deliveryPincode = primaryLocation ? this.getLocationPin(primaryLocation) : '';
    this.deliveryLocationId = primaryLocation ? this.getLocationId(primaryLocation) : null;
    this.deliveryClientId = selected._id || null;
    this.deliveryLocationIndex = '';
    this.onRouteChange();
  }

  // SELECT HANDLERS
  onConsignorSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consignorGST = c.GSTIN;
      this.consignorAddress = c.address;
      this.consignorPhone = c.phoneNum;
      this.maxConsignorDiscount = Number(c.perDis) || 0;
      this.charges.consignorDiscount = this.maxConsignorDiscount;
      this.selectedConsignorId = c._id;
      this.consignorId = c._id;
      if (this.pickupType === 'consignor') {
        this.updatePickupFromConsignor();
      }
      if (this.billingType === 'consignor') {
        this.updateBillingFromConsignor();
      } else {
        this.billingLocationId = null;
      }
      this.billingLocationIndex = '';
      this.pickupLocationIndex = '';
      this.refreshPricingSuggestions();
    }
    this.updatePaymentModeAvailability(name);
  }

  onConsigneeSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consigneeGST = c.GSTIN;
      this.consigneeAddress = c.address;
      this.consigneePhone = c.phoneNum;
      this.consigneeId = c._id;
      if (this.deliveryType === 'consignee') {
        this.updateDeliveryFromConsignee();
      }
      this.deliveryLocationIndex = '';
    }
  }

  onConsignorGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consignorGST = 'GUEST';
      this.consignorAddress = g.address;
      this.consignorPhone = g.phoneNum;
      this.charges.consignorDiscount = 0;
      this.maxConsignorDiscount = 0;
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
    this.updatePaymentModeAvailability('');
  }

  private syncConsignorDiscount() {
    const name = (this.consignor || '').trim();
    if (!name || this.consignorTab !== 'consignor') return;
    const client = this.clientList.find(x => x.clientName === name);
    this.maxConsignorDiscount = Number(client?.perDis) || 0;
    this.charges.consignorDiscount = this.maxConsignorDiscount;
  }

  onConsignorDiscountChange(value: any) {
    const raw = Number(value);
    const clamped = Math.max(0, Math.min(Number.isFinite(raw) ? raw : 0, this.maxConsignorDiscount));
    this.charges.consignorDiscount = clamped;
    this.calculateFinalAmount();
  }

  onRateUnitChange() {
    this.refreshPricingSuggestions();
  }

  onPaymentModeChange() {
    if (this.paymentMode === 'To Pay') {
      this.shipmentStatus = 'To Pay';
      return;
    }
    if (this.shipmentStatus === 'To Pay') {
      this.shipmentStatus = 'Pending';
    }
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
    }
  }

  onConsigneeGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consigneeGST = 'GUEST';
      this.consigneeAddress = g.address;
      this.consigneePhone = g.phoneNum;
      this.consigneeId = g._id || null;
      if (this.deliveryType === 'consignee') {
        this.updateDeliveryFromConsignee();
      }
      this.deliveryLocationIndex = '';
    }
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
    this.pickupLocationId = null;
    this.pickupSource = 'branch';
    this.onRouteChange();
  }

  private loadBranchDetails() {
    if (!this.branch || this.branch === 'All Branches') {
      this.branchDetails = null;
      this.updatePickupFromBranch();
      return;
    }
    this.http.get<any[]>('http://localhost:3000/api/branches')
      .subscribe({
        next: (branches) => {
          this.branchDetails = (branches || []).find(b => b.branchName === this.branch) || null;
          this.updatePickupFromBranch();
        },
        error: () => {
          this.branchDetails = null;
          this.updatePickupFromBranch();
        }
      });
  }

  private updatePaymentModeAvailability(consignorName?: string) {
    const name = (consignorName ?? this.consignor ?? '').trim();
    const client = this.clientList.find(x => x.clientName === name);
    const creditType = String(client?.creditType || '').toLowerCase();
    this.allowAccountCredit = creditType === 'credit' || creditType === 'credit allowed';
    if (!this.allowAccountCredit && this.paymentMode === 'Account Credit') {
      this.paymentMode = 'To Pay';
      this.onPaymentModeChange();
    }
  }

  isPaymentModeEnabled(): boolean {
    return Boolean((this.consignor || '').trim());
  }

  getSuggestedRate(product: any): number | null {
    const name = String(product?.type || '').trim();
    if (!name) return null;
    const value = this.suggestedRates[name];
    if (value === null || value === undefined) return null;
    return Number(value) || 0;
  }

  private loadPricingSuggestions(clientId: string | null) {
    if (!this.branch || this.branch === 'All Branches') return;
    const params = clientId
      ? `branch=${encodeURIComponent(this.branch)}&clientId=${clientId}`
      : `branch=${encodeURIComponent(this.branch)}`;
    const routeParams = [
      `pickupPincode=${encodeURIComponent(this.pickupPincode)}`,
      `deliveryPincode=${encodeURIComponent(this.deliveryPincode)}`,
      `rateUnit=${encodeURIComponent(this.rateUnit)}`
    ].join('&');
    this.http.get<any>(`http://localhost:3000/api/pricing/suggestions?${params}&${routeParams}`)
      .subscribe({
        next: (res) => {
          if (res?.pricing) {
            this.productList = res.pricing;
            this.suggestedRates = {};
            res.pricing.forEach((p: any) => {
              if (p?.suggestedRate !== null && p?.suggestedRate !== undefined) {
                this.suggestedRates[p.productName] = Number(p.suggestedRate) || 0;
              }
            });
          }
        },
        error: () => { /* ignore to keep UI working */ }
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
    const clientId = this.getClientIdForPricing();
    if (!clientId) {
      this.suggestedRates = {};
      return;
    }
    this.loadPricingSuggestions(clientId);
  }

  // QUICK ADD CLIENT/GUEST
  openClientModal() {
    if (!this.branch || this.branch === 'All Branches') {
      alert('Select a branch before adding a client.');
      return;
    }
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
      branch: this.branch
    };
    this.clientError = '';
    this.editClientError = '';
    this.selectedEditClientId = '';
    this.showClientModal = true;
  }

  setClientModalTab(tab: 'add' | 'edit') {
    this.clientModalTab = tab;
    if (tab === 'edit') {
      this.loadEditableClients();
    }
  }

  private loadEditableClients() {
    if (!this.branch || this.branch === 'All Branches') return;
    this.http.get<any[]>(`http://localhost:3000/api/clients?branch=${encodeURIComponent(this.branch)}`)
      .subscribe({
        next: (res) => this.editableClientList = res || [],
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

  saveNewClient() {
    this.clientError = '';
    if (!this.newClient.clientName || !this.newClient.address || !this.newClient.GSTIN || !this.newClient.phoneNum || !this.newClient.branch) {
      this.clientError = 'Please fill required fields (name, address, GSTIN, phone, branch).';
      return;
    }
    if (this.newClient.branch === 'All Branches') {
      this.clientError = 'Select a specific branch before adding a client.';
      return;
    }
    this.http.post('http://localhost:3000/api/clients/add', this.newClient).subscribe({
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
    this.http.put(`http://localhost:3000/api/clients/${this.selectedEditClientId}`, payload)
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
    this.http.post('http://localhost:3000/api/guests/add', this.newGuest).subscribe({
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
