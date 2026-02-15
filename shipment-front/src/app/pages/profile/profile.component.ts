import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  profile: any = {
  name: '',
  photo: '',
  address: '',
  company: '',
  mobile: '',
  email: '',
  role: '',
  businessType: '',
  pricePerNumber: 0,
  pricePerKg: 0,
  pricePerArea: 0,
  invoiceSerialScope: 'company'
};

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProfile();
  }

  isAdmin(): boolean {
    const role = String(this.profile?.role || localStorage.getItem('role') || '').toLowerCase();
    return role === 'admin';
  }

  loadProfile() {
    const email = localStorage.getItem('email'); // set during login
    const username = localStorage.getItem('username'); // set during login
    this.http.get<any>(`/api/profile?user=${username}&email=${email}`)
    .subscribe({
      next: (data) => {
        
        this.profile = data[0] || this.profile;
        const serialScope = String(this.profile?.invoiceSerialScope || '').trim().toLowerCase();
        this.profile.invoiceSerialScope = serialScope === 'branch' ? 'branch' : 'company';
        if (this.profile?.businessType) {
          localStorage.setItem('companyType', String(this.profile.businessType));
        }
      },
      error: (err) => console.error("Error loading products:", err)
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.profile.photo = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  saveProfile() {
    const email = this.profile?.email || localStorage.getItem('email') || '';
    const username = this.profile?.username || localStorage.getItem('username') || '';
    const payload = {
      ...this.profile,
      email,
      username
    };
    this.http.post('/api/profile/save', payload, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        if (res) {
          this.profile = res;
        }
        if (this.profile?.businessType) {
          localStorage.setItem('companyType', String(this.profile.businessType));
        }
        this.loadProfile();
      },
      error: (err) => {
        console.error("Error saving profile:", err);
        alert('Error: ' + err.error.message);
      }
    });
  }
  backfillBusinessType() {
    const ok = window.confirm('Backfill business type for all profiles?');
    if (!ok) return;
    this.http.post('/api/profile/migrateBusinessType', {}).subscribe({
      next: (res) => {
        alert('Business type backfilled for profiles.');
        this.loadProfile();
      },
      error: (err) => {
        console.error('Error backfilling businessType:', err);
        alert('Error: ' + (err.error?.message || 'Backfill failed'));
      }
    });
  }

  clearProfile() {
    this.profile = { 
      name: '', 
      address: '', 
      company: '', 
      mobile: '', 
      //email: localStorage.getItem('email')|| '', 
      role: '', 
      photo: '', 
      businessType: '',
      invoiceSerialScope: 'company'
      //username: localStorage.getItem('username')
    };
  }
}

