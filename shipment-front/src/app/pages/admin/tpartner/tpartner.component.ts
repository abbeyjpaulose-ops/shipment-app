import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BranchService } from '../../../services/branch.service';

@Component({
  selector: 'app-transport-partner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tpartner.component.html',
  styleUrls: ['./tpartner.component.css']
})
export class TpartnerComponent implements OnInit, OnDestroy {

  partners: any[] = [];
  showAddPartnerPopup = false;
  showEditPartnerPopup = false;
  branch: string = localStorage.getItem('branch') || 'All Branches';
  branchId: string = localStorage.getItem('branchId') || 'all';
  private branchSub?: Subscription;

  newPartner = {
    partnerName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    GSTIN: '',
    vehicleNumbers: [] as { number: string; phone: string; rateType: string; rateValue: number; vehicleStatus?: string }[],
    status: 'active',
    branch: localStorage.getItem('branch') || 'All Branches',
    branchId: localStorage.getItem('branchId') || 'all'
  };

  newVehicle = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
  editVehicleField = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
  editingNewVehicleIndex: number | null = null;
  editingExistingVehicleIndex: number | null = null;
  editing: any = null;

  constructor(private http: HttpClient, private branchService: BranchService) {}

  ngOnInit() {
    this.branch = this.branchService.currentBranch || this.branch;
    this.branchId = localStorage.getItem('branchId') || this.branchId;
    this.branchSub = this.branchService.branch$.subscribe(branch => {
      const currentBranchId = localStorage.getItem('branchId') || 'all';
      if (branch !== this.branch || currentBranchId !== this.branchId) {
        this.branch = branch;
        this.branchId = currentBranchId;
        this.loadPartners();
      }
    });
    window.addEventListener('storage', this.onStorageChange);
    this.loadPartners();
  }

  ngOnDestroy(): void {
    this.branchSub?.unsubscribe();
    window.removeEventListener('storage', this.onStorageChange);
  }

  // Add Vehicle to new Partner form
  addVehicle() {
    if (this.newVehicle.number.trim() && this.newVehicle.phone.trim()) {
      if (this.editingNewVehicleIndex !== null) {
        this.newPartner.vehicleNumbers[this.editingNewVehicleIndex] = { ...this.newVehicle };
        this.editingNewVehicleIndex = null;
      } else {
        this.newPartner.vehicleNumbers.push({ ...this.newVehicle });
      }
      this.newVehicle = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
    }
  }

  removeVehicle(i: number) {
    this.newPartner.vehicleNumbers.splice(i, 1);
    if (this.editingNewVehicleIndex === i) {
      this.editingNewVehicleIndex = null;
      this.newVehicle = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
    }
  }

  // Edit Mode vehicle add/remove
  addEditingVehicle() {
    if (this.editVehicleField.number.trim() && this.editVehicleField.phone.trim()) {
      if (this.editingExistingVehicleIndex !== null) {
        this.editing.vehicleNumbers[this.editingExistingVehicleIndex] = { ...this.editVehicleField };
        this.editingExistingVehicleIndex = null;
      } else {
        this.editing.vehicleNumbers.push({ ...this.editVehicleField });
      }
      this.editVehicleField = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
    }
  }

  removeEditingVehicle(i: number) {
    this.editing.vehicleNumbers.splice(i, 1);
    if (this.editingExistingVehicleIndex === i) {
      this.editingExistingVehicleIndex = null;
      this.editVehicleField = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
    }
  }

  // Fetch Data
  loadPartners() {
    this.http.get<any[]>(`http://localhost:3000/api/tpartners`, {
      params: {
        branchId: this.branchId || localStorage.getItem('branchId') || 'all'
      }
    })
      .subscribe(res => {
        this.partners = res;
      });
  }

  openAddPartnerPopup() {
    this.showAddPartnerPopup = true;
  }

  closeAddPartnerPopup() {
    this.showAddPartnerPopup = false;
  }

  // Add Partner
  addPartner() {
    this.newPartner.branch = this.branch || localStorage.getItem('branch') || 'All Branches';
    this.newPartner.branchId = this.branchId || localStorage.getItem('branchId') || 'all';
    if (this.newPartner.branch === 'All Branches' || this.newPartner.branchId === 'all') {
      alert('Please select a specific branch before adding a transport partner.');
      return;
    }
    this.http.post('http://localhost:3000/api/tpartners/add', this.newPartner)
      .subscribe({
        next: () => {
          alert('Transport Partner added!');
          this.loadPartners();
          this.resetForm();
          this.closeAddPartnerPopup();
        },
        error: err => alert(err.error.message)
      });
  }

  // Reset after save
  resetForm() {
    this.newPartner = {
      partnerName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      GSTIN: '',
      vehicleNumbers: [],
      status: 'active',
      branch: this.branch || localStorage.getItem('branch') || 'All Branches',
      branchId: this.branchId || localStorage.getItem('branchId') || 'all'
    };
    this.editingNewVehicleIndex = null;
    this.newVehicle = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
  }

  // Edit
  editPartner(p: any) {
    this.editing = JSON.parse(JSON.stringify(p));
    this.editing.vehicleNumbers = Array.isArray(this.editing.vehicleNumbers)
      ? this.editing.vehicleNumbers.map((v: any) => ({
          vehicleStatus: 'online',
          rateType: 'km',
          rateValue: 0,
          ...v
        }))
      : [];
    this.editingExistingVehicleIndex = null;
    this.editVehicleField = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
    this.showEditPartnerPopup = true;
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/tpartners/${this.editing._id}`, this.editing)
      .subscribe(() => {
        alert('Updated Successfully');
        this.editing = null;
        this.showEditPartnerPopup = false;
        this.loadPartners();
      });
  }

  closeEditPartnerPopup() {
    this.editing = null;
    this.showEditPartnerPopup = false;
    this.editingExistingVehicleIndex = null;
  }

  startEditNewVehicle(i: number) {
    const vehicle = this.newPartner.vehicleNumbers[i];
    if (!vehicle) return;
    this.editingNewVehicleIndex = i;
    this.newVehicle = {
      number: vehicle.number || '',
      phone: vehicle.phone || '',
      rateType: vehicle.rateType || 'km',
      rateValue: typeof vehicle.rateValue === 'number' ? vehicle.rateValue : 0,
      vehicleStatus: vehicle.vehicleStatus || 'online'
    };
  }

  startEditExistingVehicle(i: number) {
    if (!this.editing || !Array.isArray(this.editing.vehicleNumbers)) return;
    const vehicle = this.editing.vehicleNumbers[i];
    if (!vehicle) return;
    this.editingExistingVehicleIndex = i;
    this.editVehicleField = {
      number: vehicle.number || '',
      phone: vehicle.phone || '',
      rateType: vehicle.rateType || 'km',
      rateValue: typeof vehicle.rateValue === 'number' ? vehicle.rateValue : 0,
      vehicleStatus: vehicle.vehicleStatus || 'online'
    };
  }

  // Status Toggle
  toggleStatus(p: any) {
    this.http.patch(`http://localhost:3000/api/tpartners/${p._id}/status`, {})
      .subscribe(() => this.loadPartners());
  }

  updateVehicleStatus(p: any, v: any) {
    if (!p?._id || !v?.number) return;
    this.http.patch(`http://localhost:3000/api/tpartners/${p._id}/vehicle-status`, {
      vehicleNumber: v.number,
      vehicleStatus: v.vehicleStatus,
      vehicleDailyCost: v.vehicleDailyCost
    }).subscribe({
      next: () => {
        this.loadPartners();
      },
      error: err => console.error('Error updating vehicle status:', err)
    });
  }

  private onStorageChange = (e: StorageEvent) => {
    if (e.key === 'branch' || e.key === 'branchId') {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('branchId') || 'all';
      if (current !== this.branch || currentId !== this.branchId) {
        this.branch = current;
        this.branchId = currentId;
        this.loadPartners();
      }
    }
  };
}
