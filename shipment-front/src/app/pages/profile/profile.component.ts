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
    address: '',
    company: '',
    mobile: '',
    email: '',
    role: '',
    photo: '',        // base64 string for image
    businessType: '', // new field for type of business
    username: localStorage.getItem('username') // optional, if you track login
  };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    const email = localStorage.getItem('email'); // set during login
    this.http.get<any>(`http://localhost:3000/api/users/profile?email=${email}`)
      .subscribe({
        next: (data) => {
          console.log("Profile loaded:", data);
          if (data) {
            this.profile = data;
          }
        },
        error: (err) => console.error("Error loading profile:", err)
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
    this.http.post('http://localhost:3000/api/users/save', this.profile, {
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
    // Optionally call backend to clear/reset profile
    console.log('Profile cleared locally. Consider adding API call to delete/reset.');
  }
}
