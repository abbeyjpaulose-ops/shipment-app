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
  pricePerArea: 0
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
    this.http.get<any>(`http://localhost:3000/api/profile?user=${username}&email=${email}`)
    .subscribe({
      next: (data) => {
        
        this.profile = data[0] || this.profile;
        if (this.profile?.businessType) {
          localStorage.setItem('companyType', String(this.profile.businessType));
        }
        console.log("Profile loaded:", this.profile);
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
    console.log("Sending profile data:", payload);
    this.http.post('http://localhost:3000/api/profile/save', payload, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log("Profile saved", res);
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
    this.http.post('http://localhost:3000/api/profile/migrateBusinessType', {}).subscribe({
      next: (res) => {
        console.log('Profile businessType backfilled', res);
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
      //username: localStorage.getItem('username')
    };
    console.log('Profile cleared locally.');
  }
}
