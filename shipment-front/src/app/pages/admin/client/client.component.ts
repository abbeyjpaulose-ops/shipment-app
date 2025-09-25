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
    perDis: '',
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingClient: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadClients();
  }

  loadClients() {
    const email = localStorage.getItem('email'); // set during login
    this.http.get<any[]>(`http://localhost:3000/api/clients?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Clients loaded:", data); // 👈 log to browser console
        this.clients = data;
      },
      error: (err) => console.error("Error loading clients:", err)
    });
}

  addClient() {
    console.log('📤 Sending client data:');
    this.http.post('http://localhost:3000/api/clients/add', this.newClient, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Client saved', res);
        alert('Client added successfully!');
      },
      error: (err) => {
        console.error('❌ Error saving client:', err);
        alert('Error: ' + err.error.message);
      }
    });
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

  toggleStatus(client: any) {
    this.http.patch(`http://localhost:3000/api/clients/${client._id}/status`, {})
      .subscribe(() => this.loadClients());
  }
}
