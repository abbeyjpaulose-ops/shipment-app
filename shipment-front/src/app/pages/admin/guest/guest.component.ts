import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-guest',
  standalone: true,
  imports: [CommonModule, FormsModule],  // 👈 add here
  templateUrl: './guest.component.html',
  styleUrls: ['./guest.component.css']
})
export class GuestsComponent implements OnInit {
  guests: any[] = [];
  newGuest: any = {
    guestName: '',
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
  editingGuest: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadGuests();
  }

  loadGuests() {
    const email = localStorage.getItem('email'); // set during login
    this.http.get<any[]>(`http://localhost:3000/api/guests?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Guests loaded:", data); // 👈 log to browser console
        this.guests = data;
      },
      error: (err) => console.error("Error loading guests:", err)
    });
}


  addGuest() {
    console.log('📤 Sending guest data:');
    this.http.post('http://localhost:3000/api/guests/add', this.newGuest, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Guest saved', res);
        alert('Guest added successfully!');
      },
      error: (err) => {
        console.error('❌ Error saving guest:', err);
        alert('Error12: ' + err.message);
      }
    });
  }

  editGuest(guest: any) {
    this.editingGuest = { ...guest };
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/guests/${this.editingGuest._id}`, this.editingGuest)
      .subscribe(() => {
        this.loadGuests();
        this.editingGuest = null;
      });
  }

  toggleStatus(guest: any) {
    this.http.patch(`http://localhost:3000/api/guests/${guest._id}/status`, {})
      .subscribe(() => this.loadGuests());
  }
}
