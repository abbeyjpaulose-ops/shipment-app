import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-hubs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hubs.component.html',
  styleUrls: ['./hubs.component.css']
})
export class HubsComponent implements OnInit {
  hubs: any[] = [];
  newHub: any = { companyName: '', address: '', city: '', state: '', pincode: '', gstin: '', perRev: '', status: 'active' };

  username = localStorage.getItem('username');
  email = localStorage.getItem('usernameEmail');
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
    const hubData = { ...this.newHub, username: this.username, email: this.email };
    this.http.post('http://localhost:3000/api/hubs/add', hubData)
      .subscribe({
        next: () => {
          this.newHub = { companyName: '', address: '', city: '', state: '', pincode: '', gstin: '', perRev: '', status: 'active' };
          this.loadHubs();
        },
        error: err => alert(err.error.message || 'Error adding hub')
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
    this.http.patch(`http://localhost:3000/api/hubs/status/${hub._id}`, {})
      .subscribe(() => this.loadHubs());
  }
}

  