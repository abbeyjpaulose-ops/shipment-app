import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent {
  profile = {
    name: '',
    address: '',
    company: '',
    mobile: '',
    email: '',
    role: '',
    photo: '' // base64 string for image
  };

  constructor() {
    // Load profile if already saved
    const savedProfile = localStorage.getItem('user_profile');
    if (savedProfile) {
      this.profile = JSON.parse(savedProfile);
    }
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
    localStorage.setItem('user_profile', JSON.stringify(this.profile));
    alert('Profile saved successfully!');
  }

  clearProfile() {
    this.profile = { name: '', address: '', company: '', mobile: '', email: '', role: '', photo: '' };
    localStorage.removeItem('user_profile');
  }
}
