import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css']
})
export class HubComponent implements OnInit, OnDestroy {

  hubs: any[] = [];
  branches: any[] = [];
  showAddHubPopup = false;
  showEditHubPopup = false;
  private lastHubName = '';
  private currentBranchId: string = localStorage.getItem('branchId') || 'all';
  private branchCheck: any;

  newHub: any = {
    hubName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNum: '',
    perRev: '',
    branchId: localStorage.getItem('branchId') || 'all',
    deliveryAddresses: [
      {
        location: '',
        vehicles: [
          { vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: '' }
        ]
      }
    ],
    status: 'active',
  };

  editingHub: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    localStorage.setItem('branch', 'All Branches');
    this.newHub.branchId = localStorage.getItem('branchId') || 'all';
    this.loadHubs();
    this.loadBranches();
    this.branchCheck = setInterval(() => {
      const currentId = localStorage.getItem('branchId') || 'all';
      if (currentId !== this.currentBranchId) {
        this.currentBranchId = currentId;
        this.loadHubs();
      }
    }, 1000);
    window.addEventListener('storage', this.onStorage);
  }

  ngOnDestroy() {
    if (this.branchCheck) clearInterval(this.branchCheck);
    window.removeEventListener('storage', this.onStorage);
  }

  private onStorage = (e: StorageEvent) => {
    if (e.key === 'branchId') {
      const currentId = localStorage.getItem('branchId') || 'all';
      if (currentId !== this.currentBranchId) {
        this.currentBranchId = currentId;
      }
      this.loadHubs();
    }
  };

  loadHubs() {
    this.http.get<any[]>(`http://localhost:3000/api/hubs`)
      .subscribe({
        next: (data) => {
          console.log("Hubs loaded:", data);
          const branchId = String(localStorage.getItem('branchId') || 'all');
          this.hubs = branchId && branchId !== 'all' && branchId !== 'all-hubs'
            ? (data || []).filter((hub) => String(hub?.branchId || '') === branchId)
            : data;
        },
        error: (err) => console.error("Error loading hubs:", err)
      });
  }

  loadBranches() {
    this.http.get<any[]>(`http://localhost:3000/api/branches`)
      .subscribe({
        next: (data) => {
          this.branches = data;
        },
        error: (err) => console.error("Error loading branches:", err)
      });
  }

  openAddHubPopup() {
    this.showAddHubPopup = true;
    this.syncNewHubCurrentBranchDefaults();
  }

  closeAddHubPopup() {
    this.showAddHubPopup = false;
  }

  closeEditHubPopup() {
    this.showEditHubPopup = false;
    this.editingHub = null;
  }

  addHub() {
    const branchId = localStorage.getItem('branchId') || 'all';
    if (!branchId || branchId === 'all' || branchId === 'all-hubs') {
      alert('Please select a specific branch before adding a hub.');
      return;
    }
    this.syncNewHubCurrentBranchDefaults();
    const payload = JSON.parse(JSON.stringify(this.newHub || {}));
    payload.branchId = branchId;
    (payload.deliveryAddresses || []).forEach((addr: any) => {
      (addr?.vehicles || []).forEach((v: any) => {
        v.currentLocationId = this.normalizeLocationId(v?.currentLocationId);
        delete v.currentBranch;
      });
    });
    this.http.post('http://localhost:3000/api/hubs/add', payload)
      .subscribe({
        next: () => {
          alert('Hub added successfully!');
          this.loadHubs();
          this.resetForm();
          this.closeAddHubPopup();
        },
        error: (err) => {
          console.error('Error saving hub:', err);
          alert('Error: ' + err.error?.message);
        }
      });
  }

  resetForm() {
    this.newHub = {
      hubName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      phoneNum: '',
      perRev: '',
      branchId: localStorage.getItem('branchId') || 'all',
      deliveryAddresses: [
        {
          location: '',
          vehicles: [
            { vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: '' }
          ]
        }
      ],
      status: 'active',
    };
    this.lastHubName = '';
  }


  /** 🔹 Add / Remove Address in Add Mode */
  addAddress() {
    this.newHub.deliveryAddresses.push({
      location: '',
      vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: '' }]
    });
  }

  removeAddress(i: number) {
    this.newHub.deliveryAddresses.splice(i, 1);
  }


  /** 🔹 Add / Remove Vehicles in Add Mode */
  addVehicle(addrIndex: number) {
    this.newHub.deliveryAddresses[addrIndex].vehicles.push({
      vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: ''
    });
  }

  removeVehicle(addrIndex: number, vIndex: number) {
    this.newHub.deliveryAddresses[addrIndex].vehicles.splice(vIndex, 1);
  }


  /** 🔹 Edit Mode */
  editHub(hub: any) {
    this.editingHub = JSON.parse(JSON.stringify(hub)); // Deep clone
    this.ensureVehicleStatuses(this.editingHub);
    (this.editingHub?.deliveryAddresses || []).forEach((addr: any) => {
      (addr?.vehicles || []).forEach((v: any) => {
        if (!v.currentLocationId && v.currentBranch) {
          v.currentLocationId = this.normalizeLocationId(v.currentBranch);
        }
        delete v.currentBranch;
      });
    });
    this.showEditHubPopup = true;
  }

  addAddressEdit() {
    this.editingHub.deliveryAddresses.push({
      location: '',
      vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: '' }]
    });
  }

  removeAddressEdit(i: number) {
    this.editingHub.deliveryAddresses.splice(i, 1);
  }

  addVehicleEdit(addrIndex: number) {
    this.editingHub.deliveryAddresses[addrIndex].vehicles.push({
      vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentLocationId: ''
    });
  }

  removeVehicleEdit(addrIndex: number, vIndex: number) {
    this.editingHub.deliveryAddresses[addrIndex].vehicles.splice(vIndex, 1);
  }

  toggleEditVehicleStatus(vehicle: any) {
    if (!this.editingHub?._id || !vehicle) return;
    const vehicleNo = String(vehicle?.vehicleNo || '').trim();
    if (!vehicleNo) return;
    const current = String(vehicle?.vehicleStatus || 'online').trim().toLowerCase();
    const nextStatus = current === 'offline' ? 'online' : 'offline';
    this.http.patch(`http://localhost:3000/api/hubs/${this.editingHub._id}/vehicle-status`, {
      vehicleNo,
      vehicleStatus: nextStatus
    }).subscribe({
      next: () => {
        vehicle.vehicleStatus = nextStatus;
        this.loadHubs();
      },
      error: (err) => {
        console.error('Error updating vehicle status:', err);
        alert('Failed to update vehicle status.');
      }
    });
  }


  saveEdit() {
    const payload = JSON.parse(JSON.stringify(this.editingHub || {}));
    (payload?.deliveryAddresses || []).forEach((addr: any) => {
      (addr?.vehicles || []).forEach((v: any) => {
        v.currentLocationId = this.normalizeLocationId(v.currentLocationId);
        delete v.currentBranch;
      });
    });
    this.http.put(`http://localhost:3000/api/hubs/${this.editingHub._id}`, payload)
      .subscribe({
        next: () => {
          this.loadHubs();
          this.closeEditHubPopup();
        },
        error: (err) => alert("Update failed!")
      });
  }


  /** 🔹 Toggle Active/Inactive */
  toggleStatus(hub: any) {
    this.http.patch(
      `http://localhost:3000/api/hubs/${hub._id}/status`,
      { status: hub.status === 'active' ? 'inactive' : 'active' }
    )
      .subscribe(() => this.loadHubs());
  }

  handleHubNameChange(): void {
    const current = String(this.newHub.hubName || '').trim();
    const previous = String(this.lastHubName || '').trim();
    (this.newHub.deliveryAddresses || []).forEach((addr: any) => {
      (addr?.vehicles || []).forEach((v: any) => {
        const currentLocationId = String(v?.currentLocationId || '').trim();
        const matchesPrevious =
          previous && this.normalizeLocationId(currentLocationId) === this.normalizeLocationId(previous);
        if (!currentLocationId || matchesPrevious) {
          v.currentLocationId = this.normalizeLocationId(current);
        }
      });
    });
    this.lastHubName = current;
  }

  private syncNewHubCurrentBranchDefaults(): void {
    const current = String(this.newHub.hubName || '').trim();
    if (!current) return;
    (this.newHub.deliveryAddresses || []).forEach((addr: any) => {
      (addr?.vehicles || []).forEach((v: any) => {
        if (!String(v?.currentLocationId || '').trim()) {
          v.currentLocationId = this.normalizeLocationId(current);
        }
      });
    });
  }

  getHubBranchOptions(): Array<{ id: string; label: string }> {
    const options: Array<{ id: string; label: string }> = [];
    (this.hubs || []).forEach((hub: any) => {
      const id = this.normalizeId(hub?._id);
      const label = String(hub?.hubName || '').trim();
      if (id && label) options.push({ id, label });
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

  getEditHubBranchOptions(currentValue: any): Array<{ id: string; label: string }> {
    const options: Array<{ id: string; label: string }> = [];
    const currentId = this.normalizeLocationId(String(currentValue || '').trim());
    const currentLabel = this.getLocationLabel(currentId);
    if (currentId && currentLabel) {
      options.push({ id: currentId, label: currentLabel });
    }
    (this.hubs || []).forEach((hub: any) => {
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

  private ensureVehicleStatuses(targetHub: any) {
    if (!targetHub?.deliveryAddresses) return;
    targetHub.deliveryAddresses.forEach((addr: any) => {
      (addr?.vehicles || []).forEach((v: any) => {
        if (!v.vehicleStatus) {
          v.vehicleStatus = 'online';
        }
      });
    });
  }

  getFilteredVehicles(vehicles: any[]): any[] {
    const branchId = String(localStorage.getItem('branchId') || '').trim();
    if (!branchId || branchId === 'all' || branchId === 'all-hubs') {
      return vehicles || [];
    }
    return (vehicles || []).filter((v: any) => {
      const currentLocationId = this.normalizeLocationId(v?.currentLocationId || v?.currentBranch);
      return currentLocationId && currentLocationId === branchId;
    });
  }

  private getLocationLabel(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const hub = (this.hubs || []).find((h: any) => this.normalizeId(h?._id) === raw);
    if (hub?.hubName) return hub.hubName;
    const branch = (this.branches || []).find((b: any) => this.normalizeId(b?._id) === raw);
    if (branch?.branchName) return branch.branchName;
    return raw;
  }

  private normalizeLocationId(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[a-f\d]{24}$/i.test(raw)) return raw;
    const hub = (this.hubs || []).find((h: any) =>
      String(h?.hubName || '').trim().toLowerCase() === raw.toLowerCase()
    );
    if (hub?._id) return this.normalizeId(hub._id);
    const branch = (this.branches || []).find((b: any) =>
      String(b?.branchName || '').trim().toLowerCase() === raw.toLowerCase()
    );
    if (branch?._id) return this.normalizeId(branch._id);
    return '';
  }

  private normalizeId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }
}
