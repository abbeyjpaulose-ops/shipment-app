import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BranchService } from '../services/branch.service';

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
  branchOptions: Array<{ id: string; name: string }> = [];
  selectedBranchId: string = localStorage.getItem('branchId') || '';
  selectedBranchName: string = localStorage.getItem('branch') || '';
  showLogoutModal = false;

  constructor(private http: HttpClient, private branchService: BranchService) {}

  ngOnInit() {
    if (this.isAdmin && this.username) {
      this.http.get<any[]>(`http://localhost:3000/api/branches/by-user/${this.username}`)
        .subscribe(data => {
          const options = (data || [])
            .map((b: any) => ({ id: String(b?._id || ''), name: String(b?.branchName || '') }))
            .filter((b: any) => b.name);
          this.branchOptions = options;
          this.syncSelectedBranch();
        });
      if (!this.selectedBranchName) {
        this.selectedBranchName = 'All Branches';
        this.selectedBranchId = 'all';
        localStorage.setItem('branch', this.selectedBranchName);
        localStorage.setItem('branchId', this.selectedBranchId);
      }
      this.branchService.setBranch(this.selectedBranchName);
      return;
    }

    // Non-admin: use branches assigned in Profile (stored at login).
    try {
      const storedNames = JSON.parse(localStorage.getItem('branches') || '[]');
      const storedIds = JSON.parse(localStorage.getItem('branchIds') || '[]');
      if (Array.isArray(storedNames) && Array.isArray(storedIds) && storedNames.length === storedIds.length) {
        const options = storedNames.map((name: string, index: number) => ({
          id: String(storedIds[index] || ''),
          name: String(name || '')
        }));
        this.branchOptions = [
          { id: 'all', name: 'All Branches' },
          ...options.filter((b: any) => b.name && b.name !== 'All Branches')
        ];
      } else if (Array.isArray(storedNames)) {
        const options = storedNames.map((name: string) => ({
          id: String(name || ''),
          name: String(name || '')
        }));
        this.branchOptions = [
          { id: 'all', name: 'All Branches' },
          ...options.filter((b: any) => b.name && b.name !== 'All Branches')
        ];
      }
    } catch {
      this.branchOptions = [];
    }

    this.syncSelectedBranch();
    if (!this.selectedBranchName && this.branchOptions.length) {
      this.selectedBranchId = this.branchOptions[0].id;
      this.selectedBranchName = this.branchOptions[0].name;
      localStorage.setItem('branch', this.selectedBranchName);
      localStorage.setItem('branchId', this.selectedBranchId);
    }
  }

  toggleMenu(menu: string) {
    if (menu === 'shipments') this.showShipments = !this.showShipments;
    if (menu === 'admin' && this.isAdmin) this.showAdmin = !this.showAdmin;
    if (menu === 'settings') this.showSettings = !this.showSettings;
    if (menu === 'profile') this.showProfile = !this.showProfile;
  }

  private syncSelectedBranch() {
    if (!this.branchOptions.length) return;
    if (this.selectedBranchId === 'all' || this.selectedBranchName === 'All Branches') {
      this.selectedBranchId = 'all';
      this.selectedBranchName = 'All Branches';
      return;
    }
    if (this.selectedBranchId) {
      const match = this.branchOptions.find((b) => b.id === this.selectedBranchId);
      if (match) {
        this.selectedBranchName = match.name;
        return;
      }
    }
    if (this.selectedBranchName) {
      const match = this.branchOptions.find((b) => b.name === this.selectedBranchName);
      if (match) {
        this.selectedBranchId = match.id;
        return;
      }
    }
    this.selectedBranchId = this.branchOptions[0].id;
    this.selectedBranchName = this.branchOptions[0].name;
  }

  onBranchChange(event: any) {
    const branchId = String(event.target.value || '');
    const isAll = branchId === 'all';
    const match = this.branchOptions.find((b) => b.id === branchId);
    const branchName = isAll ? 'All Branches' : (match?.name || branchId);
    this.selectedBranchId = branchId;
    this.selectedBranchName = branchName;
    localStorage.setItem('branch', branchName);
    localStorage.setItem('branchId', branchId);
    this.branchService.setBranch(branchName);
    //reload for the view shipments to reflect branch change
    const currentUrl = window.location.href;
    if (currentUrl.includes("/shipments")) {
      window.location.reload();
    }
  }

  openLogoutModal() {
    this.showLogoutModal = true;
  }

  closeLogoutModal() {
    this.showLogoutModal = false;
  }

  confirmLogout() {
    this.showLogoutModal = false;
    this.performLogout();
  }

  private performLogout() {
    this.http.post('http://localhost:3000/api/auth/logout', {}).subscribe({
      next: () => {
        localStorage.clear();
        window.location.href = '/';
      },
      error: () => {
        localStorage.clear();
        window.location.href = '/';
      }
    });
  }
}

