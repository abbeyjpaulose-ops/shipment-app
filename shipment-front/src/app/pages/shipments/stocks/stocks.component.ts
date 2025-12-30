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
  stocks: any[] = [];
  filteredStocks: any[] = [];
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
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
branch: string = localStorage.getItem('branch') || 'All Branches';
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
isExternalTransport = false;

branches: any[] = [];
hubs: any[] = [];
  availableRoutePoints: { name: string; type: 'Branch' | 'Hub'; vehicles: string[] }[] = [];
  shipmentRoute: { name: string; type: 'Branch' | 'Hub'; vehicleNo: string }[] = [];
  selectedRoutePoint: any = null;
  selectedRouteVehicle: string = '';
  routeBaskets: Array<{ labelKey: string; qty: number }> = [];
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
    const branch = this.branch || localStorage.getItem('branch') || 'All Branches';
    if (!username) {
      console.error('Missing username for loading stocks');
      return;
    }
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        username,
        branch
      }
    }).subscribe({
      next: (res: any[]) => {
        const normalized = (res || []).map((stock) => ({
          ...stock,
          invoices: this.flattenInvoices(stock.ewaybills || stock.invoices || [])
        }));
        this.stocks = normalized
          .filter(stock => {
            const status = String(stock.shipmentStatus || '').trim();
            return status === 'Pending' || status === 'To Pay';
          })
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
    this.filteredStocks = this.stocks.filter(s =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true)
    );
  }

  isManifestSelectable(stock: any): boolean {
    const status = String(stock?.shipmentStatus || '').trim();
    return status !== 'To Pay';
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredStocks.forEach(s => {
      if (this.isManifestSelectable(s)) {
        s.selected = checked;
      }
    });
  }


  openStockDetails(stock: any) {
    this.selectedStock = stock;
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
              console.log('Stock updated');
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
      },
      error: (err) => console.error("Error loading hubs:", err)
    });
}

updateAvailableRoutePoints() {
  this.availableRoutePoints = [
    ...this.branches.map(b => ({
      name: b.branchName,
      type: "Branch" as const,
      vehicles: (b.vehicles || []).map((v: any) => v.vehicleNo).filter(Boolean)
    })),
    ...this.hubs.map(h => ({
      name: h.hubName,
      type: "Hub" as const,
      vehicles: (h.deliveryAddresses || [])
        .flatMap((addr: any) => (addr.vehicles || []).map((v: any) => v.vehicleNo))
        .filter(Boolean)
    }))
  ];
} 

onRoutePointChange() {
  this.selectedRouteVehicle = this.selectedRoutePoint?.vehicles?.[0] || '';
}

onTransportPartnerChange() {
  this.selectedRouteVehicle = '';
}

onExternalTransportToggle() {
  this.selectedTransportPartnerId = '';
  this.selectedRouteVehicle = '';
}

getTransportPartnerVehicles(): string[] {
  const partner = this.transportPartners.find((p: any) => String(p._id) === String(this.selectedTransportPartnerId));
  const vehicles = partner?.vehicleNumbers || [];
  return vehicles.map((v: any) => v?.number).filter(Boolean);
}

getBranchVehicles(): string[] {
  const branch = (this.branches || []).find((b: any) => String(b.branchName) === String(this.branch));
  const vehicles = branch?.vehicles || [];
  return vehicles.map((v: any) => v?.vehicleNo).filter(Boolean);
}

onEditingPaymentModeChange() {
  if (!this.editingStock) return;
  if (this.editingStock.paymentMode === 'To Pay') {
    this.editingStock.shipmentStatus = 'To Pay';
  } else {
    this.editingStock.shipmentStatus = 'Pending';
  }
}

private buildRouteString(): string {
  if (!this.shipmentRoute.length) return '';

  const hasBaskets = (this.routeBaskets || []).length > 0;
  const prefix = hasBaskets
    ? `$$${this.buildBasketDescriptor()}$$ `
    : '$$All$$ ';

  return prefix + this.shipmentRoute
    .map(p => {
      const vehicle = String(p.vehicleNo || '').trim();
      return vehicle
        ? `${p.name} (${p.type})|${vehicle}`
        : `${p.name} (${p.type})`;
    })
    .join(' -> ');
}

private buildBasketDescriptor(): string {
  return (this.routeBaskets || [])
    .filter(b => b && String(b.labelKey || '').trim() && Number(b.qty) > 0)
    .map(b => {
      const key = String(b.labelKey || '').trim();
      const parts = key.split('|');
      const labelType = parts.shift() || '';
      const labelValue = parts.join('|');
      const label = labelValue ? `${labelType}:${labelValue}` : labelType;
      return `${label}-${Number(b.qty)}`;
    })
    .join('|');
}

addRouteBasket() {
  const options = this.getBasketOptions();
  const firstKey = options.length ? options[0].key : '';
  this.routeBaskets.push({ labelKey: firstKey, qty: 0 });
}

removeRouteBasket(index: number) {
  if (index < 0 || index >= this.routeBaskets.length) return;
  this.routeBaskets.splice(index, 1);
}

getBasketOptions(): Array<{ key: string; text: string }> {
  const consignment = (this.selectedForManifestation || [])[0];
  if (!consignment) return [];

  const options: Array<{ key: string; text: string }> = [];
  const consNum = consignment.consignmentNumber || '';
  if (consNum) {
    options.push({ key: `Consignment|${consNum}`, text: `Consignment: ${consNum}` });
  }

  const ewaybills = consignment.ewaybills || [];
  if (ewaybills.length) {
    ewaybills.forEach((ewb: any, eIdx: number) => {
      const eNum = ewb.number || ewb.ewaybillNumber || `EWB-${eIdx + 1}`;
      options.push({ key: `Ewaybill|${eNum}`, text: `Ewaybill: ${eNum}` });
      (ewb.invoices || []).forEach((inv: any, iIdx: number) => {
        const invNum = inv.number || inv.invoicenum || `INV-${iIdx + 1}`;
        options.push({ key: `Invoice|${invNum}`, text: `Invoice: ${invNum}` });
        (inv.products || []).forEach((prod: any, pIdx: number) => {
          const pType = prod.type || prod.productName || `Product-${pIdx + 1}`;
          options.push({
            key: `Product|${invNum}:${pType}`,
            text: `Product: ${invNum} - ${pType}`
          });
        });
      });
    });
    return options;
  }

  (consignment.invoices || []).forEach((inv: any, iIdx: number) => {
    const invNum = inv.number || inv.invoicenum || `INV-${iIdx + 1}`;
    options.push({ key: `Invoice|${invNum}`, text: `Invoice: ${invNum}` });
    (inv.products || []).forEach((prod: any, pIdx: number) => {
      const pType = prod.type || prod.productName || `Product-${pIdx + 1}`;
      options.push({
        key: `Product|${invNum}:${pType}`,
        text: `Product: ${invNum} - ${pType}`
      });
    });
  });

  return options;
}

  ngOnInit() {
    this.email = localStorage.getItem('email') || '';
    this.username = localStorage.getItem('username') || '';
    this.branch = this.branchService.currentBranch || localStorage.getItem('branch') || 'All Branches';

    this.branchSub = this.branchService.branch$.subscribe(branch => {
      this.branch = branch;
      this.loadStocks();
    });

    // react to branch changes (same tab)
    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      if (current !== this.branch) {
        this.branch = current;
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
    this.http.get<any[]>(`http://localhost:3000/api/products/productlist?emailId=${this.email}`)
    .subscribe({
      next: data => this.productList = data,
      error: err => console.error('Error fetching product list', err),
      complete: () => console.log('Product list fetch complete')
    });

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
    if (e.key === 'branch' && e.newValue && e.newValue !== this.branch) {
      this.branch = e.newValue;
      this.loadStocks();
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
  if (this.branch === 'All Branches') {
    alert('Please select a specific branch before manifesting consignments.');
    return;
  }
  // Filter selected consignments
  this.selectedForManifestation = this.filteredStocks.filter(s => s.selected);

  // Guard clause: ensure at least one consignment is selected
  if (this.selectedForManifestation.length === 0) {
    alert('Please select at least one consignment to manifest.');
    return;
  }


  this.routeBaskets = [];

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

  if (this.shipmentRoute.some(p => !String(p.vehicleNo || '').trim())) {
    alert('Please select a vehicle for each route point.');
    return;
  }

  if (this.routeBaskets.length && !this.buildBasketDescriptor()) {
    alert('Please add at least one basket with a quantity.');
    return;
  }

  const routeString = this.buildRouteString();
  if (!routeString) {
    alert('Please add at least one route point.');
    return;
  }

  const updates = (this.selectedForManifestation || []).map((consignment) => {
    const updatedEwaybills = (consignment.ewaybills || []).map((ewb: any) => ({
      ...ewb,
      routes: routeString
    }));

    const payload = {
      ...consignment,
      shipmentStatus: 'In Transit',
      ewaybills: updatedEwaybills
    };

    return this.http.put(
      `http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`,
      payload
    );
  });

  if (!updates.length) return;

  forkJoin(updates).subscribe({
    next: () => {
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


































