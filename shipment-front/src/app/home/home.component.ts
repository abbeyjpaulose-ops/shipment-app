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
  selectedoriginLocId: string = localStorage.getItem('originLocId') || '';
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
          this.branchOptions = [
            { id: 'all', name: 'All Branches' },
            { id: 'all-hubs', name: 'All Hubs' },
            ...options.filter((b: any) => b.name !== 'All Branches' && b.name !== 'All Hubs')
          ];
          this.syncSelectedBranch();
        });
      if (!this.selectedBranchName) {
        this.selectedBranchName = 'All Branches';
        this.selectedoriginLocId = 'all';
        localStorage.setItem('branch', this.selectedBranchName);
        localStorage.setItem('originLocId', this.selectedoriginLocId);
      }
      this.branchService.setBranch(this.selectedBranchName);
      return;
    }

    // Non-admin: use branches assigned in Profile (stored at login).
    try {
      const storedNames = JSON.parse(localStorage.getItem('branches') || '[]');
      const storedIds = JSON.parse(localStorage.getItem('originLocIds') || '[]');
      if (Array.isArray(storedNames) && Array.isArray(storedIds) && storedNames.length === storedIds.length) {
        const options = storedNames.map((name: string, index: number) => ({
          id: String(storedIds[index] || ''),
          name: String(name || '')
        }));
        this.branchOptions = [
          { id: 'all', name: 'All Branches' },
          { id: 'all-hubs', name: 'All Hubs' },
          ...options.filter((b: any) => b.name && b.name !== 'All Branches' && b.name !== 'All Hubs')
        ];
      } else if (Array.isArray(storedNames)) {
        const options = storedNames.map((name: string) => ({
          id: String(name || ''),
          name: String(name || '')
        }));
        this.branchOptions = [
          { id: 'all', name: 'All Branches' },
          { id: 'all-hubs', name: 'All Hubs' },
          ...options.filter((b: any) => b.name && b.name !== 'All Branches' && b.name !== 'All Hubs')
        ];
      }
    } catch {
      this.branchOptions = [];
    }

    this.syncSelectedBranch();
    if (!this.selectedBranchName && this.branchOptions.length) {
      this.selectedoriginLocId = this.branchOptions[0].id;
      this.selectedBranchName = this.branchOptions[0].name;
      localStorage.setItem('branch', this.selectedBranchName);
      localStorage.setItem('originLocId', this.selectedoriginLocId);
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
    if (this.selectedoriginLocId === 'all-hubs' || this.selectedBranchName === 'All Hubs') {
      this.selectedoriginLocId = 'all-hubs';
      this.selectedBranchName = 'All Hubs';
      return;
    }
    if (this.selectedoriginLocId === 'all' || this.selectedBranchName === 'All Branches') {
      this.selectedoriginLocId = 'all';
      this.selectedBranchName = 'All Branches';
      return;
    }
    if (this.selectedoriginLocId) {
      const match = this.branchOptions.find((b) => b.id === this.selectedoriginLocId);
      if (match) {
        this.selectedBranchName = match.name;
        return;
      }
    }
    if (this.selectedBranchName) {
      const match = this.branchOptions.find((b) => b.name === this.selectedBranchName);
      if (match) {
        this.selectedoriginLocId = match.id;
        return;
      }
    }
    this.selectedoriginLocId = this.branchOptions[0].id;
    this.selectedBranchName = this.branchOptions[0].name;
  }

  onBranchChange(event: any) {
    const originLocId = String(event.target.value || '');
    const isAll = originLocId === 'all';
    const isAllHubs = originLocId === 'all-hubs';
    const match = this.branchOptions.find((b) => b.id === originLocId);
    const branchName = isAll
      ? 'All Branches'
      : (isAllHubs ? 'All Hubs' : (match?.name || originLocId));
    this.selectedoriginLocId = originLocId;
    this.selectedBranchName = branchName;
    localStorage.setItem('branch', branchName);
    localStorage.setItem('originLocId', originLocId);
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

