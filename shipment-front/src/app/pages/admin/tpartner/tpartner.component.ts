import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BranchService } from '../../../services/branch.service';

type DailyPayableCandidate = {
  partnerId: string;
  partnerName: string;
  vehicleNumber: string;
  date: string;
  deliveryPoints: string[];
  deliveryPointsText: string;
  amountDue: number;
  defaultAmount: number;
  existingAmountDue: number;
  hasSavedPayment: boolean;
  saving?: boolean;
};

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
  showPartnerDetailsPopup = false;
  branch: string = localStorage.getItem('branch') || 'All Branches';
  originLocId: string = localStorage.getItem('originLocId') || 'all';
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
    originLocId: localStorage.getItem('originLocId') || 'all'
  };

  newVehicle = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
  editVehicleField = { number: '', phone: '', rateType: 'km', rateValue: 0, vehicleStatus: 'online' };
  editingNewVehicleIndex: number | null = null;
  editingExistingVehicleIndex: number | null = null;
  editing: any = null;
  selectedPartner: any = null;
  payableDateFrom: string = new Date().toISOString().slice(0, 10);
  payableDateTo: string = this.payableDateFrom;
  payableSavedFilter: 'all' | 'saved' | 'unsaved' = 'all';
  payableCandidatesLoading = false;
  payableCandidates: DailyPayableCandidate[] = [];

  constructor(private http: HttpClient, private branchService: BranchService) {}

  ngOnInit() {
    this.branch = this.branchService.currentBranch || this.branch;
    this.originLocId = localStorage.getItem('originLocId') || this.originLocId;
    this.branchSub = this.branchService.branch$.subscribe(branch => {
      const currentoriginLocId = localStorage.getItem('originLocId') || 'all';
      if (branch !== this.branch || currentoriginLocId !== this.originLocId) {
        this.branch = branch;
        this.originLocId = currentoriginLocId;
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
    const requestedoriginLocId = this.getRequestoriginLocId();
    this.http.get<any[]>(`/api/tpartners`, {
      params: {
        originLocId: requestedoriginLocId
      }
    })
      .subscribe(res => {
        this.partners = Array.isArray(res) ? res : [];
        this.loadDailyPayableCandidates();
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
    this.newPartner.originLocId = this.originLocId || localStorage.getItem('originLocId') || 'all';
    if (this.newPartner.branch === 'All Branches' || this.newPartner.originLocId === 'all') {
      alert('Please select a specific branch before adding a transport partner.');
      return;
    }
    this.http.post('/api/tpartners/add', this.newPartner)
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
      originLocId: this.originLocId || localStorage.getItem('originLocId') || 'all'
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
    this.http.put(`/api/tpartners/${this.editing._id}`, this.editing)
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

  openPartnerDetailsPopup(partner: any) {
    this.selectedPartner = partner;
    this.showPartnerDetailsPopup = true;
  }

  closePartnerDetailsPopup() {
    this.selectedPartner = null;
    this.showPartnerDetailsPopup = false;
  }

  editPartnerFromDetails() {
    if (!this.selectedPartner) return;
    const partner = this.selectedPartner;
    this.closePartnerDetailsPopup();
    this.editPartner(partner);
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
    this.http.patch(`/api/tpartners/${p._id}/status`, {})
      .subscribe(() => this.loadPartners());
  }

  updateVehicleStatus(p: any, v: any) {
    if (!p?._id || !v?.number) return;
    this.http.patch(`/api/tpartners/${p._id}/vehicle-status`, {
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
    if (e.key === 'branch' || e.key === 'originLocId') {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.branch || currentId !== this.originLocId) {
        this.branch = current;
        this.originLocId = currentId;
        this.loadPartners();
      }
    }
  };

  getPartnerAddress(partner: any): string {
    const parts = [partner?.address, partner?.city, partner?.state, partner?.pinCode].filter(Boolean);
    return parts.length ? parts.join(', ') : '-';
  }

  formatVehicleRate(vehicle: any): string {
    const rateValue = vehicle?.rateValue ?? 0;
    const unit = String(vehicle?.rateType || '').toLowerCase() === 'day' ? 'Day' : 'Km';
    return `${rateValue} / ${unit}`;
  }

  onPayableFilterChange() {
    this.loadDailyPayableCandidates();
  }

  get pendingPayableCount(): number {
    return (this.payableCandidates || []).filter((row) => !row.hasSavedPayment).length;
  }

  getSaveActionLabel(candidate: DailyPayableCandidate): string {
    if (candidate?.saving) {
      return candidate?.hasSavedPayment ? 'Updating...' : 'Saving...';
    }
    return candidate?.hasSavedPayment ? 'Edit Amount' : 'Save Amount';
  }

  submitDailyPayableCandidate(candidate: DailyPayableCandidate) {
    if (!candidate || candidate.saving) return;
    const partnerId = String(candidate.partnerId || '').trim();
    const vehicleNumber = String(candidate.vehicleNumber || '').trim();
    const amountDue = Number(candidate.amountDue);
    if (!partnerId || !vehicleNumber) {
      alert('Invalid candidate row.');
      return;
    }
    if (!Number.isFinite(amountDue) || amountDue < 0) {
      alert('Please enter a valid rent amount.');
      return;
    }

    candidate.saving = true;
    this.http.post<any>(`/api/tpartners/${partnerId}/daily-payable`, {
      vehicleNumber,
      date: String(candidate.date || this.payableDateFrom || this.payableDateTo || '').trim(),
      amountDue,
      deliveryPoints: candidate.deliveryPoints
    }).subscribe({
      next: (res) => {
        const mergedPoints = Array.isArray(res?.mergedDeliveryPoints)
          ? res.mergedDeliveryPoints
            .map((point: any) => String(point || '').trim())
            .filter((point: string) => Boolean(point))
          : candidate.deliveryPoints;
        candidate.deliveryPoints = mergedPoints;
        candidate.deliveryPointsText = mergedPoints.join('$$');
        const savedAmountDue = Number(res?.payment?.amountDue);
        candidate.existingAmountDue = Number.isFinite(savedAmountDue)
          ? Math.max(savedAmountDue, 0)
          : Math.max(Number(amountDue) || 0, 0);
        candidate.hasSavedPayment = true;
        alert(res?.message || 'Daily payable saved.');
        if (this.payableSavedFilter === 'unsaved') {
          this.loadDailyPayableCandidates();
        }
      },
      error: (err) => {
        alert(err?.error?.message || 'Failed to save daily payable.');
      },
      complete: () => {
        candidate.saving = false;
      }
    });
  }

  private resolvePayableDateRange(): { dateFrom: string; dateTo: string } | null {
    const rawFrom = String(this.payableDateFrom || '').trim();
    const rawTo = String(this.payableDateTo || '').trim();
    const fallbackFrom = rawFrom || rawTo;
    const fallbackTo = rawTo || rawFrom;
    if (!fallbackFrom || !fallbackTo) return null;
    const dateFrom = fallbackFrom <= fallbackTo ? fallbackFrom : fallbackTo;
    const dateTo = fallbackFrom <= fallbackTo ? fallbackTo : fallbackFrom;
    if (this.payableDateFrom !== dateFrom) this.payableDateFrom = dateFrom;
    if (this.payableDateTo !== dateTo) this.payableDateTo = dateTo;
    return { dateFrom, dateTo };
  }

  private loadDailyPayableCandidates() {
    const range = this.resolvePayableDateRange();
    if (!range) {
      this.payableCandidates = [];
      return;
    }

    this.payableCandidatesLoading = true;
    this.http.get<any>(`/api/tpartners/daily-payable-candidates`, {
      params: {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        savedFilter: this.payableSavedFilter,
        originLocId: this.getRequestoriginLocId()
      }
    }).subscribe({
      next: (res: any) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        this.payableCandidates = rows.map((row: any): DailyPayableCandidate => {
          const points = Array.isArray(row?.deliveryPoints)
            ? row.deliveryPoints
              .map((point: any) => String(point || '').trim())
              .filter((point: string) => Boolean(point))
            : [];
          const suggestedAmount = Number(row?.suggestedAmountDue);
          const defaultAmount = Number(row?.defaultAmount);
          const existingAmount = Number(row?.existingAmountDue);
          const hasSavedPayment = Boolean(row?.hasSavedPayment) || (Number.isFinite(existingAmount) && existingAmount > 0);
          return {
            partnerId: String(row?.partnerId || ''),
            partnerName: String(row?.partnerName || ''),
            vehicleNumber: String(row?.vehicleNumber || ''),
            date: String(row?.date || range.dateFrom),
            deliveryPoints: points,
            deliveryPointsText: points.join('$$'),
            amountDue: Number.isFinite(suggestedAmount)
              ? suggestedAmount
              : (Number.isFinite(defaultAmount) ? defaultAmount : 0),
            defaultAmount: Number.isFinite(defaultAmount) ? defaultAmount : 0,
            existingAmountDue: Number.isFinite(existingAmount) ? existingAmount : 0,
            hasSavedPayment,
            saving: false
          };
        });
      },
      error: () => {
        this.payableCandidates = [];
      },
      complete: () => {
        this.payableCandidatesLoading = false;
      }
    });
  }

  private getRequestoriginLocId(): string {
    const raw = String(this.originLocId || localStorage.getItem('originLocId') || 'all').trim();
    return raw === 'all-hubs' ? 'all' : (raw || 'all');
  }
}

