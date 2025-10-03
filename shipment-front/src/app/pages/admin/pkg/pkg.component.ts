import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-pkg',
  standalone: true,
  imports: [CommonModule, FormsModule],  // 👈 add here
  templateUrl: './pkg.component.html',
  styleUrls: ['./pkg.component.css']
})
export class PkgComponent implements OnInit {
  pkgs: any[] = [];
  newPkg: any = {
    pkgName: '',
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingPkg: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPkgs();
  }

  loadPkgs() {
    const email = localStorage.getItem('email'); // set during login
    this.http.get<any[]>(`http://localhost:3000/api/pkgs?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Packages loaded:", data); // 👈 log to browser console
        this.pkgs = data;
      },
      error: (err) => console.error("Error loading pkgs:", err)
    });
}

  addPkg() {
    console.log('📤 Sending pkg data:');
    this.http.post('http://localhost:3000/api/pkgs/add', this.newPkg, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Package type saved', res);
        alert('Package type added successfully!');
        window.location.reload();
      },
      error: (err) => {
        console.error('❌ Error saving pkg:', err);
        alert('Error12: ' + err.error.message);
      }
    });
  }

  editPkg(pkg: any) {
    this.editingPkg = { ...pkg };
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/pkgs/${this.editingPkg._id}`, this.editingPkg)
      .subscribe(() => {
        this.loadPkgs();
        this.editingPkg = null;
      });
  }

  toggleStatus(pkg: any) {
    this.http.patch(`http://localhost:3000/api/pkgs/${pkg._id}/status`, {})
      .subscribe(() => this.loadPkgs());
  }
}
