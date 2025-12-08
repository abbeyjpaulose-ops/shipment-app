import { Component, OnInit } from '@angular/core';
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
  showAddClientPopup = false;
  cbranch: string = 'All Branches';

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
  }

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

  /** Popup Control */
  openAddClientPopup() {
    this.showAddClientPopup = true;
  }

  closeAddClientPopup() {
    this.showAddClientPopup = false;
  }

  /** Product Functions */
  addProduct() {
    this.newClient.products.push({
      hsnNum: '',
      productName: '',
      ratePerNum: 0,
      ratePerVolume: 0,
      ratePerKg: 0
    });
  }

  removeProduct(index: number) {
    this.newClient.products.splice(index, 1);
  }

  /** Delivery Location Functions */
  addDeliveryLocation() {
    this.newClient.deliveryLocations.push({ location: '' });
  }

  removeDeliveryLocation(index: number) {
    this.newClient.deliveryLocations.splice(index, 1);
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
  editClient(client: any) {
    this.editingClient = { ...client };
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/clients/${this.editingClient._id}`, this.editingClient)
      .subscribe(() => {
        this.loadClients();
        this.editingClient = null;
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
}
