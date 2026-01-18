import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

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
  rateAddressOptions: Array<{ id: string; label: string }> = [];
  private rateAddressLabelById = new Map<string, string>();
  newProduct: any = {
    productName: '',
    branchId: localStorage.getItem('branchId') || 'all',
    status: 'active',
    rates: [
      {
        pickupLocationId: '',
        deliveryLocationId: '',
        rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
      }
    ],
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingProduct: any = null;

  get filteredProducts(): any[] {
    const branchId = localStorage.getItem('branchId') || 'all';
    if (branchId === 'all') {
      return this.products;
    }
    return (this.products || []).filter((product: any) => String(product?.branchId) === String(branchId));
  }

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
    this.loadRateAddressOptions();
  }

  loadProducts() {
    const email = localStorage.getItem('email');
    const branch = localStorage.getItem('branch') || '';
    const branchId = localStorage.getItem('branchId') || 'all';
    this.http.get<any[]>(`http://localhost:3000/api/products?email=${email}&branchId=${encodeURIComponent(branchId)}&branch=${encodeURIComponent(branch)}`)
      .subscribe({
        next: (data) => {
          this.products = data;
        },
        error: (err) => console.error('Error loading products:', err)
      });
  }

  loadRateAddressOptions() {
    const branchParams = '?branchId=all';
    forkJoin({
      branches: this.http.get<any[]>('http://localhost:3000/api/branches'),
      hubs: this.http.get<any[]>('http://localhost:3000/api/hubs'),
      clients: this.http.get<any[]>(`http://localhost:3000/api/clients/clientslist${branchParams}`)
    }).subscribe({
      next: ({ branches, hubs, clients }) => {
        const options: Array<{ id: string; label: string }> = [];

        (branches || []).forEach((branch: any) => {
          const addresses = Array.isArray(branch?.addresses) ? branch.addresses : [];
          addresses.forEach((addr: any) => {
            const id = String(addr?._id || '').trim();
            if (!id) return;
            const parts = [addr.address, addr.city, addr.state, addr.pinCode].filter(Boolean);
            const label = `Branch: ${branch?.branchName || ''} - ${parts.join(', ')}`;
            options.push({ id, label });
          });
          if (!addresses.length && branch?._id) {
            const parts = [branch.address, branch.city, branch.state, branch.pinCode].filter(Boolean);
            const label = `Branch: ${branch?.branchName || ''} - ${parts.join(', ')}`.trim();
            options.push({ id: String(branch._id), label });
          }
        });

        (hubs || []).forEach((hub: any) => {
          const addresses = Array.isArray(hub?.deliveryAddresses) ? hub.deliveryAddresses : [];
          addresses.forEach((addr: any) => {
            const id = String(addr?._id || '').trim();
            if (!id) return;
            const label = `Hub: ${hub?.hubName || ''} - ${addr?.location || ''}`.trim();
            options.push({ id, label });
          });
        });

        (clients || []).forEach((client: any) => {
          const locations = Array.isArray(client?.deliveryLocations) ? client.deliveryLocations : [];
          locations.forEach((loc: any) => {
            const id = String(loc?.delivery_id || loc?._id || '').trim();
            if (!id) return;
            const parts = [loc.address, loc.city, loc.state, loc.pinCode].filter(Boolean);
            const label = `Client: ${client?.clientName || ''} - ${parts.join(', ')}`;
            options.push({ id, label });
          });
        });

        this.rateAddressOptions = options;
        this.rateAddressLabelById = new Map(options.map((o) => [o.id, o.label]));
      },
      error: () => {
        this.rateAddressOptions = [];
        this.rateAddressLabelById = new Map();
      }
    });
  }

  getRateAddressLabel(id: string): string {
    const key = String(id || '').trim();
    if (!key) return '-';
    return this.rateAddressLabelById.get(key) || key;
  }

  openAddProductPopup() {
    this.showAddProductPopup = true;
  }

  closeAddProductPopup() {
    this.showAddProductPopup = false;
  }

  addProduct() {
    this.newProduct.branchId = localStorage.getItem('branchId') || 'all';
    if (this.newProduct.branchId === 'all') {
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
      pickupLocationId: '',
      deliveryLocationId: '',
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
          pickupLocationId: '',
          deliveryLocationId: '',
          rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
        }
      ];
      return;
    }
    target.rates = target.rates.map((rateEntry: any) => ({
      pickupLocationId: rateEntry.pickupLocationId || '',
      deliveryLocationId: rateEntry.deliveryLocationId || '',
      rate: {
        ratePerNum: rateEntry.rate?.ratePerNum ?? 0,
        ratePerVolume: rateEntry.rate?.ratePerVolume ?? 0,
        ratePerKg: rateEntry.rate?.ratePerKg ?? 0
      }
    }));
  }
}
