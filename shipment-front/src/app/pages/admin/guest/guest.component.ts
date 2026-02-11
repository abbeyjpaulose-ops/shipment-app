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
  showAddGuestPopup = false;
  showEditGuestPopup = false;
  showGuestDetailsPopup = false;
  selectedGuest: any | null = null;
  newGuest: any = {
    guestName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNum: '',
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

  openAddGuestPopup() {
    this.showAddGuestPopup = true;
  }

  closeAddGuestPopup() {
    this.showAddGuestPopup = false;
  }

  addGuest() {
    console.log('📤 Sending guest data:');
    this.http.post('http://localhost:3000/api/guests/add', this.newGuest, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Guest saved', res);
        alert('Guest added successfully!');
        this.closeAddGuestPopup();
        this.resetNewGuest();
        this.loadGuests();
      },
      error: (err) => {
        console.error('❌ Error saving guest:', err);
        alert('Error12: ' + err.error.message);
      }
    });
  }

  editGuest(guest: any) {
    this.openEditGuestPopup(guest);
  }

  openEditGuestPopup(guest: any) {
    this.editingGuest = { ...guest };
    this.showEditGuestPopup = true;
  }

  closeEditGuestPopup() {
    this.showEditGuestPopup = false;
    this.editingGuest = null;
  }

  saveEdit() {
    if (!this.editingGuest?._id) return;
    this.http.put(`http://localhost:3000/api/guests/${this.editingGuest._id}`, this.editingGuest)
      .subscribe(() => {
        this.loadGuests();
        this.closeEditGuestPopup();
      });
  }

  toggleStatus(guest: any) {
    this.http.patch(`http://localhost:3000/api/guests/${guest._id}/status`, {})
      .subscribe(() => this.loadGuests());
  }

  openGuestDetailsPopup(guest: any) {
    this.selectedGuest = guest;
    this.showGuestDetailsPopup = true;
  }

  closeGuestDetailsPopup() {
    this.showGuestDetailsPopup = false;
    this.selectedGuest = null;
  }

  editGuestFromDetails() {
    if (!this.selectedGuest) return;
    this.openEditGuestPopup(this.selectedGuest);
    this.closeGuestDetailsPopup();
  }

  getGuestAddress(guest: any): string {
    const address = String(guest?.address || '').trim();
    const city = String(guest?.city || '').trim();
    const state = String(guest?.state || '').trim();
    const pin = String(guest?.pinCode || '').trim();
    const parts = [address, city, state, pin].filter(Boolean);
    return parts.length ? parts.join(', ') : '-';
  }

  private resetNewGuest() {
    this.newGuest = {
      guestName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      phoneNum: '',
      perDis: '',
      status: 'active',
      email: localStorage.getItem('email'),
      username: localStorage.getItem('username')
    };
  }
}
