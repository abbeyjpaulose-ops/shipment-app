import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgIf, NgFor, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  username: string | null = localStorage.getItem('username');
  email: string | null = localStorage.getItem('email');

  // Dropdown states
  showShipments = false;
  showAdmin = false;
  showSettings = false;
  showProfile = false;

  // Branch data
  branches: any[] = [];
  selectedBranch: string = localStorage.getItem('selectedBranch') || 'All Branches';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    if (this.username && this.email) {
      this.http.get<any[]>(`http://localhost:3000/api/branches/by-user/${this.username}?email=${this.email}`)
        .subscribe(data => {
          this.branches = data;
        });
    }
  }

  toggleMenu(menu: string) {
    if (menu === 'shipments') this.showShipments = !this.showShipments;
    if (menu === 'admin') this.showAdmin = !this.showAdmin;
    if (menu === 'settings') this.showSettings = !this.showSettings;
    if (menu === 'profile') this.showProfile = !this.showProfile;
  }

  onBranchChange(event: any) {
    const branch = event.target.value;
    this.selectedBranch = branch;
    localStorage.setItem('branch', branch);
  }
}
