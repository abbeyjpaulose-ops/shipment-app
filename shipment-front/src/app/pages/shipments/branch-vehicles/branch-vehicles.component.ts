import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';

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
  manifests: any[] = [];
  private scheduledVehicleSet = new Set<string>();
  private latestManifestStatusByVehicle = new Map<string, string>();
  editManifestsLoading = false;
  editVehicleManifests: Array<{
    id: string;
    manifestNumber: string;
    status: string;
    vehicleNo: string;
    pickup: string;
    drop: string;
    consignments: Array<{
      consignmentNumber: string;
      shipmentStatus: string;
      products: Array<{ name: string; qty: number }>;
    }>;
  }> = [];
  isUpdatingManifestVehicle = false;
  isAdmin = String(localStorage.getItem('role') || '').toLowerCase() === 'admin';
  vehicles: Array<{
    originLocId: string;
    branchName: string;
    branchStatus: string;
    vehicleNo: string;
    vehicleStatus: string;
    driverPhone: string;
    currentLocationId: string;
    vehicleCurrentLocationId: string;
    vehicleCurrentLocationType: string;
    sourceType: 'branch' | 'hub';
    sourceId: string;
  }> = [];
  originLocId: string = localStorage.getItem('originLocId') || 'all';
  branchName: string = localStorage.getItem('branch') || 'All Branches';
  private branchCheck: any;
  private refreshTimer: any;
  showEditLocationPopup = false;
  editLocationVehicle: any = null;
  editLocationValue = '';
  showVehicleDetailsPopup = false;
  selectedVehicle: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadBranches();
    this.loadHubs();
    this.loadManifests();
    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      const currentId = localStorage.getItem('originLocId') || 'all';
      if (current !== this.branchName || currentId !== this.originLocId) {
        this.branchName = current;
        this.originLocId = currentId;
        this.loadManifests();
        this.buildVehicles();
      }
    }, 1000);
    this.refreshTimer = setInterval(() => {
      this.loadBranches();
      this.loadHubs();
      this.loadManifests();
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
    this.http.get<any[]>(`/api/hubs?ts=${ts}`).subscribe({
      next: (data) => {
        this.hubs = data || [];
        this.buildVehicles();
      },
      error: (err) => console.error('Error loading hubs:', err)
    });
  }

  loadBranches() {
    const ts = Date.now();
    this.http.get<any[]>(`/api/branches?ts=${ts}`).subscribe({
      next: (data) => {
        this.branches = data || [];
        this.buildVehicles();
      },
      error: (err) => console.error('Error loading branches:', err)
    });
  }

  loadManifests() {
    const params: any = {};
    if (this.originLocId && this.originLocId !== 'all' && this.originLocId !== 'all-hubs') {
      params.entityType = 'branch';
      params.entityId = this.originLocId;
    }
    this.http.get<any[]>(`/api/manifests`, { params }).subscribe({
      next: (data) => {
        this.manifests = Array.isArray(data) ? data : [];
        this.buildScheduledVehicleSet();
        this.buildVehicles();
      },
      error: (err) => console.error('Error loading manifests:', err)
    });
  }

  buildVehicles() {
    const originLocId = this.originLocId || 'all';
    const branchName = String(this.branchName || '').trim().toLowerCase();
    const isAllHubs = originLocId === 'all-hubs';
    const isAllBranches = originLocId === 'all';
    const assignedoriginLocIds = this.isAdmin ? [] : this.getAssignedoriginLocIds();
    const filtered = this.isAdmin
      ? (this.branches || [])
      : (assignedoriginLocIds.length
          ? (this.branches || []).filter((b: any) => assignedoriginLocIds.includes(String(b?._id || '').trim()))
          : []);

    const rows: Array<{
      originLocId: string;
      branchName: string;
      branchStatus: string;
      vehicleNo: string;
      vehicleStatus: string;
      driverPhone: string;
      currentLocationId: string;
      vehicleCurrentLocationId: string;
      vehicleCurrentLocationType: string;
      sourceType: 'branch' | 'hub';
      sourceId: string;
    }> = [];
    if (!isAllHubs) {
      (filtered || []).forEach((b: any) => {
        const list = Array.isArray(b?.vehicles) ? b.vehicles : [];
        list.forEach((v: any) => {
          const vehicleNo = String(v?.vehicleNo || '').trim();
          const driverPhone = String(v?.driverPhone || '').trim();
          const currentLocationId = this.normalizeId(b?._id);
          const vehicleCurrentLocationId = this.normalizeId(v?.currentLocationId || v?.currentBranch);
          const vehicleCurrentLocationType = String(v?.currentLocationType || '').trim().toLowerCase();
          if (!vehicleNo && !driverPhone) return;
          if (!isAllBranches && !this.matchesBranchFilter(currentLocationId, originLocId, branchName)) return;
          rows.push({
            originLocId: String(b?._id || ''),
            branchName: b?.branchName || '',
            branchStatus: b?.status || '',
            vehicleNo,
            vehicleStatus: this.resolveVehicleStatus(vehicleNo, v?.vehicleStatus),
            driverPhone,
            currentLocationId,
            vehicleCurrentLocationId,
            vehicleCurrentLocationType,
            sourceType: 'branch',
            sourceId: String(b?._id || '')
          });
        });
      });
    }

    const hubs = this.isAdmin
      ? (this.hubs || [])
      : (assignedoriginLocIds.length
          ? (this.hubs || []).filter((h: any) => assignedoriginLocIds.includes(String(h?.originLocId || '').trim()))
          : []);
    (hubs || []).forEach((h: any) => {
      const deliveryAddresses = Array.isArray(h?.deliveryAddresses) ? h.deliveryAddresses : [];
      deliveryAddresses.forEach((addr: any) => {
        const list = Array.isArray(addr?.vehicles) ? addr.vehicles : [];
        list.forEach((v: any) => {
          const vehicleNo = String(v?.vehicleNo || '').trim();
          const driverPhone = String(v?.driverPhone || '').trim();
          const currentLocationId = this.normalizeId(h?._id);
          const vehicleCurrentLocationId = this.normalizeId(v?.currentLocationId || v?.currentBranch);
          const vehicleCurrentLocationType = String(v?.currentLocationType || '').trim().toLowerCase();
          if (!vehicleNo && !driverPhone) return;
          if (!isAllBranches && !isAllHubs && !this.matchesBranchFilter(currentLocationId, originLocId, branchName)) return;
          rows.push({
            originLocId: String(h?._id || ''),
            branchName: h?.hubName || '',
            branchStatus: h?.status || '',
            vehicleNo,
            vehicleStatus: this.resolveVehicleStatus(vehicleNo, v?.vehicleStatus),
            driverPhone,
            currentLocationId,
            vehicleCurrentLocationId,
            vehicleCurrentLocationType,
            sourceType: 'hub',
            sourceId: String(h?._id || '')
          });
        });
      });
    });
    this.vehicles = rows;
  }

  private matchesBranchFilter(currentLocationId: string, originLocId: string, branchName: string): boolean {
    const raw = String(currentLocationId || '').trim();
    if (!raw) return false;
    const targetName = String(branchName || '').trim().toLowerCase();
    const rawLower = raw.toLowerCase();
    if (rawLower === targetName) return true;
    if (String(raw) === String(originLocId)) return true;
    const branch = (this.branches || []).find((b: any) => String(b?._id || '') === raw);
    if (branch?.branchName && String(branch.branchName).trim().toLowerCase() === targetName) return true;
    const hub = (this.hubs || []).find((h: any) => String(h?._id || '') === raw);
    if (hub?.hubName && String(hub.hubName).trim().toLowerCase() === targetName) return true;
    return this.matchesBranchLabel(raw, String(branchName || ''));
  }

  private matchesBranchLabel(currentBranch: string, branchLabel: string): boolean {
    const current = String(currentBranch || '').trim().toLowerCase();
    const label = String(branchLabel || '').trim().toLowerCase();
    if (!current || !label) return false;
    if (label === current) return true;
    if (label.startsWith(`${current}-`)) return true;
    const labelPrefix = label.split('-')[0].trim();
    return Boolean(labelPrefix) && labelPrefix === current;
  }

  private onStorage = (e: StorageEvent) => {
    if (e.key === 'branch' || e.key === 'originLocId') {
      this.branchName = localStorage.getItem('branch') || 'All Branches';
      this.originLocId = localStorage.getItem('originLocId') || 'all';
      this.loadBranches();
      this.loadHubs();
      this.loadManifests();
    }
  };

  private normalizeId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    if (value?.$oid) return String(value.$oid);
    return String(value);
  }

  private getAssignedoriginLocIds(): string[] {
    try {
      const storedIds = JSON.parse(localStorage.getItem('originLocIds') || '[]');
      if (!Array.isArray(storedIds)) return [];
      return storedIds
        .map((id: any) => String(id || '').trim())
        .filter((id: string) => id);
    } catch {
      return [];
    }
  }

  toggleBranchStatus(originLocId: string) {
    if (!originLocId) return;
    this.http.patch(`/api/branches/${originLocId}/status`, {}).subscribe({
      next: () => this.loadBranches(),
      error: (err) => console.error('Error updating branch status:', err)
    });
  }

  openEditLocation(vehicle: any, event?: MouseEvent) {
    if (event) event.stopPropagation();
    if (!vehicle?.vehicleNo) return;
    this.editLocationVehicle = vehicle;
    const currentId = this.normalizeId(vehicle?.vehicleCurrentLocationId);
    const currentType = String(vehicle?.vehicleCurrentLocationType || '').trim().toLowerCase();
    if (currentId && currentType) {
      this.editLocationValue = `${currentType}:${currentId}`;
    } else if (vehicle?.currentLocationId && vehicle?.sourceType) {
      this.editLocationValue = `${vehicle.sourceType}:${vehicle.currentLocationId}`;
    } else {
      this.editLocationValue = '';
    }
    this.loadVehicleManifestsForEdit(vehicle.vehicleNo);
    this.showEditLocationPopup = true;
  }

  openVehicleDetails(vehicle: any) {
    if (!vehicle) return;
    this.selectedVehicle = vehicle;
    this.showVehicleDetailsPopup = true;
  }

  closeVehicleDetailsPopup() {
    this.showVehicleDetailsPopup = false;
    this.selectedVehicle = null;
  }

  editVehicleFromDetails() {
    if (!this.selectedVehicle) return;
    this.openEditLocation(this.selectedVehicle);
    this.closeVehicleDetailsPopup();
  }

  closeEditLocationPopup() {
    this.showEditLocationPopup = false;
    this.editLocationVehicle = null;
    this.editLocationValue = '';
    this.editVehicleManifests = [];
    this.editManifestsLoading = false;
    this.isUpdatingManifestVehicle = false;
  }

  saveEditLocation() {
    if (!this.editLocationVehicle || !this.editLocationValue) return;
    const [type, id] = String(this.editLocationValue).split(':');
    if (!type || !id) return;
    const endpoint = this.editLocationVehicle.sourceType === 'hub'
      ? `/api/hubs/${this.editLocationVehicle.sourceId}/vehicle-status`
      : `/api/branches/${this.editLocationVehicle.sourceId}/vehicle-status`;
    this.http.patch(endpoint, {
      vehicleNo: this.editLocationVehicle.vehicleNo,
      vehicleStatus: this.editLocationVehicle.vehicleStatus || 'online',
      currentLocationId: id,
      currentLocationType: type
    }).subscribe({
      next: () => {
        this.closeEditLocationPopup();
        this.loadBranches();
        this.loadHubs();
        this.loadManifests();
      },
      error: (err) => console.error('Error updating vehicle location:', err)
    });
  }

  private loadVehicleManifestsForEdit(vehicleNo: string) {
    const target = String(vehicleNo || '').trim().toLowerCase();
    const manifestMatches = (this.manifests || [])
      .filter((m: any) => String(m?.vehicleNo || '').trim().toLowerCase() === target)
      .filter((m: any) => String(m?.status || '').trim().toLowerCase() === 'scheduled');
    this.editManifestsLoading = true;
    this.editVehicleManifests = [];
    this.fillManifestDetails(manifestMatches, (payload) => {
      this.editVehicleManifests = payload;
      this.editManifestsLoading = false;
    });
  }

  private fillManifestDetails(
    manifestMatches: any[],
    onDone: (payload: Array<{
      id: string;
      manifestNumber: string;
      status: string;
      vehicleNo: string;
      pickup: string;
      drop: string;
      consignments: Array<{
        consignmentNumber: string;
        shipmentStatus: string;
        products: Array<{ name: string; qty: number }>;
      }>;
    }>) => void
  ) {
    if (!manifestMatches.length) {
      onDone([]);
      return;
    }

    const consignmentNumbers = Array.from(new Set(
      manifestMatches
        .flatMap((m: any) => Array.isArray(m?.items) ? m.items : [])
        .map((i: any) => String(i?.consignmentNumber || '').trim())
        .filter(Boolean)
    ));

    if (!consignmentNumbers.length) {
      onDone(manifestMatches.map((m: any) => ({
        id: String(m?._id || ''),
        manifestNumber: String(m?.manifestNumber || ''),
        status: String(m?.status || ''),
        vehicleNo: String(m?.vehicleNo || ''),
        pickup: this.resolveManifestPickup(m),
        drop: this.resolveManifestDrop(m),
        consignments: []
      })));
      return;
    }

    const calls = consignmentNumbers.map((consignmentNumber) =>
      this.http.get<any[]>(`/api/newshipments/getConsignment`, {
        params: { consignmentNumber }
      })
    );

    forkJoin(calls).subscribe({
      next: (responses: any[]) => {
        const consignments = responses.flatMap((r) => Array.isArray(r) ? r : []);
        const byNumber = new Map(
          consignments.map((c: any) => [String(c?.consignmentNumber || ''), c])
        );
        const payload = manifestMatches.map((m: any) => {
          const items = Array.isArray(m?.items) ? m.items : [];
          const manifestConsignments = items.map((item: any) => {
            const consignmentNumber = String(item?.consignmentNumber || '').trim();
            const shipment = byNumber.get(consignmentNumber);
            const products = this.buildShipmentProductSummary(shipment);
            return {
              consignmentNumber,
              shipmentStatus: String(shipment?.shipmentStatus || ''),
              products
            };
          }).filter((c: any) => c.consignmentNumber);
          return {
            id: String(m?._id || ''),
            manifestNumber: String(m?.manifestNumber || ''),
            status: String(m?.status || ''),
            vehicleNo: String(m?.vehicleNo || ''),
            pickup: this.resolveManifestPickup(m),
            drop: this.resolveManifestDrop(m),
            consignments: manifestConsignments
          };
        });
        onDone(payload);
      },
      error: (err) => {
        console.error('Error loading vehicle manifests', err);
        onDone([]);
      }
    });
  }

  getCurrentBranchLabel(value: string) {
    const raw = this.normalizeId(value);
    if (!raw) return '-';
    const branch = (this.branches || []).find((b: any) => String(b?._id || '') === raw);
    if (branch?.branchName) return branch.branchName;
    const byName = (this.branches || []).find((b: any) =>
      String(b?.branchName || '').trim().toLowerCase() === raw.toLowerCase()
    );
    if (byName?.branchName) return byName.branchName;
    const byPrefix = (this.branches || []).find((b: any) =>
      this.matchesBranchLabel(raw, String(b?.branchName || ''))
    );
    if (byPrefix?.branchName) return byPrefix.branchName;
    const hub = (this.hubs || []).find((h: any) => String(h?._id || '') === raw);
    if (hub?.hubName) return hub.hubName;
    return raw;
  }

  getVehicleCurrentBranchLabel(vehicle: any) {
    const id = this.normalizeId(vehicle?.vehicleCurrentLocationId || '');
    if (!id) return '-';
    return this.getCurrentBranchLabel(id);
  }

  getLocationOptions(): Array<{ value: string; label: string }> {
    const options: Array<{ value: string; label: string }> = [];
    (this.branches || []).forEach((b: any) => {
      const id = this.normalizeId(b?._id);
      if (!id) return;
      const name = String(b?.branchName || '').trim();
      options.push({ value: `branch:${id}`, label: `Branch: ${name || id}` });
    });
    (this.hubs || []).forEach((h: any) => {
      const id = this.normalizeId(h?._id);
      if (!id) return;
      const name = String(h?.hubName || '').trim();
      options.push({ value: `hub:${id}`, label: `Hub: ${name || id}` });
    });
    return options;
  }


  formatVehicleStatus(status: string) {
    const value = String(status || '').trim().toLowerCase();
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private hasManifestationConsignments(manifest: any): boolean {
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    return items.some((item: any) => {
      const status = String(item?.shipmentStatus || '').trim().toLowerCase();
      return status === 'manifestation' || status === 'dmanifestation';
    });
  }

  private buildScheduledVehicleSet() {
    const latestByVehicle = new Map<string, { status: string; ts: number }>();
    const scheduled = new Set<string>();
    (this.manifests || []).forEach((m: any) => {
      const vehicleNo = String(m?.vehicleNo || '').trim().toLowerCase();
      if (!vehicleNo) return;
      const status = String(m?.status || '').trim().toLowerCase();
      const tsSource = m?.deliveredAt || m?.updatedAt || m?.createdAt;
      const ts = tsSource ? new Date(tsSource).getTime() : 0;
      const existing = latestByVehicle.get(vehicleNo);
      if (!existing || ts >= existing.ts) {
        latestByVehicle.set(vehicleNo, { status, ts });
      }
      if (this.hasManifestationConsignments(m)) {
        scheduled.add(vehicleNo);
      }
    });
    const latestStatus = new Map<string, string>();
    latestByVehicle.forEach((info, vehicleNo) => {
      latestStatus.set(vehicleNo, info.status);
    });
    this.scheduledVehicleSet = scheduled;
    this.latestManifestStatusByVehicle = latestStatus;
  }

  private resolveVehicleStatus(vehicleNo: string, fallback: string) {
    const key = String(vehicleNo || '').trim().toLowerCase();
    if (!key) return String(fallback || 'online');
    if (this.scheduledVehicleSet.has(key)) return 'scheduled';
    const latest = this.latestManifestStatusByVehicle.get(key);
    if (latest === 'completed') return 'completed';
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    if (fallbackValue === 'offline') return 'offline';
    return 'online';
  }

  private resolveManifestPickup(manifest: any): string {
    const entityType = String(manifest?.entityType || '').trim().toLowerCase();
    const entityId = this.normalizeId(manifest?.entityId);
    return this.resolveLocationName(entityType, entityId);
  }

  private resolveManifestDrop(manifest: any): string {
    const deliveryType = String(manifest?.deliveryType || '').trim().toLowerCase();
    const deliveryId = this.normalizeId(manifest?.deliveryId);
    if (deliveryType && deliveryId) {
      return this.resolveLocationName(deliveryType, deliveryId);
    }
    return this.resolveManifestPickup(manifest);
  }

  private resolveLocationName(entityType: string, entityId: string): string {
    if (!entityType || !entityId) return '-';
    if (entityType === 'hub') {
      const hub = (this.hubs || []).find((h: any) => this.normalizeId(h?._id) === entityId);
      return hub?.hubName ? String(hub.hubName).trim() : entityId;
    }
    const branch = (this.branches || []).find((b: any) => this.normalizeId(b?._id) === entityId);
    return branch?.branchName ? String(branch.branchName).trim() : entityId;
  }

  private buildShipmentProductSummary(shipment: any): Array<{ name: string; qty: number }> {
    if (!shipment) return [];
    const invoices = Array.isArray(shipment?.ewaybills)
      ? shipment.ewaybills.flatMap((ewb: any) => ewb?.invoices || [])
      : (shipment?.invoices || []);
    const products = invoices.flatMap((inv: any) => inv?.products || []);
    const summary = new Map<string, number>();
    products.forEach((p: any) => {
      const name = String(p?.type || p?.productName || '').trim();
      if (!name) return;
      const qty = Number(p?.amount) || 0;
      summary.set(name, (summary.get(name) || 0) + qty);
    });
    return Array.from(summary.entries()).map(([name, qty]) => ({ name, qty }));
  }

  getCompanyVehicleOptions(): string[] {
    const options = new Set<string>();
    (this.branches || []).forEach((b: any) => {
      (b?.vehicles || []).forEach((v: any) => {
        const no = String(v?.vehicleNo || '').trim();
        if (no) options.add(no);
      });
    });
    (this.hubs || []).forEach((h: any) => {
      (h?.deliveryAddresses || []).forEach((addr: any) => {
        (addr?.vehicles || []).forEach((v: any) => {
          const no = String(v?.vehicleNo || '').trim();
          if (no) options.add(no);
        });
      });
    });
    return Array.from(options);
  }

  onManifestVehicleChange(manifest: any, vehicleNo: string) {
    const id = String(manifest?.id || '').trim();
    const nextVehicle = String(vehicleNo || '').trim();
    if (!id || !nextVehicle) return;
    if (nextVehicle === String(manifest?.vehicleNo || '').trim()) return;
    this.isUpdatingManifestVehicle = true;
    this.http.patch(`/api/manifests/${id}/vehicle`, {
      vehicleNo: nextVehicle
    }).subscribe({
      next: () => {
        manifest.vehicleNo = nextVehicle;
        this.loadManifests();
        this.isUpdatingManifestVehicle = false;
      },
      error: (err) => {
        console.error('Error updating manifest vehicle', err);
        this.isUpdatingManifestVehicle = false;
      }
    });
  }
}

