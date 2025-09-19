import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';   // 👈 import this

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],  // 👈 add here
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css']
})
export class HubComponent implements OnInit {
  hubs: any[] = [];
  newHub: any = {
    hubName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    GSTIN: '',
    perRev: '',
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingHub: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadHubs();
  }

  loadHubs() {
    const email = localStorage.getItem('email'); // set during login
    this.http.get<any[]>(`http://localhost:3000/api/hubs?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Hubs loaded:", data); // 👈 log to browser console
        this.hubs = data;
      },
      error: (err) => console.error("Error loading hubs:", err)
    });
}

  addHub() {
    this.http.post('http://localhost:3000/api/hubs/add', this.newHub, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Hub saved', res);
        alert('Hub added successfully!');
      },
      error: (err) => {
        console.error('❌ Error saving hub:', err);
        alert('Error12: ' + err.message);
      }
    });
  }

  editHub(hub: any) {
    this.editingHub = { ...hub };
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/hubs/${this.editingHub._id}`, this.editingHub)
      .subscribe(() => {
        this.loadHubs();
        this.editingHub = null;
      });
  }

  toggleStatus(hub: any) {
    this.http.patch(`http://localhost:3000/api/hubs/${hub._id}/status`, {})
      .subscribe(() => this.loadHubs());
  }
}
