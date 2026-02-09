import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { Subscription, forkJoin, of } from 'rxjs';
import { BranchService } from '../../../services/branch.service';

@Component({
  selector: 'app-manifest',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manifest.component.html',
  styleUrls: ['./manifest.component.css']
})
export class ManifestComponent implements OnInit, OnDestroy {
  stocks: any[] = [];
  filteredStocks: any[] = [];
  activeTab: 'stocks' | 'other-branch' | 'others-in-branch' = 'stocks';
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  filterStatus: string = 'Manifestation';
  selectedHubFilterId: string | null = null;
  selectedHubFilterName = '';
  selectedStock: any = null;
  editingStock: any = null;   // G?? track which stock is being edited
  manifests: any[] = [];
  selectedManifestIds = new Set<string>();

  get isManifestPrintEnabled(): boolean {
    return this.selectedManifestIds.size > 0;
  }
  manifestSearchText = '';
  manifestStatusFilter = '';
  manifestVehicleFilter = '';
  showManifestDetails = false;
  selectedManifestDetails: any = null;
  showConsignmentEdit = false;
  eligibleConsignments: any[] = [];
  consignmentEditLoading = false;
  consignmentEditError = '';
  consignmentsToAdd = new Set<string>();
  consignmentsToRemove = new Set<string>();
  manifestEditVehicleNo = '';
  manifestEditStatus = '';
  manifestEditDeliverySelection = '';
  manifestEditOriginal = { vehicleNo: '', status: '', deliverySelection: '' };
  manifestEditStatusOptions = ['Scheduled', 'Out for Delivery', 'Will be Picked-Up'];

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
email: string = '';
username: string = '';
branch: string = localStorage.getItem('branch') || 'All Branches';
originLocId: string = localStorage.getItem('originLocId') || 'all';
consignmentNumber: string = localStorage.getItem('consignmentNumber')||'-999'; // will be loaded asynchronously
date: string = new Date().toISOString().split('T')[0];
ewaybillNumber: string = '';
consignor: string = '';
consignorGST: string = '';
consignorAddress: string = '';
consignorPhone: string = '';
consignee: string = '';
consigneeGST: string = '';
consigneeAddress: string = '';
consigneePhone: string = '';
paymentMode: string = 'Account Credit';
externalRefId: string = '';
invoices = [{ number: '', value: 0 }];
packages = [{ type: '', amount: 1 }];
products = [{ type: '', amount: 1 }];
charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0 };
finalAmount: number = 0;
shipmentStatus: string = 'Pending';
shipmentStatusDetails: string = '';

branches: any[] = [];
hubs: any[] = [];
  availableRoutePoints: { name: string; type: 'Branch' | 'Hub'; vehicles: string[] }[] = [];
  shipmentRoute: { name: string; type: 'Branch' | 'Hub'; vehicleNo: string }[] = [];
  selectedRoutePoint: any = null;
  selectedRouteVehicle: string = '';
  private branchSub?: Subscription;
  private branchCheck: any;


  constructor(
    private http: HttpClient,
    private branchService: BranchService
  ) {}



 // --- Methods ---
addInvoice() {
  this.editingStock.invoices.push({
    number: '',
    value: 0,
    packages: [],
    products: []
  });
}

deleteInvoice(index: number) {
  this.editingStock.invoices.splice(index, 1);
}

addPackage(invoiceIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (!invoice.packages) {
    invoice.packages = [];
  }
  invoice.packages.push({ type: '', amount: 1 });
}

deletePackage(invoiceIndex: number, packageIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (invoice.packages && invoice.packages.length > packageIndex) {
    invoice.packages.splice(packageIndex, 1);
  }
}

addProduct(invoiceIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (!invoice.products) {
    invoice.products = [];
  }
  invoice.products.push({ type: '', amount: 1, instock: 0, intransitstock: 0, deliveredstock: 0 });
}

deleteProduct(invoiceIndex: number, productIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (invoice.products && invoice.products.length > productIndex) {
    const product = invoice.products[productIndex];
    if (this.isProductManifested(product)) {
      alert('This product has been manifested and cannot be deleted.');
      return;
    }
    invoice.products.splice(productIndex, 1);
  }
}

calculateFinalAmount() {
  const invoiceTotal = this.editingStock.invoices.reduce((sum: number, i: { value: number }) => sum + (i.value || 0), 0);
  const packageTotal = this.editingStock.packages.reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
  const chargeTotal = Object.values(this.charges).reduce((sum: number, c: any) => sum + (Number(c) || 0), 0);
  this.editingStock.finalAmount = invoiceTotal + packageTotal + chargeTotal;
}



  loadStocks() {
    const username = this.username || localStorage.getItem('username') || '';
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (!username) {
      console.error('Missing username for loading stocks');
      return;
    }
    const branchParamRaw = this.activeTab === 'stocks' ? originLocId : 'all';
    const branchParam = branchParamRaw === 'all-hubs' ? 'all' : branchParamRaw;
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        username,
        originLocId: branchParam
      }
    }).subscribe({
      next: (res: any[]) => {
        const normalized = (res || []).map((stock) => ({
          ...stock,
          invoices: this.flattenInvoices(stock.ewaybills || stock.invoices || [])
        }));
        this.stocks = this.getBaseStocks(normalized)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.applyFilters();
      },
      error: (err: any) => console.error('Error loading shipments:', err)
    });
  }

  private flattenInvoices(ewaybills: any[]): any[] {
    return (ewaybills || []).flatMap((ewb) => ewb.invoices || []);
  }

  getInStockAmountTotal(invoices: any[]): number {
    let total = 0;
    (invoices || []).forEach((inv) => {
      (inv.products || []).forEach((prod: any) => {
        total += Number(prod.instock || 0);
      });
    });
    return total;
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

  private normalizeId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }

  private formatLocationDisplay(idValue: any, labelValue: any): string {
    const rawId = this.normalizeId(idValue);
    const rawLabel = String(labelValue || '').trim();

    let resolvedId = rawId;
    let resolvedName = '';

    const branchById = rawId
      ? (this.branches || []).find((b) => this.normalizeId(b?._id) === rawId)
      : null;
    if (branchById?._id) {
      resolvedId = this.normalizeId(branchById._id);
      resolvedName = String(branchById.branchName || '').trim();
    } else {
      const hubById = rawId
        ? (this.hubs || []).find((h) => this.normalizeId(h?._id) === rawId)
        : null;
      if (hubById?._id) {
        resolvedId = this.normalizeId(hubById._id);
        resolvedName = String(hubById.hubName || '').trim();
      }
    }

    if (!resolvedName && rawLabel) {
      const labelLower = rawLabel.toLowerCase();
      const branchByName = (this.branches || []).find(
        (b) => String(b?.branchName || '').trim().toLowerCase() === labelLower
      );
      if (branchByName?._id) {
        resolvedId = this.normalizeId(branchByName._id);
        resolvedName = String(branchByName.branchName || '').trim();
      } else {
        const hubByName = (this.hubs || []).find(
          (h) => String(h?.hubName || '').trim().toLowerCase() === labelLower
        );
        if (hubByName?._id) {
          resolvedId = this.normalizeId(hubByName._id);
          resolvedName = String(hubByName.hubName || '').trim();
        }
      }
    }

    const name = resolvedName || rawLabel || resolvedId || '-';
    if (!resolvedId) return name;
    if (name.toLowerCase() === String(resolvedId).toLowerCase()) return name;
    return `${name}$$${resolvedId}`;
  }

  getOriginBranchDisplay(stock: any): string {
    return this.formatLocationDisplay(this.getOriginId(stock), stock?.branch);
  }

  getCurrentBranchDisplay(stock: any): string {
    return this.formatLocationDisplay(
      stock?.currentLocationId || stock?.currentBranch,
      stock?.currentBranch
    );
  }

  private getoriginLocIdByName(name: string): string {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return '';
    const branch = (this.branches || []).find((b) =>
      String(b?.branchName || '').trim().toLowerCase() === target
    );
    return branch?._id ? String(branch._id) : '';
  }

  private getOriginId(stock: any): string {
    if (!stock) return '';
    const raw = stock?.originLocId || stock?.originLocId|| stock?.originLocId || stock?.branch;
    return this.normalizeId(raw);
  }

  private getBranchNameById(id: string): string {
    const target = this.normalizeId(id);
    if (!target) return '';
    const branch = (this.branches || []).find((b) => this.normalizeId(b?._id) === target);
    return branch?.branchName ? String(branch.branchName) : '';
  }

  private getHubById(id: string): any | null {
    const target = this.normalizeId(id);
    if (!target) return null;
    return (this.hubs || []).find((h) => this.normalizeId(h?._id) === target) || null;
  }

  private matchesSelectedBranch(originLocIdValue: string, branchLabel: string, selectedoriginLocId: string): boolean {
    if (!selectedoriginLocId) return false;
    const normalizedSelected = this.normalizeId(selectedoriginLocId);
    if (originLocIdValue && this.normalizeId(originLocIdValue) === normalizedSelected) return true;
    const hubByCurrentId = (this.hubs || []).find((h) => this.normalizeId(h?._id) === this.normalizeId(originLocIdValue));
    if (hubByCurrentId) {
      const huboriginLocId = this.normalizeId(hubByCurrentId?.originLocId || hubByCurrentId?.branch);
      if (huboriginLocId && huboriginLocId === normalizedSelected) return true;
    }
    const hub = this.getHubById(normalizedSelected);
    if (hub) {
      const huboriginLocId = this.normalizeId(hub?.originLocId || hub?.branch);
      if (huboriginLocId && this.normalizeId(originLocIdValue) === huboriginLocId) return true;
      const hubName = String(hub?.hubName || '').trim();
      if (hubName && branchLabel) {
        if (String(branchLabel).trim().toLowerCase() === hubName.toLowerCase()) return true;
      }
      const hubBranchName = this.getBranchNameById(huboriginLocId);
      if (hubBranchName && branchLabel) {
        if (String(branchLabel).trim().toLowerCase() === hubBranchName.toLowerCase()) return true;
      }
    }
    const selectedName = this.getBranchNameById(normalizedSelected);
    if (selectedName && branchLabel) {
      return String(branchLabel).trim().toLowerCase() === String(selectedName).trim().toLowerCase();
    }
    return false;
  }

  private isCurrentBranchMatch(currentoriginLocId: string, uioriginLocId: string): boolean {
    if (!currentoriginLocId || !uioriginLocId) return false;
    if (this.normalizeId(currentoriginLocId) === this.normalizeId(uioriginLocId)) return true;
    const uiBranchName = this.getBranchNameById(uioriginLocId);
    if (
      uiBranchName &&
      String(currentoriginLocId || '').trim().toLowerCase() === String(uiBranchName).trim().toLowerCase()
    ) {
      return true;
    }
    const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === this.normalizeId(currentoriginLocId));
    if (!hub?.branch) return false;
    const originLocId = this.getoriginLocIdByName(hub.branch);
    return originLocId ? this.normalizeId(originLocId) === this.normalizeId(uioriginLocId) : false;
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

  private isAllowedManifestStatus(status: string): boolean {
    return status === 'Manifestation' ||
      status === 'Out for Delivery' ||
      status === 'Will be Picked-Up';
  }

  private isAllowedDeliveryStatus(status: string): boolean {
    return status === 'DManifestation' ||
      status === 'D-Out for Delivery' ||
      status === 'D-Will be Picked-Up';
  }

  private isCompanyMatch(stock: any): boolean {
    const gstinId = String(localStorage.getItem('GSTIN_ID') || '').trim();
    if (!gstinId) return true;
    const stockGstin = String(stock?.GSTIN_ID ?? stock?.gstinId ?? '').trim();
    if (!stockGstin) return false;
    return stockGstin === gstinId;
  }

  private getLastStatusDetailoriginLocId(statusDetails: string): string {
    if (!statusDetails) return '';
    const parts = String(statusDetails)
      .split('$$')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  getManifestEntityName(manifest: any): string {
    const entityType = String(manifest?.entityType || '').toLowerCase();
    const entityId = this.normalizeId(manifest?.entityId);
    if (!entityType || !entityId) return '-';
    if (entityType === 'hub') {
      const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === entityId);
      return hub?.hubName ? String(hub.hubName).trim() : entityId;
    }
    const branch = (this.branches || []).find((b) => this.normalizeId(b?._id) === entityId);
    return branch?.branchName ? String(branch.branchName).trim() : entityId;
  }

  getManifestDeliveryPointName(manifest: any): string {
    const deliveryType = String(manifest?.deliveryType || '').toLowerCase();
    const deliveryId = this.normalizeId(manifest?.deliveryId);
    if (!deliveryType || !deliveryId) return '-';
    if (deliveryType === 'hub') {
      const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === deliveryId);
      return hub?.hubName ? String(hub.hubName).trim() : deliveryId;
    }
    const branch = (this.branches || []).find((b) => this.normalizeId(b?._id) === deliveryId);
    return branch?.branchName ? String(branch.branchName).trim() : deliveryId;
  }

  private buildDeliverySelection(manifest: any): string {
    const deliveryType = String(manifest?.deliveryType || '').trim().toLowerCase();
    const deliveryId = this.normalizeId(manifest?.deliveryId);
    if (!deliveryType || !deliveryId) return '';
    return `${deliveryType}:${deliveryId}`;
  }

  private parseDeliverySelection(value: string): { type: string; id: string } {
    const raw = String(value || '').trim();
    if (!raw || !raw.includes(':')) return { type: '', id: '' };
    const [type, id] = raw.split(':');
    return { type: String(type || '').trim().toLowerCase(), id: String(id || '').trim() };
  }

  getDeliveryPointOptions(): Array<{ value: string; label: string }> {
    const options: Array<{ value: string; label: string }> = [];
    (this.branches || []).forEach((b: any) => {
      const id = this.normalizeId(b?._id);
      if (!id) return;
      const prefix = String(b?.prefix || '').trim();
      const name = String(b?.branchName || '').trim() || id;
      const label = prefix ? `${prefix} - ${name}` : name;
      options.push({ value: `branch:${id}`, label: `Branch: ${label}` });
    });
    (this.hubs || []).forEach((h: any) => {
      const id = this.normalizeId(h?._id);
      if (!id) return;
      const name = String(h?.hubName || '').trim() || id;
      options.push({ value: `hub:${id}`, label: `Hub: ${name}` });
    });
    return options;
  }

  private resolveLocationNameByIdOrName(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const branch = this.resolveBranchByIdOrName(raw, raw);
    if (branch?.branchName) return String(branch.branchName).trim();
    const hub = this.resolveHubByIdOrName(raw, raw);
    if (hub?.hubName) return String(hub.hubName).trim();
    return raw;
  }

  getManifestItemCount(manifest: any): number {
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    return items.length;
  }

  getManifestUrl(manifest: any): string {
    const id = String(manifest?._id || '').trim();
    return id ? `/manifests/${id}` : '#';
  }

  openManifestDetails(manifest: any) {
    if (!manifest?._id) return;
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    if (!items.length) {
      this.selectedManifestDetails = {
        manifest,
        deliveryPoint: this.getManifestDeliveryPointName(manifest) || this.getManifestEntityName(manifest) || '-',
        pickupPoint: '-',
        consignments: []
      };
      this.showManifestDetails = true;
      return;
    }
    const manifestId = String(manifest._id || '');
    if (!manifestId) return;
    this.http.get<any[]>(`http://localhost:3000/api/manifests/${manifestId}/consignments`).subscribe({
      next: (consignments: any[]) => {
        const manifestId = String(manifest._id || '');
        const linkedConsignments = (consignments || []).filter((c) =>
          String(c?.manifestId || '').trim() === manifestId
        );
        const formatted = linkedConsignments.map((c) => {
          const enriched = this.enrichShipmentDetails(c);
          const invoices = Array.isArray(enriched?.ewaybills)
            ? enriched.ewaybills.flatMap((ewb: any) => ewb?.invoices || [])
            : (enriched?.invoices || []);
          const products = invoices.flatMap((inv: any) => inv?.products || []);
          const productSummaryMap = new Map<string, any>();
          products.forEach((p: any) => {
            const name = String(p?.type || p?.productName || '').trim();
            if (!name) return;
            const entry = productSummaryMap.get(name) || {
              name,
              amount: 0,
              instock: 0,
              intransit: 0,
              delivered: 0
            };
            entry.amount += Number(p?.amount) || 0;
            entry.instock += Number(p?.instock) || 0;
            entry.intransit += Number(p?.intransitstock) || 0;
            entry.delivered += Number(p?.deliveredstock) || 0;
            productSummaryMap.set(name, entry);
          });
          const productSummary = Array.from(productSummaryMap.values());
          const itemManifestId = String(c?.manifestId || manifestId);
          return {
            shipmentId: enriched?._id ? String(enriched._id) : '',
            consignmentNumber: enriched?.consignmentNumber || '',
            shipmentStatus: enriched?.shipmentStatus || '',
            shipmentStatusDetails: enriched?.shipmentStatusDetails || '',
            currentLocation: this.resolveLocationNameByIdOrName(
              this.normalizeId(enriched?.currentLocationId || enriched?.currentBranch) ||
              String(enriched?.currentBranch || '')
            ) || '-',
            originLocId: this.normalizeId(enriched?.originLocId || enriched?.branch),
            originType: enriched?.originType || (enriched?.originLocId? 'hub' : ''),
            pickupName: enriched?.pickupName || '',
            pickupAddress: enriched?.pickupAddress || '',
            pickupPhone: enriched?.pickupPhone || '',
            pickupPincode: enriched?.pickupPincode || '',
            productSummary,
            manifestId: itemManifestId
          };
        });
        const manifestDeliveryPoint = this.getManifestDeliveryPointName(manifest);
        let deliveryPoint = manifestDeliveryPoint;
        let pickupPoint = '-';
        if (!deliveryPoint || deliveryPoint === '-') {
          const statusDetails = String(formatted?.[0]?.shipmentStatusDetails || '').trim();
          const lastId = this.getLastStatusDetailoriginLocId(statusDetails);
          const resolved = this.resolveLocationNameByIdOrName(lastId);
          deliveryPoint = resolved || this.getManifestEntityName(manifest) || '-';
        }
        if (formatted?.length) {
          pickupPoint = this.resolveLocationNameByIdOrName(formatted[0]?.pickupName || '') || '-';
        }
        this.selectedManifestDetails = {
          manifest,
          deliveryPoint,
          pickupPoint,
          consignments: formatted
        };
        this.showManifestDetails = true;
        this.resetConsignmentEditState();
      },
      error: (err) => {
        console.error('Failed to load manifest consignments', err);
        this.selectedManifestDetails = {
          manifest,
          deliveryPoint: this.getManifestDeliveryPointName(manifest) || this.getManifestEntityName(manifest) || '-',
          pickupPoint: '-',
          consignments: []
        };
        this.showManifestDetails = true;
        this.resetConsignmentEditState();
      }
    });
  }

  private refreshSelectedManifestDetails(manifestId: any) {
    if (!this.showManifestDetails) return;
    const selectedId = this.normalizeId(this.selectedManifestDetails?.manifest?._id);
    const targetId = this.normalizeId(manifestId);
    if (!selectedId || !targetId || selectedId !== targetId) return;
    const manifest = this.selectedManifestDetails?.manifest;
    if (manifest) {
      this.openManifestDetails(manifest);
    }
  }
  closeManifestDetails() {
    this.showManifestDetails = false;
    this.selectedManifestDetails = null;
    this.resetConsignmentEditState();
  }

  getNoConsignmentsMessage(status: any): string {
    const value = String(status || '').trim().toLowerCase();
    if (value.includes('will be picked-up') || value.includes('out for delivery')) {
      return 'No consignments found or linked.';
    }
    return 'No consignments found for this manifest.';
  }

  canDeliverManifest(manifest: any): boolean {
    const status = String(manifest?.status || '').trim().toLowerCase();
    return status !== 'completed' && status !== 'cancelled';
  }

  canCancelManifest(manifest: any): boolean {
    const status = String(manifest?.status || '').trim().toLowerCase();
    return status !== 'completed' && status !== 'cancelled';
  }

  canUncancelManifest(manifest: any): boolean {
    const status = String(manifest?.status || '').trim().toLowerCase();
    if (status !== 'cancelled') return false;
    let allowed = true;
    if (typeof manifest?.canUncancel === 'boolean') {
      allowed = manifest.canUncancel;
    }
    const selectedId = this.normalizeId(this.selectedManifestDetails?.manifest?._id);
    const targetId = this.normalizeId(manifest?._id);
    if (selectedId && targetId && selectedId === targetId) {
      const consignments = Array.isArray(this.selectedManifestDetails?.consignments)
        ? this.selectedManifestDetails.consignments
        : [];
      const hasDelivered = consignments.some((c: any) =>
        String(c?.shipmentStatus || '').trim().toLowerCase() === 'delivered'
      );
      if (hasDelivered) {
        allowed = false;
      }
    }
    return allowed;
  }

  isCancelledManifest(manifest: any): boolean {
    return String(manifest?.status || '').trim().toLowerCase() === 'cancelled';
  }

  canEditConsignments(manifest: any): boolean {
    const status = String(manifest?.status || '').trim().toLowerCase();
    return status !== 'completed' && status !== 'cancelled';
  }

  isManifestPickupStatus(status: any): boolean {
    return String(status || '').trim().toLowerCase() === 'will be picked-up';
  }

  isManifestOutForDeliveryStatus(status: any): boolean {
    return String(status || '').trim().toLowerCase() === 'out for delivery';
  }

  private resetConsignmentEditState() {
    this.showConsignmentEdit = false;
    this.eligibleConsignments = [];
    this.consignmentEditLoading = false;
    this.consignmentEditError = '';
    this.consignmentsToAdd.clear();
    this.consignmentsToRemove.clear();
    this.manifestEditVehicleNo = '';
    this.manifestEditStatus = '';
    this.manifestEditDeliverySelection = '';
    this.manifestEditOriginal = { vehicleNo: '', status: '', deliverySelection: '' };
  }

  startConsignmentEdit(manifest: any) {
    if (!manifest?._id) return;
    this.resetConsignmentEditState();
    this.showConsignmentEdit = true;
    const vehicleNo = String(manifest?.vehicleNo || '').trim();
    const status = String(manifest?.status || '').trim() || 'Scheduled';
    if (status && !this.manifestEditStatusOptions.some((s) => s.toLowerCase() === status.toLowerCase())) {
      this.manifestEditStatusOptions = [status, ...this.manifestEditStatusOptions];
    }
    const deliverySelection = this.buildDeliverySelection(manifest);
    this.manifestEditVehicleNo = vehicleNo;
    this.manifestEditStatus = status;
    this.manifestEditDeliverySelection = deliverySelection;
    this.manifestEditOriginal = { vehicleNo, status, deliverySelection };
    this.loadEligibleConsignments(manifest);
  }

  cancelConsignmentEdit() {
    this.resetConsignmentEditState();
  }

  private loadEligibleConsignments(manifest: any) {
    this.consignmentEditLoading = true;
    this.http.get<any>(`http://localhost:3000/api/manifests/${manifest._id}/eligible-consignments`, {
      }).subscribe({
      next: (res: any) => {
        this.eligibleConsignments = Array.isArray(res?.consignments) ? res.consignments : [];
        this.consignmentEditLoading = false;
      },
      error: (err) => {
        console.error('Failed to load eligible consignments', err);
        this.consignmentEditError = 'Failed to load eligible consignments.';
        this.consignmentEditLoading = false;
      }
    });
  }

  private getConsignmentKey(consignment: any): string {
    return String(consignment?._id || consignment?.shipmentId || '').trim();
  }

  toggleConsignmentAdd(consignment: any) {
    const key = this.getConsignmentKey(consignment);
    if (!key) return;
    if (this.consignmentsToAdd.has(key)) {
      this.consignmentsToAdd.delete(key);
    } else {
      this.consignmentsToAdd.add(key);
    }
  }

  toggleConsignmentRemove(consignment: any) {
    const key = this.getConsignmentKey(consignment);
    if (!key) return;
    if (this.consignmentsToRemove.has(key)) {
      this.consignmentsToRemove.delete(key);
    } else {
      this.consignmentsToRemove.add(key);
    }
  }

  isConsignmentMarkedForAdd(consignment: any): boolean {
    const key = this.getConsignmentKey(consignment);
    return key ? this.consignmentsToAdd.has(key) : false;
  }

  isConsignmentMarkedForRemove(consignment: any): boolean {
    const key = this.getConsignmentKey(consignment);
    return key ? this.consignmentsToRemove.has(key) : false;
  }

  applyConsignmentEdit(manifest: any) {
    if (!manifest?._id) return;
    const addShipmentIds = Array.from(this.consignmentsToAdd.values());
    const removeShipmentIds = Array.from(this.consignmentsToRemove.values());
    const updates: any[] = [];

    const nextStatus = String(this.manifestEditStatus || '').trim();
    const currentStatus = String(manifest?.status || '').trim();
    const statusChanged = nextStatus && nextStatus.toLowerCase() !== currentStatus.toLowerCase();
    if (statusChanged) {
      const allowed = this.manifestEditStatusOptions.map((s) => s.toLowerCase());
      if (!allowed.includes(nextStatus.toLowerCase())) {
        alert('Invalid manifest status.');
        return;
      }
      updates.push(this.http.put(`http://localhost:3000/api/manifests/${manifest._id}/status`, {
        status: nextStatus
      }));
    }

    const nextVehicleNo = String(this.manifestEditVehicleNo || '').trim();
    const currentVehicleNo = String(manifest?.vehicleNo || '').trim();
    if (nextVehicleNo && nextVehicleNo !== currentVehicleNo) {
      updates.push(this.http.patch(`http://localhost:3000/api/manifests/${manifest._id}/vehicle`, {
        vehicleNo: nextVehicleNo
      }));
    }

    const { type: deliveryType, id: deliveryId } = this.parseDeliverySelection(this.manifestEditDeliverySelection);
    const currentDeliveryType = String(manifest?.deliveryType || '').trim().toLowerCase();
    const currentDeliveryId = this.normalizeId(manifest?.deliveryId);
    const deliveryChanged = currentDeliveryType !== deliveryType || currentDeliveryId !== deliveryId;
    if (deliveryChanged) {
      updates.push(this.http.patch(`http://localhost:3000/api/manifests/${manifest._id}/delivery`, {
        deliveryType,
        deliveryId
      }));
    }

    if (addShipmentIds.length || removeShipmentIds.length) {
      updates.push(this.http.patch<any>(`http://localhost:3000/api/manifests/${manifest._id}/consignments`, {
        addShipmentIds,
        removeShipmentIds
      }));
    }

    if (!updates.length) {
      this.resetConsignmentEditState();
      return;
    }

    forkJoin(updates).subscribe({
      next: (results: any[]) => {
        this.resetConsignmentEditState();
        this.loadManifests();
        this.loadStocks();
        let updatedManifest = null;
        let updatedItems = null;
        (results || []).forEach((res) => {
          if (res?.manifest) updatedManifest = res.manifest;
          if (Array.isArray(res?.items)) updatedItems = res.items;
        });
        const manifestDetails: any = { ...(manifest || {}) };
        if (updatedManifest && typeof updatedManifest === 'object') {
          Object.assign(manifestDetails, updatedManifest);
        }
        if (updatedItems) {
          manifestDetails.items = updatedItems;
        }
        this.openManifestDetails(manifestDetails);
      },
      error: (err) => {
        console.error('Failed to update manifest details', err);
        alert('Failed to update manifest details.');
      }
    });
  }

  private isObjectId(value: string): boolean {
    return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
  }

  getManifestConsignments(): any[] {
    const manifestId = String(this.selectedManifestDetails?.manifest?._id || '');
    if (!manifestId) return [];
    return (this.selectedManifestDetails?.consignments || []).filter((c: any) => {
      return String(c?.manifestId || '').trim() === manifestId;
    });
  }

  deliverManifest(manifest: any) {
    if (!manifest?._id) return;
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    const consignmentNumbers = Array.from(new Set(
      items.map((i: any) => String(i?.consignmentNumber || '').trim()).filter(Boolean)
    ));
    if (!consignmentNumbers.length) {
      alert('No consignments found for this manifest.');
      return;
    }
    const confirmMsg = `Deliver manifest ${manifest.manifestNumber || ''} for ${consignmentNumbers.length} consignments?`;
    if (!confirm(confirmMsg)) return;

    this.http.put(`http://localhost:3000/api/manifests/${manifest._id}/status`, {
      status: 'Completed'
    }).subscribe({
      next: () => {
        this.loadManifests();
        this.loadStocks();
      },
      error: (err) => {
        console.error('Failed to update manifest status', err);
        alert('Failed to update manifest status.');
      }
    });
  }

  cancelManifest(manifest: any) {
    if (!manifest?._id) return;
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    const consignmentNumbers = Array.from(new Set(
      items.map((i: any) => String(i?.consignmentNumber || '').trim()).filter(Boolean)
    ));
    if (!consignmentNumbers.length) {
      alert('No consignments found for this manifest.');
      return;
    }
    const confirmMsg = `Cancel manifest ${manifest.manifestNumber || ''} for ${consignmentNumbers.length} consignments?`;
    if (!confirm(confirmMsg)) return;

      this.http.put(`http://localhost:3000/api/manifests/${manifest._id}/status`, {
        status: 'Cancelled'
      }).subscribe({
        next: () => {
          this.loadManifests();
          this.loadStocks();
          this.refreshSelectedManifestDetails(manifest._id);
        },
        error: (err) => {
          console.error('Failed to cancel manifest', err);
          alert('Failed to cancel manifest.');
        }
    });
  }

  uncancelManifest(manifest: any) {
    if (!manifest?._id) return;
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    const consignmentNumbers = Array.from(new Set(
      items.map((i: any) => String(i?.consignmentNumber || '').trim()).filter(Boolean)
    ));
    if (!consignmentNumbers.length) {
      alert('No consignments found for this manifest.');
      return;
    }
    const confirmMsg = `Uncancel manifest ${manifest.manifestNumber || ''} for ${consignmentNumbers.length} consignments?`;
    if (!confirm(confirmMsg)) return;

      this.http.put(`http://localhost:3000/api/manifests/${manifest._id}/status`, {
        status: 'Scheduled'
      }).subscribe({
        next: () => {
          this.loadManifests();
          this.loadStocks();
          this.refreshSelectedManifestDetails(manifest._id);
        },
        error: (err) => {
          console.error('Failed to uncancel manifest', err);
          alert('Failed to uncancel manifest.');
      }
    });
  }

  private getBaseStocks(allStocks: any[]): any[] {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (originLocId === 'all') {
      if (this.activeTab === 'other-branch' || this.activeTab === 'others-in-branch') {
        return (allStocks || []).filter(stock => {
          const status = String(stock.shipmentStatus || '').trim();
          if (!this.isAllowedDeliveryStatus(status)) return false;
          const originoriginLocId = this.getOriginId(stock);
          const currentoriginLocId = this.normalizeId(
            stock.currentLocationId || stock.currentBranch
          );
          return originoriginLocId && currentoriginLocId && originoriginLocId !== currentoriginLocId;
        });
      }
      return (allStocks || []).filter(stock => {
        const status = String(stock.shipmentStatus || '').trim();
        return this.isAllowedManifestStatus(status);
      });
    }
    if (this.activeTab === 'other-branch') {
      const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
      const selectedLocationId = originLocId === 'all-hubs'
        ? this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'))
        : this.normalizeId(originLocId);
      if (!selectedLocationId || selectedLocationId === 'all') return [];

      const selectedBranch = (this.branches || []).find(
        (b) => this.normalizeId(b?._id) === selectedLocationId
      );
      const selectedHub = selectedBranch
        ? null
        : (this.hubs || []).find((h) => this.normalizeId(h?._id) === selectedLocationId);
      const selectedName = String(selectedBranch?.branchName || selectedHub?.hubName || '').trim();
      const selectedNameLower = selectedName.toLowerCase();

      return (allStocks || []).filter(stock => {
        const status = String(stock.shipmentStatus || '').trim();
        if (!this.isAllowedDeliveryStatus(status)) return false;

        const originoriginLocId = this.getOriginId(stock);
        const originBranchLabel = String(stock.branch || '').trim();
        const currentoriginLocId = this.normalizeId(
          stock.currentLocationId || stock.currentBranch
        );

        const isIdMatch = Boolean(originoriginLocId) && originoriginLocId === selectedLocationId;
        const isNameMatch = Boolean(selectedName) && Boolean(originBranchLabel) && (
          originBranchLabel.toLowerCase() === selectedNameLower ||
          this.matchesBranchLabel(originBranchLabel, selectedName)
        );

        return originoriginLocId && currentoriginLocId && (isIdMatch || isNameMatch) && originoriginLocId !== currentoriginLocId;
      });
    }

    if (this.activeTab === 'others-in-branch') {
      const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
      const selectedLocationId = originLocId === 'all-hubs'
        ? this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'))
        : this.normalizeId(originLocId);
      if (!selectedLocationId || selectedLocationId === 'all') return [];

      const selectedBranch = (this.branches || []).find(
        (b) => this.normalizeId(b?._id) === selectedLocationId
      );
      const selectedHub = selectedBranch
        ? null
        : (this.hubs || []).find((h) => this.normalizeId(h?._id) === selectedLocationId);
      const selectedName = String(selectedBranch?.branchName || selectedHub?.hubName || '').trim();
      const selectedNameLower = selectedName.toLowerCase();

      return (allStocks || []).filter(stock => {
        const status = String(stock.shipmentStatus || '').trim();
        if (!this.isAllowedDeliveryStatus(status)) return false;

        const originoriginLocId = this.getOriginId(stock);
        const currentoriginLocId = this.normalizeId(
          stock.currentLocationId || stock.currentBranch
        );
        const currentBranchLabel = String(stock.currentBranch || '').trim();

        const isIdMatch = Boolean(currentoriginLocId) && currentoriginLocId === selectedLocationId;
        const isNameMatch = Boolean(selectedName) && Boolean(currentBranchLabel) && (
          currentBranchLabel.toLowerCase() === selectedNameLower ||
          this.matchesBranchLabel(currentBranchLabel, selectedName)
        );

        return originoriginLocId && currentoriginLocId && (isIdMatch || isNameMatch) && originoriginLocId !== currentoriginLocId;
      });
    }

    const selectedoriginLocId = this.getSelectedManifestoriginLocId();
    if (!selectedoriginLocId) return [];

    return (allStocks || []).filter(stock => {
      const status = String(stock.shipmentStatus || '').trim();
      if (!this.isAllowedManifestStatus(status)) return false;
      const currentoriginLocId = this.normalizeId(
        stock.currentLocationId || stock.currentBranch || stock.currentBranch
      );
      const currentBranchLabel = String(stock.currentBranch || '').trim();
      return currentoriginLocId && this.matchesSelectedBranch(currentoriginLocId, currentBranchLabel, selectedoriginLocId);
    });
  }

  private getSelectedManifestoriginLocId(): string {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (originLocId === 'all-hubs') {
      return this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'));
    }
    if (!originLocId || originLocId === 'all') return '';
    return this.normalizeId(originLocId);
  }

  private getManifestEntityFilter(): { entityType: string; entityId: string } | null {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (originLocId === 'all-hubs') {
      const hubId = this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'));
      return hubId ? { entityType: 'hub', entityId: hubId } : null;
    }
    if (originLocId && originLocId !== 'all') {
      return { entityType: 'branch', entityId: this.normalizeId(originLocId) };
    }
    return null;
  }

  private getManifestOriginFilter(): { originType: string; originLocId: string } | null {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (originLocId === 'all-hubs') {
      const hubId = this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'));
      return hubId ? { originType: 'hub', originLocId: hubId } : null;
    }
    if (originLocId && originLocId !== 'all') {
      return { originType: 'branch', originLocId: this.normalizeId(originLocId) };
    }
    return null;
  }

  loadManifests() {
    const params: any = {};
    const entity = this.getManifestEntityFilter();
    if (entity?.entityType && entity?.entityId) {
      params.entityType = entity.entityType;
      params.entityId = entity.entityId;
    }
    const origin = this.getManifestOriginFilter();
    if (origin?.originType && origin?.originLocId) {
      params.originType = origin.originType;
      params.originLocId = origin.originLocId;
    }
    this.http.get<any[]>('http://localhost:3000/api/manifests', { params }).subscribe({
      next: (res: any[]) => {
        this.manifests = Array.isArray(res) ? res : [];
        this.selectedManifestIds = new Set();
      },
      error: (err: any) => console.error('Error loading manifests:', err)
    });
  }

  filterManifests(list: any[]): any[] {
    const raw = Array.isArray(list) ? list : [];
    const q = String(this.manifestSearchText || '').trim().toLowerCase();
    const status = String(this.manifestStatusFilter || '').trim().toLowerCase();
    const vehicle = String(this.manifestVehicleFilter || '').trim().toLowerCase();
    return raw.filter((m) => {
      const number = String(m?.manifestNumber || '').toLowerCase();
      const matchesSearch = !q || number.includes(q);
      const mStatus = String(m?.status || '').trim().toLowerCase();
      const matchesStatus = !status || mStatus === status;
      const mVehicle = String(m?.vehicleNo || '').trim().toLowerCase();
      const matchesVehicle = !vehicle || mVehicle.includes(vehicle);
      return matchesSearch && matchesStatus && matchesVehicle;
    });
  }

  getDeliveryDisplayName(stock: any): string {
    const name = String(stock?.deliveryName || '').trim();
    if (name) return name;
    const deliveryId = this.normalizeId(stock?.deliveryID);
    if (!deliveryId) return '-';
    const branch = (this.branches || []).find(b => this.normalizeId(b?._id) === deliveryId);
    if (branch?.branchName) return branch.branchName;
    const client = (this.clientList || []).find(c => this.normalizeId(c?._id) === deliveryId);
    if (client?.clientName) return client.clientName;
    const guest = (this.guestList || []).find(g => this.normalizeId(g?._id) === deliveryId);
    if (guest?.guestName) return guest.guestName;
    return deliveryId;
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

  private resolveBranchByVehicle(vehicleNo: string): any | null {
    const target = String(vehicleNo || '').trim().toLowerCase();
    if (!target) return null;
    return (this.branches || []).find((b) =>
      (b?.vehicles || []).some((v: any) => String(v?.vehicleNo || '').trim().toLowerCase() === target)
    ) || null;
  }

  private resolveHubByVehicle(vehicleNo: string): any | null {
    const target = String(vehicleNo || '').trim().toLowerCase();
    if (!target) return null;
    return (this.hubs || []).find((h) =>
      (h?.deliveryAddresses || []).some((addr: any) =>
        (addr?.vehicles || []).some((v: any) => String(v?.vehicleNo || '').trim().toLowerCase() === target)
      )
    ) || null;
  }

  private findVehicleStatus(vehicleNo: string): string {
    const target = String(vehicleNo || '').trim().toLowerCase();
    if (!target) return '';
    for (const branch of this.branches || []) {
      const match = (branch?.vehicles || []).find((v: any) =>
        String(v?.vehicleNo || '').trim().toLowerCase() === target
      );
      if (match) return String(match?.vehicleStatus || '').trim().toLowerCase();
    }
    for (const hub of this.hubs || []) {
      for (const addr of hub?.deliveryAddresses || []) {
        const match = (addr?.vehicles || []).find((v: any) =>
          String(v?.vehicleNo || '').trim().toLowerCase() === target
        );
        if (match) return String(match?.vehicleStatus || '').trim().toLowerCase();
      }
    }
    return '';
  }

  private resolveVehicleOwner(
    vehicleNo: string,
    fallbackType?: any,
    fallbackId?: any
  ): { ownerType: 'Branch' | 'Hub' | ''; ownerId: string } {
    const ownerTypeRaw = String(fallbackType || '').trim().toLowerCase();
    const ownerIdRaw = String(fallbackId || '').trim();
    if (ownerIdRaw && (ownerTypeRaw === 'branch' || ownerTypeRaw === 'hub')) {
      return { ownerType: ownerTypeRaw === 'branch' ? 'Branch' : 'Hub', ownerId: ownerIdRaw };
    }
    const ownerBranch = this.resolveBranchByVehicle(vehicleNo);
    if (ownerBranch?._id) return { ownerType: 'Branch', ownerId: String(ownerBranch._id) };
    const ownerHub = this.resolveHubByVehicle(vehicleNo);
    if (ownerHub?._id) return { ownerType: 'Hub', ownerId: String(ownerHub._id) };
    return { ownerType: '', ownerId: '' };
  }

  getSelectedBranchVehicles(): string[] {
    const currentoriginLocId = this.normalizeId(this.originLocId || localStorage.getItem('originLocId'));
    const currentBranchName = String(this.branch || localStorage.getItem('branch') || '').trim();
    const currentBranchNameLower = currentBranchName.toLowerCase();
    const isAllHubsSelection = currentoriginLocId === 'all-hubs' || currentBranchNameLower === 'all hubs';
    const selectedHubId = isAllHubsSelection
      ? (this.normalizeId(this.selectedHubFilterId) || this.normalizeId(localStorage.getItem('hubId')))
      : '';
    const locationFilterId = isAllHubsSelection ? selectedHubId : currentoriginLocId;
    const locationFilterName = locationFilterId
      ? String(
          (this.branches || []).find((b) => this.normalizeId(b?._id) === locationFilterId)?.branchName ||
          (this.hubs || []).find((h) => this.normalizeId(h?._id) === locationFilterId)?.hubName ||
          ''
        ).trim()
      : '';
    if (!locationFilterId || locationFilterId === 'all' || locationFilterId === 'all-hubs') return [];

    const branchVehicles = (this.branches || []).flatMap((b: any) =>
      (b?.vehicles || []).map((v: any) => ({
        ...v,
        _ownerType: 'branch',
        _ownerId: this.normalizeId(b?._id)
      }))
    );
    const hubVehicles = (this.hubs || []).flatMap((h: any) =>
      (h?.deliveryAddresses || []).flatMap((addr: any) =>
        (addr?.vehicles || []).map((v: any) => ({
          ...v,
          _ownerType: 'hub',
          _ownerId: this.normalizeId(h?._id)
        }))
      )
    );
    const vehicles = [...branchVehicles, ...hubVehicles];
    const seen = new Set<string>();

    return vehicles
      .filter((v: any) => {
        const currentLocationRaw = v?.currentLocationId || v?.currentBranch || v?.currentBranch || '';
        const currentLocation = this.normalizeId(currentLocationRaw);
        if (currentLocation) {
          if (this.isCurrentBranchMatch(currentLocation, locationFilterId)) return true;
          if (locationFilterName && this.matchesBranchLabel(String(currentLocationRaw || ''), locationFilterName)) return true;
          if (locationFilterName && this.matchesBranchLabel(String(currentLocation || ''), locationFilterName)) return true;
          return false;
        }
        if (String(v?._ownerType || '').toLowerCase() === 'branch') {
          const ownerId = this.normalizeId(v?._ownerId);
          return ownerId && ownerId === this.normalizeId(locationFilterId);
        }
        return false;
      })
      .map((v: any) => {
        if (typeof v === 'string') return v;
        return v?.vehicleNo || v?.number || v?.vehicleNumber || '';
      })
      .filter((vehicle: string) => {
        if (!vehicle) return false;
        if (seen.has(vehicle)) return false;
        seen.add(vehicle);
        return true;
      });
  }

  private resolveClientLocation(client: any, locationId: any): any | null {
    if (!client) return null;
    const normId = this.normalizeId(locationId);
    const locations = client?.deliveryLocations || [];
    if (!normId) return locations[0] || null;
    return locations.find((loc: any) => this.normalizeId(loc?.delivery_id) === normId) || null;
  }

  private enrichShipmentDetails(stock: any): any {
    const enriched = { ...stock };
    const consignor = stock?.consignorTab === 'guest'
      ? this.resolveGuestByIdOrName(stock?.consignorId, stock?.consignor)
      : this.resolveClientByIdOrName(stock?.consignorId, stock?.consignor);
    const consignee = stock?.consigneeTab === 'guest'
      ? this.resolveGuestByIdOrName(stock?.consigneeId, stock?.consignee)
      : this.resolveClientByIdOrName(stock?.consigneeId, stock?.consignee);

    enriched.consignor = this.firstNonEmpty(enriched.consignor, consignor?.clientName, consignor?.guestName);
    enriched.consignorGST = this.firstNonEmpty(enriched.consignorGST, consignor?.GSTIN, stock?.consignorTab === 'guest' ? 'GUEST' : '');
    enriched.consignorPhone = this.firstNonEmpty(enriched.consignorPhone, consignor?.phoneNum);
    enriched.consignorAddress = this.firstNonEmpty(enriched.consignorAddress, consignor?.address);

    enriched.consignee = this.firstNonEmpty(enriched.consignee, consignee?.clientName, consignee?.guestName);
    enriched.consigneeGST = this.firstNonEmpty(enriched.consigneeGST, consignee?.GSTIN, stock?.consigneeTab === 'guest' ? 'GUEST' : '');
    enriched.consigneePhone = this.firstNonEmpty(enriched.consigneePhone, consignee?.phoneNum);
    enriched.consigneeAddress = this.firstNonEmpty(enriched.consigneeAddress, consignee?.address);

    if (stock?.billingType === 'consignor') {
      enriched.billingName = this.firstNonEmpty(enriched.billingName, enriched.consignor);
      enriched.billingGSTIN = this.firstNonEmpty(enriched.billingGSTIN, enriched.consignorGST);
      enriched.billingPhone = this.firstNonEmpty(enriched.billingPhone, enriched.consignorPhone);
      enriched.billingAddress = this.firstNonEmpty(enriched.billingAddress, enriched.consignorAddress);
    } else {
      const billingClient = this.resolveClientByIdOrName(stock?.billingClientId, stock?.billingName);
      enriched.billingName = this.firstNonEmpty(enriched.billingName, billingClient?.clientName);
      enriched.billingGSTIN = this.firstNonEmpty(enriched.billingGSTIN, billingClient?.GSTIN);
      enriched.billingPhone = this.firstNonEmpty(enriched.billingPhone, billingClient?.phoneNum);
      enriched.billingAddress = this.firstNonEmpty(enriched.billingAddress, billingClient?.address);
    }

    if (stock?.pickupType === 'branch') {
      const pickupBranch = this.resolveBranchByIdOrName(stock?.pickupLocationId, stock?.pickupName) ||
        this.resolveBranchByIdOrName(null, stock?.branch);
      enriched.pickupName = this.firstNonEmpty(enriched.pickupName, pickupBranch?.branchName);
      enriched.pickupAddress = this.firstNonEmpty(enriched.pickupAddress, pickupBranch?.address);
      enriched.pickupPhone = this.firstNonEmpty(enriched.pickupPhone, pickupBranch?.phoneNum);
      enriched.pickupPincode = this.firstNonEmpty(enriched.pickupPincode, pickupBranch?.pinCode);
    } else if (stock?.pickupType === 'consignor') {
      enriched.pickupName = this.firstNonEmpty(enriched.pickupName, enriched.consignor);
      enriched.pickupAddress = this.firstNonEmpty(enriched.pickupAddress, enriched.consignorAddress);
      enriched.pickupPhone = this.firstNonEmpty(enriched.pickupPhone, enriched.consignorPhone);
      enriched.pickupPincode = this.firstNonEmpty(enriched.pickupPincode, consignor?.pinCode);
    }

    const isSelfPickup =
      stock?.deliveryType === 'Customer self pick up' ||
      stock?.deliveryType === 'branch' ||
      stock?.deliveryType === 'hub';
    if (isSelfPickup) {
      const deliveryBranch = this.resolveBranchByIdOrName(stock?.deliveryID, stock?.deliveryName);
      const deliveryHub = deliveryBranch ? null : this.resolveHubByIdOrName(stock?.deliveryID, stock?.deliveryName);
      enriched.deliveryName = this.firstNonEmpty(enriched.deliveryName, deliveryBranch?.branchName, deliveryHub?.hubName);
      enriched.deliveryAddress = this.firstNonEmpty(enriched.deliveryAddress, deliveryBranch?.address, deliveryHub?.address);
      enriched.deliveryPhone = this.firstNonEmpty(enriched.deliveryPhone, deliveryBranch?.phoneNum, deliveryHub?.phoneNum);
      enriched.deliveryPincode = this.firstNonEmpty(enriched.deliveryPincode, deliveryBranch?.pinCode, deliveryHub?.pinCode);
    } else {
      const deliveryClient = this.resolveClientByIdOrName(stock?.deliveryID, stock?.deliveryName);
      const deliveryGuest = this.resolveGuestByIdOrName(stock?.deliveryID, stock?.deliveryName);
      const deliveryLocation = this.resolveClientLocation(deliveryClient, stock?.deliveryLocationId);
      enriched.deliveryName = this.firstNonEmpty(enriched.deliveryName, deliveryClient?.clientName, deliveryGuest?.guestName, enriched.consignee);
      enriched.deliveryAddress = this.firstNonEmpty(enriched.deliveryAddress, deliveryLocation?.address, deliveryClient?.address, deliveryGuest?.address, enriched.consigneeAddress);
      enriched.deliveryPhone = this.firstNonEmpty(enriched.deliveryPhone, deliveryClient?.phoneNum, deliveryGuest?.phoneNum, enriched.consigneePhone);
      enriched.deliveryPincode = this.firstNonEmpty(enriched.deliveryPincode, deliveryLocation?.pinCode, deliveryClient?.pinCode, deliveryGuest?.pinCode);
    }

    return enriched;
  }

  getProductTotal(ewaybills: any[], field: string): number {
    let total = 0;
    ewaybills.forEach(ewaybill => {
      ewaybill.invoices.forEach((invoice: any) => {
        invoice.products.forEach((product: any) => {
          total += product[field] || 0;
        });
      });
    });
    return total;
  }


  applyFilters() {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    const hubFilterId = this.normalizeId(this.selectedHubFilterId);
    const useHubFilter = originLocId === 'all-hubs' && (this.activeTab === 'stocks' || this.activeTab === 'other-branch' || this.activeTab === 'others-in-branch');
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
    this.filteredStocks = this.stocks.filter(s =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true) &&
      (this.filterStatus ? String(s.shipmentStatus || '').trim() === this.filterStatus : true) &&
      (!useHubFilter || (effectiveHubFilterId && this.matchesHubFilter(s, effectiveHubFilterId, effectiveHubName)))
    );
  }

  onHubFilterChange(value: string | null) {
    this.selectedHubFilterId = value;
    const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === this.normalizeId(value));
    this.selectedHubFilterName = String(hub?.hubName || '').trim();
    if (value) {
      localStorage.setItem('hubId', String(value));
      localStorage.setItem('hubName', this.selectedHubFilterName);
    }
    this.applyFilters();
  }

  getAllHubsFilterOptions(): any[] {
    return this.hubs || [];
  }

  private matchesHubFilter(stock: any, hubId: string, hubName: string): boolean {
    if (!hubId) return false;
    const hasHubName = Boolean(hubName);
    if (this.activeTab === 'stocks') {
      const currentoriginLocId = this.normalizeId(
        stock?.currentLocationId || stock?.currentBranch
      );
      const currentBranchLabel = String(stock?.currentBranch || '').trim();
      return (
        currentoriginLocId === hubId ||
        (hasHubName && currentBranchLabel.toLowerCase() === hubName.toLowerCase()) ||
        (hasHubName && this.matchesBranchLabel(currentBranchLabel, hubName))
      );
    }
    if (this.activeTab === 'other-branch') {
      const originoriginLocId = this.getOriginId(stock);
      const originBranchLabel = String(stock?.branch || '').trim();
      return (
        originoriginLocId === hubId ||
        (hasHubName && originBranchLabel.toLowerCase() === hubName.toLowerCase()) ||
        (hasHubName && this.matchesBranchLabel(originBranchLabel, hubName))
      );
    }
    if (this.activeTab === 'others-in-branch') {
      const currentoriginLocId = this.normalizeId(
        stock?.currentLocationId || stock?.currentBranch
      );
      const currentBranchLabel = String(stock?.currentBranch || '').trim();
      return (
        currentoriginLocId === hubId ||
        (hasHubName && currentBranchLabel.toLowerCase() === hubName.toLowerCase()) ||
        (hasHubName && this.matchesBranchLabel(currentBranchLabel, hubName))
      );
    }
    return this.getStockHubId(stock) === hubId;
  }

  private getStockHubId(stock: any): string {
    return (
      this.getOriginId(stock) ||
      this.normalizeId(stock?.currentLocationId || stock?.currentBranch)
    );
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredStocks.forEach(s => s.selected = checked);
  }

  clearSelection() {
    this.filteredStocks.forEach(s => {
      s.selected = false;
    });
    this.selectedForManifestation = [];
  }

  hasSelectedConsignment(): boolean {
    return (this.filteredStocks || []).some(s => s.selected);
  }

  showCancelPopup = false;

  openCancelPopup() {
    if (String(this.originLocId || '').trim().toLowerCase() === 'all') {
      alert('Please select a specific branch for canceling');
      return;
    }
    if (!this.hasSelectedConsignment()) return;
    this.showCancelPopup = true;
  }

  closeCancelPopup() {
    this.showCancelPopup = false;
  }

  getSelectedConsignments(): any[] {
    return (this.filteredStocks || []).filter(s => s.selected);
  }

  removeSelection(consignment: any) {
    if (consignment) {
      consignment.selected = false;
    }
  }

  confirmCancelSelection() {
    const selected = this.getSelectedConsignments();
    if (!selected.length) {
      this.closeCancelPopup();
      return;
    }

    const updates = selected.map((consignment) => {
      const shipmentId = consignment?._id ? encodeURIComponent(consignment._id) : '';
      const shipmentParam = shipmentId ? `?shipmentId=${shipmentId}` : '';
      const payload = {
        ...consignment,
        shipmentStatus: 'Deleted during Transportation',
        currentVehicleNo: '',
        currentVehicleOwnerType: '',
        currentVehicleOwnerId: null
      };
      return this.http.put(
        `http://localhost:3000/api/newshipments/${consignment.consignmentNumber}${shipmentParam}`,
        payload
      );
    });

    forkJoin(updates).subscribe({
      next: () => {
        this.closeCancelPopup();
        this.clearSelection();
        this.loadStocks();
      },
      error: (err) => {
        console.error('Error deleting consignments:', err);
        this.deleteErrorMessage = 'Failed to delete consignments. Please try again.';
        this.showDeleteErrorPopup = true;
      }
    });
  }

  showDeleteErrorPopup = false;
  deleteErrorMessage = '';

  closeDeleteErrorPopup() {
    this.showDeleteErrorPopup = false;
  }

  setActiveTab(tab: 'stocks' | 'other-branch' | 'others-in-branch') {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    // Ensure the status filter does not hide delivery-status rows on delivery tabs.
    if (tab === 'stocks') {
      if (this.isAllowedDeliveryStatus(String(this.filterStatus || '').trim())) {
        this.filterStatus = 'Manifestation';
      }
    } else {
      if (!this.isAllowedDeliveryStatus(String(this.filterStatus || '').trim())) {
        this.filterStatus = '';
      }
    }
    this.loadStocks();
  }


  openStockDetails(stock: any) {
    this.selectedStock = this.enrichShipmentDetails(stock);
  }

  closeStockDetails() {
    this.selectedStock = null;
  }

    editStock(stock: any) {
    console.log('?o??,? Edit stock:', stock);
    const cloned = JSON.parse(JSON.stringify(stock));
    cloned.invoices = this.flattenInvoices(cloned.ewaybills || cloned.invoices || []);
    this.editingStock = cloned;
    this.manifestEditsById = {};
    this.pendingManifestAdjustment = null;
    this.manifestAdjustmentLines = [];
    this.showManifestAdjustmentPopup = false;
    this.captureOriginalProductValues(this.editingStock);
  }
  saveStockEdit() {
    if (!this.editingStock) return;
    if (this.pendingManifestAdjustment || this.showManifestAdjustmentPopup) {
      this.applyManifestAdjustments();
      if (this.pendingManifestAdjustment || this.showManifestAdjustmentPopup) {
        return;
      }
    }
    this.syncEwaybillsFromInvoices();

    console.log("kkkkkkkkkkklllllllllllllllll" + this.editingStock.consignmentNumber);

    const payload = this.buildShipmentPayload();
    const manifestUpdates = Object.values(this.manifestEditsById || {});
    const updateManifests$ = manifestUpdates.length
      ? forkJoin(manifestUpdates.map((m: any) =>
        this.http.put(`http://localhost:3000/api/manifest/${m._id}`, m)
      ))
      : of([]);

    updateManifests$.subscribe({
      next: () => {
        this.http.put(`http://localhost:3000/api/newshipments/${payload.consignmentNumber}`, payload)
          .subscribe({
            next: () => {
              console.log('?o. Stock updated');
              this.loadStocks();          // reload updated data
              this.editingStock = null;   // close modal
            },
            error: (err) => console.error('??O Error updating stock:', err)
          });
      },
      error: (err) => {
        console.error('??O Error updating manifests:', err);
        alert('Failed to update manifests. Please try again.');
      }
    });
  }

  cancelEdit() {
    this.editingStock = null;
    this.pendingManifestAdjustment = null;
    this.manifestAdjustmentLines = [];
    this.showManifestAdjustmentPopup = false;
  }

  private captureOriginalProductValues(stock: any) {
    (stock?.invoices || []).forEach((inv: any) => {
      (inv.products || []).forEach((prod: any) => {
        prod._originalAmount = Number(prod.amount) || 0;
        prod._originalInstock = Number(prod.instock) || 0;
        prod._originalIntransit = Number(prod.intransitstock) || 0;
        prod._originalDelivered = Number(prod.deliveredstock) || 0;
      });
    });
  }

  private resetProductToOriginal(product: any) {
    product.amount = Number(product._originalAmount) || 0;
    product.instock = Number(product._originalInstock) || 0;
    product.intransitstock = Number(product._originalIntransit) || 0;
    product.deliveredstock = Number(product._originalDelivered) || 0;
  }

  private normalizeInvoiceNumber(invoice: any): string {
    return String(invoice?.number || invoice?.invoicenum || '').trim();
  }

  private normalizeProductType(product: any): string {
    return String(product?.type || '').trim();
  }

  private getManifestTotals() {
    const lines = this.manifestAdjustmentLines || [];
    const deliveredTotal = lines
      .filter((line) => line?.isDelivered)
      .reduce((sum, line) => sum + (Number(line.newManifestQty) || 0), 0);
    const manifestTotal = lines.reduce((sum, line) => sum + (Number(line.newManifestQty) || 0), 0);
    const intransitTotal = Math.max(0, manifestTotal - deliveredTotal);
    return { manifestTotal, deliveredTotal, intransitTotal };
  }

  private syncEwaybillsFromInvoices() {
    if (!this.editingStock?.ewaybills?.length || !this.editingStock?.invoices?.length) return;
    for (const flatInv of this.editingStock.invoices || []) {
      const flatInvNumber = this.normalizeInvoiceNumber(flatInv);
      for (const ewb of this.editingStock.ewaybills || []) {
        for (const inv of ewb.invoices || []) {
          if (this.normalizeInvoiceNumber(inv) !== flatInvNumber) continue;
          for (const prod of inv.products || []) {
            const flatProd = (flatInv.products || []).find(
              (p: any) => this.normalizeProductType(p) === this.normalizeProductType(prod)
            );
            if (!flatProd) continue;
            prod.amount = flatProd.amount;
            prod.instock = flatProd.instock;
            prod.intransitstock = flatProd.intransitstock;
            prod.deliveredstock = flatProd.deliveredstock;
            if (flatProd.manifestQty !== undefined) {
              prod.manifestQty = flatProd.manifestQty;
            }
          }
        }
      }
    }
  }

  private applyProductUpdate(
    invoices: any[],
    invoiceNumber: string,
    productType: string,
    update: (prod: any) => void
  ) {
    const normalizedInvoice = String(invoiceNumber || '').trim();
    const normalizedProduct = String(productType || '').trim();
    (invoices || []).forEach((inv: any) => {
      const invNumber = this.normalizeInvoiceNumber(inv);
      if (normalizedInvoice && invNumber !== normalizedInvoice) return;
      (inv.products || []).forEach((prod: any) => {
        if (this.normalizeProductType(prod) !== normalizedProduct) return;
        update(prod);
      });
    });
  }

  private isProductManifested(product: any): boolean {
    return Number(product?._originalIntransit ?? product?.intransitstock ?? 0) > 0;
  }

  onProductAmountFocus(invoice: any, product: any, invoiceIndex?: number) {
    if (!this.isProductManifested(product)) return;
    this.openManifestAdjustmentPopup(invoice, product, product.amount, invoiceIndex);
  }

  onProductAmountChange(invoice: any, product: any, rawValue: any, invoiceIndex?: number) {
    if (!this.editingStock) return;

    let newAmount = Number(rawValue);
    if (!Number.isFinite(newAmount)) newAmount = 0;
    if (newAmount < 0) newAmount = 0;

    const originalAmount = Number(product._originalAmount) || 0;
    const originalInstock = Number(product._originalInstock) || 0;
    const originalIntransit = Number(product._originalIntransit) || 0;
    const originalDelivered = Number(product._originalDelivered) || 0;

    if (!this.isProductManifested(product)) {
      if (newAmount >= originalAmount) {
        const delta = newAmount - originalAmount;
        product.amount = newAmount;
        product.instock = originalInstock + delta;
        product.intransitstock = originalIntransit;
        product.deliveredstock = originalDelivered;
        return;
      }

      const reduction = originalAmount - newAmount;
      if (reduction <= originalInstock) {
        product.amount = newAmount;
        product.instock = originalInstock - reduction;
        product.intransitstock = originalIntransit;
        product.deliveredstock = originalDelivered;
        return;
      }

      alert('Reduction exceeds available in-stock quantity.');
      this.resetProductToOriginal(product);
      return;
    }

    const reduction = originalAmount - newAmount;
    if (reduction > (originalInstock + originalIntransit)) {
      alert('Reduction exceeds available in-stock and manifested quantity.');
      this.resetProductToOriginal(product);
      return;
    }

    if (!this.pendingManifestAdjustment || this.pendingManifestAdjustment.productRef !== product) {
      this.openManifestAdjustmentPopup(invoice, product, newAmount, invoiceIndex);
      return;
    }

    this.pendingManifestAdjustment.targetAmount = newAmount;
    product.amount = newAmount;
  }

  private openManifestAdjustmentPopup(invoice: any, product: any, targetAmount: any, invoiceIndex?: number) {
    const consignmentNumber = this.editingStock?.consignmentNumber;
    if (!consignmentNumber) return;

    let invoiceNumber = this.normalizeInvoiceNumber(invoice);
    if (!invoiceNumber && Number.isFinite(invoiceIndex)) {
      invoiceNumber = `MAN-${String(consignmentNumber || '').trim()}-${Number(invoiceIndex) + 1}`;
    }

    this.pendingManifestAdjustment = {
      consignmentNumber,
      invoiceNumber,
      productType: this.normalizeProductType(product),
      targetAmount: Number(targetAmount) || 0,
      popupInstock: Number(product._originalInstock) || 0,
      originalAmount: Number(product._originalAmount) || 0,
      originalInstock: Number(product._originalInstock) || 0,
      originalIntransit: Number(product._originalIntransit) || 0,
      originalDelivered: Number(product._originalDelivered) || 0,
      productRef: product
    };

    this.http.get<any[]>(`http://localhost:3000/api/manifest/by-consignment/${encodeURIComponent(consignmentNumber)}`)
      .subscribe({
        next: (res: any[]) => {
          this.manifestAdjustments = res || [];
          this.buildManifestAdjustmentLines();
        },
        error: (err) => {
          console.error('Error loading manifests:', err);
          alert('Failed to load manifests for adjustment.');
          this.cancelManifestAdjustments();
        }
      });
  }

  private buildManifestAdjustmentLines() {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return;

    const productType = pending.productType;
    const consignmentNumber = pending.consignmentNumber;
    const lines: any[] = [];

    for (const manifest of this.manifestAdjustments || []) {
      for (const cons of manifest.consignments || []) {
        if (String(cons.consignmentNumber || '').trim() !== consignmentNumber) continue;
        for (const inv of cons.invoices || []) {
          const invNumber = this.normalizeInvoiceNumber(inv);
          if (pending.invoiceNumber && invNumber !== pending.invoiceNumber) continue;
          for (const prod of inv.products || []) {
            if (this.normalizeProductType(prod) !== productType) continue;
            const originalManifestQty = Number(prod.manifestQty) || 0;
            lines.push({
              manifestId: manifest._id,
              manifestationNumber: manifest.manifestationNumber,
              date: manifest.date,
              manifestStatus: manifest.mshipmentStatus,
              consignmentNumber,
              invoiceNumber: invNumber,
              productType,
              originalManifestQty,
              newManifestQty: originalManifestQty,
              isDelivered: String(manifest.mshipmentStatus || '').toLowerCase() === 'delivered'
            });
          }
        }
      }
    }

    if (!lines.length) {
      alert('No manifest lines found for this product.');
      this.cancelManifestAdjustments();
      return;
    }

    this.manifestAdjustmentLines = lines;
    this.syncPopupInstockWithTarget();
    this.showManifestAdjustmentPopup = true;
  }

  onManifestQtyChange(line: any) {
    let value = Number(line.newManifestQty);
    if (!Number.isFinite(value)) value = 0;
    if (value < 0) value = 0;
    line.newManifestQty = value;
    const pending = this.pendingManifestAdjustment;
    if (!pending) return;
    const totals = this.getManifestTotals();
    pending.targetAmount = (Number(pending.popupInstock) || 0) + totals.manifestTotal;
    if (pending.productRef) {
      pending.productRef.amount = Number(pending.targetAmount) || 0;
    }
  }

  getManifestLineTotal(): number {
    return this.getManifestTotals().manifestTotal;
  }

  getPopupTargetTotal(): number {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return 0;
    return Number(pending.targetAmount) || 0;
  }

  getPopupDeliveredTotal(): number {
    return this.getManifestTotals().deliveredTotal;
  }

  getPopupInstockTotal(): number {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return 0;
    const totals = this.getManifestTotals();
    return (Number(pending.targetAmount) || 0) - totals.manifestTotal;
  }

  private syncPopupInstockWithTarget() {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return;
    const totals = this.getManifestTotals();
    const targetAmount = Number(pending.targetAmount) || 0;
    const computedInstock = targetAmount - totals.manifestTotal;
    pending.popupInstock = Math.max(0, computedInstock);
    pending.targetAmount = pending.popupInstock + totals.manifestTotal;
  }

  private syncTargetFromInstock() {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return;
    const popupInstock = Math.max(0, Number(pending.popupInstock) || 0);
    pending.popupInstock = popupInstock;
    const totals = this.getManifestTotals();
    pending.targetAmount = popupInstock + totals.manifestTotal;
  }

  onPopupTargetAmountChange(rawValue: any) {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return;

    let newAmount = Number(rawValue);
    if (!Number.isFinite(newAmount)) newAmount = 0;
    if (newAmount < 0) newAmount = 0;

    pending.targetAmount = newAmount;
    this.syncPopupInstockWithTarget();
    if (pending.productRef) {
      pending.productRef.amount = newAmount;
    }
  }

  onPopupInstockChange(rawValue: any) {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return;

    let newInstock = Number(rawValue);
    if (!Number.isFinite(newInstock)) newInstock = 0;
    if (newInstock < 0) newInstock = 0;

    pending.popupInstock = newInstock;
    this.syncTargetFromInstock();
    if (pending.productRef) {
      pending.productRef.amount = Number(pending.targetAmount) || 0;
    }
  }

  applyManifestAdjustments() {
    const pending = this.pendingManifestAdjustment;
    if (!pending) return;

    const totals = this.getManifestTotals();
    const instockTotal = Math.max(0, Number(pending.popupInstock) || 0);
    const targetAmount = instockTotal + totals.manifestTotal;
    if (instockTotal < 0) {
      alert('New Total Qty must be at least manifest + delivered quantities.');
      return;
    }

    for (const line of this.manifestAdjustmentLines || []) {
      line.updatedAmount = targetAmount;
      line.updatedInstock = instockTotal;
      line.updatedIntransit = totals.intransitTotal;
      line.updatedDelivered = totals.deliveredTotal;
    }

    for (const line of this.manifestAdjustmentLines || []) {
      this.queueManifestUpdate(line);
    }

    const updateTotals = (prod: any) => {
      prod.amount = targetAmount;
      prod.instock = instockTotal;
      prod.intransitstock = totals.intransitTotal;
      prod.deliveredstock = totals.deliveredTotal;
      prod.manifestQty = totals.manifestTotal;
    };
    if (pending.productRef) {
      updateTotals(pending.productRef);
    }
    this.applyProductUpdate(this.editingStock?.invoices || [], pending.invoiceNumber, pending.productType, updateTotals);
    (this.editingStock?.ewaybills || []).forEach((ewb: any) => {
      this.applyProductUpdate(ewb.invoices || [], pending.invoiceNumber, pending.productType, updateTotals);
    });

    this.pendingManifestAdjustment = null;
    this.manifestAdjustmentLines = [];
    this.showManifestAdjustmentPopup = false;
  }

  cancelManifestAdjustments() {
    const pending = this.pendingManifestAdjustment;
    if (pending?.productRef) this.resetProductToOriginal(pending.productRef);
    this.pendingManifestAdjustment = null;
    this.manifestAdjustmentLines = [];
    this.showManifestAdjustmentPopup = false;
  }

  private queueManifestUpdate(line: any) {
    const manifest = (this.manifestAdjustments || []).find((m: any) => m._id === line.manifestId);
    if (!manifest) return;

    for (const cons of manifest.consignments || []) {
      if (String(cons.consignmentNumber || '').trim() !== line.consignmentNumber) continue;
      for (const inv of cons.invoices || []) {
        const invNumber = this.normalizeInvoiceNumber(inv);
        if (invNumber !== line.invoiceNumber) continue;
        for (const prod of inv.products || []) {
          if (this.normalizeProductType(prod) !== line.productType) continue;
          prod.manifestQty = Number(line.newManifestQty) || 0;
          if (line.updatedAmount !== undefined) {
            prod.amount = Number(line.updatedAmount) || 0;
            prod.instock = Number(line.updatedInstock) || 0;
            prod.intransitstock = Number(line.updatedIntransit) || 0;
            prod.deliveredstock = Number(line.updatedDelivered) || 0;
          }
        }
      }
    }

    this.manifestEditsById[manifest._id] = manifest;
  }

  private buildShipmentPayload() {
    const payload = JSON.parse(JSON.stringify(this.editingStock));
    const cleanProduct = (prod: any) => {
      delete prod._originalAmount;
      delete prod._originalInstock;
      delete prod._originalIntransit;
      delete prod._originalDelivered;
    };

    (payload.ewaybills || []).forEach((ewb: any) => {
      (ewb.invoices || []).forEach((inv: any) => {
        (inv.products || []).forEach((prod: any) => cleanProduct(prod));
      });
    });
    (payload.invoices || []).forEach((inv: any) => {
      (inv.products || []).forEach((prod: any) => cleanProduct(prod));
    });

    return payload;
  }

  onConsignorSelect(name: string) {
    const selectedconignor = this.clientList.find(c => c.clientName === name);
    if (selectedconignor) {
      this.editingStock.consignorGST = selectedconignor.GSTIN;
      this.editingStock.consignorAddress = selectedconignor.address;
      this.editingStock.consignorPhone = selectedconignor.phoneNum;
    }
  }

  onConsigneeSelect(name: string) {
    const selectedconignee = this.clientList.find(c => c.clientName === name);
    if (selectedconignee) {
      this.editingStock.consigneeGST = selectedconignee.GSTIN;
      this.editingStock.consigneeAddress = selectedconignee.address;
      this.editingStock.consigneePhone = selectedconignee.phoneNum;
    }
  }

  onConsignorGuestSelect(name: string) {
    const selectedguestconignor = this.guestList.find(c => c.guestName === name);
    if (selectedguestconignor) {
      this.editingStock.consignorGST = 'GUEST';
      this.editingStock.consignorAddress = selectedguestconignor.address;
      this.editingStock.consignorPhone = selectedguestconignor.phoneNum;
    }
  }

  onConsigneeGuestSelect(name: string) {
    const selectedguestconignee = this.guestList.find(c => c.guestName === name);
    if (selectedguestconignee) {
      this.editingStock.consigneeGST = 'GUEST';
      this.editingStock.consigneeAddress = selectedguestconignee.address;
      this.editingStock.consigneePhone = selectedguestconignee.phoneNum;
    }
  }

  onPackageList(name: string) {
    const selectedpackage = this.pkgList.find(c => c.pkgName === name);
  }

  onProductList(name: string) {
    const selectedproduct = this.productList.find(c => c.productName === name);
  }

addRoutePoint() {
  if (!this.selectedRoutePoint) return;
  const vehicleNo = this.selectedRouteVehicle || '';
  this.shipmentRoute.push({
    name: this.selectedRoutePoint.name,
    type: this.selectedRoutePoint.type,
    vehicleNo
  });
  this.selectedRoutePoint = null;
  this.selectedRouteVehicle = '';
}

removeRoutePoint(index: number) {
  this.shipmentRoute.splice(index, 1);
}

loadBranches() {
  const email = localStorage.getItem('email');
  this.http.get<any[]>(`http://localhost:3000/api/branches?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Branches loaded:", data);
        this.branches = data;
        this.updateAvailableRoutePoints(); // Refresh route options
        this.loadStocks();
        this.loadManifests();
      },
      error: (err) => console.error("Error loading branches:", err)
    });
}

loadHubs() {
  const email = localStorage.getItem('email');
  this.http.get<any[]>(`http://localhost:3000/api/hubs?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Hubs loaded:", data);
        this.hubs = data;
        this.updateAvailableRoutePoints(); // Refresh route options

        const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
        if (originLocId === 'all-hubs') {
          const storedHubId = this.normalizeId(localStorage.getItem('hubId'));
          const fallbackHubId = this.normalizeId((this.hubs || [])[0]?._id);
          const hubId = storedHubId || fallbackHubId;
          if (hubId) {
            this.selectedHubFilterId = hubId;
            const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === hubId);
            this.selectedHubFilterName = String(hub?.hubName || '').trim();
            localStorage.setItem('hubId', hubId);
            localStorage.setItem('hubName', this.selectedHubFilterName);
          }
          this.loadStocks();
          this.loadManifests();
        }
      },
      error: (err) => console.error("Error loading hubs:", err)
    });
}

updateAvailableRoutePoints() {
  const originLocId = String(this.originLocId || '').trim();
  const branchName = String(this.branch || '').trim().toLowerCase();
  const excludeSelected = branchName && branchName !== 'all branches';
  this.availableRoutePoints = [
    ...this.branches
      .filter((b) => {
        if (!excludeSelected) return true;
        const idMatch = originLocId && originLocId !== 'all' &&
          this.normalizeId(b?._id) === this.normalizeId(originLocId);
        const nameMatch = String(b?.branchName || '').trim().toLowerCase() === branchName;
        return !(idMatch || nameMatch);
      })
      .map(b => ({
        name: b.branchName,
        type: "Branch" as const,
        vehicles: (b.vehicles || []).map((v: any) => v.vehicleNo).filter(Boolean)
      })),
    ...this.hubs
      .filter((h) => {
        if (!excludeSelected) return true;
        const idMatch = originLocId && originLocId !== 'all' &&
          this.normalizeId(h?.originLocId) === this.normalizeId(originLocId);
        if (idMatch) return false;
        const hubBranch = (this.branches || []).find((b) =>
          this.normalizeId(b?._id) === this.normalizeId(h?.originLocId)
        );
        const nameMatch = hubBranch?.branchName &&
          String(hubBranch.branchName).trim().toLowerCase() === branchName;
        return !nameMatch;
      })
      .map(h => ({
        name: h.hubName,
        type: "Hub" as const,
        vehicles: (h.deliveryAddresses || [])
          .flatMap((addr: any) => (addr.vehicles || []).map((v: any) => v.vehicleNo))
          .filter(Boolean)
      }))
  ];
  console.log('[manifest] route points', {
    originLocId,
    branchName: this.branch,
    points: this.availableRoutePoints.map((p) => `${p.name} (${p.type})`)
  });
}

onRoutePointChange() {
  this.selectedRouteVehicle = this.selectedRoutePoint?.vehicles?.[0] || '';
}

  ngOnInit() {
    this.activeTab = 'stocks';
    this.email = localStorage.getItem('email') || '';
    this.username = localStorage.getItem('username') || '';
    this.branch = this.branchService.currentBranch || localStorage.getItem('branch') || 'All Branches';
    this.originLocId = localStorage.getItem('originLocId') || 'all';
    if (this.originLocId === 'all') { this.filterStatus = ''; }

    this.branchSub = this.branchService.branch$.subscribe(branch => {
      this.branch = branch;
      this.originLocId = localStorage.getItem('originLocId') || 'all';
      this.updateAvailableRoutePoints();
      this.loadStocks();
      this.loadManifests();
    });

    // react to branch changes (same tab)
    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.branch || currentId !== this.originLocId) {
        this.branch = current;
        this.originLocId = currentId;
        this.updateAvailableRoutePoints();
        this.loadStocks();
        this.loadManifests();
      }
    }, 1000);

    // react to branch changes (other tabs)
    window.addEventListener('storage', this.onStorageChange);

    // Clients list
    this.http.get<any[]>(`http://localhost:3000/api/clients/clientslist?emailId=${this.email}`)
    .subscribe({
      next: data => this.clientList = data,
      error: err => console.error('Error fetching client list', err),
      complete: () => console.log('Client list fetch complete')
    });

    // Guests list
    this.http.get<any[]>(`http://localhost:3000/api/guests/guestslist?emailId=${this.email}`)
    .subscribe({
      next: data => this.guestList = data,
      error: err => console.error('Error fetching guest list', err),
      complete: () => console.log('Guest list fetch complete')
    });

    // Packages list
    this.http.get<any[]>(`http://localhost:3000/api/pkgs/pkglist?emailId=${this.email}`)
    .subscribe({
      next: data => this.pkgList = data,
      error: err => console.error('Error fetching package list', err),
      complete: () => console.log('Package list fetch complete')
    });

    // Products list
    const originFilter = this.getManifestOriginFilter();
    const params: any = {
      branch: this.branch || localStorage.getItem('branch') || ''
    };
    if (originFilter) {
      params.originType = originFilter.originType;
      params.originLocId = originFilter.originLocId;
    } else {
      const originLocIdParam = this.originLocId || localStorage.getItem('originLocId') || 'all';
      params.originLocId = originLocIdParam === 'all-hubs' ? 'all' : originLocIdParam;
    }
    this.http.get<any[]>('http://localhost:3000/api/products/productlist', { params })
      .subscribe({
      next: data => this.productList = data,
      error: err => console.error('Error fetching product list', err),
      complete: () => console.log('Product list fetch complete')
    });

    this.loadBranches();
    this.loadHubs();
  }

  ngOnDestroy(): void {
    this.branchSub?.unsubscribe();
    if (this.branchCheck) clearInterval(this.branchCheck);
    window.removeEventListener('storage', this.onStorageChange);
  }

  private onStorageChange = (e: StorageEvent) => {
    if (e.key === 'branch' || e.key === 'originLocId') {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.branch || currentId !== this.originLocId) {
        this.branch = current;
        this.originLocId = currentId;
        this.loadStocks();
        this.loadManifests();
      }
    }
  };

  showManifestAdjustmentPopup = false;
  pendingManifestAdjustment: any = null;
  manifestAdjustments: any[] = [];
  manifestAdjustmentLines: any[] = [];
  manifestEditsById: Record<string, any> = {};

  showManifestationPopup = false;
  selectedForManifestation: any[] = [];
  manifestationNumber: string = '';


  getEwaybillNumberFromDB(consignmentNumber: string): string {
  const record = this.stocks.find(
    shipment => shipment.consignmentNumber === consignmentNumber
  );
  return record?.ewaybillNumber || '';
}

  

openManifestationPopup() {
  if (this.originLocId === 'all' || !this.originLocId) {
    alert('Please select a specific branch before manifesting consignments.');
    return;
  }
  // Filter selected consignments
  this.selectedForManifestation = this.filteredStocks.filter(s => s.selected);

  // Guard clause: ensure at least one consignment is selected
  if (this.selectedForManifestation.length === 0) {
    alert('G??n+? Please select at least one consignment to manifest.');
    return;
  }


  // Initialize manifestQty and eway bill fields
  this.selectedForManifestation = this.selectedForManifestation.map(consignment => {
    // Set eway bill fields
    const updatedConsignment = {
      ...consignment,
      ewayBillRequired: false,
      ewaybillNumber: this.getEwaybillNumberFromDB(consignment.consignmentNumber)
    };

    // Set manifestQty = instock for each product
    updatedConsignment.invoices?.forEach((invoice: any) => {
      invoice.products?.forEach((product: any) => {
        const amount = Number(product.amount) || 0;
        const inTransit = Number(product.intransitstock) || 0;
        const delivered = Number(product.deliveredstock) || 0;
        const available = Math.max(0, amount - inTransit - delivered);
        const currentInstock = Number(product.instock) || 0;
        if (!currentInstock && available > 0) {
          product.instock = available;
        }
        product.manifestQty = Number(product.instock) || available;
        product.manifestQtyTouched = false;
      });
    });

    return updatedConsignment;
  });

  // Show the popup
  this.showManifestationPopup = true;
}



closeManifestationPopup() {
  this.showManifestationPopup = false;
}

private executeDelivery(consignments: any[], onSuccess?: () => void) {
  if (!consignments.length) {
    alert('No consignments selected.');
    return;
  }

  const vehicleUpdates: Array<ReturnType<typeof this.http.patch>> = [];
  const completionTargets = new Map<string, { vehicleNo: string; ownerType: 'Branch' | 'Hub'; ownerId: string; locationId: string }>();
  const updates = (consignments || []).map((consignment) => {
      const updatedEwaybills = (consignment.ewaybills || []).map((ewb: any) => ({
        ...ewb
      }));
      const status = String(consignment?.shipmentStatus || '').trim();
      const isManifestation = status === 'Manifestation' || status === 'DManifestation';
      const statusDetailsoriginLocId = this.getLastStatusDetailoriginLocId(consignment?.shipmentStatusDetails || '');
      const resolvedCurrentoriginLocId =
        statusDetailsoriginLocId ||
        consignment?.currentLocationId ||
        consignment?.currentBranch ||
        consignment?.currentBranch;
      const vehicleNo = String(consignment?.currentVehicleNo || '').trim();

        const payload = {
          shipmentId: consignment?._id || '',
          shipmentStatus: isManifestation ? 'DPending' : 'Delivered',
          currentLocationId: resolvedCurrentoriginLocId,
          currentVehicleNo: consignment?.currentVehicleNo || '',
          currentVehicleOwnerType: consignment?.currentVehicleOwnerType || '',
          currentVehicleOwnerId: consignment?.currentVehicleOwnerId || null,
          clearAllVehicles: true,
          ewaybills: updatedEwaybills
        };
      const shipmentId = consignment?._id ? encodeURIComponent(consignment._id) : '';
      const shipmentParam = shipmentId ? `?shipmentId=${shipmentId}` : '';

      console.log('[manifest:update] payload', {
        consignmentNumber: consignment.consignmentNumber,
        shipmentId: payload.shipmentId,
        shipmentStatus: payload.shipmentStatus,
        currentLocationId: payload.currentLocationId
      });
      if (!isManifestation && vehicleNo && resolvedCurrentoriginLocId) {
        const currentStatus = this.findVehicleStatus(vehicleNo);
        if (currentStatus === 'scheduled' || currentStatus === 'delivering') {
          const owner = this.resolveVehicleOwner(
            vehicleNo,
            consignment?.currentVehicleOwnerType,
            consignment?.currentVehicleOwnerId
          );
          if (owner.ownerType && owner.ownerId) {
            const key = `${owner.ownerType}:${owner.ownerId}:${vehicleNo}`;
            completionTargets.set(key, {
              vehicleNo,
              ownerType: owner.ownerType as 'Branch' | 'Hub',
              ownerId: owner.ownerId,
              locationId: String(resolvedCurrentoriginLocId || '')
            });
          }
        }
      }
      return this.http.put(
        `http://localhost:3000/api/newshipments/${consignment.consignmentNumber}${shipmentParam}`,
        payload
    );
  });

  completionTargets.forEach((target) => {
    const endpoint = target.ownerType === 'Hub'
      ? `http://localhost:3000/api/hubs/${target.ownerId}/vehicle-status`
      : `http://localhost:3000/api/branches/${target.ownerId}/vehicle-status`;
    vehicleUpdates.push(
      this.http.patch(endpoint, {
        vehicleNo: target.vehicleNo,
        vehicleStatus: 'online',
        currentLocationId: target.locationId
      })
    );
  });

  const calls = [...updates, ...vehicleUpdates];
  if (!calls.length) return;

  forkJoin(calls).subscribe({
    next: (responses: any[]) => {
      console.log('[manifest:update] response', responses);
      if (onSuccess) {
        onSuccess();
        return;
      }
      this.showManifestationPopup = false;
      this.selectedForManifestation = [];
      this.filteredStocks.forEach(s => s.selected = false);
      this.loadStocks();
    },
    error: (err) => {
      console.error('Error updating consignment status:', err);
      alert('Failed to update consignment status.');
    }
  });
}

finalizeManifestation() {
  this.executeDelivery(this.selectedForManifestation, () => {
    this.showManifestationPopup = false;
    this.selectedForManifestation = [];
    this.filteredStocks.forEach(s => s.selected = false);
    this.loadStocks();
  });
}

validateManifestQty(product: any) {
  product.manifestQtyTouched = true;
  if (product.manifestQty > product.instock) {
    alert(`G??n+? Manifest quantity cannot exceed available stock (${product.instock}).`);
    product.manifestQty = product.instock;
  }
  if (product.manifestQty < 0) {
    alert('G??n+? Manifest quantity cannot be negative.');
    product.manifestQty = 0;
  }
}

printSelectedManifests() {
  const selected = this.getSelectedManifests();
  if (!selected.length) {
    alert('Select at least one manifest to print.');
    return;
  }

  const html = this.buildManifestPrintHtml(selected);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

isManifestSelected(manifest: any): boolean {
  const id = this.normalizeId(manifest?._id);
  return Boolean(id && this.selectedManifestIds.has(id));
}

toggleManifestSelection(manifest: any): void {
  const id = this.normalizeId(manifest?._id);
  if (!id) return;
  const updated = new Set(this.selectedManifestIds);
  if (updated.has(id)) {
    updated.delete(id);
  } else {
    updated.add(id);
  }
  this.selectedManifestIds = updated;
}

private getSelectedManifests(): any[] {
  if (!this.selectedManifestIds.size) return [];
  return (this.manifests || []).filter((manifest) =>
    this.selectedManifestIds.has(this.normalizeId(manifest?._id))
  );
}

private buildManifestPrintHtml(manifests: any[]): string {
    const sections = manifests.map((manifest, index) => {
      const items = Array.isArray(manifest?.items) ? manifest.items : [];
      const manifestStatusNormalized = String(manifest?.status || '').trim().toLowerCase();
      const filteredForCancelled = manifestStatusNormalized === 'cancelled'
        ? items.filter((item: any) => String(item?.status || '').trim().toLowerCase() === 'cancelled')
        : items;
      const sectionItems = filteredForCancelled.length ? filteredForCancelled : items;
      const rows = sectionItems.length
        ? sectionItems.map((item: any) => {
        const consignmentNumber = String(item?.consignmentNumber || '').trim() || '-';
        const status = String(item?.status || item?.shipmentStatus || '-');
        const shipmentId = String(item?.shipmentId || '').trim() || '-';
        return `
          <tr>
            <td>${consignmentNumber}</td>
            <td>${status}</td>
            <td>${shipmentId}</td>
          </tr>
        `;
      }).join('')
      : `<tr><td colspan="3">No consignments recorded.</td></tr>`;

    const entityName = this.getManifestEntityName(manifest);
    const createdAt = manifest?.createdAt ? new Date(manifest.createdAt).toLocaleString() : '-';
    const sectionStatusLabel = manifestStatusNormalized === 'cancelled'
      ? 'Cancelled consignments'
      : manifest?.status || '-';

    return `
      <section class="manifest-print-section">
        <h2>${manifest?.manifestNumber || 'Manifest'}</h2>
        <p class="manifest-print-meta">
          <span><strong>Status:</strong> ${sectionStatusLabel}</span>
          <span><strong>Vehicle:</strong> ${manifest?.vehicleNo || '-'}</span>
          <span><strong>Entity:</strong> ${entityName}</span>
          <span><strong>Created:</strong> ${createdAt}</span>
        </p>
        <table class="manifest-print-table">
          <thead>
            <tr>
              <th>Consignment</th>
              <th>Manifest Status</th>
              <th>Shipment ID</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
      ${index < manifests.length - 1 ? '<div class="page-break"></div>' : ''}
    `;
  });

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Manifest Print</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #fff; color: #0f172a; }
          .manifest-print-section { border: 1px solid #d1d5db; border-radius: 12px; padding: 18px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
          .manifest-print-section h2 { margin: 0 0 6px; font-size: 20px; }
          .manifest-print-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; font-size: 14px; }
          .manifest-print-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          .manifest-print-table th, .manifest-print-table td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; font-size: 13px; }
          .manifest-print-table th { background: #f8fafc; }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>
        ${sections.join('')}
      </body>
    </html>
  `;
}

}












































