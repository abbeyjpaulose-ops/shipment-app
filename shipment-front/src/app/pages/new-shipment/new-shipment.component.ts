import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

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
    deliveryLocations: [{ location: '' }],
    status: 'active',
    branch: ''
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

  clientList: any[] = [];
  guestList: any[] = [];
  pkgList: any[] = [];
  productList: any[] = [];

  // Pickup
  pickupType: 'consignor' | 'different' = 'consignor';
  pickupName = '';
  pickupAddress = '';
  pickupPhone = '';

  // Delivery
  deliveryType: 'consignee' | 'different' = 'consignee';
  deliveryName = '';
  deliveryAddress = '';
  deliveryPhone = '';

  consignorTab: 'consignor' | 'guest' = 'consignor';
  consigneeTab: 'consignee' | 'guest' = 'consignee';

  username: string = '';
  branch: string = localStorage.getItem('branch') || 'All Branches';
  selectedConsignorId: string | null = null;

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
  externalRefId: string = '';

  ewaybills = [
    {
      number: '',
      date: this.date,
      invoices: [
        {
          number: '',
          value: 0,
          packages: [{ type: '', amount: 0 }],
          products: [{ type: '', amount: 1, instock: 1, intransitstock: 0, deliveredstock: 0 }]
        }
      ]
    }
  ];

  charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0, consignorDiscount: 0 };
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
    this.loadDraft(this.branch);
    this.getCurrentConsignmentNumber();
    this.loadLists();
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
      pickupType: this.pickupType,
      pickupName: this.pickupName,
      pickupAddress: this.pickupAddress,
      pickupPhone: this.pickupPhone,
      deliveryType: this.deliveryType,
      deliveryName: this.deliveryName,
      deliveryAddress: this.deliveryAddress,
      deliveryPhone: this.deliveryPhone,
      consignorTab: this.consignorTab,
      consigneeTab: this.consigneeTab,
      consignor: this.consignor,
      consignorGST: this.consignorGST,
      consignorAddress: this.consignorAddress,
      consignorPhone: this.consignorPhone,
      consignee: this.consignee,
      consigneeGST: this.consigneeGST,
      consigneeAddress: this.consigneeAddress,
      consigneePhone: this.consigneePhone,
      paymentMode: this.paymentMode,
      externalRefId: this.externalRefId,
      ewaybills: this.ewaybills,
      charges: this.charges,
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
        pickupType: draft.pickupType ?? this.pickupType,
        pickupName: draft.pickupName ?? this.pickupName,
        pickupAddress: draft.pickupAddress ?? this.pickupAddress,
        pickupPhone: draft.pickupPhone ?? this.pickupPhone,
        deliveryType: draft.deliveryType ?? this.deliveryType,
        deliveryName: draft.deliveryName ?? this.deliveryName,
        deliveryAddress: draft.deliveryAddress ?? this.deliveryAddress,
        deliveryPhone: draft.deliveryPhone ?? this.deliveryPhone,
        consignorTab: draft.consignorTab ?? this.consignorTab,
        consigneeTab: draft.consigneeTab ?? this.consigneeTab,
        consignor: draft.consignor ?? this.consignor,
        consignorGST: draft.consignorGST ?? this.consignorGST,
        consignorAddress: draft.consignorAddress ?? this.consignorAddress,
        consignorPhone: draft.consignorPhone ?? this.consignorPhone,
        consignee: draft.consignee ?? this.consignee,
        consigneeGST: draft.consigneeGST ?? this.consigneeGST,
        consigneeAddress: draft.consigneeAddress ?? this.consigneeAddress,
        consigneePhone: draft.consigneePhone ?? this.consigneePhone,
        paymentMode: draft.paymentMode ?? this.paymentMode,
        externalRefId: draft.externalRefId ?? this.externalRefId,
        ewaybills: draft.ewaybills ?? this.ewaybills,
        charges: draft.charges ?? this.charges,
        finalAmount: draft.finalAmount ?? this.finalAmount,
        selectedConsignorId: draft.selectedConsignorId ?? null,
        consignmentNumber: draft.consignmentNumber ?? this.consignmentNumber,
        date: draft.date ?? this.date
      });
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
      .subscribe(res => this.clientList = res);

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
      invoiceTotal += ewb.invoices.reduce((sum, inv) => sum + (inv.value || 0), 0);
      packageTotal += ewb.invoices.reduce((sum, inv) =>
        sum + inv.packages.reduce((pSum, p) => pSum + (p.amount || 0), 0), 0);
    });
    const chargeTotal = Object.values(this.charges).reduce((sum, c) => sum + (Number(c) || 0), 0);
    this.finalAmount = invoiceTotal + packageTotal + chargeTotal;
  }

  resetForm() {
    this.billingType = 'consignor';
    this.billingName = '';
    this.billingAddress = '';
    this.billingGSTIN = '';
    this.billingPhone = '';
    this.pickupType = 'consignor';
    this.pickupName = '';
    this.pickupAddress = '';
    this.pickupPhone = '';
    this.deliveryType = 'consignee';
    this.deliveryName = '';
    this.deliveryAddress = '';
    this.deliveryPhone = '';
    this.consignorTab = 'consignor';
    this.consigneeTab = 'consignee';
    this.selectedConsignorId = null;
    this.consignor = '';
    this.consignorGST = '';
    this.consignorAddress = '';
    this.consignorPhone = '';
    this.consignee = '';
    this.consigneeGST = '';
    this.consigneeAddress = '';
    this.consigneePhone = '';
    this.paymentMode = 'To Pay';
    this.externalRefId = '';
    this.ewaybills = [{
      number: '',
      date: this.date,
      invoices: [
        {
          number: '',
          value: 0,
          packages: [{ type: '', amount: 0 }],
          products: [{ type: '', amount: 1, instock: 1, intransitstock: 0, deliveredstock: 0 }]
        }
      ]
    }];
    this.charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0, consignorDiscount: 0 };
    this.finalAmount = 0;
    this.saveDraft(this.branch);
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
    this.isSaving = true;
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
      consigneeTab: this.consigneeTab,
      consignee: this.consignee,
      consigneeGST: this.consigneeGST,
      consigneeAddress: this.consigneeAddress,
      consigneePhone: this.consigneePhone,
      billingType: this.billingType,
      billingName: this.billingName,
      billingGSTIN: this.billingGSTIN,
      billingAddress: this.billingAddress,
      billingPhone: this.billingPhone,
      pickupType: this.pickupType,
      pickupName: this.pickupName,
      pickupAddress: this.pickupAddress,
      pickupPhone: this.pickupPhone,
      deliveryType: this.deliveryType,
      deliveryName: this.deliveryName,
      deliveryAddress: this.deliveryAddress,
      deliveryPhone: this.deliveryPhone,
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
    }
    if (this.pickupType === 'consignor') {
      shipmentData.pickupName = this.consignor;
      shipmentData.pickupAddress = this.consignorAddress;
      shipmentData.pickupPhone = this.consignorPhone;
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

  // SELECT HANDLERS
  onConsignorSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consignorGST = c.GSTIN;
      this.consignorAddress = c.address;
      this.consignorPhone = c.phoneNum;
      this.charges.consignorDiscount = c.perDis;
      this.selectedConsignorId = c._id;
      this.loadPricingSuggestions(c._id);
    }
  }

  onConsigneeSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consigneeGST = c.GSTIN;
      this.consigneeAddress = c.address;
      this.consigneePhone = c.phoneNum;
    }
  }

  onConsignorGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consignorGST = 'GUEST';
      this.consignorAddress = g.address;
      this.consignorPhone = g.phoneNum;
      this.selectedConsignorId = null;
      this.loadPricingSuggestions(null);
    }
  }

  onConsigneeGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consigneeGST = 'GUEST';
      this.consigneeAddress = g.address;
      this.consigneePhone = g.phoneNum;
    }
  }

  onPackageList(name: string) {
    this.pkgList.find(x => x.pkgName === name);
  }

  onProductList(name: string) {
    this.productList.find(x => x.productName === name);
  }

  private loadPricingSuggestions(clientId: string | null) {
    if (!this.branch || this.branch === 'All Branches') return;
    const params = clientId
      ? `branch=${encodeURIComponent(this.branch)}&clientId=${clientId}`
      : `branch=${encodeURIComponent(this.branch)}`;
    this.http.get<any>(`http://localhost:3000/api/pricing/suggestions?${params}`)
      .subscribe({
        next: (res) => {
          if (res?.pricing) {
            // Map to product dropdown structure
            this.productList = res.pricing.map((p: any) => ({
              productName: p.productName,
              hsnNum: p.hsnNum,
              ratePerNum: p.ratePerNum,
              ratePerVolume: p.ratePerVolume,
              ratePerKg: p.ratePerKg,
              source: p.source
            }));
          }
        },
        error: () => { /* ignore to keep UI working */ }
      });
  }

  // QUICK ADD CLIENT/GUEST
  openClientModal() {
    if (!this.branch || this.branch === 'All Branches') {
      alert('Select a branch before adding a client.');
      return;
    }
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
      deliveryLocations: [{ location: '' }],
      status: 'active',
      branch: this.branch
    };
    this.clientError = '';
    this.showClientModal = true;
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
    this.newClient.deliveryLocations.push({ location: '' });
  }

  removeDeliveryLocation(index: number) {
    this.newClient.deliveryLocations.splice(index, 1);
  }
}
