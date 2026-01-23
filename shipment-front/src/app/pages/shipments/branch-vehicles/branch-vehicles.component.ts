import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-branch-vehicles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './branch-vehicles.component.html',
  styleUrls: ['./branch-vehicles.component.css']
})
export class BranchVehiclesComponent implements OnInit, OnDestroy {
  branches: any[] = [];
  hubs: any[] = [];
  vehicles: Array<{
    branchId: string;
    branchName: string;
    branchStatus: string;
    vehicleNo: string;
    vehicleStatus: string;
    driverPhone: string;
    currentBranch: string;
    sourceType: 'branch' | 'hub';
    sourceId: string;
  }> = [];
  branchId: string = localStorage.getItem('branchId') || 'all';
  branchName: string = localStorage.getItem('branch') || 'All Branches';
  private branchCheck: any;
  private refreshTimer: any;
  private vehicleStatusByKey = new Map<string, string>();
  showDeliveringConfirm = false;
  showCompletionConfirm = false;
  pendingStatusVehicle: any = null;
  deliveringConsignments: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }> = [];
  completionConsignments: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }> = [];
  private deliveringConsignmentsOriginal: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }> = [];
  private completionConsignmentsOriginal: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }> = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadBranches();
    this.loadHubs();
    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('branchId') || 'all';
      if (current !== this.branchName || currentId !== this.branchId) {
        this.branchName = current;
        this.branchId = currentId;
        this.buildVehicles();
      }
    }, 1000);
    this.refreshTimer = setInterval(() => {
      this.loadBranches();
      this.loadHubs();
    }, 5000);
    window.addEventListener('storage', this.onStorage);
  }

  ngOnDestroy() {
    if (this.branchCheck) clearInterval(this.branchCheck);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    window.removeEventListener('storage', this.onStorage);
  }

  loadHubs() {
    const ts = Date.now();
    this.http.get<any[]>(`http://localhost:3000/api/hubs?ts=${ts}`).subscribe({
      next: (data) => {
        this.hubs = data || [];
        this.buildVehicles();
      },
      error: (err) => console.error('Error loading hubs:', err)
    });
  }

  loadBranches() {
    const ts = Date.now();
    this.http.get<any[]>(`http://localhost:3000/api/branches?ts=${ts}`).subscribe({
      next: (data) => {
        this.branches = data || [];
        this.buildVehicles();
      },
      error: (err) => console.error('Error loading branches:', err)
    });
  }

  buildVehicles() {
    const branchId = this.branchId || 'all';
    const branchName = String(this.branchName || '').trim().toLowerCase();
    const filtered = branchId === 'all'
      ? this.branches
      : this.branches.filter((b: any) => {
          const idMatch = String(b?._id || '') === String(branchId || '');
          const nameMatch = String(b?.branchName || '').trim().toLowerCase() === branchName;
          return idMatch || nameMatch;
        });

    const rows: Array<{
      branchId: string;
      branchName: string;
      branchStatus: string;
      vehicleNo: string;
      vehicleStatus: string;
      driverPhone: string;
      currentBranch: string;
      sourceType: 'branch' | 'hub';
      sourceId: string;
    }> = [];
    (filtered || []).forEach((b: any) => {
      const list = Array.isArray(b?.vehicles) ? b.vehicles : [];
      list.forEach((v: any) => {
        const vehicleNo = String(v?.vehicleNo || '').trim();
        const driverPhone = String(v?.driverPhone || '').trim();
        const currentBranch = String(v?.currentBranch || '').trim();
        if (!vehicleNo && !driverPhone) return;
        if (branchId !== 'all') {
          const currentBranchName = currentBranch.toLowerCase();
          if (!currentBranchName || currentBranchName !== branchName) return;
        }
        rows.push({
          branchId: String(b?._id || ''),
          branchName: b?.branchName || '',
          branchStatus: b?.status || '',
          vehicleNo,
          vehicleStatus: String(v?.vehicleStatus || 'online'),
          driverPhone,
          currentBranch,
          sourceType: 'branch',
          sourceId: String(b?._id || '')
        });
      });
    });

    const hubs = branchId === 'all'
      ? this.hubs
      : this.hubs.filter((h: any) => String(h?.branchId || '') === String(branchId || ''));
    (hubs || []).forEach((h: any) => {
      const deliveryAddresses = Array.isArray(h?.deliveryAddresses) ? h.deliveryAddresses : [];
      deliveryAddresses.forEach((addr: any) => {
        const list = Array.isArray(addr?.vehicles) ? addr.vehicles : [];
        list.forEach((v: any) => {
          const vehicleNo = String(v?.vehicleNo || '').trim();
          const driverPhone = String(v?.driverPhone || '').trim();
          const currentBranch = String(v?.currentBranch || '').trim();
          if (!vehicleNo && !driverPhone) return;
          if (branchId !== 'all') {
            const currentBranchName = currentBranch.toLowerCase();
            if (!currentBranchName || currentBranchName !== branchName) return;
          }
          rows.push({
            branchId: String(h?._id || ''),
            branchName: h?.hubName || '',
            branchStatus: h?.status || '',
            vehicleNo,
            vehicleStatus: String(v?.vehicleStatus || 'online'),
            driverPhone,
            currentBranch,
            sourceType: 'hub',
            sourceId: String(h?._id || '')
          });
        });
      });
    });
    this.vehicles = rows;
    this.vehicleStatusByKey = new Map(
      rows.map((v) => [`${v.sourceType}:${v.sourceId}:${v.vehicleNo}`, v.vehicleStatus || 'online'])
    );
  }

  private onStorage = (e: StorageEvent) => {
    if (e.key === 'branch' || e.key === 'branchId') {
      this.branchName = localStorage.getItem('branch') || 'All Branches';
      this.branchId = localStorage.getItem('branchId') || 'all';
      this.loadBranches();
      this.loadHubs();
    }
  };

  private normalizeId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }

  toggleBranchStatus(branchId: string) {
    if (!branchId) return;
    this.http.patch(`http://localhost:3000/api/branches/${branchId}/status`, {}).subscribe({
      next: () => this.loadBranches(),
      error: (err) => console.error('Error updating branch status:', err)
    });
  }

  onVehicleStatusChange(vehicle: any) {
    if (!vehicle) return;
    const key = `${vehicle.sourceType}:${vehicle.sourceId}:${vehicle.vehicleNo}`;
    const previousStatus = this.vehicleStatusByKey.get(key) || vehicle.vehicleStatus || 'online';
    const nextStatus = String(vehicle.vehicleStatus || '').trim().toLowerCase();
    if (nextStatus === 'delivering') {
      this.pendingStatusVehicle = { ...vehicle, previousStatus };
      vehicle.vehicleStatus = previousStatus;
      this.fetchDeliveringConsignments();
      return;
    }
    if (nextStatus === 'completed') {
      this.pendingStatusVehicle = { ...vehicle, previousStatus };
      vehicle.vehicleStatus = previousStatus;
      this.fetchCompletionConsignments();
      return;
    }
    this.updateVehicleStatus(vehicle, nextStatus);
  }

  confirmDelivering() {
    if (!this.pendingStatusVehicle) return;
    const removed = this.getRemovedConsignments(
      this.deliveringConsignmentsOriginal,
      this.deliveringConsignments
    );
    this.updateConsignmentStatuses([], removed, { applyCurrentBranchFromDetails: false }).subscribe({
      next: () => {
        this.updateVehicleStatus(this.pendingStatusVehicle, 'delivering');
        this.showDeliveringConfirm = false;
        this.deliveringConsignments = [];
        this.deliveringConsignmentsOriginal = [];
        this.pendingStatusVehicle = null;
      },
      error: (err) => console.error('Error updating consignments:', err)
    });
  }

  cancelDelivering() {
    this.showDeliveringConfirm = false;
    this.deliveringConsignments = [];
    this.deliveringConsignmentsOriginal = [];
    this.pendingStatusVehicle = null;
  }

  confirmCompletion() {
    if (!this.pendingStatusVehicle) return;
    const nextDeliveryPoint = this.getNextDeliveryPointFromConsignments(this.completionConsignments);
    const removed = this.getRemovedConsignments(
      this.completionConsignmentsOriginal,
      this.completionConsignments
    );
    this.updateConsignmentStatuses(this.completionConsignments, removed, { applyCurrentBranchFromDetails: true }).subscribe({
      next: () => {
        this.updateVehicleStatus(this.pendingStatusVehicle, 'online', nextDeliveryPoint);
        this.showCompletionConfirm = false;
        this.completionConsignments = [];
        this.completionConsignmentsOriginal = [];
        this.pendingStatusVehicle = null;
      },
      error: (err) => console.error('Error updating consignments:', err)
    });
  }

  cancelCompletion() {
    this.showCompletionConfirm = false;
    this.completionConsignments = [];
    this.completionConsignmentsOriginal = [];
    this.pendingStatusVehicle = null;
  }

  removeDeliveringConsignment(index: number) {
    this.deliveringConsignments.splice(index, 1);
  }

  removeCompletionConsignment(index: number) {
    this.completionConsignments.splice(index, 1);
  }

  getCurrentBranchLabel(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const branch = (this.branches || []).find((b: any) => String(b?._id || '') === raw);
    if (branch?.branchName) return branch.branchName;
    const hub = (this.hubs || []).find((h: any) => String(h?._id || '') === raw);
    if (hub?.hubName) return hub.hubName;
    return raw;
  }

  private fetchDeliveringConsignments() {
    const vehicleNo = String(this.pendingStatusVehicle?.vehicleNo || '').trim();
    if (!vehicleNo) return;
    this.http.get<any>('http://localhost:3000/api/newshipments/vehicle-consignments', {
      params: { vehicleNumber: vehicleNo, statusFilter: 'assigned' }
    }).subscribe({
      next: (resp) => {
        const list = Array.isArray(resp?.consignments) ? resp.consignments : [];
        if (!list.length) {
          this.updateVehicleStatus(this.pendingStatusVehicle, 'online');
          this.pendingStatusVehicle = null;
          return;
        }
        this.deliveringConsignments = list;
        this.deliveringConsignmentsOriginal = list.map((c: any) => ({ ...c }));
        this.showDeliveringConfirm = true;
      },
      error: (err) => console.error('Error loading delivering consignments:', err)
    });
  }

  private fetchCompletionConsignments() {
    const vehicleNo = String(this.pendingStatusVehicle?.vehicleNo || '').trim();
    if (!vehicleNo) return;
    this.http.get<any>('http://localhost:3000/api/newshipments/vehicle-consignments', {
      params: { vehicleNumber: vehicleNo, statusFilter: 'assigned' }
    }).subscribe({
      next: (resp) => {
        const list = Array.isArray(resp?.consignments) ? resp.consignments : [];
        if (!list.length) {
          this.updateVehicleStatus(this.pendingStatusVehicle, 'online');
          this.pendingStatusVehicle = null;
          return;
        }
        this.completionConsignments = list;
        this.completionConsignmentsOriginal = list.map((c: any) => ({ ...c }));
        this.showCompletionConfirm = true;
      },
      error: (err) => console.error('Error loading completion consignments:', err)
    });
  }

  private getRemovedConsignments(
    original: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }>,
    current: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }>
  ): Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }> {
    const currentIds = new Set(current.map((c) => String(c?.id || '')));
    return original.filter((c) => !currentIds.has(String(c?.id || '')));
  }

  private updateConsignmentStatuses(
    kept: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }>,
    removed: Array<{ id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string }>,
    options: { applyCurrentBranchFromDetails: boolean }
  ): Observable<any[]> {
    const updates = [
      ...kept.map((item) => this.buildShipmentUpdate(item, true, options)),
      ...removed.map((item) => this.buildShipmentUpdate(item, false, options))
    ].filter(Boolean) as any[];
    if (!updates.length) {
      return of([] as any[]);
    }
    return forkJoin(updates);
  }

  private buildShipmentUpdate(
    item: { id: string; consignmentNumber: string; shipmentStatus: string; shipmentStatusDetails?: string },
    keep: boolean,
    options: { applyCurrentBranchFromDetails: boolean }
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
    const currentBranchId = options.applyCurrentBranchFromDetails && keep
      ? this.parseCurrentBranchId(item?.shipmentStatusDetails)
      : '';
    const shipmentParam = `?shipmentId=${encodeURIComponent(shipmentId)}`;
    return this.http.put(
      `http://localhost:3000/api/newshipments/${consignmentNumber}${shipmentParam}`,
      {
        shipmentId,
        shipmentStatus: nextStatus,
        ...(currentBranchId ? { currentBranchId } : {})
      }
    );
  }

  private updateVehicleStatus(vehicle: any, status: string, currentBranch?: string | null) {
    if (!vehicle?.vehicleNo || !vehicle?.sourceId) return;
    const nextStatus = status === 'completed' ? 'online' : status;
    const endpoint = vehicle.sourceType === 'hub'
      ? `http://localhost:3000/api/hubs/${vehicle.sourceId}/vehicle-status`
      : `http://localhost:3000/api/branches/${vehicle.sourceId}/vehicle-status`;
    this.http.patch(endpoint, {
      vehicleNo: vehicle.vehicleNo,
      vehicleStatus: nextStatus,
      ...(currentBranch ? { currentBranch } : {})
    }).subscribe({
      next: () => {
        this.loadBranches();
        this.loadHubs();
      },
      error: (err) => console.error('Error updating vehicle status:', err)
    });
  }

  private getNextDeliveryPointFromConsignments(
    consignments: Array<{ shipmentStatusDetails?: string }>
  ): string | null {
    const details = (consignments || [])
      .map((c) => String(c?.shipmentStatusDetails || '').trim())
      .find((text) => text);
    if (!details) return null;
    return this.parseCurrentBranchId(details);
  }

  private parseCurrentBranchId(details?: string): string {
    if (!details) return '';
    const parts = String(details)
      .split('$$')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (!parts.length) return '';
    const last = parts[parts.length - 1];
    if (!last) return '';
    const cleaned = last.includes('/') ? last.split('/').pop() || '' : last;
    return String(cleaned || '').trim();
  }

  formatVehicleStatus(status: string) {
    const value = String(status || '').trim().toLowerCase();
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
