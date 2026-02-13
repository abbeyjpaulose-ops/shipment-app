import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { Subscription, forkJoin, of } from 'rxjs';
import { BranchService } from '../../../services/branch.service';

@Component({
  selector: 'app-stocks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stocks.component.html',
  styleUrls: ['./stocks.component.css']
})
export class StocksComponent implements OnInit, OnDestroy {
  allStocks: any[] = [];
  stocks: any[] = [];
  filteredStocks: any[] = [];
  activeTab: 'stocks' | 'others-in-branch' = 'stocks';
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  selectedHubFilterId: string | null = null;
  selectedHubFilterName = '';
  selectedStock: any = null;
  editingStock: any = null;   // track which stock is being edited

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
transportPartners: any[] = [];
selectedTransportPartnerId: string = '';
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
  isAdmin = String(localStorage.getItem('role') || '').toLowerCase() === 'admin';
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
  manifestationStatusOptions: string[] = ['Manifestation', 'Out for Delivery', 'Will be Picked-Up'];
  manifestationStatus: string = 'Manifestation';
isExternalTransport = false;

branches: any[] = [];
hubs: any[] = [];
  availableRoutePoints: { name: string; type: 'Branch' | 'Hub'; vehicles: string[] }[] = [];
  shipmentRoute: { name: string; type: 'Branch' | 'Hub' | 'Transport Partner'; vehicleNo: string }[] = [];
  selectedRoutePoint: any = null;
  selectedRouteVehicle: string = '';
  selectedNextDeliveryPoint: string = '';
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
    const params: any = {
      username
    };
    const originFilter = this.getSelectedOrigin(branchParam);
    if (originFilter) {
      params.originType = originFilter.originType;
      params.originLocId = originFilter.originLocId;
    } else {
      params.originLocId = branchParam;
    }
    this.http.get<any[]>('http://localhost:3000/api/newshipments', { params }).subscribe({
      next: (res: any[]) => {
        console.log('[stocks][load]', {
          originLocId,
          branchParam,
          activeTab: this.activeTab,
          count: Array.isArray(res) ? res.length : 0
        });
        const normalized = (res || []).map((stock) => ({
          ...stock,
          branch: stock.branch || stock.branchName || '',
          invoices: this.flattenInvoices(stock.ewaybills || stock.invoices || [])
        }));
        this.allStocks = normalized;
        this.refreshStocksView();
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

  private isDeliveryStatus(status: string): boolean {
    return status === 'DPending' ||
      status === 'DManifestation' ||
      status === 'D-Out for Delivery' ||
      status === 'D-|Will be Picked-Up';
  }

  private isDeliveryStatusForOthers(status: string): boolean {
    return status === 'DPending' ||
      status === 'DManifestation' ||
      status === 'D-Out for Delivery' ||
      status === 'D-|Will be Picked-Up';
  }

  private isCompanyMatch(stock: any): boolean {
    const gstinId = String(localStorage.getItem('GSTIN_ID') || '').trim();
    if (!gstinId) return true;
    const stockGstin = String(stock?.GSTIN_ID ?? stock?.gstinId ?? '').trim();
    if (!stockGstin) return false;
    return stockGstin === gstinId;
  }


  private getBaseStocks(): any[] {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (originLocId === 'all') {
      if (this.activeTab === 'others-in-branch') {
        return (this.allStocks || []).filter(stock => {
          const status = String(stock.shipmentStatus || '').trim();
          if (status !== 'DPending') return false;
          const originoriginLocId = this.getOriginId(stock);
          const currentoriginLocId = this.normalizeId(
            stock.currentLocationId || stock.currentBranch
          );
          return originoriginLocId && currentoriginLocId && originoriginLocId !== currentoriginLocId;
        });
      }
      return (this.allStocks || []).filter(stock => {
        const status = String(stock.shipmentStatus || '').trim();
        return status === 'Pending';
      });
    }
    if (this.activeTab === 'others-in-branch') {
      if (!originLocId || originLocId === 'all') return [];
      if (originLocId === 'all-hubs') {
        return (this.allStocks || []).filter(stock => {
          const status = String(stock.shipmentStatus || '').trim();
          if (status !== 'DPending') return false;
        const currentoriginLocId = this.normalizeId(
          stock.currentLocationId || stock.currentBranch
        );
        const originoriginLocId = this.getOriginId(stock) || currentoriginLocId;
          const selectedHubId = this.normalizeId(this.selectedHubFilterId);
          const selectedHubName = selectedHubId
            ? String((this.hubs || []).find((h) => this.normalizeId(h?._id) === selectedHubId)?.hubName || '').trim()
            : '';
          const currentBranchLabel = String(stock.currentBranch || '').trim();
          const matchesSelectedHub = Boolean(selectedHubId) && (
            currentoriginLocId === selectedHubId ||
            String(currentBranchLabel).toLowerCase() === String(selectedHubName).toLowerCase() ||
            this.matchesBranchLabel(currentBranchLabel, selectedHubName)
          );
          return selectedHubId &&
            originoriginLocId &&
            originoriginLocId !== selectedHubId &&
            matchesSelectedHub;
        });
      }
      return (this.allStocks || []).filter(stock => {
        const currentoriginLocId = this.normalizeId(
          stock.currentLocationId || stock.currentBranch
        );
        const originoriginLocId = this.getOriginId(stock);
        const status = String(stock.shipmentStatus || '').trim();
        if (status !== 'DPending') return false;
        const selectedoriginLocId = this.normalizeId(originLocId);
        return currentoriginLocId &&
          selectedoriginLocId &&
          currentoriginLocId === selectedoriginLocId &&
          originoriginLocId &&
          originoriginLocId !== currentoriginLocId;
      });
    }
    return (this.allStocks || []).filter(stock => {
      const status = String(stock.shipmentStatus || '').trim();
      if (status !== 'Pending') return false;
      if (!originLocId || originLocId === 'all') {
        return true;
      }
        if (originLocId === 'all-hubs') {
          const hubId =
            this.getOriginId(stock) ||
            this.normalizeId(stock.currentLocationId || stock.currentBranch);
          return this.isHubLinkedToAssignedBranch(hubId);
        }
      const currentoriginLocId = this.normalizeId(
        stock.currentLocationId || stock.currentBranch
      );
      const selectedoriginLocId = this.normalizeId(originLocId);
      return currentoriginLocId &&
        selectedoriginLocId &&
        currentoriginLocId === selectedoriginLocId;
    });
  }

  private refreshStocksView() {
    this.stocks = this.getBaseStocks()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    this.applyFilters();
    this.maybeOpenEditFromStorage();
  }

  private maybeOpenEditFromStorage(): void {
    const target = String(localStorage.getItem('editConsignmentNumber') || '').trim();
    if (!target) return;
    const match = (this.stocks || []).find((s) =>
      String(s?.consignmentNumber || '').trim() === target
    );
    if (!match) return;
    localStorage.removeItem('editConsignmentNumber');
    this.editStock(match);
  }

  setActiveTab(tab: 'stocks' | 'others-in-branch') {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.loadStocks();
  }

  applyFilters() {
    const originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
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
    this.filteredStocks = this.stocks.filter(s =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true) &&
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
    this.refreshStocksView();
  }

  private matchesHubFilter(stock: any, hubId: string, hubName: string): boolean {
    if (!hubId) return false;
    const hasHubName = Boolean(hubName);
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

  getAllHubsFilterOptions(): any[] {
    if (this.isAdmin) return this.hubs || [];
    return (this.hubs || []).filter((h) => this.isHubLinkedToAssignedBranch(this.normalizeId(h?._id)));
  }

  private getStockHubId(stock: any): string {
    return (
      this.normalizeId(stock?.originLocId) ||
      this.normalizeId(stock?.currentLocationId || stock?.currentBranch)
    );
  }

  private getStockCurrentHubId(stock: any): string {
    const currentoriginLocId = this.normalizeId(
      stock?.currentLocationId || stock?.currentBranch
    );
    if (!currentoriginLocId) return '';
    const hubById = (this.hubs || []).find((h) => this.normalizeId(h?._id) === currentoriginLocId);
    if (hubById?._id) return this.normalizeId(hubById._id);
    const currentName = String(stock?.currentBranch || '').trim().toLowerCase();
    if (!currentName) return '';
    const hubByName = (this.hubs || []).find(
      (h) => String(h?.hubName || '').trim().toLowerCase() === currentName
    );
    return hubByName?._id ? this.normalizeId(hubByName._id) : '';
  }

  private normalizeId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }

  private getOriginId(stock: any): string {
    if (!stock) return '';
    const raw = stock?.originLocId || stock?.originLocId|| stock?.originLocId || stock?.branch;
    return this.normalizeId(raw);
  }

  private getSelectedOrigin(originLocIdOverride: string | null = null): { originType: 'branch' | 'hub'; originLocId: string } | null {
    const originLocId = (originLocIdOverride || this.originLocId || localStorage.getItem('originLocId') || 'all').toLowerCase();
    if (!originLocId || originLocId === 'all') return null;
    if (originLocId === 'all-hubs') {
      const hubId = this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'));
      return hubId ? { originType: 'hub', originLocId: hubId } : null;
    }
    const normalized = this.normalizeId(originLocId);
    return normalized ? { originType: 'branch', originLocId: normalized } : null;
  }

  private getoriginLocIdByName(name: string): string {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return '';
    const branch = (this.branches || []).find((b) =>
      String(b?.branchName || '').trim().toLowerCase() === target
    );
    return branch?._id ? String(branch._id) : '';
  }

  private getBranchNameById(id: string): string {
    const target = this.normalizeId(id);
    if (!target) return '';
    const branch = (this.branches || []).find((b) => this.normalizeId(b?._id) === target);
    return branch?.branchName ? String(branch.branchName) : '';
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
    if (this.matchesBranchLabel(String(currentoriginLocId || ''), String(uiBranchName || ''))) {
      return true;
    }
    const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === this.normalizeId(currentoriginLocId));
    if (!hub?.branch) return false;
    const originLocId = this.getoriginLocIdByName(hub.branch);
    return originLocId ? this.normalizeId(originLocId) === this.normalizeId(uioriginLocId) : false;
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
    return name;
  }

  getCurrentBranchLabel(stock: any): string {
    return this.formatLocationDisplay(
      stock?.currentLocationId || stock?.currentBranch,
      stock?.currentBranch
    );
  }

  getOriginBranchLabel(stock: any): string {
    return this.formatLocationDisplay(stock?.originLocId || stock?.branch, stock?.branch || stock?.branchName);
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

  private isHubLinkedToAssignedBranch(hubId: string): boolean {
    if (this.isAdmin) {
      return Boolean(String(hubId || '').trim());
    }
    const assignedoriginLocIds = this.getAssignedoriginLocIds();
    if (!assignedoriginLocIds.length) return false;
    const hub = this.resolveHubByIdOrName(hubId, hubId);
    if (!hub) return false;
    return assignedoriginLocIds.includes(this.normalizeId(hub?.originLocId));
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

  private resolveBranchByName(name: string): any | null {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;
    return (this.branches || []).find((b) =>
      String(b?.branchName || '').trim().toLowerCase() === target
    ) || null;
  }

  private resolveHubByName(name: string): any | null {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;
    return (this.hubs || []).find((h) =>
      String(h?.hubName || '').trim().toLowerCase() === target
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

  private resolveClientLocation(client: any, locationId: any): any | null {
    if (!client) return null;
    const normId = this.normalizeId(locationId);
    const locations = client?.deliveryLocations || [];
    if (!normId) return locations[0] || null;
    return locations.find((loc: any) => this.normalizeId(loc?.delivery_id) === normId) || null;
  }

  private getNextDeliveryPointId(name: string): string {
    const target = String(name || '').trim();
    if (!target) return '';
    const branch = (this.branches || []).find((b) => String(b?.branchName || '').trim() === target);
    if (branch?._id) return String(branch._id);
    const hub = (this.hubs || []).find((h) => String(h?.hubName || '').trim() === target);
    if (hub?._id) return String(hub._id);
    return '';
  }

  private enrichShipmentDetails(stock: any): any {
    const enriched = { ...stock };
    const branchName = this.firstNonEmpty(stock?.branchName, stock?.branch);
    const branch = this.resolveBranchByIdOrName(stock?.originLocId, branchName);
    enriched.branch = this.firstNonEmpty(branch?.branchName, branchName);
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

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredStocks.forEach(s => {
      s.selected = checked;
    });
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
      const payload = { ...consignment, shipmentStatus: 'Deleted from Stocks' };
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
        console.error('Error cancelling consignments:', err);
        alert('Failed to cancel consignments. Please try again.');
      }
    });
  }


  openStockDetails(stock: any) {
    this.selectedStock = this.enrichShipmentDetails(stock);
  }

  closeStockDetails() {
    this.selectedStock = null;
  }

  editStock(stock: any) {
    console.log('Edit stock:', stock);
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
    if (this.editingStock.paymentMode === 'To Pay') {
      this.editingStock.shipmentStatus = 'To Pay';
    } else {
      this.editingStock.shipmentStatus = 'Pending';
    }
    this.syncEwaybillsFromInvoices();

    const payload = this.buildShipmentPayload();
    payload.paymentMode = this.editingStock.paymentMode;
    payload.shipmentStatus = this.editingStock.shipmentStatus;
    payload.shipmentStatusDetails = this.editingStock.shipmentStatusDetails;
    const manifestUpdates = Object.values(this.manifestEditsById || {});
    const updateManifests$ = manifestUpdates.length
      ? forkJoin(manifestUpdates.map((m: any) =>
        this.http.put(`http://localhost:3000/api/manifest/${m._id}`, m)
      ))
      : of([]);

    updateManifests$.subscribe({
      next: () => {
        const consignmentNumber = this.editingStock?.consignmentNumber;
        const shipmentId = this.editingStock?._id;
        console.log('[stocks:update] payload', {
          consignmentNumber,
          paymentMode: payload.paymentMode,
          shipmentStatus: payload.shipmentStatus
        });
        const shipmentParam = shipmentId ? `?shipmentId=${encodeURIComponent(shipmentId)}` : '';
        this.http.put(`http://localhost:3000/api/newshipments/${consignmentNumber}${shipmentParam}`, payload)
          .subscribe({
            next: (res: any) => {
              console.log('[stocks:update] response', {
                shipmentStatus: res?.shipmentStatus,
                paymentMode: res?.paymentMode
              });
              this.loadStocks();          // reload updated data
              this.editingStock = null;   // close modal
            },
            error: (err) => console.error('Error updating stock:', err)
          });
      },
      error: (err) => {
        console.error('Error updating manifests:', err);
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
    delete payload._id;
    delete payload.consignmentNumber;
    delete payload.GSTIN_ID;
    delete payload.originLocId;
    delete payload.branchName;
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
      this.editingStock.editingStock.consigneeAddress = selectedguestconignee.address;
      this.editingStock.editingStock.consigneePhone = selectedguestconignee.phoneNum;
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

  const originLocId = this.normalizeId(this.originLocId || localStorage.getItem('originLocId'));
  const isAllHubsSelection = originLocId === 'all-hubs';
  const selectedHubId = isAllHubsSelection
    ? (this.normalizeId(this.selectedHubFilterId) || this.normalizeId(localStorage.getItem('hubId')))
    : '';
  const selectedHub = selectedHubId
    ? (this.hubs || []).find((h) => this.normalizeId(h?._id) === selectedHubId)
    : null;
  const selectedHubName = String(selectedHub?.hubName || '').trim();
  const selectedPointName = String(this.selectedRoutePoint.name || '').trim();
  const selectedPointNameLower = selectedPointName.toLowerCase();

  const shouldSwapAllHubsBranch =
    isAllHubsSelection &&
    this.selectedRoutePoint.type === 'Branch' &&
    selectedHubName &&
    (
      selectedPointNameLower === 'all hubs' ||
      selectedPointNameLower === String(this.branch || '').trim().toLowerCase()
    );

  const routeName = shouldSwapAllHubsBranch ? selectedHubName : this.selectedRoutePoint.name;

  this.shipmentRoute.push({
    name: routeName,
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
  this.http.get<any[]>(`http://localhost:3000/api/branches?email=${email}&vehicleStatusNot=offline`)
    .subscribe({
      next: (data) => {
        console.log("Branches loaded:", data);
        this.branches = data;
        this.updateAvailableRoutePoints(); // Refresh route options
        this.refreshStocksView();
      },
      error: (err) => console.error("Error loading branches:", err)
    });
}

loadHubs() {
  const email = localStorage.getItem('email');
  this.http.get<any[]>(`http://localhost:3000/api/hubs?email=${email}&vehicleStatusNot=offline`)
    .subscribe({
      next: (data) => {
        console.log("Hubs loaded:", data);
        this.hubs = data;
        this.updateAvailableRoutePoints(); // Refresh route options
        this.refreshStocksView();
      },
      error: (err) => console.error("Error loading hubs:", err)
    });
}

private loadTransportPartners(useAllOrigins = false) {
  const transportParams: any = {};
  if (useAllOrigins) {
    transportParams.originLocId = 'all';
  } else {
    const transportOrigin = this.getSelectedOrigin();
    if (transportOrigin) {
      transportParams.originType = transportOrigin.originType;
      transportParams.originLocId = transportOrigin.originLocId;
    } else {
      const originLocIdFallback = this.originLocId || localStorage.getItem('originLocId') || 'all';
      transportParams.originLocId = originLocIdFallback === 'all-hubs' ? 'all' : originLocIdFallback;
    }
  }
  this.http.get<any>(`http://localhost:3000/api/tpartners/tpartnerslist`, { params: transportParams })
    .subscribe({
      next: data => this.transportPartners = Array.isArray(data) ? data : (data?.value || []),
      error: err => console.error('Error fetching transport partners', err),
      complete: () => console.log('Transport partners fetch complete')
    });
}

updateAvailableRoutePoints() {
  const branchFilterId = this.normalizeId(this.originLocId || localStorage.getItem('originLocId'));
  const isAllHubs = branchFilterId === 'all-hubs';
  const hubFilterId = this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'));
  const locationFilterId = isAllHubs ? hubFilterId : branchFilterId;
  const shouldFilterVehicles =
    Boolean(locationFilterId) &&
    locationFilterId !== 'all' &&
    locationFilterId !== 'all-hubs';
  const locationLabel = shouldFilterVehicles
    ? String(
        (this.branches || []).find((b) => this.normalizeId(b?._id) === locationFilterId)?.branchName ||
        (this.hubs || []).find((h) => this.normalizeId(h?._id) === locationFilterId)?.hubName ||
        ''
      ).trim().toLowerCase()
    : '';
  const filterVehicles = (vehicles: any[]) => {
    if (!shouldFilterVehicles) return vehicles;
    return (vehicles || []).filter((v: any) => {
      const currentId = this.normalizeId(v?.currentLocationId || v?.currentBranch);
      if (currentId && currentId === locationFilterId) return true;
      if (!locationLabel) return false;
      const currentLabel = String(v?.currentBranch || '').trim().toLowerCase();
      if (currentLabel && currentLabel === locationLabel) return true;
      return currentLabel ? this.matchesBranchLabel(currentLabel, locationLabel) : false;
    });
  };
  const rawRoutePoints = [
    ...this.branches.map(b => ({
      name: b.branchName,
      type: "Branch" as const,
      vehicles: filterVehicles(b.vehicles || []).map((v: any) => v.vehicleNo).filter(Boolean)
    })),
    ...this.hubs.map(h => ({
      name: h.hubName,
      type: "Hub" as const,
      vehicles: (h.deliveryAddresses || [])
        .flatMap((addr: any) => filterVehicles(addr.vehicles || []).map((v: any) => v.vehicleNo))
        .filter(Boolean)
    }))
  ];
  const locationName = locationLabel.trim().toLowerCase();
  this.availableRoutePoints = locationName
    ? rawRoutePoints.filter((p) => String(p?.name || '').trim().toLowerCase() !== locationName)
    : rawRoutePoints;
} 

onRoutePointChange() {
  this.selectedRouteVehicle = this.selectedRoutePoint?.vehicles?.[0] || '';
}

onNextDeliveryPointChange() {
  this.ensureHubChargesForSelectedConsignments();
  if (this.isExternalTransport) {
    const availablePartnerIds = new Set(
      this.getExternalTransportPartners().map((partner: any) => String(partner?._id || ''))
    );
    if (
      this.selectedTransportPartnerId &&
      !availablePartnerIds.has(String(this.selectedTransportPartnerId))
    ) {
      this.selectedTransportPartnerId = '';
      this.selectedRouteVehicle = '';
      this.shipmentRoute = [];
    }
    return;
  }
  this.onRouteVehicleChange();
}

private getSelectedNextHub(): any | null {
  const name = String(this.selectedNextDeliveryPoint || '').trim();
  if (!name) return null;
  return (this.hubs || []).find((h) => String(h?.hubName || '').trim() === name) || null;
}

private getSelectedNextRoutePoint(): { name: string; type: 'Branch' | 'Hub'; vehicles: string[] } | null {
  const name = String(this.selectedNextDeliveryPoint || '').trim();
  if (!name) return null;
  return (this.availableRoutePoints || []).find((p) => String(p?.name || '').trim() === name) || null;
}

getNextDeliveryPointVehicles(): string[] {
  const point = this.getSelectedNextRoutePoint();
  if (point?.vehicles?.length) return point.vehicles;
  return [];
}

isSelectedNextDeliveryPointHub(): boolean {
  const name = String(this.selectedNextDeliveryPoint || '').trim();
  if (!name) return false;
  const point = this.getSelectedNextRoutePoint();
  return point?.type === 'Hub';
}

getHubChargeTotal(): number {
  if (!this.isSelectedNextDeliveryPointHub()) return 0;
  return (this.selectedForManifestation || []).reduce((sum: number, consignment: any) => {
    return sum + (Number(consignment?.hubPerRevAmount) || 0);
  }, 0);
}

getHubChargeSuggestion(consignment: any): number {
  const hub = this.getSelectedNextHub();
  if (!hub) return 0;
  const perRev = Number(hub?.perRev) || 0;
  const finalAmount = Number(consignment?.finalAmount) || 0;
  const raw = (finalAmount * perRev) / 100;
  return Math.round(raw * 100) / 100;
}

private ensureHubChargesForSelectedConsignments() {
  if (!this.isSelectedNextDeliveryPointHub()) return;
  const hub = this.getSelectedNextHub();
  if (!hub) return;
  for (const consignment of this.selectedForManifestation || []) {
    if (consignment?.hubWillPickedUp) {
      consignment.hubPerRevAmount = 0;
      continue;
    }
    const suggested = this.getHubChargeSuggestion(consignment);
    consignment.hubPerRevAmount = suggested;
  }
}

onHubPickedUpToggle(consignment: any) {
  if (!consignment) return;
  if (consignment.hubWillPickedUp) {
    consignment.hubPerRevAmount = 0;
    return;
  }
  consignment.hubPerRevAmount = this.getHubChargeSuggestion(consignment);
}

onTransportPartnerChange() {
  this.selectedRouteVehicle = '';
  this.shipmentRoute = [];
}

onExternalTransportToggle() {
  this.selectedTransportPartnerId = '';
  this.selectedRouteVehicle = '';
  this.shipmentRoute = [];
  if (this.isExternalTransport) {
    this.loadTransportPartners(true);
  }
}

private getExternalTransportHubBranchId(): string {
  const selectedNextHub = this.getSelectedNextHub();
  if (selectedNextHub?._id) {
    return this.normalizeId(selectedNextHub.originLocId);
  }
  const selectedOriginId = this.normalizeId(this.originLocId || localStorage.getItem('originLocId'));
  if (selectedOriginId !== 'all-hubs') return '';
  const scopedHubId = this.normalizeId(this.selectedHubFilterId || localStorage.getItem('hubId'));
  if (!scopedHubId) return '';
  const scopedHub = (this.hubs || []).find((hub: any) => this.normalizeId(hub?._id) === scopedHubId);
  return this.normalizeId(scopedHub?.originLocId);
}

getExternalTransportPartners(): any[] {
  const partners = Array.isArray(this.transportPartners) ? this.transportPartners : [];
  const hubBranchId = this.getExternalTransportHubBranchId();
  if (!hubBranchId) return partners;
  return partners.filter((partner: any) => this.normalizeId(partner?.originLocId) === hubBranchId);
}

onRouteVehicleChange() {
  const vehicle = String(this.selectedRouteVehicle || '').trim();
  if (!vehicle) {
    this.shipmentRoute = [];
    return;
  }
  if (this.isExternalTransport) {
    const partner = this.getExternalTransportPartners()
      .find((p: any) => String(p?._id) === String(this.selectedTransportPartnerId));
    const partnerName = String(partner?.partnerName || '').trim();
    this.shipmentRoute = [{
      name: partnerName || 'Transport Partner',
      type: 'Transport Partner',
      vehicleNo: vehicle
    }];
    return;
  }
  const routePoint = this.getSelectedNextRoutePoint();
  const pointName = routePoint?.name || this.branch || 'Branch';
  const pointType = routePoint?.type || 'Branch';
  this.shipmentRoute = [{
    name: pointName,
    type: pointType,
    vehicleNo: vehicle
  }];
}

getTransportPartnerVehicles(): string[] {
  const partner = this.getExternalTransportPartners()
    .find((p: any) => String(p?._id) === String(this.selectedTransportPartnerId));
  const vehicles = partner?.vehicleNumbers || partner?.vehicles || [];
  return vehicles
    .filter((v: any) => {
      if (typeof v === 'string') return true;
      const status = String(v?.vehicleStatus || 'online').toLowerCase();
      return status === 'online' || status === 'scheduled';
    })
    .map((v: any) => {
      if (typeof v === 'string') return v;
      return v?.number || v?.vehicleNo || v?.vehicleNumber || v?.regNo || '';
    })
    .filter(Boolean);
}

getBranchVehicles(): string[] {
  const currentoriginLocId = this.normalizeId(this.originLocId || localStorage.getItem('originLocId'));
  const currentBranchName = String(this.branch || localStorage.getItem('branch') || '').trim();
  const currentBranchNameLower = currentBranchName.toLowerCase();
  const isAllHubsSelection = currentoriginLocId === 'all-hubs' || currentBranchNameLower === 'all hubs';
  const selectedHubId = isAllHubsSelection
    ? (this.normalizeId(this.selectedHubFilterId) ||
        this.normalizeId(this.getSelectedNextHub()?._id) ||
        this.normalizeId(localStorage.getItem('hubId')))
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
  const branchVehicles = (this.branches || []).flatMap((b: any) => b?.vehicles || []);
  const hubVehicles = (this.hubs || []).flatMap((h: any) =>
    (h?.deliveryAddresses || []).flatMap((addr: any) => addr?.vehicles || [])
  );
  const vehicles = [...branchVehicles, ...hubVehicles];
  const seen = new Set<string>();
  return vehicles
    .filter((v: any) => {
      const currentLocationRaw = v?.currentLocationId || v?.currentBranch || v?.currentBranch || '';
      const currentLocation = this.normalizeId(currentLocationRaw);
      if (!currentLocation) return false;
      if (this.isCurrentBranchMatch(currentLocation, locationFilterId)) return true;
      if (locationFilterName && this.matchesBranchLabel(String(currentLocationRaw || ''), locationFilterName)) return true;
      if (locationFilterName && this.matchesBranchLabel(String(currentLocation || ''), locationFilterName)) return true;
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

  private getManifestationTargetBranch(): { id: string; name: string } | null {
    const first = (this.selectedForManifestation || [])[0];
    if (!first) return null;
    const currentoriginLocId = this.normalizeId(
      first?.currentLocationId || first?.currentBranch || first?.currentBranch
    );
    if (currentoriginLocId) {
      const branch = (this.branches || []).find((b) => this.normalizeId(b?._id) === currentoriginLocId);
      if (branch?.branchName) return { id: currentoriginLocId, name: String(branch.branchName).trim() };
      const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === currentoriginLocId);
      if (hub?.hubName) return { id: currentoriginLocId, name: String(hub.hubName).trim() };
      return { id: currentoriginLocId, name: '' };
    }
    const currentBranchName = String(first?.currentBranch || '').trim();
    if (!currentBranchName) return null;
    const hub = (this.hubs || []).find((h) =>
      String(h?.hubName || '').trim().toLowerCase() === currentBranchName.toLowerCase()
    );
    if (hub?._id) return { id: this.normalizeId(hub._id), name: String(hub.hubName).trim() };
    const branch = (this.branches || []).find((b) =>
      String(b?.branchName || '').trim().toLowerCase() === currentBranchName.toLowerCase()
    );
    if (branch?._id) return { id: this.normalizeId(branch._id), name: String(branch.branchName).trim() };
    return { id: '', name: currentBranchName };
  }

  private resolveManifestEntityType(entityId: string): 'branch' | 'hub' | '' {
    if (!entityId) return '';
    const hub = (this.hubs || []).find((h) => this.normalizeId(h?._id) === this.normalizeId(entityId));
    return hub?._id ? 'hub' : 'branch';
  }

  private resolveManifestVehicleNo(): string {
    const direct = String(this.selectedRouteVehicle || '').trim();
    if (direct) return direct;
    const routeVehicle = (this.shipmentRoute || []).find((p) => String(p?.vehicleNo || '').trim());
    if (routeVehicle?.vehicleNo) return String(routeVehicle.vehicleNo).trim();
    const fromConsignment = (this.selectedForManifestation || []).find((c) =>
      String(c?.currentVehicleNo || '').trim()
    );
    return fromConsignment ? String(fromConsignment.currentVehicleNo || '').trim() : '';
  }

  private createManifestRecord(selectedConsignments: any[]) {
    const statusValue = String(this.manifestationStatus || 'Manifested').trim();
    const manifestStatus = statusValue === 'Manifestation' ? 'Scheduled' : statusValue;
    const isPickup = statusValue.toLowerCase() === 'will be picked-up';
    const resolvedVehicleNo = this.resolveManifestVehicleNo();
    const manifestVehicleNo = isPickup ? '' : resolvedVehicleNo;
    const nextPointName = String(this.selectedNextDeliveryPoint || '').trim();
    const nextPointId = !isPickup && nextPointName ? this.getNextDeliveryPointId(nextPointName) : '';
    const nextPoint = !isPickup && nextPointName ? this.getSelectedNextRoutePoint() : null;
    const deliveryType = nextPoint?.type ? String(nextPoint.type).toLowerCase() : '';
    const sidebarEntityId = this.normalizeId(
      this.originLocId === 'all-hubs'
        ? (this.selectedHubFilterId || localStorage.getItem('hubId'))
        : this.originLocId
    );
    const entityId = sidebarEntityId;
    const entityType = this.resolveManifestEntityType(entityId);
    if (!entityType || !entityId) {
      const fallbackEntityId = sidebarEntityId;
      if (!fallbackEntityId) {
        alert('Cannot create manifest: missing branch/hub context.');
        return;
      }
      const fallbackType = this.resolveManifestEntityType(fallbackEntityId);
      if (!fallbackType) {
        alert('Cannot create manifest: invalid branch/hub context.');
        return;
      }
      console.warn('[manifest] Missing entity for manifest creation, using fallback.', {
        fallbackType,
        fallbackEntityId
      });
      if (!manifestVehicleNo && !isPickup) {
        alert('Cannot create manifest: missing vehicle number.');
        return;
      }
      const consignments = (selectedConsignments || []).map((c) => ({
        shipmentId: c?._id || '',
        consignmentNumber: c?.consignmentNumber || ''
      })).filter((c) => c.shipmentId || c.consignmentNumber);
      if (!consignments.length) return;
      const payload = {
        entityType: fallbackType,
        entityId: fallbackEntityId,
        deliveryType: deliveryType || undefined,
        deliveryId: nextPointId || undefined,
        vehicleNo: manifestVehicleNo,
        status: manifestStatus,
        consignments
      };
      this.http.post<any>('http://localhost:3000/api/manifests', payload).subscribe({
        next: (res) => {
          const manifestNumber = res?.manifest?.manifestNumber || '';
          const reusedManifest = Boolean(res?.reused);
          if (manifestNumber) {
            this.manifestationNumber = manifestNumber;
            console.log('[manifest]', reusedManifest ? 'reused' : 'created', manifestNumber);
            alert(reusedManifest
              ? `Added to existing manifest: ${manifestNumber}`
              : `Manifest created: ${manifestNumber}`);
          } else {
            alert('Manifest created, but no number returned.');
          }
        },
        error: (err) => {
          console.error('Failed to create manifest record', err);
          const serverMsg = String(err?.error?.message || '').trim();
          alert(serverMsg || 'Failed to create manifest number. Please try again.');
        }
      });
      return;
    }
    if (!manifestVehicleNo && !isPickup) {
      alert('Cannot create manifest: missing vehicle number.');
      return;
    }
    const consignments = (selectedConsignments || []).map((c) => ({
      shipmentId: c?._id || '',
      consignmentNumber: c?.consignmentNumber || ''
    })).filter((c) => c.shipmentId || c.consignmentNumber);
    if (!consignments.length) return;
    const payload = {
      entityType,
      entityId,
      deliveryType: deliveryType || undefined,
      deliveryId: nextPointId || undefined,
      vehicleNo: manifestVehicleNo,
      status: manifestStatus,
      consignments
    };
    this.http.post<any>('http://localhost:3000/api/manifests', payload).subscribe({
      next: (res) => {
        const manifestNumber = res?.manifest?.manifestNumber || '';
        const reusedManifest = Boolean(res?.reused);
        if (manifestNumber) {
          this.manifestationNumber = manifestNumber;
          console.log('[manifest]', reusedManifest ? 'reused' : 'created', manifestNumber);
          alert(reusedManifest
            ? `Added to existing manifest: ${manifestNumber}`
            : `Manifest created: ${manifestNumber}`);
        } else {
          alert('Manifest created, but no number returned.');
        }
      },
      error: (err) => {
        console.error('Failed to create manifest record', err);
        const serverMsg = String(err?.error?.message || '').trim();
        alert(serverMsg || 'Failed to create manifest number. Please try again.');
      }
    });
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

onEditingPaymentModeChange() {
  if (!this.editingStock) return;
  if (this.editingStock.paymentMode === 'To Pay') {
    this.editingStock.shipmentStatus = 'To Pay';
  } else {
    this.editingStock.shipmentStatus = 'Pending';
  }
}

  ngOnInit() {
    this.email = localStorage.getItem('email') || '';
    this.username = localStorage.getItem('username') || '';
    this.branch = this.branchService.currentBranch || localStorage.getItem('branch') || 'All Branches';
    this.originLocId = localStorage.getItem('originLocId') || 'all';

    this.branchSub = this.branchService.branch$.subscribe(branch => {
      this.branch = branch;
      this.originLocId = localStorage.getItem('originLocId') || 'all';
      if (this.originLocId !== 'all-hubs') {
        this.selectedHubFilterId = null;
        this.selectedHubFilterName = '';
      }
      this.loadStocks();
    });

    // react to branch changes (same tab)
    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.branch || currentId !== this.originLocId) {
        this.branch = current;
        this.originLocId = currentId;
        if (this.originLocId !== 'all-hubs') {
          this.selectedHubFilterId = null;
          this.selectedHubFilterName = '';
        }
        this.loadStocks();
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
    const originFilter = this.getSelectedOrigin();
    const productParams: any = {
      branch: this.branch || localStorage.getItem('branch') || ''
    };
    if (originFilter) {
      productParams.originType = originFilter.originType;
      productParams.originLocId = originFilter.originLocId;
    } else {
      const originLocIdFallback = this.originLocId || localStorage.getItem('originLocId') || 'all';
      productParams.originLocId = originLocIdFallback === 'all-hubs' ? 'all' : originLocIdFallback;
    }
    this.http.get<any[]>('http://localhost:3000/api/products/productlist', { params: productParams })
    .subscribe({
      next: data => this.productList = data,
      error: err => console.error('Error fetching product list', err),
      complete: () => console.log('Product list fetch complete')
    });

    // Transport partners list
    this.loadTransportPartners();

    this.loadBranches();
    this.loadHubs();
    this.loadStocks();
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
        if (this.originLocId !== 'all-hubs') {
          this.selectedHubFilterId = null;
          this.selectedHubFilterName = '';
        }
        this.loadStocks();
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
  this.manifestationNumber = '';
  // Filter selected consignments
  this.selectedForManifestation = this.filteredStocks.filter(s => s.selected);

  // Guard clause: ensure at least one consignment is selected
  if (this.selectedForManifestation.length === 0) {
    alert('Please select at least one consignment to manifest.');
    return;
  }
  const manifestoriginLocIds = new Set(
    this.selectedForManifestation
      .map((c) => this.normalizeId(c?.currentLocationId || c?.currentBranch || c?.currentBranch))
      .filter(Boolean)
  );
  if (manifestoriginLocIds.size > 1) {
    alert('Selected consignments are in different branches/hubs.');
    return;
  }


  this.manifestationStatus = 'Manifestation';
  this.selectedNextDeliveryPoint = '';

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

finalizeManifestation() {
  if (this.selectedForManifestation.length === 0) {
    alert('No consignments selected.');
    return;
  }

  const requiresVehicle = String(this.manifestationStatus || '').trim() !== 'Will be Picked-Up';
  const vehicleSelected = Boolean(String(this.selectedRouteVehicle || '').trim());
  if (requiresVehicle && !vehicleSelected) {
    alert('Please select a vehicle.');
    return;
  }
  if (this.manifestationStatus === 'Manifestation' && !String(this.selectedNextDeliveryPoint || '').trim()) {
    alert('Please select a next delivery point.');
    return;
  }

  const updates = (this.selectedForManifestation || []).map((consignment) => {
    const updatedEwaybills = (consignment.ewaybills || []).map((ewb: any) => ({ ...ewb }));

    const nextPointName = String(this.selectedNextDeliveryPoint || '').trim();
    const nextPointId = nextPointName ? this.getNextDeliveryPointId(nextPointName) : '';
    const nextPoint = nextPointId ? `$$${nextPointId}` : '';
    const routePoint = this.getSelectedNextRoutePoint();
    const vehicleNo = String(this.selectedRouteVehicle || '').trim();
    const vehicleOwnerType = routePoint?.type ? String(routePoint.type).toLowerCase() : '';
    const vehicleOwnerId = nextPointId;
    const selectedHub = this.getSelectedNextHub();
    const hubId = selectedHub?._id ? String(selectedHub._id) : '';
    const hubCharge = this.isSelectedNextDeliveryPointHub()
      ? Number(consignment?.hubPerRevAmount) || 0
      : 0;
    const currentStatus = String(consignment?.shipmentStatus || '').trim();
    let nextStatus = this.manifestationStatus || 'Manifestation';
    if (currentStatus === 'DPending') {
      if (nextStatus === 'Manifestation') {
        nextStatus = 'DManifestation';
      } else if (nextStatus === 'Out for Delivery') {
        nextStatus = 'D-Out for Delivery';
      } else if (nextStatus === 'Will be Picked-Up') {
        nextStatus = 'D-|Will be Picked-Up';
      }
    }
    const shouldAttachVehicle = requiresVehicle &&
      vehicleNo &&
      vehicleOwnerType &&
      vehicleOwnerId &&
      ['Manifestation', 'DManifestation', 'Out for Delivery', 'D-Out for Delivery'].includes(nextStatus);
    const payload = {
      shipmentId: consignment?._id || '',
      shipmentStatus: nextStatus,
      shipmentStatusDetails: `${consignment.shipmentStatusDetails || ''}${nextPoint}`,
      ewaybills: updatedEwaybills,
      ...(hubId ? { hubId, hubCharge } : {}),
      ...(shouldAttachVehicle
        ? {
            currentVehicleNo: vehicleNo,
            currentVehicleOwnerType: vehicleOwnerType,
            currentVehicleOwnerId: vehicleOwnerId
          }
        : {})
    };
    const shipmentId = consignment?._id ? encodeURIComponent(consignment._id) : '';
    const shipmentParam = shipmentId ? `?shipmentId=${shipmentId}` : '';

    return this.http.put(
      `http://localhost:3000/api/newshipments/${consignment.consignmentNumber}${shipmentParam}`,
      payload
    );
  });

  if (!updates.length) return;

  forkJoin(updates).subscribe({
    next: () => {
      if (this.manifestationStatus === 'Manifestation' || this.manifestationStatus === 'Out for Delivery') {
        this.updateInternalVehicleStatuses('scheduled');
      }
      this.createManifestRecord(this.selectedForManifestation);
      this.showManifestationPopup = false;
      this.selectedForManifestation = [];
      this.filteredStocks.forEach(s => s.selected = false);
      this.loadStocks();
    },
    error: (err) => {
      console.error('Error updating consignment status:', err);
      const serverMsg = String(err?.error?.message || '').trim();
      alert(serverMsg || 'Failed to update consignment status.');
    }
  });
}

private updateInternalVehicleStatuses(status: string) {
  if (this.isExternalTransport) return;
  let routePoints = (this.shipmentRoute || []).filter((p) => p && p.type !== 'Transport Partner');
  if (!routePoints.length) {
    const vehicleNo = String(this.selectedRouteVehicle || '').trim();
    const point = this.getSelectedNextRoutePoint();
    if (vehicleNo && point) {
      routePoints = [{ name: point.name, type: point.type, vehicleNo }];
    } else if (vehicleNo) {
      routePoints = [{ name: this.branch || 'Branch', type: 'Branch', vehicleNo }];
    }
  }
  if (!routePoints.length) return;

  const calls: Array<ReturnType<typeof this.http.patch>> = [];
  const seen = new Set<string>();
  routePoints.forEach((point) => {
    const vehicleNo = String(point?.vehicleNo || '').trim();
    if (!vehicleNo) return;
    if (point.type === 'Branch') {
      const branch = this.resolveBranchByName(point.name) || this.resolveBranchByVehicle(vehicleNo);
      const originLocId = branch?._id ? String(branch._id) : '';
      if (!originLocId) return;
      const key = `branch:${originLocId}:${vehicleNo}`;
      if (seen.has(key)) return;
      seen.add(key);
      calls.push(this.http.patch(`http://localhost:3000/api/branches/${originLocId}/vehicle-status`, {
        vehicleNo,
        vehicleStatus: status
      }));
    } else if (point.type === 'Hub') {
      const hub = this.resolveHubByName(point.name) || this.resolveHubByVehicle(vehicleNo);
      const hubId = hub?._id ? String(hub._id) : '';
      if (!hubId) return;
      const key = `hub:${hubId}:${vehicleNo}`;
      if (seen.has(key)) return;
      seen.add(key);
      calls.push(this.http.patch(`http://localhost:3000/api/hubs/${hubId}/vehicle-status`, {
        vehicleNo,
        vehicleStatus: status
      }));
    } else {
      const branch = this.resolveBranchByVehicle(vehicleNo);
      if (branch?._id) {
        const originLocId = String(branch._id);
        const key = `branch:${originLocId}:${vehicleNo}`;
        if (!seen.has(key)) {
          seen.add(key);
          calls.push(this.http.patch(`http://localhost:3000/api/branches/${originLocId}/vehicle-status`, {
            vehicleNo,
            vehicleStatus: status
          }));
        }
        return;
      }
      const hub = this.resolveHubByVehicle(vehicleNo);
      if (hub?._id) {
        const hubId = String(hub._id);
        const key = `hub:${hubId}:${vehicleNo}`;
        if (!seen.has(key)) {
          seen.add(key);
          calls.push(this.http.patch(`http://localhost:3000/api/hubs/${hubId}/vehicle-status`, {
            vehicleNo,
            vehicleStatus: status
          }));
        }
      }
    }
  });

  if (!calls.length) return;
  forkJoin(calls).subscribe({
    error: (err) => console.error('Error updating internal vehicle status:', err)
  });
}

private buildManifestationPincodeDirections(consignments: any[]): string[] {
  return (consignments || []).map((consignment: any) => {
    const enriched = this.enrichShipmentDetails(consignment);
    const pickup = String(enriched?.pickupPincode || '').trim();
    const delivery = String(enriched?.deliveryPincode || '').trim();
    if (!pickup && !delivery) return '';
    return `$$${pickup}-${delivery}`;
  }).filter(Boolean);
}

validateManifestQty(product: any) {
  product.manifestQtyTouched = true;
  if (product.manifestQty > product.instock) {
    alert(`Manifest quantity cannot exceed available stock (${product.instock}).`);
    product.manifestQty = product.instock;
  }
  if (product.manifestQty < 0) {
    alert('Manifest quantity cannot be negative.');
    product.manifestQty = 0;
  }
}

printReceipts() {
  const selected = this.filteredStocks?.filter(s => s.selected) || [];

  if (selected.length === 0) {
    alert('No consignments selected.');
    return;
  }


  fetch('assets/receipt-template.html')
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
            </style>
          </head>
          <body>
      `;

      selected.forEach((consignment, index) => {
        const rows = consignment.invoices.flatMap((inv: any) =>
          inv.products.map((p: any) => `
            <tr>
              <td>${inv.number}</td>
              <td>${p.type}</td>
              <td>${p.instock}</td>
              <td>${p.manifestQty}</td>
              <td>${p.amount}</td>
            </tr>
          `)
        ).join('');

        const htmlContent = template
          .replace('{{consignmentNumber}}', consignment.consignmentNumber)
          .replace('{{consignor}}', consignment.consignor)
          .replace('{{rows}}', rows);

        fullHtml += htmlContent;

        // Add page break after each consignment except the last one
        if (index < selected.length - 1) {
          fullHtml += `<div class="page-break"></div>`;
        }
      });

      fullHtml += `</body></html>`;

      const printWindow = window.open('', '_blank');

      if (printWindow) {

        printWindow.document.open();
        printWindow.document.write(fullHtml);  // use write instead of body.innerHTML
        printWindow.document.close();
        printWindow.print();
      }

    });
}

}


































