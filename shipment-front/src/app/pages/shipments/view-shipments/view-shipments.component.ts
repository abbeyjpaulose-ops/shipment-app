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

  searchText: string = '';
  filterDate: string = '';
  filterStatus: string = '';
  filterConsignor: string = '';

  selectedShipment: any | null = null;   // ✅ for modal popup

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadShipments();
  }

  loadShipments(): void {
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        email: localStorage.getItem('email') || '',
        branch: localStorage.getItem('branch') || ''
      }
    }).subscribe({
      next: (res: any[]) => {
        this.shipments = res.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.filteredShipments = [...this.shipments];
      },
      error: (err: any) => console.error('❌ Error loading shipments:', err)
    });
  }

  getInvoiceAmountTotal(invoices: any[]): number {
  if (!invoices) return 0;

  return invoices.reduce((total, invoice) => {
    const productSum = invoice.products?.reduce((sum: number, prod: any) => sum + (prod.amount || 0), 0) || 0;
    return total + productSum;
  }, 0);
}

  getInStockAmountTotal(invoices: any[]): number {
  if (!invoices) return 0;

  return invoices.reduce((total, invoice) => {
    const productSum = invoice.products?.reduce((sum: number, prod: any) => sum + (prod.instock || 0), 0) || 0;
    return total + productSum;
  }, 0);
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
  }

  // ✅ open details modal
  openShipmentDetails(shipment: any): void {
    this.selectedShipment = shipment;
  }

  // ✅ close details modal
  closeShipmentDetails(): void {
    this.selectedShipment = null;
  }
}
