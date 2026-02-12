import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css']
})
export class ReportsComponent implements OnInit {
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  fiscalYear = '';
  fiscalYearInput = '';
  fiscalYears: string[] = [];
  searchText = '';
  loading = false;
  gstPercent = 0;
  private invoiceTemplate = '';
  showDeletePopup = false;
  deleteTargets: any[] = [];
  deleting = false;
  paymentUpdatingId: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadInvoices();
    this.loadFiscalYears();
  }

  loadInvoices(): void {
    this.loading = true;
    this.http.get<any>('http://localhost:3000/api/newshipments/generatedInvoices', {
      params: {
        fiscalYear: this.fiscalYearInput || ''
      }
    }).subscribe({
      next: (res) => {
        this.fiscalYear = res?.fiscalYear || this.fiscalYear;
        if (!this.fiscalYearInput) {
          this.fiscalYearInput = this.fiscalYear || '';
        }
        this.gstPercent = Number(res?.gstPercent) || 0;
        this.invoices = Array.isArray(res?.invoices) ? res.invoices : [];
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading generated invoices:', err);
        this.invoices = [];
        this.filteredInvoices = [];
        this.loading = false;
      }
    });
  }

  loadFiscalYears(): void {
    this.http.get<any>('http://localhost:3000/api/newshipments/generatedInvoices/years').subscribe({
      next: (res) => {
        this.fiscalYears = Array.isArray(res?.years) ? res.years : [];
      },
      error: (err) => {
        console.error('Error loading fiscal years:', err);
        this.fiscalYears = [];
      }
    });
  }

  applyFilters(): void {
    const q = this.searchText.trim().toLowerCase();
    if (!q) {
      this.filteredInvoices = [...this.invoices];
      return;
    }
    this.filteredInvoices = this.invoices.filter((inv) => {
      const matchesHeader =
        String(inv.invoiceDisplayNumber || '').toLowerCase().includes(q) ||
        String(inv.invoiceCode || '').toLowerCase().includes(q) ||
        String(inv.invoiceNumber || '').toLowerCase().includes(q) ||
        String(inv.clientName || '').toLowerCase().includes(q) ||
        String(inv.clientGSTIN || '').toLowerCase().includes(q) ||
        String(inv.billingAddress || '').toLowerCase().includes(q);
      if (matchesHeader) return true;
    return (inv.consignments || []).some((c: any) =>
      String(c.consignmentNumber || '').toLowerCase().includes(q)
    );
  });
  }

  get selectedCount(): number {
    return this.filteredInvoices.filter((inv) => inv.selected).length;
  }

  private getSelectedInvoices(): any[] {
    return this.filteredInvoices.filter((inv) => inv.selected);
  }

  hasDeletableSelection(): boolean {
    return this.filteredInvoices.some(
      (inv) => inv.selected && !this.isDeleted(inv)
    );
  }

  isDeleted(inv: any): boolean {
    const status = String(inv?.status || '').trim().toLowerCase();
    return status === 'deleted' || status === 'cancelled';
  }

  toggleAllSelection(event: any): void {
    const checked = !!event?.target?.checked;
    this.filteredInvoices.forEach((inv) => {
      if (this.isDeleted(inv)) {
        inv.selected = false;
      } else {
        inv.selected = checked;
      }
    });
  }

  clearSelection(): void {
    this.invoices.forEach((inv) => {
      inv.selected = false;
    });
  }

  openDeletePopupForSelected(): void {
    const selected = this.getSelectedInvoices().filter((inv) => !this.isDeleted(inv));
    if (!selected.length) return;
    this.deleteTargets = selected;
    this.showDeletePopup = true;
  }

  cancelDelete(): void {
    this.showDeletePopup = false;
    this.deleteTargets = [];
  }

  confirmDelete(): void {
    if (this.deleting) return;
    const targets = (this.deleteTargets || []).filter(
      (inv) => inv?._id && !this.isDeleted(inv)
    );
    if (!targets.length) {
      this.cancelDelete();
      return;
    }
    this.deleting = true;
    let remaining = targets.length;
    const finalizeOne = () => {
      remaining -= 1;
      if (remaining <= 0) {
        this.deleting = false;
        this.cancelDelete();
        this.clearSelection();
      }
    };
    targets.forEach((target) => {
      this.http
        .put<any>(
          `http://localhost:3000/api/newshipments/generatedInvoices/${target._id}/cancel`,
          {}
        )
        .subscribe({
          next: (res) => {
            const updated = res?.invoice;
            if (updated?._id) {
              this.invoices = this.invoices.map((inv) =>
                String(inv._id) === String(updated._id) ? { ...inv, ...updated } : inv
              );
              this.applyFilters();
            }
            finalizeOne();
          },
          error: (err) => {
            console.error('Error cancelling generated invoice:', err);
            finalizeOne();
          }
        });
    });
  }

  togglePaymentStatus(inv: any): void {
    if (!inv?._id || this.paymentUpdatingId) return;
    const current = String(inv.status || '').trim().toLowerCase();
    const nextStatus = current === 'paid' ? 'Active' : 'Paid';
    this.paymentUpdatingId = String(inv._id);
    this.http
      .put<any>(`http://localhost:3000/api/newshipments/generatedInvoices/${inv._id}/payment-status`, {
        status: nextStatus
      })
      .subscribe({
        next: (res) => {
          const updated = res?.invoice;
          if (updated?._id) {
            this.invoices = this.invoices.map((row) =>
              String(row._id) === String(updated._id) ? { ...row, ...updated } : row
            );
            this.applyFilters();
          }
          this.paymentUpdatingId = null;
        },
        error: (err) => {
          console.error('Error updating payment status:', err);
          this.paymentUpdatingId = null;
        }
      });
  }

  async printInvoice(inv: any): Promise<void> {
    try {
      const template = await this.getTemplate();
      const body = this.buildInvoiceBody(inv);
      this.openPrintWindow(template.replace('{{content}}', body));
    } catch (err) {
      console.error('Error loading invoice template:', err);
    }
  }

  async printAllInvoices(): Promise<void> {
    await this.printInvoices(this.filteredInvoices);
  }

  async printSelectedInvoices(): Promise<void> {
    const selected = this.getSelectedInvoices();
    if (!selected.length) return;
    await this.printInvoices(selected);
  }

  private async printInvoices(list: any[]): Promise<void> {
    if (!list.length) {
      return;
    }
    try {
      const template = await this.getTemplate();
      const pages = list.map((inv) => this.buildInvoiceBody(inv));
      const body = pages
        .map((page, idx) => page + (idx < pages.length - 1 ? '<div class="page-break"></div>' : ''))
        .join('');
      this.openPrintWindow(template.replace('{{content}}', body));
    } catch (err) {
      console.error('Error loading invoice template:', err);
    }
  }

  private buildInvoiceBody(inv: any): string {
    const consignments = inv?.consignments || [];
    const total = consignments.reduce((sum: number, c: any) => sum + Number(c.finalAmount || 0), 0);
    const chargeKeys = ['odc', 'unloading', 'docket', 'other', 'ccc', 'consignorDiscount'];
    const chargeTotals = chargeKeys.reduce((acc: any, key) => {
      acc[key] = consignments.reduce((sum: number, c: any) => {
        return sum + Number(c?.charges?.[key] || 0);
      }, 0);
      return acc;
    }, {});
    const gstAmount = total * (this.gstPercent / 100);
    const grandTotal = total + gstAmount;
    const rows = consignments.map((c: any, idx: number) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${c.consignmentNumber || ''}</td>
        <td>${c.consignor || ''}</td>
        <td>${c.deliveryAddress || ''}</td>
        <td style="text-align:right">${Number(c.finalAmount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const chargesList = chargeKeys.map((key) => `
      <div>${key}: ${Number(chargeTotals[key] || 0).toFixed(2)}</div>
    `).join('');

    return `
      <h2>Invoice #${inv.invoiceDisplayNumber || inv.invoiceCode || inv.invoiceNumber || ''}</h2>
      <div class="meta">
        <div>Client: ${inv.clientName || ''}</div>
        <div>GSTIN: ${inv.clientGSTIN || ''}</div>
        <div>Billing Address: ${inv.billingAddress || ''}</div>
        <div>GST Percent: ${this.gstPercent}%</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Consignment</th>
            <th>Consignor</th>
            <th>Delivery Address</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5">No consignments</td></tr>'}
        </tbody>
      </table>
      <div class="totals">
        <div>Subtotal: ${total.toFixed(2)}</div>
        <div>GST (${this.gstPercent}%): ${gstAmount.toFixed(2)}</div>
        <div>Grand Total: ${grandTotal.toFixed(2)}</div>
      </div>
      <div class="charges">
        <div class="charges-title">Charges</div>
        ${chargesList}
      </div>
    `;
  }

  private async getTemplate(): Promise<string> {
    if (this.invoiceTemplate) return this.invoiceTemplate;
    const res = await fetch('assets/generated-invoice-template.html');
    this.invoiceTemplate = await res.text();
    return this.invoiceTemplate;
  }

  private openPrintWindow(html: string): void {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.print();
    }
  }
}
