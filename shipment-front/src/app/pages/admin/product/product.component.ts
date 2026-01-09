import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product.component.html',
  styleUrls: ['./product.component.css']
})
export class ProductComponent implements OnInit {
  products: any[] = [];
  showAddProductPopup = false;
  newProduct: any = {
    productName: '',
    branch: localStorage.getItem('branch') || 'All Branches',
    status: 'active',
    rates: [
      {
        pickupPincode: '',
        deliveryPincode: '',
        rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
      }
    ],
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingProduct: any = null;

  get filteredProducts(): any[] {
    const branch = localStorage.getItem('branch') || 'All Branches';
    if (branch === 'All Branches') {
      return this.products;
    }
    return (this.products || []).filter((product: any) => product?.branch === branch);
  }

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
  }

  loadProducts() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/products?email=${email}`)
      .subscribe({
        next: (data) => {
          this.products = data;
        },
        error: (err) => console.error('Error loading products:', err)
      });
  }

  openAddProductPopup() {
    this.showAddProductPopup = true;
  }

  closeAddProductPopup() {
    this.showAddProductPopup = false;
  }

  addProduct() {
    this.newProduct.branch = localStorage.getItem('branch') || 'All Branches';
    if (this.newProduct.branch === 'All Branches') {
      alert('Please select a specific branch before adding a product.');
      return;
    }
    this.ensureRates(this.newProduct);
    this.http.post('http://localhost:3000/api/products/add', this.newProduct, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: () => {
        alert('Product type added successfully!');
        this.closeAddProductPopup();
        window.location.reload();
      },
      error: (err) => {
        alert('Error: ' + err.error?.message);
      }
    });
  }

  editProduct(product: any) {
    this.editingProduct = JSON.parse(JSON.stringify(product));
    this.ensureRates(this.editingProduct);
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/products/${this.editingProduct._id}`, this.editingProduct)
      .subscribe(() => {
        this.loadProducts();
        this.editingProduct = null;
      });
  }

  toggleStatus(product: any) {
    this.http.patch(`http://localhost:3000/api/products/${product._id}/status`, {})
      .subscribe(() => this.loadProducts());
  }

  addRateRow(target: any) {
    if (!target.rates) {
      target.rates = [];
    }
    target.rates.push({
      pickupPincode: '',
      deliveryPincode: '',
      rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
    });
  }

  removeRateRow(target: any, index: number) {
    if (!target.rates) {
      return;
    }
    target.rates.splice(index, 1);
  }

  private ensureRates(target: any) {
    if (!Array.isArray(target.rates) || target.rates.length === 0) {
      target.rates = [
        {
          pickupPincode: '',
          deliveryPincode: '',
          rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
        }
      ];
      return;
    }
    target.rates = target.rates.map((rateEntry: any) => ({
      pickupPincode: rateEntry.pickupPincode || '',
      deliveryPincode: rateEntry.deliveryPincode || '',
      rate: {
        ratePerNum: rateEntry.rate?.ratePerNum ?? 0,
        ratePerVolume: rateEntry.rate?.ratePerVolume ?? 0,
        ratePerKg: rateEntry.rate?.ratePerKg ?? 0
      }
    }));
  }
}
