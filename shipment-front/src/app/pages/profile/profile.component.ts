import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  profile: any = {
    name: '',
    address: '',
    company: '',
    mobile: '',
    email: '',
    role: '',
    photo: '',
    businessType: '',
    username: localStorage.getItem('username')
  };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    const email = localStorage.getItem('email'); // set during login
    const username = localStorage.getItem('username'); // set during login
    this.http.get<any>(`http://localhost:3000/api/profile?user=${username}&email=${email}`)
    .subscribe({
      next: (data) => {
        
        this.profile = data[0] || this.profile;
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
    console.log('📤 Sending profile data:', this.profile);
    this.http.post('http://localhost:3000/api/profile/save', this.profile, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Profile saved', res);
        alert('Profile saved successfully!');
      },
      error: (err) => {
        console.error('❌ Error saving profile:', err);
        alert('Error: ' + err.error.message);
      }
    });
  }

  clearProfile() {
    this.profile = { 
      name: '', 
      address: '', 
      company: '', 
      mobile: '', 
      email: '', 
      role: '', 
      photo: '', 
      businessType: '', 
      username: localStorage.getItem('username')
    };
    console.log('Profile cleared locally.');
  }
}
