import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule], // ✅ Removed HttpClientModule
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';

  constructor(private http: HttpClient) {}

  login() {
    this.http.post('http://localhost:3000/api/auth/login', {
      username: this.username,
      password: this.password
    }).subscribe({
      next: (res: any) => {
        localStorage.setItem('username', res.username);
        localStorage.setItem('email', res.email);
        localStorage.setItem('branch', 'All Branches');

        this.http.get<any>(`http://localhost:3000/api/profile?user=${username}&email=${email}`)
   
        .subscribe({
    
          next: (data) => {
         
            localStorage.setItem('companyType', data[0].CompanyType || '');
             
          },
    
          error: (err) => console.error("Error loading products:", err)
   
        });
        

        this.http.get<any[]>(`http://localhost:3000/api/branches/by-user/${res.username}?email=${res.email}`)
          .subscribe(branches => {
            
            if (branches.length === 0) {
              window.location.href = '/home/Branches';
            } else {
              window.location.href = '/home/dashboard';
            }
          }); 
      },
      error: (err) => {
        console.error(err);
        alert('Invalid credentials');
      }
    });
  }
}
