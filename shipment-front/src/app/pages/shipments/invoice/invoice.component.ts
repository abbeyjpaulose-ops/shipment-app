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
        email: localStorage.getItem('email') || '',
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
}
