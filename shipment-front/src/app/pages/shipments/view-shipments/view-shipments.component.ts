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
  isEditingConsignment: boolean = false;
  editingShipment: any | null = null;
  isSavingConsignment: boolean = false;
  editQuoteSubtotal: number = 0;
  showReturnModal: boolean = false;
  showReturnFinalAmount: boolean = false;
  // selection for print
  private selectedShipmentIds: Set<string> = new Set();
  isAllViewShipmentsSelected = false;

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

  isInvoiceOnProcess(shipment: any): boolean {
    const invoiceStatus = String(shipment?.invoiceStatus || '').trim().toLowerCase();
    const shipmentStatus = String(shipment?.shipmentStatus || '').trim().toLowerCase();
    if (!invoiceStatus) return false;
    if (shipmentStatus.includes('deleted')) return false;
    return invoiceStatus === 'onprocess';
  }

  // --- View Shipments selection helpers (print) ---
  private getShipmentKey(shipment: any): string {
    if (!shipment) return '';
    const byId = shipment._id || shipment.id || shipment.consignmentNumber;
    return String(byId || '').trim();
  }

  isViewShipmentSelected(shipment: any): boolean {
    const key = this.getShipmentKey(shipment);
    return key ? this.selectedShipmentIds.has(key) : false;
  }

  toggleShipmentSelection(shipment: any): void {
    const key = this.getShipmentKey(shipment);
    if (!key) return;
    if (this.selectedShipmentIds.has(key)) {
      this.selectedShipmentIds.delete(key);
    } else {
      this.selectedShipmentIds.add(key);
    }
    this.isAllViewShipmentsSelected =
      !!this.filteredShipments.length &&
      this.filteredShipments.every((s) => this.isViewShipmentSelected(s));
  }

  toggleSelectAllShipments(event: any): void {
    const checked = Boolean(event?.target?.checked);
    this.isAllViewShipmentsSelected = checked;
    this.selectedShipmentIds.clear();
    if (checked) {
      (this.filteredShipments || []).forEach((s) => {
        const key = this.getShipmentKey(s);
        if (key) this.selectedShipmentIds.add(key);
      });
    }
  }

  get isPrintEnabled(): boolean {
    return this.selectedShipmentIds.size > 0;
  }

  printSelectedShipments(): void {
    const selected = (this.filteredShipments || []).filter((s) => this.isViewShipmentSelected(s));
    const baseSelection = selected.length ? selected : (this.filteredShipments || []).slice(0, 1);
    if (!baseSelection.length) return;
    const toPrint = baseSelection.map((s) => this.enrichShipmentDetails(s));
    const html = this.buildPrintDocument(toPrint);
    // Use hidden iframe to avoid popup blockers and blank prints.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    const onLoad = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => iframe.remove(), 500);
      }
    };
    if (iframe.contentWindow?.document?.readyState === 'complete') {
      setTimeout(onLoad, 25);
    } else {
      iframe.onload = onLoad;
    }
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

  private splitCompositeLocation(value: any): { id: string; label: string } {
    if (!value) return { id: '', label: '' };
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return { id: '', label: '' };
      const parts = trimmed.split('$$');
      if (parts.length === 1) {
        return { id: trimmed, label: trimmed };
      }
      const id = String(parts[parts.length - 1] || '').trim();
      const label = parts.slice(0, -1).join('$$').trim();
      return { id, label };
    }
    if (value?._id) return { id: String(value._id), label: '' };
    if (value?.$oid) return { id: String(value.$oid), label: '' };
    return { id: String(value), label: '' };
  }

  private normalizeId(value: any): string {
    const { id, label } = this.splitCompositeLocation(value);
    return id || label;
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
    const raw = shipment?.currentLocationId || shipment?.currentBranch;
    const { id, label } = this.splitCompositeLocation(raw);
    const currentLocationId = id || this.normalizeId(raw);
    if (!currentLocationId && !label) return '-';
    if (currentLocationId) {
      const branch = (this.branches || []).find(b => this.normalizeId(b?._id) === currentLocationId);
      if (branch?.branchName) return branch.branchName;
      const hub = (this.hubs || []).find(h => this.normalizeId(h?._id) === currentLocationId);
      if (hub?.hubName) return hub.hubName;
    }
    if (label) return label;
    return currentLocationId || '-';
  }

  getOriginBranchDisplay(shipment: any): string {
    const raw = shipment?.originLocId || shipment?.branch || shipment?.branchName;
    const { id, label } = this.splitCompositeLocation(raw);
    const originLocId = id || this.normalizeId(raw);
    if (!originLocId && !label) return '-';
    if (originLocId) {
      const branch = (this.branches || []).find(b => this.normalizeId(b?._id) === originLocId);
      if (branch?.branchName) return branch.branchName;
      const hub = (this.hubs || []).find(h => this.normalizeId(h?._id) === originLocId);
      if (hub?.hubName) return hub.hubName;
    }
    if (label) {
      const labelLower = label.toLowerCase();
      const branchByName = (this.branches || []).find(
        b => String(b?.branchName || '').trim().toLowerCase() === labelLower
      );
      if (branchByName?.branchName) return branchByName.branchName;
      const hubByName = (this.hubs || []).find(
        h => String(h?.hubName || '').trim().toLowerCase() === labelLower
      );
      if (hubByName?.hubName) return hubByName.hubName;
      return label;
    }
    return originLocId || '-';
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
    return locations.find((loc: any) => {
      const byDeliveryId = this.normalizeId(loc?.delivery_id);
      const byAltId = this.normalizeId(loc?.deliveryLocationId);
      return byDeliveryId === normId || byAltId === normId;
    }) || null;
  }

  private enrichShipmentDetails(shipment: any): any {
    const enriched = { ...shipment };
    const consignor = shipment?.consignorTab === 'guest'
      ? this.resolveGuestByIdOrName(shipment?.consignorId, shipment?.consignor)
      : this.resolveClientByIdOrName(shipment?.consignorId, shipment?.consignor);
    const consignorPrimaryLoc = this.resolveClientLocation(
      consignor,
      shipment?.pickupLocationId || shipment?.billingLocationId || shipment?.deliveryLocationId
    );
    const consignorLocAddress = (() => {
      if (!consignorPrimaryLoc) return '';
      const parts = [
        consignorPrimaryLoc.address || consignorPrimaryLoc.location,
        consignorPrimaryLoc.city,
        consignorPrimaryLoc.state,
        consignorPrimaryLoc.pinCode
      ].filter(Boolean);
      return parts.join(', ');
    })();
    const consignee = shipment?.consigneeTab === 'guest'
      ? this.resolveGuestByIdOrName(shipment?.consigneeId, shipment?.consignee)
      : this.resolveClientByIdOrName(shipment?.consigneeId, shipment?.consignee);
    const consigneePrimaryLoc = this.resolveClientLocation(consignee, shipment?.deliveryLocationId);
    const consigneeLocAddress = (() => {
      if (!consigneePrimaryLoc) return '';
      const parts = [
        consigneePrimaryLoc.address || consigneePrimaryLoc.location,
        consigneePrimaryLoc.city,
        consigneePrimaryLoc.state,
        consigneePrimaryLoc.pinCode
      ].filter(Boolean);
      return parts.join(', ');
    })();

    enriched.consignor = this.firstNonEmpty(enriched.consignor, consignor?.clientName, consignor?.guestName);
    enriched.consignorGST = this.firstNonEmpty(enriched.consignorGST, consignor?.GSTIN, shipment?.consignorTab === 'guest' ? 'GUEST' : '');
    enriched.consignorPhone = this.firstNonEmpty(enriched.consignorPhone, consignor?.phoneNum);
    enriched.consignorAddress = this.firstNonEmpty(
      enriched.consignorAddress,
      consignorLocAddress,
      consignor?.address,
      enriched.billingAddress,
      enriched.deliveryAddress,
      enriched.pickupAddress
    );

    enriched.consignee = this.firstNonEmpty(enriched.consignee, consignee?.clientName, consignee?.guestName);
    enriched.consigneeGST = this.firstNonEmpty(enriched.consigneeGST, consignee?.GSTIN, shipment?.consigneeTab === 'guest' ? 'GUEST' : '');
    enriched.consigneePhone = this.firstNonEmpty(enriched.consigneePhone, consignee?.phoneNum);
    enriched.consigneeAddress = this.firstNonEmpty(
      enriched.consigneeAddress,
      consigneeLocAddress,
      consignee?.address,
      shipment?.deliveryAddress
    );

    if (shipment?.billingType === 'consignor') {
      const consignorClient = this.resolveClientByIdOrName(shipment?.consignorId, shipment?.consignor);
      const consignorLoc = this.resolveClientLocation(
        consignorClient,
        shipment?.billingLocationId || shipment?.deliveryLocationId || shipment?.pickupLocationId
      );
      const consignorLocAddress = (() => {
        if (!consignorLoc) return '';
        const parts = [
          consignorLoc.address || consignorLoc.location,
          consignorLoc.city,
          consignorLoc.state,
          consignorLoc.pinCode
        ].filter(Boolean);
        return parts.join(', ');
      })();
      const consignorLocIdText = this.safeText(consignorLoc?.delivery_id ?? shipment?.billingLocationId);

      enriched.billingName = this.firstNonEmpty(enriched.billingName, enriched.consignor);
      enriched.billingGSTIN = this.firstNonEmpty(enriched.billingGSTIN, enriched.consignorGST);
      enriched.billingPhone = this.firstNonEmpty(enriched.billingPhone, consignorLoc?.phoneNum, enriched.consignorPhone);
      enriched.billingAddress = this.firstNonEmpty(
        enriched.billingAddress,
        consignorLocAddress,
        enriched.consignorAddress,
        enriched.deliveryAddress,
        enriched.pickupAddress,
        consignorLocIdText
      );
      enriched.billingLocationId = this.firstNonEmpty(enriched.billingLocationId, consignorLoc?.delivery_id, shipment?.billingLocationId);
    } else {
      const billingClient = this.resolveClientByIdOrName(shipment?.billingClientId, shipment?.billingName);
      const billingLocation = this.resolveClientLocation(billingClient, shipment?.billingLocationId);
      enriched.billingName = this.firstNonEmpty(enriched.billingName, billingClient?.clientName);
      enriched.billingGSTIN = this.firstNonEmpty(enriched.billingGSTIN, billingClient?.GSTIN);
      enriched.billingPhone = this.firstNonEmpty(enriched.billingPhone, billingClient?.phoneNum);
      const loc = billingLocation || (billingClient?.deliveryLocations || [])[0];
      const billingLocationIdText = this.safeText(loc?.delivery_id ?? shipment?.billingLocationId);
      const billingLocationAddress = (() => {
        if (!loc) return '';
        const parts = [
          loc.address || loc.location,
          loc.city,
          loc.state,
          loc.pinCode
        ].filter(Boolean);
        return parts.join(', ');
      })();
      // Prefer resolved billing location full address; then billing client's primary address; then other fallbacks; then id text
      enriched.billingAddress = this.firstNonEmpty(
        enriched.billingAddress,
        billingLocationAddress,
        billingClient?.address,
        shipment?.deliveryAddress,
        shipment?.consignorAddress,
        billingLocationIdText
      );
      // Always keep the resolved id handy for display fallbacks
      enriched.billingLocationId = this.firstNonEmpty(enriched.billingLocationId, loc?.delivery_id, shipment?.billingLocationId);
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
    this.isEditingConsignment = false;
    this.editingShipment = null;
    this.loadManifestForShipment(enriched?.consignmentNumber);
  }

  editSelectedConsignment(): void {
    if (!this.selectedShipment) return;
    this.isEditingConsignment = true;
    this.editingShipment = this.prepareShipmentForEdit(this.selectedShipment);
    this.recalculateEditTotals();
  }

  cancelConsignmentEdit(): void {
    this.isEditingConsignment = false;
    this.editingShipment = null;
  }

  saveConsignmentEdits(): void {
    if (!this.editingShipment) return;
    const updatedConsignment = this.buildConsignmentUpdatePayload(this.editingShipment);
    this.isSavingConsignment = true;
    this.http.post('http://localhost:3000/api/newshipments/updateConsignment', { updatedConsignment })
      .subscribe({
        next: (res: any) => {
          const data = res?.data ? this.enrichShipmentDetails(res.data) : this.enrichShipmentDetails(updatedConsignment);
          this.selectedShipment = data;
          this.cancelConsignmentEdit();
          this.loadShipments();
          this.loadReceivedShipments();
        },
        error: (err: any) => {
          console.error('Error updating consignment:', err);
          this.isSavingConsignment = false;
        },
        complete: () => {
          this.isSavingConsignment = false;
        }
      });
  }

  private prepareShipmentForEdit(shipment: any): any {
    const cloned = JSON.parse(JSON.stringify(shipment || {}));
    cloned.charges = this.normalizeCharges(cloned.charges);
    return cloned;
  }

  private buildConsignmentUpdatePayload(editing: any): any {
    const payload = { ...editing };
    delete payload.branch;
    delete payload.invoices;
    delete payload.ewaybills;
    delete payload._returnSelected;
    delete payload._id;
    payload.charges = this.normalizeCharges(payload.charges);
    if (payload.finalAmount !== undefined && payload.finalAmount !== null && payload.finalAmount !== '') {
      payload.finalAmount = Number(payload.finalAmount) || 0;
    }
    if (payload.taxableValue !== undefined && payload.taxableValue !== null && payload.taxableValue !== '') {
      payload.taxableValue = Number(payload.taxableValue) || 0;
    }
    if (payload.igstPercent !== undefined && payload.igstPercent !== null && payload.igstPercent !== '') {
      payload.igstPercent = Number(payload.igstPercent) || 0;
    }
    if (payload.initialPaid !== undefined && payload.initialPaid !== null && payload.initialPaid !== '') {
      payload.initialPaid = Number(payload.initialPaid) || 0;
    }
    delete payload.igstAmount;
    return payload;
  }

  private normalizeCharges(charges: any): any {
    const base = charges || {};
    return {
      ...base,
      odc: Number(base.odc || 0),
      unloading: Number(base.unloading || 0),
      docket: Number(base.docket || 0),
      other: Number(base.other || 0),
      ccc: Number(base.ccc || 0),
      consignorDiscount: Number(base.consignorDiscount || 0)
    };
  }

  recalculateEditTotals(): void {
    if (!this.editingShipment) return;
    this.editingShipment.charges = this.normalizeCharges(this.editingShipment.charges);
    const invoices = Array.isArray(this.editingShipment.invoices) ? this.editingShipment.invoices : [];
    const baseTotals = this.computeEditTotals(invoices, this.editingShipment.charges);
    this.editQuoteSubtotal = baseTotals.subtotal;

    const discountPercent = this.normalizeAmount(this.editingShipment.charges?.consignorDiscount);
    const discountAmount = (baseTotals.subtotal * discountPercent) / 100;
    const baseAmount = baseTotals.subtotal - discountAmount;

    const storedPercent = Number(this.editingShipment?.igstPercent);
    const fallbackPercent = Number(localStorage.getItem('companyType')) || 0;
    const igstPercent = Number.isFinite(storedPercent) ? storedPercent : fallbackPercent;
    this.editingShipment.igstPercent = igstPercent;
    const effectiveRate = this.getEffectiveIgstPercentForEdit(igstPercent);

    this.editingShipment.taxableValue = this.roundCurrency(baseAmount);
    const igstAmount = this.roundCurrency((this.editingShipment.taxableValue || 0) * effectiveRate / 100);
    this.editingShipment.igstAmount = igstAmount;
    this.editingShipment.finalAmount = this.roundCurrency((this.editingShipment.taxableValue || 0) + igstAmount);
  }

  onEditFinalAmountChange(value: any): void {
    if (!this.editingShipment) return;
    const raw = Number(value);
    const finalAmount = Number.isFinite(raw) ? raw : 0;
    this.editingShipment.finalAmount = this.roundCurrency(finalAmount);
    if (this.editQuoteSubtotal <= 0) return;
    const effectiveRate = this.getEffectiveIgstPercentForEdit(Number(this.editingShipment?.igstPercent) || 0);
    const multiplier = 1 + effectiveRate / 100;
    const taxable = multiplier > 0 ? this.editingShipment.finalAmount / multiplier : this.editingShipment.finalAmount;
    this.editingShipment.taxableValue = this.roundCurrency(taxable);
    this.editingShipment.igstAmount = this.roundCurrency(this.editingShipment.finalAmount - this.editingShipment.taxableValue);
    const discountPercent = ((this.editQuoteSubtotal - this.editingShipment.taxableValue) / this.editQuoteSubtotal) * 100;
    const safePercent = Number.isFinite(discountPercent) ? discountPercent : 0;
    this.editingShipment.charges.consignorDiscount = this.roundCurrency(Math.max(0, safePercent));
  }

  private computeEditTotals(invoices: any[], charges: any): { subtotal: number } {
    let invoiceTotal = 0;
    let packageTotal = 0;
    (invoices || []).forEach((inv: any) => {
      const products = Array.isArray(inv?.products) ? inv.products : [];
      const productTotal = products.reduce((sum: number, p: any) => {
        const qty = this.normalizeAmount(p?.amount);
        const rate = this.normalizeAmount(p?.ratePer);
        return sum + (qty * rate);
      }, 0);
      const invoiceValue = this.normalizeAmount(inv?.value);
      invoiceTotal += productTotal > 0 ? productTotal : invoiceValue;
      const packages = Array.isArray(inv?.packages) ? inv.packages : [];
      packageTotal += packages.reduce((sum: number, p: any) => sum + this.normalizeAmount(p?.amount), 0);
    });

    const chargeTotal = Object.entries(charges || {})
      .filter(([key]) => key !== 'consignorDiscount')
      .reduce((sum, [, value]) => sum + this.normalizeAmount(value), 0);

    return { subtotal: invoiceTotal + packageTotal + chargeTotal };
  }

  private getEffectiveIgstPercentForEdit(base: number): number {
    if (base === 5 && this.shouldGtaExemptEdit()) return 0;
    return base;
  }

  getViewTaxableValue(shipment: any): number {
    const raw = this.normalizeAmount(shipment?.taxableValue);
    if (raw > 0) return this.roundCurrency(raw);
    const finalAmount = this.normalizeAmount(shipment?.finalAmount);
    if (finalAmount <= 0) return 0;
    const effectiveRate = this.getEffectiveIgstPercentForView(shipment);
    const multiplier = 1 + effectiveRate / 100;
    return this.roundCurrency(multiplier > 0 ? finalAmount / multiplier : finalAmount);
  }

  getViewIgstPercent(shipment: any): number {
    const storedPercent = Number(shipment?.igstPercent);
    const fallbackPercent = Number(localStorage.getItem('companyType')) || 0;
    return Number.isFinite(storedPercent) ? storedPercent : fallbackPercent;
  }

  getViewIgstAmount(shipment: any): number {
    const taxableValue = this.getViewTaxableValue(shipment);
    const effectiveRate = this.getEffectiveIgstPercentForView(shipment);
    return this.roundCurrency(taxableValue * effectiveRate / 100);
  }

  getViewFinalAmount(shipment: any): number {
    const taxableValue = this.getViewTaxableValue(shipment);
    const igstAmount = this.getViewIgstAmount(shipment);
    return this.roundCurrency(taxableValue + igstAmount);
  }

  private getEffectiveIgstPercentForView(shipment: any): number {
    const base = this.getViewIgstPercent(shipment);
    if (base === 5 && this.shouldGtaExemptForShipment(shipment)) return 0;
    return base;
  }

  private shouldGtaExemptForShipment(shipment: any): boolean {
    if (this.isToPayModeForShipment(shipment)) {
      return String(shipment?.consigneeTab || '').toLowerCase() === 'consignee';
    }
    return this.isBillingClientForShipment(shipment);
  }

  private isBillingClientForShipment(shipment: any): boolean {
    if (String(shipment?.billingType || '') === 'consignor') {
      return String(shipment?.consignorTab || '').toLowerCase() === 'consignor';
    }
    return Boolean(shipment?.billingClientId);
  }

  private isToPayModeForShipment(shipment: any): boolean {
    return String(shipment?.paymentMode || '').toLowerCase().includes('to pay');
  }

  private shouldGtaExemptEdit(): boolean {
    if (this.isToPayModeEdit()) {
      return String(this.editingShipment?.consigneeTab || '').toLowerCase() === 'consignee';
    }
    return this.isBillingClientEdit();
  }

  private isBillingClientEdit(): boolean {
    if (String(this.editingShipment?.billingType || '') === 'consignor') {
      return String(this.editingShipment?.consignorTab || '').toLowerCase() === 'consignor';
    }
    return Boolean(this.editingShipment?.billingClientId);
  }

  private isToPayModeEdit(): boolean {
    return String(this.editingShipment?.paymentMode || '').toLowerCase().includes('to pay');
  }

  private normalizeAmount(value: any): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // ✅ close details modal
  closeShipmentDetails(): void {
    this.selectedShipment = null;
    this.selectedShipmentManifestId = null;
    this.selectedShipmentManifestNumber = null;
    this.isEditingConsignment = false;
    this.editingShipment = null;
  }

  // --- Print helpers ---
  private safeText(value: any): string {
    const text = String(value ?? '').trim();
    return text || '-';
  }

  private formatCurrency(value: any): string {
    const num = Number(value ?? 0);
    return `₹${num.toFixed(2)}`;
  }

  private getBranchAddress(branchName: string): string {
    const branch = (this.branches || []).find(
      (b) => String(b?.branchName || '').trim().toLowerCase() === String(branchName || '').trim().toLowerCase()
    );
    return branch?.address || '-';
  }

  private getBranchPhone(branchName: string): string {
    const branch = (this.branches || []).find(
      (b) => String(b?.branchName || '').trim().toLowerCase() === String(branchName || '').trim().toLowerCase()
    );
    return branch?.phoneNum || '';
  }

  private buildChargeRows(charges: any, goodsValue: number): { label: string; value: string; bold?: boolean }[] {
    const c = charges || {};
    const rows = [
      { label: 'LR Charge', value: this.formatCurrency(c.lrCharge ?? 0) },
      { label: 'Loading/Unloading Charges', value: this.formatCurrency(c.loadingUnloadingCharges ?? c.loadingCharges ?? 0) },
      { label: 'Freight', value: this.formatCurrency(c.freight ?? 0) },
      { label: 'Extra Charge', value: this.formatCurrency(c.extraCharge ?? 0) },
      { label: 'Taxable Value', value: this.formatCurrency(c.taxableValue ?? goodsValue) },
      { label: 'CGST(6%)', value: this.formatCurrency(c.cgst ?? c.cgst6 ?? 0) },
      { label: 'SGST(6%)', value: this.formatCurrency(c.sgst ?? c.sgst6 ?? 0) },
      { label: 'IGST(12%)', value: this.formatCurrency(c.igst ?? c.igst12 ?? 0) },
      { label: 'Net Total', value: this.formatCurrency(c.netTotal ?? c.total ?? goodsValue), bold: true },
      { label: 'Balance', value: this.formatCurrency(c.balance ?? 0) }
    ];
    return rows;
  }

  private buildItemsTable(shipment: any): string {
    const items = (shipment?.invoices || []).flatMap((inv: any) => inv.products || []);
    if (!items.length) {
      return `
        <tr><td>1</td><td>-</td><td>-</td></tr>
      `;
    }
    return items
      .map((prod: any, idx: number) => {
        const size = this.safeText(prod.type || prod.description || prod.name);
        const qty = this.safeText(prod.qty ?? prod.quantity ?? prod.instock ?? prod.amount);
        return `<tr><td>${idx + 1}</td><td>${size}</td><td>${qty}</td></tr>`;
      })
      .join('\n');
  }

  private buildSlip(shipment: any): string {
    const goodsValue = this.getInvoiceAmountTotal(shipment?.invoices || []);
    const charges = this.buildChargeRows(shipment?.charges, goodsValue);
    const branchName = this.safeText(this.getOriginBranchDisplay(shipment));
    const branchAddress = this.safeText(this.getBranchAddress(branchName));
    const branchPhone = this.safeText(this.getBranchPhone(branchName));
    const billingIdText = this.safeText(shipment?.billingLocationId);
    const billingAddrText = this.safeText(shipment?.billingAddress);
    const billingAddressDisplay = billingAddrText !== '-' ? billingAddrText : billingIdText;
    const billingPhoneDisplay = this.safeText(shipment?.billingPhone);
    return `
    <div class="slip">
      <div class="header-grid">
        <div class="cell">
          <div class="label">Branch:</div>
          <div class="value">${branchName}</div>
          <div class="label">Branch Address:</div>
          <div class="value">${branchAddress}</div>
        </div>
        <div class="cell center">
          <div class="title">Booking Slip</div>
          <div class="label">Booking Date:</div>
          <div class="value">${this.safeText(shipment?.date ? new Date(shipment.date).toLocaleString() : '')}</div>
        </div>
        <div class="cell">
          <div><strong>Consignment No.:</strong> ${this.safeText(shipment?.consignmentNumber)}</div>
          <div><strong>Eway Bill:</strong> ${this.safeText(shipment?.ewayBill || '-')}</div>
        </div>
      </div>

      <div class="header-grid">
        <div class="cell">
          <div class="label">FROM:</div>
          <div class="value">${this.safeText(shipment?.pickupName)}</div>
          <div class="value">${this.safeText(shipment?.pickupAddress)}</div>
          <div class="value">PH: ${this.safeText(shipment?.pickupPhone)}</div>
        </div>
        <div class="cell">
          <div class="label">TO:</div>
          <div class="value">${this.safeText(shipment?.deliveryAddress)}</div>
          <div class="value">PH: ${this.safeText(shipment?.deliveryPhone)}</div>
        </div>
        <div class="cell">
          <div class="label">Billing:</div>
          <div class="value">${this.safeText(shipment?.billingName)}</div>
          <div class="value">${billingAddressDisplay}</div>
          <div class="value">PH: ${billingPhoneDisplay}</div>
        </div>
      </div>

      <div class="header-grid">
        <div class="cell">
          <div class="label">Consignor:</div>
          <div class="value">${this.safeText(shipment?.consignor)}</div>
          <div class="value">GST: ${this.safeText(shipment?.consignorGST)}</div>
          <div class="value">PH: ${this.safeText(shipment?.consignorPhone)}</div>
        </div>
        <div class="cell">
          <div class="label">Consignee:</div>
          <div class="value">${this.safeText(shipment?.consignee)}</div>
          <div class="value">GST: ${this.safeText(shipment?.consigneeGST)}</div>
          <div class="value">PH: ${this.safeText(shipment?.consigneePhone)}</div>
        </div>
        <div class="cell center">
          <div class="label">Payment Mode</div>
          <div class="value">${this.safeText(shipment?.paymentMode)}</div>
        </div>
      </div>

        <div class="items-charges">
          <div class="items">
            <table class="items-table">
              <thead>
                <tr><th>Items</th><th>Size</th><th>Qty</th></tr>
              </thead>
            <tbody>
              ${this.buildItemsTable(shipment)}
            </tbody>
          </table>
        </div>
        <div class="charges">
          ${charges
            .map((row) => `<div class="charge-row${row.bold ? ' bold' : ''}"><span>${row.label}</span><span>${row.value}</span></div>`)
            .join('')}
        </div>
      </div>

      <div class="footer-grid">
        <div class="cell">Delivery Mode: ${this.safeText(shipment?.deliveryType || 'Out for Delivery')}</div>
        <div class="cell">Goods Value: ${this.formatCurrency(goodsValue)}</div>
        <div class="cell">Bill Invoice: ${this.safeText(shipment?.billingName)}</div>
        <div class="cell center">No. of Items: ${this.safeText((shipment?.invoices || []).reduce((acc: number, inv: any) => acc + (inv.products?.length || 0), 0))}</div>
      </div>

      <div class="terms-grid">
        <div>
          <div class="label">Terms & Conditions</div>
          <div class="value small">Consignments will be carried under OWNER's risk. Details are true to the best of our knowledge.</div>
        </div>
        <div>
          <div class="label">Received Goods in Good Condition</div>
          <div class="value small">
            Name: ______________________<br/>
            Date: ______________________<br/>
            Mobile: _____________________<br/>
            Signature &amp; Seal
          </div>
        </div>
      </div>
    </div>
    `;
  }

  private buildPrintDocument(selected: any[]): string {
    const slips = selected.map((s) => this.buildSlip(s)).join('<div class="page-break"></div>');
    const styles = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 16px; }
        .slip { border: 1px solid #000; padding: 12px; margin-bottom: 24px; page-break-inside: avoid; }
        .header-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #000; border-bottom: none; }
        .header-grid .cell { border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 8px; font-size: 12px; }
        .header-grid .cell:last-child { border-right: 0; }
        .header-grid .title { font-weight: 700; font-size: 14px; }
        .header-grid .label { font-weight: 700; }
        .header-grid .center { text-align: center; }
        .items-charges { display: grid; grid-template-columns: 2fr 1fr; border: 1px solid #000; border-top: none; }
        .items { border-right: 1px solid #000; }
        .items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .items-table th, .items-table td { border: 1px solid #000; padding: 6px; text-align: center; }
        .charges { padding: 8px; font-size: 12px; }
        .charge-row { display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding: 4px 0; }
        .charge-row:last-child { border-bottom: 0; }
        .charge-row.bold { font-weight: 700; }
        .footer-grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #000; border-top: none; }
        .footer-grid .cell { border-right: 1px solid #000; padding: 6px; font-size: 12px; }
        .footer-grid .cell:last-child { border-right: 0; }
        .footer-grid .center { text-align: center; font-weight: 700; }
        .terms-grid { display: grid; grid-template-columns: 2fr 1fr; border: 1px solid #000; border-top: none; padding: 8px; font-size: 12px; }
        .terms-grid .label { font-weight: 700; margin-bottom: 4px; }
        .terms-grid .small { font-size: 11px; }
        .page-break { page-break-after: always; }
      </style>
    `;
    return `
      <!doctype html>
      <html>
        <head><title>Print LR</title>${styles}</head>
        <body>${slips}</body>
      </html>
    `;
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


