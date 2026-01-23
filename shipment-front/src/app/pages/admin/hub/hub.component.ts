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
          { vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: '' }
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
          this.hubs = branchId && branchId !== 'all'
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
    if (!branchId || branchId === 'all') {
      alert('Please select a specific branch before adding a hub.');
      return;
    }
    this.syncNewHubCurrentBranchDefaults();
    this.newHub.branchId = branchId;
    this.http.post('http://localhost:3000/api/hubs/add', this.newHub)
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
            { vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: '' }
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
      vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: String(this.newHub.hubName || '').trim() }]
    });
  }

  removeAddress(i: number) {
    this.newHub.deliveryAddresses.splice(i, 1);
  }


  /** 🔹 Add / Remove Vehicles in Add Mode */
  addVehicle(addrIndex: number) {
    this.newHub.deliveryAddresses[addrIndex].vehicles.push({
      vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: String(this.newHub.hubName || '').trim()
    });
  }

  removeVehicle(addrIndex: number, vIndex: number) {
    this.newHub.deliveryAddresses[addrIndex].vehicles.splice(vIndex, 1);
  }


  /** 🔹 Edit Mode */
  editHub(hub: any) {
    this.editingHub = JSON.parse(JSON.stringify(hub)); // Deep clone
    this.ensureVehicleStatuses(this.editingHub);
    this.showEditHubPopup = true;
  }

  addAddressEdit() {
    this.editingHub.deliveryAddresses.push({
      location: '',
      vehicles: [{ vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: String(this.editingHub?.hubName || '').trim() }]
    });
  }

  removeAddressEdit(i: number) {
    this.editingHub.deliveryAddresses.splice(i, 1);
  }

  addVehicleEdit(addrIndex: number) {
    this.editingHub.deliveryAddresses[addrIndex].vehicles.push({
      vehicleNo: '', driverPhone: '', vehicleStatus: 'online', currentBranch: String(this.editingHub?.hubName || '').trim()
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
    this.http.put(`http://localhost:3000/api/hubs/${this.editingHub._id}`, this.editingHub)
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
        const currentBranch = String(v?.currentBranch || '').trim();
        const matchesPrevious =
          previous && currentBranch.toLowerCase() === previous.toLowerCase();
        if (!currentBranch || matchesPrevious) {
          v.currentBranch = current;
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
        if (!String(v?.currentBranch || '').trim()) {
          v.currentBranch = current;
        }
      });
    });
  }

  getHubBranchOptions(): string[] {
    const options: string[] = [];
    const hubName = String(this.newHub.hubName || '').trim();
    if (hubName) {
      options.push(hubName);
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

  getEditHubBranchOptions(currentValue: any): string[] {
    const options: string[] = [];
    const current = String(currentValue || '').trim();
    if (current) {
      options.push(current);
    }
    const hubName = String(this.editingHub?.hubName || '').trim();
    if (hubName) {
      const exists = options.some((option) => option.toLowerCase() === hubName.toLowerCase());
      if (!exists) {
        options.push(hubName);
      }
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
    const branchName = String(localStorage.getItem('branch') || '').trim();
    if (!branchName || branchName === 'All Branches') {
      return vehicles || [];
    }
    const target = branchName.toLowerCase();
    return (vehicles || []).filter((v: any) => {
      const currentBranch = String(v?.currentBranch || '').trim().toLowerCase();
      return currentBranch === target;
    });
  }

}
