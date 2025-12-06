import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-client',
  standalone: true,
  imports: [CommonModule, FormsModule],  // 👈 add here
  templateUrl: './client.component.html',
  styleUrls: ['./client.component.css']
})
export class ClientComponent implements OnInit {
  clients: any[] = [];
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
    status: 'active',
    branch: localStorage.getItem('branch') || 'All Branches',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingClient: any = null;

  constructor(private http: HttpClient) {}
  cbranch: string = 'All Branches';
  ngOnInit() {
    this.loadClients();
  }

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

  loadClients() {
    const email = localStorage.getItem('email'); // set during login
    this.cbranch = localStorage.getItem('branch') || 'All Branches';
    this.http.get<any[]>(`http://localhost:3000/api/clients?email=${email}&branch=${this.cbranch}
`)
    .subscribe({
      next: (data) => {
        console.log("Clients loaded:", data); // 👈 log to browser console
        this.clients = data;
      },
      error: (err) => console.error("Error loading clients:", err)
    });
}

showAddClientPopup = false;

openAddClientPopup() {
  this.showAddClientPopup = true;
}

closeAddClientPopup() {
  this.showAddClientPopup = false;
}


  addClient() {
    console.log('📤 Sending client data:');
    const email = localStorage.getItem('email'); // set during login
    this.newClient.branch = localStorage.getItem('branch') || 'All Branches';

    if (this.newClient.branch !== 'All Branches') {
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
    } else {
      alert('Please select a specific branch before adding a client.');
    }
  }

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

  toggleCreditType(client: any) {
  this.http.patch(`http://localhost:3000/api/clients/${client._id}/credit`, {})
    .subscribe(() => this.loadClients());
    console.log('TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTToggled credit type for client:', client._id);
}


  toggleStatus(client: any) {
    this.http.patch(`http://localhost:3000/api/clients/${client._id}/status`, {})
      .subscribe(() => this.loadClients());
  }
}
