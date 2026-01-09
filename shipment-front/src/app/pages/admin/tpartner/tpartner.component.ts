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
  private branchSub?: Subscription;

  newPartner = {
    partnerName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    GSTIN: '',
    vehicleNumbers: [] as { number: string; phone: string }[],
    rateType: 'km',
    rateValue: 0,
    status: 'active',
    branch: localStorage.getItem('branch') || 'All Branches'
  };

  newVehicle = { number: '', phone: '' };
  editVehicleField = { number: '', phone: '' };

  editing: any = null;

  constructor(private http: HttpClient, private branchService: BranchService) {}

  ngOnInit() {
    this.branch = this.branchService.currentBranch || this.branch;
    this.branchSub = this.branchService.branch$.subscribe(branch => {
      if (branch !== this.branch) {
        this.branch = branch;
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
      this.newPartner.vehicleNumbers.push({ ...this.newVehicle });
      this.newVehicle = { number: '', phone: '' };
    }
  }

  removeVehicle(i: number) {
    this.newPartner.vehicleNumbers.splice(i, 1);
  }

  // Edit Mode vehicle add/remove
  addEditingVehicle() {
    if (this.editVehicleField.number.trim() && this.editVehicleField.phone.trim()) {
      this.editing.vehicleNumbers.push({ ...this.editVehicleField });
      this.editVehicleField = { number: '', phone: '' };
    }
  }

  removeEditingVehicle(i: number) {
    this.editing.vehicleNumbers.splice(i, 1);
  }

  // Fetch Data
  loadPartners() {
    this.http.get<any[]>(`http://localhost:3000/api/tpartners`, {
      params: {
        branch: this.branch || localStorage.getItem('branch') || 'All Branches'
      }
    })
      .subscribe(res => this.partners = res);
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
    if (this.newPartner.branch === 'All Branches') {
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
      rateType: 'km',
      rateValue: 0,
      status: 'active',
      branch: this.branch || localStorage.getItem('branch') || 'All Branches'
    };
  }

  // Edit
  editPartner(p: any) {
    this.editing = JSON.parse(JSON.stringify(p));
    this.editVehicleField = { number: '', phone: '' };
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
  }

  // Status Toggle
  toggleStatus(p: any) {
    this.http.patch(`http://localhost:3000/api/tpartners/${p._id}/status`, {})
      .subscribe(() => this.loadPartners());
  }

  private onStorageChange = (e: StorageEvent) => {
    if (e.key === 'branch' && e.newValue && e.newValue !== this.branch) {
      this.branch = e.newValue;
      this.loadPartners();
    }
  };
}
