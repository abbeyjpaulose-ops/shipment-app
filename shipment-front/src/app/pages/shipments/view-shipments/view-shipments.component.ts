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
  hubs: any[] = [];
  originLocId: string = localStorage.getItem('originLocId') || 'all';
  selectedHubFilterId: string | null = null;
  selectedHubFilterName: string = '';
  clientList: any[] = [];
  guestList: any[] = [];
  email: string = '';

  searchText: string = '';
  filterDate: string = '';
  filterStatus: string = '';
  filterConsignor: string = '';
  activeTab: 'all' | 'received' = 'all';

  selectedShipment: any | null = null;   // ✅ for modal popup
  selectedShipmentManifestId: string | null = null;
  selectedShipmentManifestNumber: string | null = null;
  showReturnModal: boolean = false;
  showReturnFinalAmount: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.email = localStorage.getItem('email') || '';
    this.loadShipments();
    this.loadReceivedShipments();
    this.loadBranches();
    this.loadHubs();
    this.loadClients();
    this.loadGuests();
  }

  loadShipments(): void {
    const storedoriginLocId = localStorage.getItem('originLocId') || 'all';
    const params: any = {
      username: localStorage.getItem('username') || ''
    };
    const originFilter = this.getSelectedOrigin();
    if (originFilter) {
      params.originType = originFilter.originType;
      params.originLocId = originFilter.originLocId;
    } else {
      params.originLocId = storedoriginLocId === 'all-hubs' ? 'all' : storedoriginLocId;
    }
    this.http.get<any[]>('http://localhost:3000/api/newshipments', { params }).subscribe({
      next: (res: any[]) => {
        const normalized = (res || []).map((shipment) => ({
          ...shipment,
          branch: this.getOriginBranchDisplay(shipment),
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
        originLocId: 'all'
      }
    }).subscribe({
      next: (res: any[]) => {
        const normalized = (res || []).map((shipment) => ({
          ...shipment,
          branch: this.getOriginBranchDisplay(shipment),
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

  loadHubs(): void {
    this.http.get<any[]>('http://localhost:3000/api/hubs')
      .subscribe({
        next: (hubs) => {
          this.hubs = hubs || [];
        },
        error: (err: any) => console.error('Error loading hubs:', err)
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
    this.originLocId = localStorage.getItem('originLocId') || 'all';
    const originLocId = String(this.originLocId || '').trim();
    const hubFilterId = this.normalizeId(this.selectedHubFilterId);
    const useHubFilter = originLocId === 'all-hubs';

    if (useHubFilter && !hubFilterId) {
      const storedHubId = this.normalizeId(localStorage.getItem('hubId'));
      const storedHubName = String(localStorage.getItem('hubName') || '').trim();
      if (storedHubId) {
        const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === storedHubId);
        this.selectedHubFilterId = storedHubId;
        this.selectedHubFilterName = String(hub?.hubName || storedHubName || '').trim();
      } else {
        const options = this.getAllHubsFilterOptions();
        const firstHubId = this.normalizeId(options?.[0]?._id);
        this.selectedHubFilterId = firstHubId || null;
        this.selectedHubFilterName = String(options?.[0]?.hubName || '').trim();
      }
    }

    const effectiveHubFilterId = this.normalizeId(this.selectedHubFilterId);
    if (effectiveHubFilterId && !this.selectedHubFilterName) {
      const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === effectiveHubFilterId);
      this.selectedHubFilterName = String(hub?.hubName || '').trim();
    }
    const effectiveHubName = this.selectedHubFilterName;

    const storedBranchName = String(localStorage.getItem('branch') || '').trim();

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

      const matchesHub = !useHubFilter || (
        effectiveHubFilterId && this.matchesHubFilterForShipment(s, effectiveHubFilterId, effectiveHubName)
      );

      const matchesBranchColumn = (() => {
        const originId = this.getOriginId(s);
        const originLabel = String(s?.branch || '').trim();
        if (!originLocId || originLocId === 'all') return true;
        if (originLocId === 'all-hubs') {
          if (!effectiveHubFilterId) return false;
          const hubNameLower = String(effectiveHubName || '').trim().toLowerCase();
          const originLower = originLabel.toLowerCase();
          return originId === effectiveHubFilterId ||
            (hubNameLower && (originLower === hubNameLower || this.matchesBranchLabel(originLabel, effectiveHubName)));
        }
        const selectedoriginLocId = this.normalizeId(originLocId);
        const branchById = (this.branches || []).find(
          (b) => this.normalizeId(b?._id) === selectedoriginLocId
        );
        const selectedBranchName = String(branchById?.branchName || storedBranchName || '').trim();
        const selectedLower = selectedBranchName.toLowerCase();
        const originLower = originLabel.toLowerCase();
        return originId === selectedoriginLocId ||
          (selectedLower && (originLower === selectedLower || this.matchesBranchLabel(originLabel, selectedBranchName)));
      })();

      return matchesSearch && matchesDate && matchesStatus && matchesConsignor && matchesHub && matchesBranchColumn;
    });
    this.filteredReceived = this.receivedShipments.filter(s => {
      const matchesDelivery = true;

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
  getAllHubsFilterOptions(): any[] {
    return this.hubs || [];
  }

  onHubFilterChange(value: string | null): void {
    this.selectedHubFilterId = value;
    const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === this.normalizeId(value));
    this.selectedHubFilterName = String(hub?.hubName || '').trim();
    if (value) {
      localStorage.setItem('hubId', String(value));
      localStorage.setItem('hubName', this.selectedHubFilterName);
    }
    this.applyFilters();
  }

  private matchesHubIdOrName(idValue: any, labelValue: any, hubId: string, hubName: string): boolean {
    if (!hubId) return false;
    const id = this.normalizeId(idValue);
    const label = String(labelValue || '').trim();
    const hasHubName = Boolean(hubName);
    if (id && id === hubId) return true;
    if (!hasHubName || !label) return false;
    const hubNameLower = hubName.toLowerCase();
    const labelLower = label.toLowerCase();
    return labelLower === hubNameLower || this.matchesBranchLabel(label, hubName);
  }

  private matchesHubFilterForShipment(shipment: any, hubId: string, hubName: string): boolean {
    const currentId = this.normalizeId(
      shipment?.currentLocationId || shipment?.currentBranch
    );
    const currentLabel = String(shipment?.currentBranch || '').trim();
        const originId = this.getOriginId(shipment);
    const originLabel = String(shipment?.branch || '').trim();
    return (
      this.matchesHubIdOrName(currentId, currentLabel, hubId, hubName) ||
      this.matchesHubIdOrName(originId, originLabel, hubId, hubName)
    );
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
      const statusDetailsBranch = branch ? `/${branch}` : '';
      const updatedConsignment: any = {
        ...consignment,
        shipmentStatus: 'Returned',
        shipmentStatusDetails: statusDetailsBranch
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

  private getSelectedOrigin(): { originType: 'branch' | 'hub'; originLocId: string } | null {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (!originLocId || originLocId === 'all') return null;
    if (originLocId === 'all-hubs') {
      const hubId = this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'));
      return hubId ? { originType: 'hub', originLocId: hubId } : null;
    }
    const normalized = this.normalizeId(originLocId);
    return normalized ? { originType: 'branch', originLocId: normalized } : null;
  }

  private getOriginId(shipment: any): string {
    if (!shipment) return '';
    const raw = shipment?.originLocId || shipment?.originLocId|| shipment?.originLocId || shipment?.branch;
    return this.normalizeId(raw);
  }

  getCurrentBranchDisplay(shipment: any): string {
    const currentLocationId = this.normalizeId(
      shipment?.currentLocationId || shipment?.currentBranch
    );
    if (!currentLocationId) return '-';
    const branch = (this.branches || []).find(b => this.normalizeId(b?._id) === currentLocationId);
    if (branch?.branchName) return branch.branchName;
    const hub = (this.hubs || []).find(h => this.normalizeId(h?._id) === currentLocationId);
    if (hub?.hubName) return hub.hubName;
    return currentLocationId;
  }

  getOriginBranchDisplay(shipment: any): string {
    const originoriginLocId = this.getOriginId(shipment);
    if (!originoriginLocId) return '-';
    const branch = (this.branches || []).find(b => this.normalizeId(b?._id) === originoriginLocId);
    if (branch?.branchName) return branch.branchName;
    const hub = (this.hubs || []).find(h => this.normalizeId(h?._id) === originoriginLocId);
    if (hub?.hubName) return hub.hubName;
    return originoriginLocId;
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

  private resolveHubByIdOrName(id: any, name: any): any | null {
    const normId = this.normalizeId(id);
    const normName = String(name || '').trim().toLowerCase();
    return (this.hubs || []).find((h) =>
      (normId && this.normalizeId(h?._id) === normId) ||
      (normName && String(h?.hubName || '').trim().toLowerCase() === normName)
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

    const isSelfPickup =
      shipment?.deliveryType === 'Customer self pick up' ||
      shipment?.deliveryType === 'branch' ||
      shipment?.deliveryType === 'hub';
    if (isSelfPickup) {
      const deliveryBranch = this.resolveBranchByIdOrName(shipment?.deliveryID, shipment?.deliveryName);
      const deliveryHub = deliveryBranch ? null : this.resolveHubByIdOrName(shipment?.deliveryID, shipment?.deliveryName);
      enriched.deliveryName = this.firstNonEmpty(enriched.deliveryName, deliveryBranch?.branchName, deliveryHub?.hubName);
      enriched.deliveryAddress = this.firstNonEmpty(enriched.deliveryAddress, deliveryBranch?.address, deliveryHub?.address);
      enriched.deliveryPhone = this.firstNonEmpty(enriched.deliveryPhone, deliveryBranch?.phoneNum, deliveryHub?.phoneNum);
      enriched.deliveryPincode = this.firstNonEmpty(enriched.deliveryPincode, deliveryBranch?.pinCode, deliveryHub?.pinCode);
    } else {
      const deliveryClient = this.resolveClientByIdOrName(shipment?.deliveryID, shipment?.deliveryName);
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
    const currentoriginLocId = this.normalizeId(localStorage.getItem('originLocId'));
    if (currentoriginLocId && currentoriginLocId !== 'all') {
      const branch = (this.branches || []).find(b => this.normalizeId(b?._id) === currentoriginLocId);
      if (branch?.branchName) return branch.branchName;
    }
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

  private getoriginLocIdByName(name: string): string | null {
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
      locationId: consignment.deliveryLocationId
    };
    const finalPickup = options.swapAddresses ? deliveryFields : pickupFields;
    const finalDelivery = options.swapAddresses ? pickupFields : deliveryFields;
    const isSelfPickup =
      finalDelivery.type === 'Customer self pick up' ||
      finalDelivery.type === 'branch' ||
      finalDelivery.type === 'hub';
    const deliveryId = options.swapAddresses && isSelfPickup
      ? this.getoriginLocIdByName(String(finalDelivery.name || '')) || finalDelivery.id
      : finalDelivery.id;

    const rawStatusDetailsBranch = options.branchName || consignment.branch || localStorage.getItem('branch') || '';
    const statusDetailsBranch = rawStatusDetailsBranch ? `/${rawStatusDetailsBranch}` : '';
    const payload: any = {
      username,
      branch: options.branchName || consignment.branch,
      originLocId:
        this.getOriginId(consignment) ||
        this.getoriginLocIdByName(String(options.branchName || consignment.branch || '')) ||
        consignment.originLocId,
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
      ewaybills: this.getReturnEwaybills(consignment),
      charges: consignment.charges,
      finalAmount: options.finalAmount
    };

    if (options.deliveryBranchName) {
      const deliveryBranch = this.resolveBranchByIdOrName(null, options.deliveryBranchName);
      payload.deliveryType = 'Customer self pick up';
      payload.deliveryID = deliveryBranch?._id || payload.deliveryID;
      payload.deliveryName = deliveryBranch?.branchName || options.deliveryBranchName;
      payload.deliveryAddress = deliveryBranch?.address || payload.deliveryAddress;
      payload.deliveryPhone = deliveryBranch?.phoneNum || payload.deliveryPhone;
      payload.deliveryPincode = deliveryBranch?.pinCode || payload.deliveryPincode;
      payload.deliveryLocationId = null;
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
      `http://localhost:3000/api/newshipments/nextConsignment?username=${encodeURIComponent(username)}&originLocId=${encodeURIComponent(this.getoriginLocIdByName(branchName) || '')}&branch=${encodeURIComponent(branchName)}`
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
    const enriched = this.enrichShipmentDetails(shipment);
    this.selectedShipment = enriched;
    this.selectedShipmentManifestId = null;
    this.selectedShipmentManifestNumber = null;
    this.loadManifestForShipment(enriched?.consignmentNumber);
  }

  // ✅ close details modal
  closeShipmentDetails(): void {
    this.selectedShipment = null;
    this.selectedShipmentManifestId = null;
    this.selectedShipmentManifestNumber = null;
  }

  private loadManifestForShipment(consignmentNumber: string | null | undefined): void {
    const key = String(consignmentNumber || '').trim();
    if (!key) {
      this.selectedShipmentManifestId = null;
      this.selectedShipmentManifestNumber = null;
      return;
    }
    this.http.get<any[]>('http://localhost:3000/api/manifests', {
      params: { consignmentNumber: key }
    }).subscribe({
      next: (manifests: any[]) => {
        const manifest = Array.isArray(manifests) && manifests.length ? manifests[0] : null;
        this.selectedShipmentManifestId = manifest?._id ? String(manifest._id) : null;
        this.selectedShipmentManifestNumber = manifest?.manifestNumber || null;
      },
      error: () => {
        this.selectedShipmentManifestId = null;
        this.selectedShipmentManifestNumber = null;
      }
    });
  }

  getManifestUrl(id: string | null | undefined): string {
    const manifestId = String(id || '').trim();
    return manifestId ? `/manifests/${manifestId}` : '#';
  }
}


