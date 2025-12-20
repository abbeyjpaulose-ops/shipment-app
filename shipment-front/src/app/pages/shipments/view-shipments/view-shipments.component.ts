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

  selectedShipment: any | null = null;   // âœ… for modal popup

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadShipments();
  }

  loadShipments(): void {
    this.http.get<any[]>('http://localhost:3000/api/newshipments', {
      params: {
        username: localStorage.getItem('username') || '',
        branch: localStorage.getItem('branch') || 'All Branches'
      }
    }).subscribe({
      next: (res: any[]) => {
        const normalized = (res || []).map((shipment) => ({
          ...shipment,
          invoices: this.flattenInvoices(shipment.ewaybills || shipment.invoices || [])
        }));
        this.shipments = normalized;
        this.filteredShipments = normalized;
      },
      error: (err: any) => console.error('Error loading shipments:', err)
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
    return this.getInStockAmountTotal(invoices)
      + this.getProductTotal(invoices, 'intransitstock')
      + this.getProductTotal(invoices, 'deliveredstock');
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

  // âœ… open details modal
  openShipmentDetails(shipment: any): void {
    this.selectedShipment = shipment;
  }

  // âœ… close details modal
  closeShipmentDetails(): void {
    this.selectedShipment = null;
  }
}


