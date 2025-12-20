import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice.component.html',
  styleUrls: ['./invoice.component.css']
})
export class InvoiceComponent implements OnInit {
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  selectedInvoice: any = null;
  showInvoiceModal = false;

  editingInvoice: any = null;   // ✅ Track the invoice being edited
  showEditPopup: boolean = false; // ✅ Control popup visibility

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadInvoices();
  }

  loadInvoices() {
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        username: localStorage.getItem('username') || '',
        branch: localStorage.getItem('branch') || ''
      }
    }).subscribe({
      next: (res) => {
        // ✅ Only show shipments with status 'Delivered'
        //onsole.log('📦 IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIInvoices loaded:', res);
        this.invoices = res.filter(s => s.shipmentStatus === 'Delivered' || s.shipmentStatus === 'Invoiced');
        this.filteredInvoices = [...this.invoices];
        console.log('📦 Filtered Invoices for Delivered status:', this.filteredInvoices);
        this.filteredInvoices.forEach(i => console.log('📦 Filtered Invoice:', i.consignmentNumber));
      },
      error: (err) => console.error('❌ Error loading invoices:', err)
    });
  }

  applyFilters() {
    this.filteredInvoices = this.invoices.filter(s =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true)
    );
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredInvoices.forEach(i => i.selected = checked);
  }

  openInvoiceDetails(invoice: any) {
    this.selectedInvoice = invoice;
    this.showInvoiceModal = true;
  }

  closeInvoiceDetails() {
    this.showInvoiceModal = false;
    this.selectedInvoice = null;
  }

  // ✅ Function to mark selected Delivered consignments as Invoiced
  invoiceSelected() {
    const selectedConsignments = this.filteredInvoices.filter(i => i.selected);

    if (selectedConsignments.length === 0) {
      console.warn('⚠️ No consignments selected for invoicing.');
      return;
    }

    selectedConsignments.forEach(consignment => {
      const updatedConsignment = { ...consignment, shipmentStatus: 'Invoiced' };

      this.http.put(`http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`, updatedConsignment)
        .subscribe({
          next: () => {
            console.log(`✅ Consignment ${consignment.consignmentNumber} updated to Invoiced`);
            this.loadInvoices(); // Refresh data
          },
          error: (err) => {
            console.error(`❌ Error updating consignment ${consignment.consignmentNumber}:`, err);
          }
        });
    });

    // Clear selection
    this.filteredInvoices.forEach(i => i.selected = false);
  }

  // ✅ Edit function (opens popup)
  editInvoice(invoice: any) {
    console.log('✏️ Edit invoice:', invoice);
    this.editingInvoice = { ...invoice };  // Copy invoice data into editing object
    this.showEditPopup = true;             // Show popup
  }

  deleteInvoice() {
  // Confirm before deleting
  const selectedConsignments = this.filteredInvoices.filter(i => i.selected);

    if (selectedConsignments.length === 0) {
      console.warn('⚠️ No consignments selected for invoicing.');
      return;
    }

    selectedConsignments.forEach(consignment => {
      const updatedConsignment = { ...consignment, shipmentStatus: ' Cancelled-'+consignment.shipmentStatus};

      this.http.put(`http://localhost:3000/api/newshipments/${consignment.consignmentNumber}`, updatedConsignment)
        .subscribe({
          next: () => {
            console.log(`✅ Consignment ${consignment.consignmentNumber} updated to Invoiced`);
            this.loadInvoices(); // Refresh data
          },
          error: (err) => {
            console.error(`❌ Error updating consignment ${consignment.consignmentNumber}:`, err);
          }
        });
    });

    // Clear selection
    this.filteredInvoices.forEach(i => i.selected = false);
}


  // ✅ Save changes from popup
  saveInvoiceEdit() {
    if (!this.editingInvoice) return;
    
    this.editingInvoice.invoices.forEach((inv: any) => {
      inv.products.forEach((prod: any) => {
      prod.deliveredstock = 0;
      prod.instock = prod.amount;
      console.log('💾 SSSSSSSSSSSSSSSSSSaving invoice edit:', prod);
      });
    });
    

    this.http.put(`http://localhost:3000/api/newshipments/${this.editingInvoice.consignmentNumber}`, this.editingInvoice)
      .subscribe({
        next: () => {
          console.log('✅ Invoice updated successfully');
          this.loadInvoices();
          this.editingInvoice = null;
          this.showEditPopup = false; // Close popup
        },
        error: (err) => console.error('❌ Error updating invoice:', err)
      });
  }

  // ✅ Cancel edit and close popup
  cancelEdit() {
    this.editingInvoice = null;
    this.showEditPopup = false;
  }

  printInvoice() {
  const selected = this.filteredInvoices?.filter(inv => inv.selected) || [];

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
      console.log('🖨️ Printing invoice for consignment:', inv);

      // Build product rows + calculate subtotal
      let subtotal = 0;
      const rows = inv.invoices.map((i: any) =>
        i.products.map((p: any) => {
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
      console.log('🏢 Company type for invoice:', ctype);

      const gst = inv.finalAmount * (parseInt(ctype)/100);
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

      // Add page break after each invoice except the last
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
