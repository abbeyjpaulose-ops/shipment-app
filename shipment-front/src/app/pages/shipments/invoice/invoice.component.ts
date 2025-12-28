import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { BranchService } from '../../../services/branch.service';

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice.component.html',
  styleUrls: ['./invoice.component.css']
})
export class InvoiceComponent implements OnInit, OnDestroy {
  invoices: any[] = [];
  deliveredInvoices: any[] = [];
  preInvoicedInvoices: any[] = [];
  filteredDelivered: any[] = [];
  filteredPreInvoiced: any[] = [];
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  selectedInvoice: any = null;
  showInvoiceModal = false;
  branch: string = localStorage.getItem('branch') || 'All Branches';
  private branchSub?: Subscription;

  editingInvoice: any = null;   // âœ… Track the invoice being edited
  showEditPopup: boolean = false; // âœ… Control popup visibility

  constructor(private http: HttpClient, private branchService: BranchService) {}

  ngOnInit() {
    this.branch = this.branchService.currentBranch || this.branch;
    this.branchSub = this.branchService.branch$.subscribe(branch => {
      if (branch !== this.branch) {
        this.branch = branch;
        this.loadInvoices();
      }
    });
    window.addEventListener('storage', this.onStorageChange);
    this.loadInvoices();
  }

  ngOnDestroy(): void {
    this.branchSub?.unsubscribe();
    window.removeEventListener('storage', this.onStorageChange);
  }

  loadInvoices() {
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        username: localStorage.getItem('username') || '',
        branch: this.branch || localStorage.getItem('branch') || ''
      }
    }).subscribe({
      next: (res) => {
        // âœ… Only show shipments with status 'Delivered'
        //onsole.log('ðŸ“¦ IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIInvoices loaded:', res);
        this.invoices = res.filter(s => s.shipmentStatus === 'Delivered' || s.shipmentStatus === 'Pre-Invoiced');
        this.deliveredInvoices = this.invoices.filter(s => s.shipmentStatus === 'Delivered');
        this.preInvoicedInvoices = this.invoices.filter(s => s.shipmentStatus === 'Pre-Invoiced');
        this.applyFilters();
        console.log('A��,f??A� Filtered Delivered consignments:', this.filteredDelivered);
        console.log('A��,f??A� Filtered Pre-Invoiced consignments:', this.filteredPreInvoiced);
      },
      error: (err) => console.error('âŒ Error loading invoices:', err)
    });
  }

  private onStorageChange = (e: StorageEvent) => {
    if (e.key === 'branch' && e.newValue && e.newValue !== this.branch) {
      this.branch = e.newValue;
      this.loadInvoices();
    }
  };

  applyFilters() {
    const matches = (s: any) =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true);

    this.filteredDelivered = this.deliveredInvoices.filter(matches);
    this.filteredPreInvoiced = this.preInvoicedInvoices.filter(matches);
  }

  toggleAllDeliveredSelection(event: any) {
    const checked = event.target.checked;
    this.filteredDelivered.forEach(i => i.selected = checked);
  }

  toggleAllPreInvoicedSelection(event: any) {
    const checked = event.target.checked;
    this.filteredPreInvoiced.forEach(i => i.selected = checked);
  }
  openInvoiceDetails(invoice: any) {
    this.selectedInvoice = invoice;
    this.showInvoiceModal = true;
  }

  closeInvoiceDetails() {
    this.showInvoiceModal = false;
    this.selectedInvoice = null;
  }

  // âœ… Function to mark selected Delivered consignments as Invoiced
  invoiceSelected() {
    const selectedConsignments = this.filteredDelivered.filter(i => i.selected);

    if (selectedConsignments.length === 0) {
      console.warn('No consignments selected for invoicing.');
      return;
    }

    selectedConsignments.forEach(consignment => {
      const updatedConsignment = { ...consignment, shipmentStatus: 'Pre-Invoiced' };

      this.http.put(`http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`, updatedConsignment)
        .subscribe({
          next: () => {
            console.log(`Consignment ${consignment.consignmentNumber} updated to Pre-Invoiced`);
            this.loadInvoices();
          },
          error: (err) => {
            console.error(`Error updating consignment ${consignment.consignmentNumber}:`, err);
          }
        });
    });

    this.filteredDelivered.forEach(i => i.selected = false);
  }

  editInvoice(invoice: any) {
    console.log('Edit invoice:', invoice);
    const cloned = JSON.parse(JSON.stringify(invoice || {}));
    if (Array.isArray(cloned.ewaybills) && cloned.ewaybills.length) {
      cloned.invoices = this.flattenInvoices(cloned.ewaybills);
    } else {
      cloned.invoices = cloned.invoices || [];
    }
    this.editingInvoice = cloned;
    this.captureOriginalDelivered(this.editingInvoice);
    this.showEditPopup = true;
  }

  private flattenInvoices(ewaybills: any[]): any[] {
    return (ewaybills || []).flatMap((ewb) => ewb.invoices || []);
  }

  private captureOriginalDelivered(invoice: any) {
    (invoice?.invoices || []).forEach((inv: any) => {
      (inv.products || []).forEach((prod: any) => {
        prod._originalDelivered = Number(prod.deliveredstock) || 0;
      });
    });
  }

  deleteDelivered() {
    this.deleteConsignments(this.filteredDelivered);
  }

  deletePreInvoiced() {
    this.deleteConsignments(this.filteredPreInvoiced);
  }

  deleteInvoice() {
    this.deleteConsignments([...this.filteredDelivered, ...this.filteredPreInvoiced]);
  }

  finalizePreInvoiced() {
    const selectedConsignments = (this.filteredPreInvoiced || []).filter(i => i.selected);

    if (selectedConsignments.length === 0) {
      console.warn('No consignments selected for invoicing.');
      return;
    }

    selectedConsignments.forEach(consignment => {
      const updatedConsignment = { ...consignment, shipmentStatus: 'Invoiced' };

      this.http.put(`http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`, updatedConsignment)
        .subscribe({
          next: () => {
            console.log(`Consignment ${consignment.consignmentNumber} updated to Invoiced`);
            this.loadInvoices();
          },
          error: (err) => {
            console.error(`Error updating consignment ${consignment.consignmentNumber}:`, err);
          }
        });
    });

    this.filteredPreInvoiced.forEach(i => i.selected = false);
  }

  private deleteConsignments(list: any[]) {
    const selectedConsignments = (list || []).filter(i => i.selected);

    if (selectedConsignments.length === 0) {
      console.warn('No consignments selected for invoicing.');
      return;
    }

    selectedConsignments.forEach(consignment => {
      const updatedConsignment = { ...consignment, shipmentStatus: ' Cancelled-'+consignment.shipmentStatus };

      this.http.put(`http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`, updatedConsignment)
        .subscribe({
          next: () => {
            console.log(`Consignment ${consignment.consignmentNumber} updated to Invoiced`);
            this.loadInvoices();
          },
          error: (err) => {
            console.error(`Error updating consignment ${consignment.consignmentNumber}:`, err);
          }
        });
    });

    (list || []).forEach(i => i.selected = false);
  }

  printDelivered() {
    this.printConsignments(this.filteredDelivered);
  }

  printPreInvoiced() {
    this.printConsignments(this.filteredPreInvoiced);
  }

  printInvoice() {
    this.printConsignments([...this.filteredDelivered, ...this.filteredPreInvoiced]);
  }

  private printConsignments(list: any[]) {
    const selected = (list || []).filter(inv => inv.selected);

    if (selected.length === 0) {
      alert('No invoices selected.');
      return;
    }

    fetch('assets/invoice-template.html')
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
            .totals { margin-top: 15px; font-weight: bold; }
          </style>
        </head>
        <body>
    `;

        selected.forEach((inv, index) => {
          let subtotal = 0;
          const rows = (inv.invoices || []).map((i: any) =>
            (i.products || []).map((p: any) => {
              const lineTotal = (p.price || 0) * (p.deliveredstock || 0);
              subtotal += lineTotal;
              return `
          <tr>
          <td>${inv.consignmentNumber}</td>
          <td>${inv.shipmentStatus}</td>
          <td>${inv.consignor}</td>
          <td>${inv.deliveryAddress}</td>
          <td>${p.type}</td>
          <td>${p.deliveredstock}</td>
          <td>${p.price || 0}</td>
          <td>${lineTotal.toFixed(2)}</td>
          </tr>
          `;
            }).join('')
          ).join('');

          const ctype = localStorage.getItem('companyType') || 'default';
          const gst = inv.finalAmount * (parseInt(ctype, 10) / 100);
          const grandTotal = inv.finalAmount + gst;
          const htmlContent = template
            .replace('{{consignmentNumber}}', inv.consignmentNumber)
            .replace('{{consignor}}', inv.consignor)
            .replace('{{deliveryAddress}}', inv.deliveryAddress)
            .replace('{{status}}', inv.shipmentStatus)
            .replace('{{rows}}', rows)
            .replace('{{subtotal}}', subtotal.toFixed(2))
            .replace('{{gst}}', gst.toFixed(2))
            .replace('{{grandTotal}}', grandTotal.toFixed(2));

          fullHtml += htmlContent;

          if (index < selected.length - 1) {
            fullHtml += `<div class="page-break"></div>`;
          }
        });

        fullHtml += `</body></html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(fullHtml);
          printWindow.document.close();
          printWindow.print();
        }
      })
      .catch(err => console.error('Error loading invoice template:', err));
  }
}
