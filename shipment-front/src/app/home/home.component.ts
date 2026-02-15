import { Component, HostListener, OnInit } from '@angular/core';
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
  branchOptions: Array<{ id: string; name: string; label: string }> = [];
  selectedoriginLocId: string = localStorage.getItem('originLocId') || '';
  selectedBranchName: string = localStorage.getItem('branch') || '';
  showLogoutModal = false;

  constructor(private http: HttpClient, private branchService: BranchService) {}

  ngOnInit() {
    if (this.isAdmin && this.username) {
      this.http.get<any[]>(`/api/branches/by-user/${this.username}`)
        .subscribe(data => {
          const options = (data || [])
            .map((b: any) => ({
              id: String(b?._id || ''),
              name: String(b?.branchName || ''),
              label: this.getBranchOptionLabel(b)
            }))
            .filter((b: any) => b.name);
          this.branchOptions = [
            { id: 'all', name: 'All Branches', label: 'All Branches' },
            { id: 'all-hubs', name: 'All Hubs', label: 'All Hubs' },
            ...options.filter((b: any) => b.name !== 'All Branches' && b.name !== 'All Hubs')
          ];
          this.syncSelectedBranch();
          this.enrichBranchOptionLabels();
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
          name: String(name || ''),
          label: String(name || '')
        }));
        this.branchOptions = [
          { id: 'all', name: 'All Branches', label: 'All Branches' },
          { id: 'all-hubs', name: 'All Hubs', label: 'All Hubs' },
          ...options.filter((b: any) => b.name && b.name !== 'All Branches' && b.name !== 'All Hubs')
        ];
      } else if (Array.isArray(storedNames)) {
        const options = storedNames.map((name: string) => ({
          id: String(name || ''),
          name: String(name || ''),
          label: String(name || '')
        }));
        this.branchOptions = [
          { id: 'all', name: 'All Branches', label: 'All Branches' },
          { id: 'all-hubs', name: 'All Hubs', label: 'All Hubs' },
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
    this.enrichBranchOptionLabels();
  }

  toggleMenu(menu: string) {
    const wasOpen =
      (menu === 'shipments' && this.showShipments) ||
      (menu === 'admin' && this.showAdmin) ||
      (menu === 'settings' && this.showSettings) ||
      (menu === 'profile' && this.showProfile);

    this.closeMenus();

    if (wasOpen) return;

    if (menu === 'shipments') this.showShipments = true;
    if (menu === 'admin' && this.isAdmin) this.showAdmin = true;
    if (menu === 'settings') this.showSettings = true;
    if (menu === 'profile') this.showProfile = true;
  }

  closeMenus() {
    this.showShipments = false;
    this.showAdmin = false;
    this.showSettings = false;
    this.showProfile = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.submenu')) return;
    if (target.closest('.dropdown-toggle')) return;
    this.closeMenus();
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
      const match = this.branchOptions.find(
        (b) => b.name === this.selectedBranchName || b.label === this.selectedBranchName
      );
      if (match) {
        this.selectedoriginLocId = match.id;
        this.selectedBranchName = match.name;
        return;
      }
    }
    this.selectedoriginLocId = this.branchOptions[0].id;
    this.selectedBranchName = this.branchOptions[0].name;
  }

  private getBranchOptionLabel(branch: any): string {
    const prefix = String(branch?.prefix || '').trim();
    if (prefix) return prefix;
    return String(branch?.branchName || '').trim();
  }

  private enrichBranchOptionLabels() {
    if (!this.branchOptions.length) return;

    this.http.get<any[]>(`/api/branches`).subscribe({
      next: (branches) => {
        const byId = new Map(
          (branches || []).map((b: any) => [String(b?._id || ''), this.getBranchOptionLabel(b)])
        );
        const byName = new Map(
          (branches || []).map((b: any) => [
            String(b?.branchName || '').trim().toLowerCase(),
            this.getBranchOptionLabel(b)
          ])
        );

        this.branchOptions = (this.branchOptions || []).map((option) => {
          if (option.id === 'all' || option.id === 'all-hubs') {
            return option;
          }
          const idLabel = byId.get(option.id);
          const nameLabel = byName.get(String(option.name || '').trim().toLowerCase());
          const label = idLabel || nameLabel || option.label || option.name;
          return { ...option, label };
        });
      },
      error: () => {
        // Keep existing labels if branch metadata can't be loaded.
      }
    });
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
    this.http.post('/api/auth/logout', {}).subscribe({
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


