import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
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
  showCompletionConfirm = false;
  completionConsignments: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }> = [];
  completionPartnerId = '';
  completionVehicleNumber = '';
  completionPreviousStatus = '';
  private completionConsignmentsOriginal: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }> = [];
  showDeliveringConfirm = false;
  deliveringConsignments: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }> = [];
  deliveringPartnerId = '';
  deliveringVehicleNumber = '';
  deliveringPreviousStatus = '';
  deliveringCostMissing = false;
  deliveringDailyCost: number | null = null;
  private deliveringConsignmentsOriginal: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }> = [];
  private vehicleStatusByKey = new Map<string, string>();

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
        this.vehicleStatusByKey = new Map();
        (this.partners || []).forEach((p: any) => {
          (p?.vehicleNumbers || []).forEach((v: any) => {
            const key = `${p?._id || ''}::${v?.number || ''}`;
            this.vehicleStatusByKey.set(key, v?.vehicleStatus || 'online');
          });
        });
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
    const key = `${p._id}::${v.number}`;
    const previousStatus = this.vehicleStatusByKey.get(key) || 'online';
    const nextStatus = String(v.vehicleStatus || '').toLowerCase();
    if (nextStatus === 'delivering') {
      const costValue = Number(v.vehicleDailyCost);
      this.deliveringDailyCost = Number.isFinite(costValue) ? costValue : null;
      this.deliveringCostMissing = !Number.isFinite(costValue) || costValue <= 0;
      this.deliveringPartnerId = p._id;
      this.deliveringVehicleNumber = v.number;
      this.deliveringPreviousStatus = previousStatus;
      v.vehicleStatus = previousStatus;
      this.fetchDeliveringConsignments();
      return;
    }
    if (nextStatus === 'completed') {
      this.completionPartnerId = p._id;
      this.completionVehicleNumber = v.number;
      this.completionPreviousStatus = previousStatus;
      v.vehicleStatus = previousStatus;
      this.completionConsignments = [];
      this.completionConsignmentsOriginal = [];
      this.showCompletionConfirm = true;
      this.fetchCompletionConsignments();
      return;
    }
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

  private fetchCompletionConsignments() {
    if (!this.completionPartnerId || !this.completionVehicleNumber) return;
    this.http.get<any>('http://localhost:3000/api/tpartner-activity/consignments', {
      params: {
        tpartnerId: this.completionPartnerId,
        vehicleNumber: this.completionVehicleNumber,
        statusFilter: 'all'
      }
    }).subscribe({
      next: (resp) => {
        const list = Array.isArray(resp?.consignments) ? resp.consignments : [];
        this.completionConsignments = list;
        this.completionConsignmentsOriginal = list.map((c: any) => ({ ...c }));
      },
      error: err => console.error('Error loading completion consignments:', err)
    });
  }

  confirmCompletion() {
    if (!this.completionPartnerId || !this.completionVehicleNumber) return;
    const removed = this.getRemovedConsignments(
      this.completionConsignmentsOriginal,
      this.completionConsignments
    );
    this.updateConsignmentStatuses(this.completionConsignments, removed).subscribe({
      next: () => {
        this.http.patch(`http://localhost:3000/api/tpartners/${this.completionPartnerId}/vehicle-status`, {
          vehicleNumber: this.completionVehicleNumber,
          vehicleStatus: 'online'
        }).subscribe({
          next: () => {
            this.updateActivityStatus(this.completionPartnerId, this.completionVehicleNumber, 'completed');
            this.showCompletionConfirm = false;
            this.completionConsignments = [];
            this.completionConsignmentsOriginal = [];
            this.completionPartnerId = '';
            this.completionVehicleNumber = '';
            this.completionPreviousStatus = '';
            this.loadPartners();
          },
          error: err => console.error('Error updating vehicle status:', err)
        });
      },
      error: (err: any) => console.error('Error updating consignments:', err)
    });
  }

  cancelCompletion() {
    this.showCompletionConfirm = false;
    this.completionConsignments = [];
    this.completionConsignmentsOriginal = [];
    this.completionPartnerId = '';
    this.completionVehicleNumber = '';
    this.completionPreviousStatus = '';
  }

  private fetchDeliveringConsignments() {
    if (!this.deliveringPartnerId || !this.deliveringVehicleNumber) return;
    this.http.get<any>('http://localhost:3000/api/tpartner-activity/consignments', {
      params: {
        tpartnerId: this.deliveringPartnerId,
        vehicleNumber: this.deliveringVehicleNumber
      }
    }).subscribe({
      next: (resp) => {
        const list = Array.isArray(resp?.consignments) ? resp.consignments : [];
        this.deliveringConsignments = list;
        this.deliveringConsignmentsOriginal = list.map((c: any) => ({ ...c }));
        this.showDeliveringConfirm = true;
      },
      error: err => console.error('Error loading delivering consignments:', err)
    });
  }

  confirmDelivering() {
    if (!this.deliveringPartnerId || !this.deliveringVehicleNumber) return;
    const costValue = Number(this.deliveringDailyCost);
    this.deliveringCostMissing = !Number.isFinite(costValue) || costValue <= 0;
    if (this.deliveringCostMissing) {
      return;
    }
    const removed = this.getRemovedConsignments(
      this.deliveringConsignmentsOriginal,
      this.deliveringConsignments
    );
    this.updateConsignmentStatuses([], removed).subscribe({
      next: () => {
    this.http.patch(`http://localhost:3000/api/tpartners/${this.deliveringPartnerId}/vehicle-status`, {
      vehicleNumber: this.deliveringVehicleNumber,
      vehicleStatus: 'delivering',
      vehicleDailyCost: costValue
    }).subscribe({
      next: () => {
        this.updateActivityStatus(this.deliveringPartnerId, this.deliveringVehicleNumber, 'delivering');
        this.showDeliveringConfirm = false;
        this.deliveringConsignments = [];
        this.deliveringConsignmentsOriginal = [];
        this.deliveringPartnerId = '';
        this.deliveringVehicleNumber = '';
        this.deliveringPreviousStatus = '';
        this.deliveringDailyCost = null;
        this.deliveringCostMissing = false;
        this.loadPartners();
      },
      error: err => console.error('Error updating vehicle status:', err)
    });
      },
      error: (err: any) => console.error('Error updating consignments:', err)
    });
  }

  cancelDelivering() {
    this.showDeliveringConfirm = false;
    this.deliveringConsignments = [];
    this.deliveringConsignmentsOriginal = [];
    this.deliveringPartnerId = '';
    this.deliveringVehicleNumber = '';
    this.deliveringPreviousStatus = '';
    this.deliveringCostMissing = false;
    this.deliveringDailyCost = null;
  }

  removeDeliveringConsignment(index: number) {
    this.deliveringConsignments.splice(index, 1);
  }

  removeCompletionConsignment(index: number) {
    this.completionConsignments.splice(index, 1);
  }

  private getRemovedConsignments(
    original: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }>,
    current: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }>
  ): Array<{ id: string; consignmentNumber: string; shipmentStatus: string }> {
    const currentIds = new Set(current.map((c) => String(c?.id || '')));
    return original.filter((c) => !currentIds.has(String(c?.id || '')));
  }

  private updateConsignmentStatuses(
    kept: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }>,
    removed: Array<{ id: string; consignmentNumber: string; shipmentStatus: string }>
  ): Observable<any[]> {
    const updates = [
      ...kept.map((item) => this.buildShipmentUpdate(item, true)),
      ...removed.map((item) => this.buildShipmentUpdate(item, false))
    ].filter(Boolean) as any[];
    if (!updates.length) {
      return of([] as any[]);
    }
    return forkJoin(updates);
  }

  private buildShipmentUpdate(
    item: { id: string; consignmentNumber: string; shipmentStatus: string },
    keep: boolean
  ) {
    const shipmentId = String(item?.id || '').trim();
    const consignmentNumber = String(item?.consignmentNumber || '').trim();
    if (!shipmentId || !consignmentNumber) return null;
    const status = String(item?.shipmentStatus || '').trim();
    const isManifestation = status === 'Manifestation' || status === 'DManifestation';
    const isDStatus = status.startsWith('D');
    const nextStatus = keep
      ? (isManifestation ? 'DPending' : 'Delivered')
      : (isDStatus ? 'DPending' : 'Pending');
    const shipmentParam = `?shipmentId=${encodeURIComponent(shipmentId)}`;
    return this.http.put(
      `http://localhost:3000/api/newshipments/${consignmentNumber}${shipmentParam}`,
      { shipmentId, shipmentStatus: nextStatus }
    );
  }

  private updateActivityStatus(tpartnerId: string, vehicleNumber: string, status: string) {
    this.http.patch('http://localhost:3000/api/tpartner-activity/status', {
      tpartnerId,
      vehicleNumber,
      status
    }).subscribe({
      error: err => console.error('Error updating activity status:', err)
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
