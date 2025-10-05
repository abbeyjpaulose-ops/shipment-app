import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, provideHttpClient } from '@angular/common/http';

@Component({
  selector: 'app-stocks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stocks.component.html',
  styleUrls: ['./stocks.component.css']
})
export class StocksComponent implements OnInit {
  stocks: any[] = [];
  filteredStocks: any[] = [];
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  selectedStock: any = null;
  editingStock: any = null;   // ✅ track which stock is being edited

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadStocks();
  }

  loadStocks() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/newshipments?email=${email}`).subscribe({
      next: (res) => {
        // filter only INSTOCK shipments
        
        this.stocks = res.filter(s => s.shipmentStatus === 'INSTOCK');
        console.log(this.stocks);
        this.filteredStocks = [...this.stocks];
      },
      error: (err) => console.error('❌ Error loading stocks:', err)
    });
  }

  applyFilters() {
    this.filteredStocks = this.stocks.filter(s =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true)
    );
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredStocks.forEach(s => s.selected = checked);
  }

  manifestSelected() {
    const selected = this.filteredStocks.filter(s => s.selected);
    console.log('🚀 Manifest selected stocks:', selected);
    


    // later implement API call
  }

  openStockDetails(stock: any) {
    this.selectedStock = stock;
  }

  closeStockDetails() {
    this.selectedStock = null;
  }

    editStock(stock: any) {
    console.log('✏️ Edit stock:', stock);
    this.editingStock = { ...stock };  // ✅ copy so we don’t mutate directly
  }

  saveStockEdit() {
    if (!this.editingStock) return;

    console.log("kkkkkkkkkkklllllllllllllllll" + this.editingStock.consignmentNumber);

    this.http.put(`http://localhost:3000/api/newshipments/${this.editingStock.consignmentNumber}`, this.editingStock)
      .subscribe({
        next: () => {
          console.log('✅ Stock updated');
          this.loadStocks();          // reload updated data
          this.editingStock = null;   // close modal
        },
        error: (err) => console.error('❌ Error updating stock:', err)
      });
  }

  cancelEdit() {
    this.editingStock = null;
  }

}
