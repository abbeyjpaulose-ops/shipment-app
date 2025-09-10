import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],  // 👈 Both required
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email: string = '';
  password: string = '';

  login() {
    if (this.email === 'admin@example.com' && this.password === 'admin') {
      window.location.href = '/home';
    } else {
      alert('Invalid credentials');
    }
  }
}
