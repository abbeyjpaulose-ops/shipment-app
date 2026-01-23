import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-branch',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch.component.html',
  styleUrls: ['./branch.component.css']
})
export class BranchComponent implements OnInit {
  branches: any[] = [];
  hubs: any[] = [];
  showAddBranchPopup = false;
  showEditBranchPopup = false;
  private lastHeadingBranchName = '';

  newBranch: any = {
    branchName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNum: '',
    vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: '' }],
    status: 'active'
  };

  editingBranch: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    localStorage.setItem('branch', 'All Branches');
    this.loadBranches();
    this.loadHubs();
  }

  // Load Branches
  loadBranches() {
    this.http.get<any[]>(`http://localhost:3000/api/branches`).subscribe({
      next: (data) => {
        this.branches = data;
      },
      error: (err) => console.error('Error loading branches:', err)
    });
  }

  loadHubs() {
    this.http.get<any[]>(`http://localhost:3000/api/hubs`).subscribe({
      next: (data) => {
        this.hubs = data;
      },
      error: (err) => console.error('Error loading hubs:', err)
    });
  }

  openAddBranchPopup() {
    this.showAddBranchPopup = true;
  }

  closeAddBranchPopup() {
    this.showAddBranchPopup = false;
  }

  closeEditBranchPopup() {
    this.showEditBranchPopup = false;
    this.editingBranch = null;
  }

  // Add Vehicle in Add Form
  addVehicle() {
    const headingBranch = String(this.newBranch.branchName || '').trim();
    this.newBranch.vehicles.push({
      vehicleNo: '',
      driverPhone: '',
      vehicleStatus: 'online',
      currentBranch: headingBranch
    });
  }

  // Remove Vehicle in Add Form
  removeVehicle(index: number) {
    this.newBranch.vehicles.splice(index, 1);
  }

  // Add Vehicle while Editing
  addVehicleEdit() {
    this.editingBranch.vehicles.push({ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: '' });
  }

  // Remove Vehicle while Editing
  removeVehicleEdit(index: number) {
    this.editingBranch.vehicles.splice(index, 1);
  }

  toggleEditVehicleStatus(vehicle: any) {
    if (!this.editingBranch?._id || !vehicle) return;
    const vehicleNo = String(vehicle?.vehicleNo || '').trim();
    if (!vehicleNo) return;
    const current = String(vehicle?.vehicleStatus || 'online').trim().toLowerCase();
    const nextStatus = current === 'offline' ? 'online' : 'offline';
    this.http.patch(`http://localhost:3000/api/branches/${this.editingBranch._id}/vehicle-status`, {
      vehicleNo,
      vehicleStatus: nextStatus
    }).subscribe({
      next: () => {
        vehicle.vehicleStatus = nextStatus;
        this.loadBranches();
      },
      error: (err) => {
        console.error('Error updating vehicle status:', err);
        alert('Failed to update vehicle status.');
      }
    });
  }

  // Add Branch
  addBranch() {
    if (!this.newBranch.branchName || !this.newBranch.address || !this.newBranch.phoneNum) {
      alert('Branch Name, Address, and Branch Phone are required.');
      return;
    }

    const hasIncompleteVehicle =
      Array.isArray(this.newBranch.vehicles) &&
      this.newBranch.vehicles.some(
        (v: any) => (v?.vehicleNo || v?.driverPhone) && !(v?.vehicleNo && v?.driverPhone)
      );
    if (hasIncompleteVehicle) {
      alert('Each vehicle must have both Vehicle No. and Driver Phone (or leave the row empty).');
      return;
    }

    const vehicles = Array.isArray(this.newBranch.vehicles)
      ? this.newBranch.vehicles.filter((v: any) => v?.vehicleNo && v?.driverPhone)
      : [];

    const payload = {
      branchName: this.newBranch.branchName,
      address: this.newBranch.address,
      city: this.newBranch.city,
      state: this.newBranch.state,
      pinCode: this.newBranch.pinCode,
      phoneNum: this.newBranch.phoneNum,
      vehicles
    };

    this.http
      .post('http://localhost:3000/api/branches/add', payload, {
        headers: { 'Content-Type': 'application/json' }
      })
      .subscribe({
        next: () => {
          alert('Branch added successfully!');
          this.loadBranches();
          this.resetNewBranch();
          this.closeAddBranchPopup();
        },
        error: (err) => {
          console.error('Error saving branch:', err);
          alert('Error: ' + (err?.error?.message || err?.message || 'Bad Request'));
        }
      });
  }

  handleHeadingBranchChange(): void {
    const current = String(this.newBranch.branchName || '').trim();
    const previous = String(this.lastHeadingBranchName || '').trim();
    if (!Array.isArray(this.newBranch.vehicles)) {
      this.lastHeadingBranchName = current;
      return;
    }
    this.newBranch.vehicles.forEach((v: any) => {
      const currentBranch = String(v?.currentBranch || '').trim();
      const matchesPrevious =
        previous && currentBranch.toLowerCase() === previous.toLowerCase();
      if (!currentBranch || matchesPrevious) {
        v.currentBranch = current;
      }
    });
    this.lastHeadingBranchName = current;
  }

  getAddBranchOptions(): string[] {
    const options: string[] = [];
    const heading = String(this.newBranch.branchName || '').trim();
    if (heading) {
      options.push(heading);
    }
    (this.branches || []).forEach((branch: any) => {
      const name = String(branch?.branchName || '').trim();
      if (!name) return;
      const exists = options.some((option) => option.toLowerCase() === name.toLowerCase());
      if (!exists) {
        options.push(name);
      }
    });
    return options;
  }

  getEditBranchOptions(currentValue: any): string[] {
    const options: string[] = [];
    const current = String(currentValue || '').trim();
    if (current) {
      options.push(current);
    }
    const heading = String(this.editingBranch?.branchName || '').trim();
    if (heading) {
      const exists = options.some((option) => option.toLowerCase() === heading.toLowerCase());
      if (!exists) {
        options.push(heading);
      }
    }
    const editingBranchId = this.normalizeId(this.editingBranch?._id);
    (this.hubs || []).forEach((hub: any) => {
      if (!editingBranchId) return;
      const hubBranchId = this.normalizeId(hub?.branchId);
      if (!hubBranchId || hubBranchId !== editingBranchId) return;
      const name = String(hub?.hubName || '').trim();
      if (!name) return;
      const exists = options.some((option) => option.toLowerCase() === name.toLowerCase());
      if (!exists) {
        options.push(name);
      }
    });
    (this.branches || []).forEach((branch: any) => {
      const name = String(branch?.branchName || '').trim();
      if (!name) return;
      const exists = options.some((option) => option.toLowerCase() === name.toLowerCase());
      if (!exists) {
        options.push(name);
      }
    });
    return options;
  }

  private normalizeId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }

  // Reset Form
  resetNewBranch() {
    this.newBranch = {
      branchName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      phoneNum: '',
      vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: '' }],
      status: 'active'
    };
    this.lastHeadingBranchName = '';
  }

  // Edit Branch Mode
  editBranch(branch: any) {
    this.editingBranch = JSON.parse(JSON.stringify(branch)); // deep copy to avoid UI distortions
    this.showEditBranchPopup = true;
  }

  // Save Edited Branch
  saveEdit() {
    this.http.put(`http://localhost:3000/api/branches/${this.editingBranch._id}`, this.editingBranch).subscribe({
      next: () => {
        alert('Branch updated successfully!');
        this.closeEditBranchPopup();
        this.loadBranches();
      },
      error: (err) => {
        console.error('Error updating branch:', err);
        alert('Error: ' + (err?.error?.message || err?.message || 'Bad Request'));
      }
    });
  }

  // Toggle Status Active / Inactive
  toggleStatus(branch: any) {
    this.http.patch(`http://localhost:3000/api/branches/${branch._id}/status`, {}).subscribe(() => {
      this.loadBranches();
    });
  }

  getBranchAddress(branch: any): string {
    const parts = [branch?.address, branch?.city, branch?.state, branch?.pinCode].filter(Boolean);
    if (parts.length) {
      return parts.join(', ');
    }
    const firstAddress = Array.isArray(branch?.addresses) ? branch.addresses[0] : null;
    const fallback = [firstAddress?.address, firstAddress?.city, firstAddress?.state, firstAddress?.pinCode]
      .filter(Boolean);
    return fallback.join(', ');
  }
}
