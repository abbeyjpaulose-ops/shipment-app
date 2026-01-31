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
    vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: '' }],
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
    this.newBranch.vehicles.push({
      vehicleNo: '',
      driverPhone: '',
      vehicleStatus: 'online',
      currentLocationId: ''
    });
  }

  // Remove Vehicle in Add Form
  removeVehicle(index: number) {
    this.newBranch.vehicles.splice(index, 1);
  }

  // Add Vehicle while Editing
  addVehicleEdit() {
    this.editingBranch.vehicles.push({ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: '' });
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
      ? this.newBranch.vehicles
          .filter((v: any) => v?.vehicleNo && v?.driverPhone)
          .map((v: any) => ({
            ...v,
            currentLocationId: this.normalizeLocationId(v?.currentLocationId)
          }))
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
      const currentLocationId = String(v?.currentLocationId || '').trim();
      const matchesPrevious =
        previous && this.normalizeId(currentLocationId) === this.normalizeLocationId(previous);
      if (!currentLocationId || matchesPrevious) {
        v.currentLocationId = this.normalizeLocationId(current);
      }
    });
    this.lastHeadingBranchName = current;
  }

  getAddBranchOptions(): Array<{ id: string; label: string }> {
    const options: Array<{ id: string; label: string }> = [];
    (this.branches || []).forEach((branch: any) => {
      const id = this.normalizeId(branch?._id);
      const label = String(branch?.branchName || '').trim();
      if (id && label) options.push({ id, label });
    });
    (this.hubs || []).forEach((hub: any) => {
      const id = this.normalizeId(hub?._id);
      const label = String(hub?.hubName || '').trim();
      if (id && label) options.push({ id, label });
    });
    return options;
  }

  getEditBranchOptions(currentValue: any): Array<{ id: string; label: string }> {
    const options: Array<{ id: string; label: string }> = [];
    const currentId = this.normalizeLocationId(String(currentValue || '').trim());
    const currentLabel = this.getCurrentLocationLabel(currentId);
    if (currentId && currentLabel) {
      options.push({ id: currentId, label: currentLabel });
    }
    const editingoriginLocId = this.normalizeId(this.editingBranch?._id);
    (this.hubs || []).forEach((hub: any) => {
      if (!editingoriginLocId) return;
      const huboriginLocId = this.normalizeId(hub?.originLocId);
      if (!huboriginLocId || huboriginLocId !== editingoriginLocId) return;
      const id = this.normalizeId(hub?._id);
      const label = String(hub?.hubName || '').trim();
      if (id && label && !options.some((o) => o.id === id)) {
        options.push({ id, label });
      }
    });
    (this.branches || []).forEach((branch: any) => {
      const id = this.normalizeId(branch?._id);
      const label = String(branch?.branchName || '').trim();
      if (id && label && !options.some((o) => o.id === id)) {
        options.push({ id, label });
      }
    });
    return options;
  }

  private getCurrentLocationLabel(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const branch = (this.branches || []).find((b: any) => this.normalizeId(b?._id) === raw);
    if (branch?.branchName) return branch.branchName;
    const hub = (this.hubs || []).find((h: any) => this.normalizeId(h?._id) === raw);
    if (hub?.hubName) return hub.hubName;
    return raw;
  }

  private normalizeLocationId(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[a-f\d]{24}$/i.test(raw)) return raw;
    const branch = (this.branches || []).find((b: any) =>
      String(b?.branchName || '').trim().toLowerCase() === raw.toLowerCase()
    );
    if (branch?._id) return this.normalizeId(branch._id);
    const hub = (this.hubs || []).find((h: any) =>
      String(h?.hubName || '').trim().toLowerCase() === raw.toLowerCase()
    );
    if (hub?._id) return this.normalizeId(hub._id);
    return '';
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
      vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: '' }],
      status: 'active'
    };
    this.lastHeadingBranchName = '';
  }

  // Edit Branch Mode
  editBranch(branch: any) {
    this.editingBranch = JSON.parse(JSON.stringify(branch)); // deep copy to avoid UI distortions
    if (Array.isArray(this.editingBranch?.vehicles)) {
      this.editingBranch.vehicles.forEach((vehicle: any) => {
        if (!vehicle.currentLocationId && vehicle.currentBranch) {
          vehicle.currentLocationId = this.normalizeLocationId(vehicle.currentBranch);
        }
        delete vehicle.currentBranch;
      });
    }
    this.showEditBranchPopup = true;
  }

  // Save Edited Branch
  saveEdit() {
    const payload = JSON.parse(JSON.stringify(this.editingBranch || {}));
    if (Array.isArray(payload?.vehicles)) {
      payload.vehicles.forEach((vehicle: any) => {
        vehicle.currentLocationId = this.normalizeLocationId(vehicle.currentLocationId);
        delete vehicle.currentBranch;
      });
    }
    this.http.put(`http://localhost:3000/api/branches/${this.editingBranch._id}`, payload).subscribe({
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
