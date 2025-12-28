import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-client',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client.component.html',
  styleUrls: ['./client.component.css']
})
export class ClientComponent implements OnInit {

  clients: any[] = [];
  productOptions: any[] = [];
  showAddClientPopup = false;
  showEditClientPopup = false;
  cbranch: string = localStorage.getItem('branch') || 'All Branches';
  private branchCheck: any;

  newClient: any = {
    clientName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    GSTIN: '',
    phoneNum: '',
    perDis: '',
    creditType: 'no-credit',
    products: [],
    deliveryLocations: [{ location: '' }],
    status: 'active',
    branch: localStorage.getItem('branch') || 'All Branches',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };

  editingClient: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadClients();
    this.loadProducts();
    // react to branch changes (same tab)
    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      if (current !== this.cbranch) {
        this.cbranch = current;
        this.loadClients();
        this.loadProducts();
      }
    }, 1000);
    // react to branch changes (other tabs)
    window.addEventListener('storage', this.onStorage);
  }

  ngOnDestroy() {
    if (this.branchCheck) clearInterval(this.branchCheck);
    window.removeEventListener('storage', this.onStorage);
  }

  private onStorage = (e: StorageEvent) => {
    if (e.key === 'branch' && e.newValue && e.newValue !== this.cbranch) {
      this.cbranch = e.newValue;
      this.loadClients();
      this.loadProducts();
    }
  };

  /** Load Clients */
  loadClients() {
    const email = localStorage.getItem('email');
    this.cbranch = localStorage.getItem('branch') || 'All Branches';

    this.http.get<any[]>(`http://localhost:3000/api/clients?email=${email}&branch=${this.cbranch}`)
      .subscribe({
        next: (data) => {
          console.log("Clients loaded:", data);
          this.clients = data;
        },
        error: (err) => console.error("Error loading clients:", err)
      });
  }

  /** Load Products for dropdown */
  loadProducts() {
    const branch = localStorage.getItem('branch') || 'All Branches';
    this.http.get<any[]>(`http://localhost:3000/api/products`)
      .subscribe({
        next: (data) => {
          this.productOptions = (data || []).filter((p: any) =>
            branch === 'All Branches' ? true : p.branch === branch
          );
        },
        error: (err) => console.error('Error loading products:', err)
      });
  }

  /** Popup Control */
  openAddClientPopup() {
    this.showAddClientPopup = true;
  }

  closeAddClientPopup() {
    this.showAddClientPopup = false;
  }

  openEditClientPopup(client: any) {
    this.editingClient = JSON.parse(JSON.stringify(client));
    if (!Array.isArray(this.editingClient.products)) this.editingClient.products = [];
    if (!Array.isArray(this.editingClient.deliveryLocations)) {
      this.editingClient.deliveryLocations = [{ location: '' }];
    }
    this.editingClient.products = this.editingClient.products.map((product: any) =>
      this.ensureProductRates(product)
    );
    this.showEditClientPopup = true;
  }

  closeEditClientPopup() {
    this.showEditClientPopup = false;
    this.editingClient = null;
  }

  /** Product Functions */
  addProduct() {
    this.newClient.products.push({
      hsnNum: '',
      productName: '',
      rates: [this.createRateEntry()]
    });
  }

  onProductSelect(row: any) {
    const match = this.productOptions.find((p) => p.productName === row.productName);
    if (match) {
      row.hsnNum = match.hsnNum;
    }
  }

  removeProduct(index: number) {
    this.newClient.products.splice(index, 1);
  }

  addProductEdit() {
    this.editingClient.products.push({
      hsnNum: '',
      productName: '',
      rates: [this.createRateEntry()]
    });
  }

  removeProductEdit(index: number) {
    this.editingClient.products.splice(index, 1);
  }

  addRateRow(product: any) {
    if (!product.rates) {
      product.rates = [];
    }
    product.rates.push(this.createRateEntry());
  }

  removeRateRow(product: any, index: number) {
    if (!product.rates) {
      return;
    }
    product.rates.splice(index, 1);
  }

  /** Delivery Location Functions */
  addDeliveryLocation() {
    this.newClient.deliveryLocations.push({ location: '' });
  }

  removeDeliveryLocation(index: number) {
    this.newClient.deliveryLocations.splice(index, 1);
  }

  addDeliveryLocationEdit() {
    this.editingClient.deliveryLocations.push({ location: '' });
  }

  removeDeliveryLocationEdit(index: number) {
    this.editingClient.deliveryLocations.splice(index, 1);
  }

  /** Add Client */
  addClient() {
    console.log('📤 Sending client data:', this.newClient);

    this.newClient.branch = localStorage.getItem('branch') || 'All Branches';

    if (this.newClient.branch === 'All Branches') {
      alert('Please select a specific branch before adding a client.');
      return;
    }

    this.http.post('http://localhost:3000/api/clients/add', this.newClient, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Client saved', res);
        alert('Client added successfully!');
        window.location.reload();
      },
      error: (err) => {
        console.error('❌ Error saving client:', err);
        alert('Error: ' + err.error.message);
      }
    });
  }

  /** Edit Functions */
  saveEdit() {
    this.http.put(`http://localhost:3000/api/clients/${this.editingClient._id}`, this.editingClient)
      .subscribe(() => {
        this.loadClients();
        this.closeEditClientPopup();
      });
  }

  /** Toggle Functions */
  toggleCreditType(client: any) {
    this.http.patch(`http://localhost:3000/api/clients/${client._id}/credit`, {})
      .subscribe(() => this.loadClients());

    console.log('Toggled credit type for client:', client._id);
  }

  toggleStatus(client: any) {
    this.http.patch(`http://localhost:3000/api/clients/${client._id}/status`, {})
      .subscribe(() => this.loadClients());
  }

  private createRateEntry() {
    return {
      pickupPincode: '',
      deliveryPincode: '',
      rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
    };
  }

  private ensureProductRates(product: any) {
    return {
      ...product,
      rates: Array.isArray(product.rates) && product.rates.length > 0
        ? product.rates.map((rateEntry: any) => ({
            pickupPincode: rateEntry.pickupPincode || '',
            deliveryPincode: rateEntry.deliveryPincode || '',
            rate: {
              ratePerNum: rateEntry.rate?.ratePerNum ?? 0,
              ratePerVolume: rateEntry.rate?.ratePerVolume ?? 0,
              ratePerKg: rateEntry.rate?.ratePerKg ?? 0
            }
          }))
        : [this.createRateEntry()]
    };
  }
}
