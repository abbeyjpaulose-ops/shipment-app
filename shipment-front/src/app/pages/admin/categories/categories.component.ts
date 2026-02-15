import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BranchService } from '../../../services/branch.service';

type CostTab = 'summary' | 'fuel' | 'workers' | 'maintenance';
type EntryType = 'fuel' | 'workers' | 'maintenance';

type RowMeta = {
  _id?: string;
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelledBy?: string;
};

type FuelEntry = RowMeta & {
  vehicleNo: string;
  fuelType: 'petrol' | 'diesel';
  amount: number;
  notes?: string;
  createdAt?: string;
};

type WorkerEntry = RowMeta & {
  workType: 'loading' | 'unloading' | 'both';
  workersCount: number;
  wagePerWorker: number;
  totalAmount: number;
  notes?: string;
  createdAt?: string;
};

type MaintenanceEntry = RowMeta & {
  vehicleNo: string;
  maintenanceType: 'service' | 'breakdown-repair' | 'other';
  amount: number;
  notes?: string;
  createdAt?: string;
};

type DaySummary = {
  fuelTotal: number;
  workersTotal: number;
  maintenanceTotal: number;
  grandTotal: number;
  fuelCount: number;
  workersCount: number;
  maintenanceCount: number;
};

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.css']
})
export class CategoriesComponent implements OnInit, OnDestroy {
  activeTab: CostTab = 'summary';
  branch: string = localStorage.getItem('branch') || 'All Branches';
  originLocId: string = localStorage.getItem('originLocId') || 'all';
  selectedDate: string = new Date().toISOString().slice(0, 10);
  private branchSub?: Subscription;

  isLoading = false;
  savingFuel = false;
  savingWorkers = false;
  savingMaintenance = false;
  cancellingRows: Record<string, boolean> = {};
  infoMessage = '';
  errorMessage = '';

  vehicleOptions: string[] = [];
  fuelEntries: FuelEntry[] = [];
  workerEntries: WorkerEntry[] = [];
  maintenanceEntries: MaintenanceEntry[] = [];
  summary: DaySummary = this.getDefaultSummary();

  fuelForm = {
    vehicleNo: '',
    fuelType: 'diesel' as 'petrol' | 'diesel',
    amount: '',
    notes: ''
  };

  workerForm = {
    workType: 'loading' as 'loading' | 'unloading' | 'both',
    workersCount: '',
    wagePerWorker: '',
    notes: ''
  };

  maintenanceForm = {
    vehicleNo: '',
    maintenanceType: 'service' as 'service' | 'breakdown-repair' | 'other',
    amount: '',
    notes: ''
  };

  constructor(private http: HttpClient, private branchService: BranchService) {}

  ngOnInit(): void {
    this.branch = this.branchService.currentBranch || this.branch;
    this.originLocId = localStorage.getItem('originLocId') || this.originLocId;
    this.branchSub = this.branchService.branch$.subscribe((branch) => {
      const currentoriginLocId = localStorage.getItem('originLocId') || 'all';
      if (branch !== this.branch || currentoriginLocId !== this.originLocId) {
        this.branch = branch;
        this.originLocId = currentoriginLocId;
        this.loadDayData();
      }
    });
    window.addEventListener('storage', this.onStorageChange);
    this.loadDayData();
  }

  ngOnDestroy(): void {
    this.branchSub?.unsubscribe();
    window.removeEventListener('storage', this.onStorageChange);
  }

  private onStorageChange = (e: StorageEvent) => {
    if (e.key === 'branch' || e.key === 'originLocId') {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.branch || currentId !== this.originLocId) {
        this.branch = current;
        this.originLocId = currentId;
        this.loadDayData();
      }
    }
  };

  setTab(tab: CostTab): void {
    this.activeTab = tab;
  }

  onDateChange(): void {
    this.loadDayData();
  }

  get hasScopedBranch(): boolean {
    const id = this.getNormalizedoriginLocId();
    return Boolean(id && id !== 'all');
  }

  get workerPreviewTotal(): number {
    const workersCount = Number(this.workerForm.workersCount);
    const wagePerWorker = Number(this.workerForm.wagePerWorker);
    if (!Number.isFinite(workersCount) || workersCount < 0) return 0;
    if (!Number.isFinite(wagePerWorker) || wagePerWorker < 0) return 0;
    return Number((workersCount * wagePerWorker).toFixed(2));
  }

  formatMoney(value: any): string {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  formatDateTime(value: any): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
  }

  isEntryCancelled(entry: RowMeta | null | undefined): boolean {
    return Boolean(entry?.isCancelled);
  }

  isCancelling(entryType: EntryType, entryId: string | undefined): boolean {
    const key = this.getCancelKey(entryType, entryId);
    return key ? Boolean(this.cancellingRows[key]) : false;
  }

  submitFuel(): void {
    if (!this.hasScopedBranch) {
      alert('Please select a specific branch first.');
      return;
    }
    const vehicleNo = String(this.fuelForm.vehicleNo || '').trim();
    const amount = Number(this.fuelForm.amount);
    if (!vehicleNo) {
      alert('Vehicle is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      alert('Please enter a valid fuel amount.');
      return;
    }

    this.savingFuel = true;
    this.http.post<any>('http://localhost:3000/api/categories/running-costs/fuel', {
      date: this.selectedDate,
      originLocId: this.getNormalizedoriginLocId(),
      vehicleNo,
      fuelType: this.fuelForm.fuelType,
      amount,
      notes: this.fuelForm.notes
    }).subscribe({
      next: (res) => {
        this.fuelForm.amount = '';
        this.fuelForm.notes = '';
        alert(res?.message || 'Fuel charge added.');
        this.loadDayData();
      },
      error: (err) => {
        alert(err?.error?.message || 'Failed to add fuel charge.');
      },
      complete: () => {
        this.savingFuel = false;
      }
    });
  }

  submitWorkers(): void {
    if (!this.hasScopedBranch) {
      alert('Please select a specific branch first.');
      return;
    }
    const workersCount = Number(this.workerForm.workersCount);
    const wagePerWorker = Number(this.workerForm.wagePerWorker);
    if (!Number.isFinite(workersCount) || workersCount < 0) {
      alert('Please enter valid worker count.');
      return;
    }
    if (!Number.isFinite(wagePerWorker) || wagePerWorker < 0) {
      alert('Please enter valid wage per worker.');
      return;
    }

    this.savingWorkers = true;
    this.http.post<any>('http://localhost:3000/api/categories/running-costs/workers', {
      date: this.selectedDate,
      originLocId: this.getNormalizedoriginLocId(),
      workType: this.workerForm.workType,
      workersCount,
      wagePerWorker,
      notes: this.workerForm.notes
    }).subscribe({
      next: (res) => {
        this.workerForm.workersCount = '';
        this.workerForm.wagePerWorker = '';
        this.workerForm.notes = '';
        alert(res?.message || 'Worker wage entry added.');
        this.loadDayData();
      },
      error: (err) => {
        alert(err?.error?.message || 'Failed to add worker wages.');
      },
      complete: () => {
        this.savingWorkers = false;
      }
    });
  }

  submitMaintenance(): void {
    if (!this.hasScopedBranch) {
      alert('Please select a specific branch first.');
      return;
    }
    const vehicleNo = String(this.maintenanceForm.vehicleNo || '').trim();
    const amount = Number(this.maintenanceForm.amount);
    if (!vehicleNo) {
      alert('Vehicle is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      alert('Please enter a valid maintenance amount.');
      return;
    }

    this.savingMaintenance = true;
    this.http.post<any>('http://localhost:3000/api/categories/running-costs/maintenance', {
      date: this.selectedDate,
      originLocId: this.getNormalizedoriginLocId(),
      vehicleNo,
      maintenanceType: this.maintenanceForm.maintenanceType,
      amount,
      notes: this.maintenanceForm.notes
    }).subscribe({
      next: (res) => {
        this.maintenanceForm.amount = '';
        this.maintenanceForm.notes = '';
        alert(res?.message || 'Maintenance cost added.');
        this.loadDayData();
      },
      error: (err) => {
        alert(err?.error?.message || 'Failed to add maintenance cost.');
      },
      complete: () => {
        this.savingMaintenance = false;
      }
    });
  }

  cancelEntry(entryType: EntryType, entry: RowMeta | null | undefined): void {
    if (!this.hasScopedBranch) {
      alert('Please select a specific branch first.');
      return;
    }
    const entryId = String(entry?._id || '').trim();
    if (!entryId) {
      alert('Missing row id.');
      return;
    }
    if (this.isEntryCancelled(entry)) {
      return;
    }
    const labelByType: Record<EntryType, string> = {
      fuel: 'fuel entry',
      workers: 'worker wage entry',
      maintenance: 'maintenance entry'
    };
    const label = labelByType[entryType] || 'entry';
    if (!window.confirm(`Cancel this ${label}?`)) {
      return;
    }

    const cancelKey = this.getCancelKey(entryType, entryId);
    if (!cancelKey) return;
    this.cancellingRows[cancelKey] = true;

    this.http.post<any>(`http://localhost:3000/api/categories/running-costs/${entryType}/${entryId}/cancel`, {
      date: this.selectedDate,
      originLocId: this.getNormalizedoriginLocId()
    }).subscribe({
      next: (res) => {
        alert(res?.message || 'Entry cancelled.');
        this.loadDayData();
      },
      error: (err) => {
        alert(err?.error?.message || `Failed to cancel ${label}.`);
      },
      complete: () => {
        delete this.cancellingRows[cancelKey];
      }
    });
  }

  private getNormalizedoriginLocId(): string {
    const raw = String(this.originLocId || localStorage.getItem('originLocId') || 'all').trim();
    return raw === 'all-hubs' ? 'all' : (raw || 'all');
  }

  private loadDayData(): void {
    const date = String(this.selectedDate || '').trim();
    if (!date) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    this.http.get<any>('http://localhost:3000/api/categories/running-costs', {
      params: {
        date,
        originLocId: this.getNormalizedoriginLocId()
      }
    }).subscribe({
      next: (res) => {
        this.cancellingRows = {};
        this.vehicleOptions = Array.isArray(res?.vehicleOptions)
          ? res.vehicleOptions
            .map((value: any) => String(value || '').trim())
            .filter((value: string) => Boolean(value))
          : [];
        this.fuelEntries = Array.isArray(res?.fuelEntries) ? res.fuelEntries : [];
        this.workerEntries = Array.isArray(res?.workerEntries) ? res.workerEntries : [];
        this.maintenanceEntries = Array.isArray(res?.maintenanceEntries) ? res.maintenanceEntries : [];
        this.summary = {
          ...this.getDefaultSummary(),
          ...(res?.summary || {})
        };
        this.syncDefaultVehicleSelection();
      },
      error: (err) => {
        this.cancellingRows = {};
        this.vehicleOptions = [];
        this.fuelEntries = [];
        this.workerEntries = [];
        this.maintenanceEntries = [];
        this.summary = this.getDefaultSummary();
        const serverMessage = String(err?.error?.message || '').trim();
        if (serverMessage && serverMessage.toLowerCase().includes('select a specific branch')) {
          this.infoMessage = serverMessage;
          this.errorMessage = '';
        } else {
          this.errorMessage = serverMessage || 'Failed to load running cost data.';
        }
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private getCancelKey(entryType: EntryType, entryId: string | undefined): string {
    const id = String(entryId || '').trim();
    return id ? `${entryType}:${id}` : '';
  }

  private syncDefaultVehicleSelection(): void {
    if (!this.vehicleOptions.length) {
      this.fuelForm.vehicleNo = '';
      this.maintenanceForm.vehicleNo = '';
      return;
    }

    if (!this.fuelForm.vehicleNo || !this.vehicleOptions.includes(this.fuelForm.vehicleNo)) {
      this.fuelForm.vehicleNo = this.vehicleOptions[0];
    }
    if (!this.maintenanceForm.vehicleNo || !this.vehicleOptions.includes(this.maintenanceForm.vehicleNo)) {
      this.maintenanceForm.vehicleNo = this.vehicleOptions[0];
    }
  }

  private getDefaultSummary(): DaySummary {
    return {
      fuelTotal: 0,
      workersTotal: 0,
      maintenanceTotal: 0,
      grandTotal: 0,
      fuelCount: 0,
      workersCount: 0,
      maintenanceCount: 0
    };
  }
}
