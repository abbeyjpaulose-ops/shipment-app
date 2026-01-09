import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-view-shipments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './view-shipments.component.html',
  styleUrls: ['./view-shipments.component.css']
})
export class ViewShipmentsComponent implements OnInit {
  shipments: any[] = [];
  filteredShipments: any[] = [];
  receivedShipments: any[] = [];
  filteredReceived: any[] = [];
  branches: any[] = [];
  clientList: any[] = [];
  guestList: any[] = [];
  email: string = '';

  searchText: string = '';
  filterDate: string = '';
  filterStatus: string = '';
  filterConsignor: string = '';
  activeTab: 'all' | 'received' = 'all';

  selectedShipment: any | null = null;   // ✅ for modal popup
  showReturnModal: boolean = false;
  showReturnFinalAmount: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.email = localStorage.getItem('email') || '';
    this.loadShipments();
    this.loadReceivedShipments();
    this.loadBranches();
    this.loadClients();
    this.loadGuests();
  }

  loadShipments(): void {
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        username: localStorage.getItem('username') || '',
        branch: localStorage.getItem('branch') || 'All Branches'
      }
    }).subscribe({
      next: (res: any[]) => {
        const normalized = (res || []).map((shipment) => ({
          ...shipment,
          invoices: this.flattenInvoices(shipment.ewaybills || shipment.invoices || [])
        }));
        this.shipments = normalized;
        this.filteredShipments = normalized;
      },
      error: (err: any) => console.error('Error loading shipments:', err)
    });
  }

  loadReceivedShipments(): void {
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        username: localStorage.getItem('username') || '',
        branch: 'All Branches'
      }
    }).subscribe({
      next: (res: any[]) => {
        const normalized = (res || []).map((shipment) => ({
          ...shipment,
          invoices: this.flattenInvoices(shipment.ewaybills || shipment.invoices || [])
        }));
        this.receivedShipments = normalized;
        this.applyFilters();
      },
      error: (err: any) => console.error('Error loading received shipments:', err)
    });
  }

  loadBranches(): void {
    this.http.get<any[]>('http://localhost:3000/api/branches')
      .subscribe({
        next: (branches) => {
          this.branches = branches || [];
        },
        error: (err: any) => console.error('Error loading branches:', err)
      });
  }

  loadClients(): void {
    if (!this.email) return;
    this.http.get<any[]>(`http://localhost:3000/api/clients/clientslist?emailId=${this.email}`)
      .subscribe({
        next: (clients) => {
          this.clientList = clients || [];
        },
        error: (err: any) => console.error('Error loading clients:', err)
      });
  }

  loadGuests(): void {
    if (!this.email) return;
    this.http.get<any[]>(`http://localhost:3000/api/guests/guestslist?emailId=${this.email}`)
      .subscribe({
        next: (guests) => {
          this.guestList = guests || [];
        },
        error: (err: any) => console.error('Error loading guests:', err)
      });
  }

  private flattenInvoices(ewaybills: any[]): any[] {
    return (ewaybills || []).flatMap((ewb) => ewb.invoices || []);
  }
  getProductTotal(invoices: any[], key: 'amount' | 'instock' | 'intransitstock' | 'deliveredstock'): number {
  if (!invoices) return 0;

  return invoices.reduce((total, invoice) => {
    const productSum = invoice.products?.reduce(
      (sum: number, prod: any) => sum + Number(prod[key] || 0),
      0
    ) || 0;
    return total + Number(productSum || 0);
  }, 0);
}

  getInStockAmountTotal(invoices: any[]): number {
    return this.getProductTotal(invoices, 'instock');
  }
  getInvoiceAmountTotal(invoices: any[]): number {
    let total = 0;
    (invoices || []).forEach((inv) => {
      (inv.products || []).forEach((prod: any) => {
        total += Number(prod.amount || 0);
      });
    });
    return total;
  }

  applyFilters(): void {
    this.filteredShipments = this.shipments.filter(s => {
      const matchesSearch = this.searchText
        ? (s.consignmentNumber?.toLowerCase().includes(this.searchText.toLowerCase()) ||
           s.consignor?.toLowerCase().includes(this.searchText.toLowerCase()))
        : true;

      const matchesDate = this.filterDate
        ? new Date(s.date).toDateString() === new Date(this.filterDate).toDateString()
        : true;

      const matchesStatus = this.filterStatus
        ? s.shipmentStatus === this.filterStatus
        : true;

      const matchesConsignor = this.filterConsignor
        ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase())
        : true;

      return matchesSearch && matchesDate && matchesStatus && matchesConsignor;
    });
    this.filteredReceived = this.receivedShipments.filter(s => {
      const branchName = String(localStorage.getItem('branch') || '').trim();
      const deliveryName = this.getDeliveryDisplayName(s).toLowerCase();
      let matchesDelivery = true;
      if (branchName) {
        if (branchName === 'All Branches') {
          const branchNames = (this.branches || []).map(b => String(b?.branchName || '').toLowerCase()).filter(Boolean);
          matchesDelivery = branchNames.includes(deliveryName);
        } else {
          matchesDelivery = deliveryName === branchName.toLowerCase();
        }
      }
      const matchesSearch = this.searchText
        ? (s.consignmentNumber?.toLowerCase().includes(this.searchText.toLowerCase()) ||
           s.consignor?.toLowerCase().includes(this.searchText.toLowerCase()))
        : true;

      const matchesDate = this.filterDate
        ? new Date(s.date).toDateString() === new Date(this.filterDate).toDateString()
        : true;

      const matchesStatus = this.filterStatus
        ? s.shipmentStatus === this.filterStatus
        : true;

      const matchesConsignor = this.filterConsignor
        ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase())
        : true;

      return matchesDelivery && matchesSearch && matchesDate && matchesStatus && matchesConsignor;
    });
  }

  hasSelectedReceived(): boolean {
    return (this.filteredReceived || []).some(s => s._returnSelected);
  }

  getSelectedReceived(): any[] {
    return (this.filteredReceived || []).filter(s => s._returnSelected);
  }

  toggleAllReceived(event: any): void {
    const checked = event.target.checked;
    (this.filteredReceived || []).forEach(s => {
      if (this.isCancelled(s)) return;
      s._returnSelected = checked;
    });
  }

  openReturnModal(): void {
    if (!this.hasSelectedReceived()) return;
    this.getSelectedReceived().forEach((consignment) => {
      if (consignment.returnFinalAmount === undefined || consignment.returnFinalAmount === null || consignment.returnFinalAmount === '') {
        consignment.returnFinalAmount = consignment.finalAmount ?? '';
      }
    });
    this.showReturnModal = true;
    this.showReturnFinalAmount = false;
  }

  closeReturnModal(): void {
    this.showReturnModal = false;
    this.showReturnFinalAmount = false;
  }

  returnSelected(): void {
    const selected = (this.filteredReceived || []).filter(s => s._returnSelected);
    if (!selected.length) return;
    selected.forEach((consignment) => {
      if (this.showReturnFinalAmount) {
        this.createCustomerReturnConsignment(consignment);
      } else {
        this.createBranchReturnConsignment(consignment);
      }

      const now = new Date().toISOString();
      const username = localStorage.getItem('username') || '';
      const branch = localStorage.getItem('branch') || '';
      const updatedConsignment: any = {
        ...consignment,
        shipmentStatus: 'Returned',
        shipmentStatusDetails: branch
      };
      if (this.showReturnFinalAmount) {
        updatedConsignment.finalAmount = consignment.returnFinalAmount ?? consignment.finalAmount;
      }
      this.http.post('http://localhost:3000/api/newshipments/updateConsignment', { updatedConsignment })
        .subscribe({
          next: () => {
            this.loadReceivedShipments();
          },
          error: (err: any) => {
            console.error('Error returning consignment:', err);
          }
        });
    });
    selected.forEach(s => s._returnSelected = false);
    this.showReturnModal = false;
  }

  private isDelivered(shipment: any): boolean {
    const value = String(shipment?.shipmentStatus || '').toLowerCase();
    return value.includes('delivered');
  }

  isCancelled(shipment: any): boolean {
    const status = String(shipment?.shipmentStatus || '').toLowerCase();
    return status === 'cancelled' || status === 'returned';
  }

  private normalizeId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }

  private firstNonEmpty(...values: any[]): string {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return '-';
  }

  private resolveClientByIdOrName(id: any, name: any): any | null {
    const normId = this.normalizeId(id);
    const normName = String(name || '').trim().toLowerCase();
    return (this.clientList || []).find((c) =>
      (normId && this.normalizeId(c?._id) === normId) ||
      (normName && String(c?.clientName || '').trim().toLowerCase() === normName)
    ) || null;
  }

  private resolveGuestByIdOrName(id: any, name: any): any | null {
    const normId = this.normalizeId(id);
    const normName = String(name || '').trim().toLowerCase();
    return (this.guestList || []).find((g) =>
      (normId && this.normalizeId(g?._id) === normId) ||
      (normName && String(g?.guestName || '').trim().toLowerCase() === normName)
    ) || null;
  }

  private resolveBranchByIdOrName(id: any, name: any): any | null {
    const normId = this.normalizeId(id);
    const normName = String(name || '').trim().toLowerCase();
    return (this.branches || []).find((b) =>
      (normId && this.normalizeId(b?._id) === normId) ||
      (normName && String(b?.branchName || '').trim().toLowerCase() === normName)
    ) || null;
  }

  private resolveClientLocation(client: any, locationId: any): any | null {
    if (!client) return null;
    const normId = this.normalizeId(locationId);
    const locations = client?.deliveryLocations || [];
    if (!normId) return locations[0] || null;
    return locations.find((loc: any) => this.normalizeId(loc?.delivery_id) === normId) || null;
  }

  private enrichShipmentDetails(shipment: any): any {
    const enriched = { ...shipment };
    const consignor = shipment?.consignorTab === 'guest'
      ? this.resolveGuestByIdOrName(shipment?.consignorId, shipment?.consignor)
      : this.resolveClientByIdOrName(shipment?.consignorId, shipment?.consignor);
    const consignee = shipment?.consigneeTab === 'guest'
      ? this.resolveGuestByIdOrName(shipment?.consigneeId, shipment?.consignee)
      : this.resolveClientByIdOrName(shipment?.consigneeId, shipment?.consignee);

    enriched.consignor = this.firstNonEmpty(enriched.consignor, consignor?.clientName, consignor?.guestName);
    enriched.consignorGST = this.firstNonEmpty(enriched.consignorGST, consignor?.GSTIN, shipment?.consignorTab === 'guest' ? 'GUEST' : '');
    enriched.consignorPhone = this.firstNonEmpty(enriched.consignorPhone, consignor?.phoneNum);
    enriched.consignorAddress = this.firstNonEmpty(enriched.consignorAddress, consignor?.address);

    enriched.consignee = this.firstNonEmpty(enriched.consignee, consignee?.clientName, consignee?.guestName);
    enriched.consigneeGST = this.firstNonEmpty(enriched.consigneeGST, consignee?.GSTIN, shipment?.consigneeTab === 'guest' ? 'GUEST' : '');
    enriched.consigneePhone = this.firstNonEmpty(enriched.consigneePhone, consignee?.phoneNum);
    enriched.consigneeAddress = this.firstNonEmpty(enriched.consigneeAddress, consignee?.address);

    if (shipment?.billingType === 'consignor') {
      enriched.billingName = this.firstNonEmpty(enriched.billingName, enriched.consignor);
      enriched.billingGSTIN = this.firstNonEmpty(enriched.billingGSTIN, enriched.consignorGST);
      enriched.billingPhone = this.firstNonEmpty(enriched.billingPhone, enriched.consignorPhone);
      enriched.billingAddress = this.firstNonEmpty(enriched.billingAddress, enriched.consignorAddress);
    } else {
      const billingClient = this.resolveClientByIdOrName(shipment?.billingClientId, shipment?.billingName);
      enriched.billingName = this.firstNonEmpty(enriched.billingName, billingClient?.clientName);
      enriched.billingGSTIN = this.firstNonEmpty(enriched.billingGSTIN, billingClient?.GSTIN);
      enriched.billingPhone = this.firstNonEmpty(enriched.billingPhone, billingClient?.phoneNum);
      enriched.billingAddress = this.firstNonEmpty(enriched.billingAddress, billingClient?.address);
    }

    if (shipment?.pickupType === 'branch') {
      const pickupBranch = this.resolveBranchByIdOrName(shipment?.pickupLocationId, shipment?.pickupName) ||
        this.resolveBranchByIdOrName(null, shipment?.branch);
      enriched.pickupName = this.firstNonEmpty(enriched.pickupName, pickupBranch?.branchName);
      enriched.pickupAddress = this.firstNonEmpty(enriched.pickupAddress, pickupBranch?.address);
      enriched.pickupPhone = this.firstNonEmpty(enriched.pickupPhone, pickupBranch?.phoneNum);
      enriched.pickupPincode = this.firstNonEmpty(enriched.pickupPincode, pickupBranch?.pinCode);
    } else if (shipment?.pickupType === 'consignor') {
      enriched.pickupName = this.firstNonEmpty(enriched.pickupName, enriched.consignor);
      enriched.pickupAddress = this.firstNonEmpty(enriched.pickupAddress, enriched.consignorAddress);
      enriched.pickupPhone = this.firstNonEmpty(enriched.pickupPhone, enriched.consignorPhone);
      enriched.pickupPincode = this.firstNonEmpty(enriched.pickupPincode, consignor?.pinCode);
    }

    if (shipment?.deliveryType === 'branch') {
      const deliveryBranch = this.resolveBranchByIdOrName(shipment?.deliveryID, shipment?.deliveryName);
      enriched.deliveryName = this.firstNonEmpty(enriched.deliveryName, deliveryBranch?.branchName);
      enriched.deliveryAddress = this.firstNonEmpty(enriched.deliveryAddress, deliveryBranch?.address);
      enriched.deliveryPhone = this.firstNonEmpty(enriched.deliveryPhone, deliveryBranch?.phoneNum);
      enriched.deliveryPincode = this.firstNonEmpty(enriched.deliveryPincode, deliveryBranch?.pinCode);
    } else {
      const deliveryClient = this.resolveClientByIdOrName(shipment?.deliveryClientId || shipment?.deliveryID, shipment?.deliveryName);
      const deliveryGuest = this.resolveGuestByIdOrName(shipment?.deliveryID, shipment?.deliveryName);
      const deliveryLocation = this.resolveClientLocation(deliveryClient, shipment?.deliveryLocationId);
      enriched.deliveryName = this.firstNonEmpty(enriched.deliveryName, deliveryClient?.clientName, deliveryGuest?.guestName, enriched.consignee);
      enriched.deliveryAddress = this.firstNonEmpty(enriched.deliveryAddress, deliveryLocation?.address, deliveryClient?.address, deliveryGuest?.address, enriched.consigneeAddress);
      enriched.deliveryPhone = this.firstNonEmpty(enriched.deliveryPhone, deliveryClient?.phoneNum, deliveryGuest?.phoneNum, enriched.consigneePhone);
      enriched.deliveryPincode = this.firstNonEmpty(enriched.deliveryPincode, deliveryLocation?.pinCode, deliveryClient?.pinCode, deliveryGuest?.pinCode);
    }

    return enriched;
  }

  getDeliveryDisplayName(shipment: any): string {
    const name = String(shipment?.deliveryName || '').trim();
    if (name) return name;
    const deliveryId = this.normalizeId(shipment?.deliveryID);
    if (!deliveryId) return '-';
    const branch = (this.branches || []).find(b => this.normalizeId(b?._id) === deliveryId);
    if (branch?.branchName) return branch.branchName;
    const client = (this.clientList || []).find(c => this.normalizeId(c?._id) === deliveryId);
    if (client?.clientName) return client.clientName;
    const guest = (this.guestList || []).find(g => this.normalizeId(g?._id) === deliveryId);
    if (guest?.guestName) return guest.guestName;
    return deliveryId;
  }

  private getReturnBranchName(consignment: any): string {
    const deliveryName = String(this.getDeliveryDisplayName(consignment) || '').trim();
    if (deliveryName && deliveryName !== '-') return deliveryName;
    const currentBranch = String(localStorage.getItem('branch') || '').trim();
    if (currentBranch && currentBranch !== 'All Branches') return currentBranch;
    return String(consignment?.branch || '').trim();
  }

  private getOriginBranchName(consignment: any): string {
    return String(consignment?.branch || '').trim();
  }

  private getReturnEwaybills(consignment: any): any[] {
    const ewaybills = Array.isArray(consignment?.ewaybills) ? consignment.ewaybills : [];
    if (ewaybills.length) return ewaybills;
    const invoices = Array.isArray(consignment?.invoices) ? consignment.invoices : [];
    if (!invoices.length) return [];
    return [{ invoices }];
  }

  private getBranchIdByName(name: string): string | null {
    const match = (this.branches || []).find(b => String(b?.branchName || '').toLowerCase() === name.toLowerCase());
    return match?._id || null;
  }

  private buildReturnPayload(consignment: any, options: {
    consignmentNumber: string;
    branchName: string;
    finalAmount: number | string;
    swapAddresses: boolean;
    deliveryBranchName?: string;
  }): any {
    const now = new Date().toISOString();
    const username = localStorage.getItem('username') || '';
    const pickupFields = {
      type: consignment.pickupType,
      id: consignment.pickupLocationId ?? null,
      name: consignment.pickupName,
      address: consignment.pickupAddress,
      phone: consignment.pickupPhone,
      pincode: consignment.pickupPincode,
      locationId: consignment.pickupLocationId,
      clientId: consignment.pickupClientId
    };
    const deliveryFields = {
      type: consignment.deliveryType,
      id: consignment.deliveryID,
      name: consignment.deliveryName,
      address: consignment.deliveryAddress,
      phone: consignment.deliveryPhone,
      pincode: consignment.deliveryPincode,
      locationId: consignment.deliveryLocationId,
      clientId: consignment.deliveryClientId
    };
    const finalPickup = options.swapAddresses ? deliveryFields : pickupFields;
    const finalDelivery = options.swapAddresses ? pickupFields : deliveryFields;
    const deliveryId = options.swapAddresses && finalDelivery.type === 'branch'
      ? this.getBranchIdByName(String(finalDelivery.name || '')) || finalDelivery.id
      : finalDelivery.id;

    const statusDetailsBranch = options.branchName || consignment.branch || localStorage.getItem('branch') || '';
    const payload: any = {
      username,
      branch: options.branchName || consignment.branch,
      shipmentStatus: 'Pending',
      shipmentStatusDetails: statusDetailsBranch,
      consignmentNumber: options.consignmentNumber,
      date: now,
      paymentMode: consignment.paymentMode,
      externalRefId: consignment.externalRefId,
      consignorTab: consignment.consignorTab,
      consignor: consignment.consignor,
      consignorGST: consignment.consignorGST,
      consignorAddress: consignment.consignorAddress,
      consignorPhone: consignment.consignorPhone,
      consignorId: consignment.consignorId,
      consigneeTab: consignment.consigneeTab,
      consignee: consignment.consignee,
      consigneeGST: consignment.consigneeGST,
      consigneeAddress: consignment.consigneeAddress,
      consigneePhone: consignment.consigneePhone,
      consigneeId: consignment.consigneeId,
      billingType: consignment.billingType,
      billingName: consignment.billingName,
      billingGSTIN: consignment.billingGSTIN,
      billingAddress: consignment.billingAddress,
      billingPhone: consignment.billingPhone,
      billingLocationId: consignment.billingLocationId,
      billingClientId: consignment.billingClientId,
      pickupType: finalPickup.type,
      pickupName: finalPickup.name,
      pickupAddress: finalPickup.address,
      pickupPhone: finalPickup.phone,
      pickupPincode: finalPickup.pincode,
      pickupLocationId: finalPickup.locationId,
      deliveryType: finalDelivery.type,
      deliveryID: deliveryId,
      deliveryName: finalDelivery.name,
      deliveryAddress: finalDelivery.address,
      deliveryPhone: finalDelivery.phone,
      deliveryPincode: finalDelivery.pincode,
      deliveryLocationId: finalDelivery.locationId,
      deliveryClientId: finalDelivery.clientId,
      ewaybills: this.getReturnEwaybills(consignment),
      charges: consignment.charges,
      finalAmount: options.finalAmount
    };

    if (options.deliveryBranchName) {
      const deliveryBranch = this.resolveBranchByIdOrName(null, options.deliveryBranchName);
      payload.deliveryType = 'branch';
      payload.deliveryID = deliveryBranch?._id || payload.deliveryID;
      payload.deliveryName = deliveryBranch?.branchName || options.deliveryBranchName;
      payload.deliveryAddress = deliveryBranch?.address || payload.deliveryAddress;
      payload.deliveryPhone = deliveryBranch?.phoneNum || payload.deliveryPhone;
      payload.deliveryPincode = deliveryBranch?.pinCode || payload.deliveryPincode;
      payload.deliveryLocationId = null;
      payload.deliveryClientId = null;
    }

    return payload;
  }

  private createBranchReturnConsignment(consignment: any): void {
    const deliveryBranchName = this.getReturnBranchName(consignment);
    const originBranchName = this.getOriginBranchName(consignment);
    const suffix = originBranchName || deliveryBranchName || String(localStorage.getItem('branch') || '').trim();
    const annotatedNumber = `${consignment.consignmentNumber}/${suffix}/R`;
    const payload = this.buildReturnPayload(consignment, {
      consignmentNumber: annotatedNumber,
      branchName: deliveryBranchName || consignment.branch,
      finalAmount: consignment.finalAmount ?? 0,
      swapAddresses: false,
      deliveryBranchName: originBranchName || consignment.branch
    });
    this.http.post(
      'http://localhost:3000/api/newshipments/add?summary=true',
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    ).subscribe({
      error: (err: any) => console.error('Error creating return consignment:', err)
    });
  }

  private createCustomerReturnConsignment(consignment: any): void {
    const branchName = this.getReturnBranchName(consignment);
    if (!branchName || branchName === 'All Branches') {
      console.error('Missing branch for return consignment number');
      return;
    }
    const username = localStorage.getItem('username') || '';
    this.http.get<{ nextNumber: number }>(
      `http://localhost:3000/api/newshipments/nextConsignment?username=${encodeURIComponent(username)}&branch=${encodeURIComponent(branchName)}`
    ).subscribe({
      next: (res) => {
        const payload = this.buildReturnPayload(consignment, {
          consignmentNumber: String(res.nextNumber || ''),
          branchName,
          finalAmount: consignment.returnFinalAmount ?? consignment.finalAmount ?? 0,
          swapAddresses: true,
          deliveryBranchName: this.getOriginBranchName(consignment)
        });
        this.http.post(
          'http://localhost:3000/api/newshipments/add?summary=true',
          payload,
          { headers: { 'Content-Type': 'application/json' } }
        ).subscribe({
          error: (err: any) => console.error('Error creating return consignment:', err)
        });
      },
      error: (err: any) => console.error('Error fetching next consignment number:', err)
    });
  }

  // ✅ open details modal
  openShipmentDetails(shipment: any): void {
    this.selectedShipment = this.enrichShipmentDetails(shipment);
  }

  // ✅ close details modal
  closeShipmentDetails(): void {
    this.selectedShipment = null;
  }
}



