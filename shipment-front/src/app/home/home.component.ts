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
  role: string | null = localStorage.getItem('role');
  isAdmin = String(localStorage.getItem('role') || '').toLowerCase() === 'admin';

  // Dropdown states
  showShipments = false;
  showAdmin = false;
  showSettings = false;
  showProfile = false;

  // Branch data
  branchOptions: string[] = [];
  selectedBranch: string = localStorage.getItem('branch') || '';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    if (this.isAdmin && this.username) {
      this.http.get<any[]>(`http://localhost:3000/api/branches/by-user/${this.username}`)
        .subscribe(data => {
          const names = (data || []).map((b: any) => b.branchName).filter(Boolean);
          this.branchOptions = names;
        });
      if (!this.selectedBranch) {
        this.selectedBranch = 'All Branches';
        localStorage.setItem('branch', this.selectedBranch);
      }
      return;
    }

    // Non-admin: use branches assigned in Profile (stored at login).
    try {
      const stored = JSON.parse(localStorage.getItem('branches') || '[]');
      if (Array.isArray(stored)) this.branchOptions = stored;
    } catch {
      this.branchOptions = [];
    }

    if (!this.selectedBranch && this.branchOptions.length) {
      this.selectedBranch = this.branchOptions[0];
      localStorage.setItem('branch', this.selectedBranch);
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
    //reload for the view shipments to reflect branch change
    const currentUrl = window.location.href;
    if (currentUrl.includes("/shipments")) {
      window.location.reload();
    }
  }
}
