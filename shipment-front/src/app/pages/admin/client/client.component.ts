import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-client',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client.component.html',
  styleUrls: ['./client.component.css']
})
export class ClientComponent implements OnInit {

  clients: any[] = [];
  hubs: any[] = [];
  selectedHubId: string = '';
  productOptions: any[] = [];
  rateAddressOptions: Array<{ id: string; label: string }> = [];
  private rateAddressLabelById = new Map<string, string>();
  showAddClientPopup = false;
  showEditClientPopup = false;
  showClientDetailsPopup = false;
  selectedClient: any | null = null;
  cbranch: string = localStorage.getItem('branch') || 'All Branches';
  coriginLocId: string = localStorage.getItem('originLocId') || 'all';
  private branchCheck: any;

  newClient: any = {
    clientName: '',
    GSTIN: '',
    phoneNum: '',
    perDis: '',
    creditType: 'no-credit',
    products: [],
    deliveryLocations: [{ address: '', city: '', state: '', pinCode: '' }],
    status: 'active',
    branch: localStorage.getItem('branch') || 'All Branches',
    originLocId: localStorage.getItem('originLocId') || 'all',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };

  editingClient: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadClients();
    this.loadHubs();
    this.loadProducts();
    this.loadRateAddressOptions();
    // react to branch changes (same tab)
    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.cbranch || currentId !== this.coriginLocId) {
        this.cbranch = current;
        this.coriginLocId = currentId;
        if (current !== 'All Hubs') {
          this.selectedHubId = '';
        }
        this.loadClients();
        this.loadHubs();
        this.loadProducts();
        this.loadRateAddressOptions();
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
    if (e.key === 'branch' || e.key === 'originLocId') {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.cbranch || currentId !== this.coriginLocId) {
        this.cbranch = current;
        this.coriginLocId = currentId;
      }
      this.loadClients();
      if (current !== 'All Hubs') {
        this.selectedHubId = '';
      }
      this.loadHubs();
      this.loadProducts();
      this.loadRateAddressOptions();
    }
  };

  /** Load Clients */
  loadClients() {
    const email = localStorage.getItem('email');
    this.cbranch = localStorage.getItem('branch') || 'All Branches';
    this.coriginLocId = localStorage.getItem('originLocId') || 'all';
    const effectiveoriginLocId =
      this.cbranch === 'All Hubs' ? 'all-hubs' : this.coriginLocId;

    this.http.get<any[]>(`http://localhost:3000/api/clients?email=${email}&originLocId=${effectiveoriginLocId}`)
      .subscribe({
        next: (data) => {
          console.log("Clients loaded:", data);
          this.clients = data;
        },
        error: (err) => console.error("Error loading clients:", err)
      });
  }

  loadHubs() {
    this.http.get<any[]>('http://localhost:3000/api/hubs')
      .subscribe({
        next: (data) => {
          this.hubs = data || [];
        },
        error: () => {
          this.hubs = [];
        }
      });
  }

  /** Load Products for dropdown */
  loadProducts() {
    const branch = localStorage.getItem('branch') || '';
    const originLocId = localStorage.getItem('originLocId') || 'all';
    this.http.get<any[]>(`http://localhost:3000/api/products?originLocId=${encodeURIComponent(originLocId)}&branch=${encodeURIComponent(branch)}`)
      .subscribe({
        next: (data) => {
          this.productOptions = data || [];
        },
      error: (err) => console.error('Error loading products:', err)
    });
  }

  loadRateAddressOptions() {
    const branchParams = '?originLocId=all';
    forkJoin({
      branches: this.http.get<any[]>('http://localhost:3000/api/branches'),
      hubs: this.http.get<any[]>('http://localhost:3000/api/hubs'),
      clients: this.http.get<any[]>(`http://localhost:3000/api/clients/clientslist${branchParams}`)
    }).subscribe({
      next: ({ branches, hubs, clients }) => {
        this.hubs = hubs || [];
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

  /** Popup Control */
  openAddClientPopup() {
    this.showAddClientPopup = true;
  }

  openClientDetailsPopup(client: any) {
    this.selectedClient = client;
    this.showClientDetailsPopup = true;
  }

  closeClientDetailsPopup() {
    this.showClientDetailsPopup = false;
    this.selectedClient = null;
  }

  editSelectedClientFromDetails() {
    if (!this.selectedClient) return;
    this.openEditClientPopup(this.selectedClient);
    this.closeClientDetailsPopup();
  }

  getRateAddressLabel(value: any): string {
    const key = String(value || '').trim();
    if (!key) return '-';
    return this.rateAddressLabelById.get(key) || key;
  }

  getClientPrimaryAddress(client: any): string {
    const source = client || {};
    const primary = Array.isArray(source.deliveryLocations) ? source.deliveryLocations[0] : null;
    const address = source.address || primary?.address || primary?.location || '';
    const city = source.city || primary?.city || '';
    const state = source.state || primary?.state || '';
    const pin = source.pinCode || primary?.pinCode || '';
    const parts = [address, city, state, pin].map((p) => String(p || '').trim()).filter(Boolean);
    return parts.length ? parts.join(', ') : '-';
  }

  closeAddClientPopup() {
    this.showAddClientPopup = false;
  }

  openEditClientPopup(client: any) {
    this.editingClient = JSON.parse(JSON.stringify(client));
    if (!Array.isArray(this.editingClient.products)) this.editingClient.products = [];
    if (!Array.isArray(this.editingClient.deliveryLocations)) {
      this.editingClient.deliveryLocations = [{ address: '', city: '', state: '', pinCode: '' }];
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
    this.newClient.deliveryLocations.push({ address: '', city: '', state: '', pinCode: '' });
  }

  removeDeliveryLocation(index: number) {
    this.newClient.deliveryLocations.splice(index, 1);
  }

  addDeliveryLocationEdit() {
    this.editingClient.deliveryLocations.push({ address: '', city: '', state: '', pinCode: '' });
  }

  removeDeliveryLocationEdit(index: number) {
    this.editingClient.deliveryLocations.splice(index, 1);
  }

  /** Add Client */
  addClient() {
    console.log('📤 Sending client data:', this.newClient);

    this.newClient.branch = localStorage.getItem('branch') || 'All Branches';
    this.newClient.originLocId = localStorage.getItem('originLocId') || 'all';

    if (this.newClient.branch === 'All Hubs' || this.newClient.originLocId === 'all-hubs') {
      const hub = (this.hubs || []).find((h) => String(h?._id || '') === String(this.selectedHubId || ''));
      if (!hub) {
        alert('Please select a hub before adding a client.');
        return;
      }
      this.newClient.originLocId = String(hub._id || '');
      this.newClient.branch = String(hub.hubName || '').trim() || this.newClient.branch;
    }

    if (this.newClient.branch === 'All Branches' || this.newClient.originLocId === 'all') {
      alert('Please select a specific branch before adding a client.');
      return;
    }
    if (!this.hasRequiredPinCodes(this.newClient)) {
      alert('Please enter a Pin Code for every delivery location.');
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
    if (!this.hasRequiredPinCodes(this.editingClient)) {
      alert('Please enter a Pin Code for every delivery location.');
      return;
    }
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
      pickupLocationId: '',
      deliveryLocationId: '',
      rate: { ratePerNum: 0, ratePerVolume: 0, ratePerKg: 0 }
    };
  }

  private ensureProductRates(product: any) {
    return {
      ...product,
      rates: Array.isArray(product.rates) && product.rates.length > 0
        ? product.rates.map((rateEntry: any) => ({
            pickupLocationId: rateEntry.pickupLocationId || '',
            deliveryLocationId: rateEntry.deliveryLocationId || '',
            rate: {
              ratePerNum: rateEntry.rate?.ratePerNum ?? 0,
              ratePerVolume: rateEntry.rate?.ratePerVolume ?? 0,
              ratePerKg: rateEntry.rate?.ratePerKg ?? 0
            }
          }))
        : [this.createRateEntry()]
    };
  }

  private hasRequiredPinCodes(client: any): boolean {
    if (!client) return false;
    if (Array.isArray(client.deliveryLocations)) {
      const missing = client.deliveryLocations.some((loc: any) => !String(loc?.pinCode || '').trim());
      if (missing) return false;
    }
    if ('pinCode' in client && !String(client?.pinCode || '').trim()) {
      return false;
    }
    return true;
  }
}
