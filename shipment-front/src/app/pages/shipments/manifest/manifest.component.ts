import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-manifest',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manifest.component.html',
  styleUrls: ['./manifest.component.css']
})
export class ManifestComponent implements OnInit {
  manifests: any[] = [];
  filteredManifests: any[] = [];
  searchText: string = '';
  filterDate: string = '';
  filterConsignor: string = '';
  selectedManifest: any = null;
  showDeliveryPopup: boolean = false;
  selectedForDelivery: any[] = [];

  email: string = '';
  username: string = '';
  branch: string = localStorage.getItem('branch') || 'All Branches';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.email = localStorage.getItem('email') || '';
    this.username = localStorage.getItem('username') || '';
    this.branch = localStorage.getItem('branch') || 'All Branches';
    this.loadManifests();
  }

  // ✅ Load all manifests from backend
  loadManifests() {
    this.http.get<any[]>(`http://localhost:3000/api/manifest?email=${this.email}`).subscribe({
      next: (res) => {
        this.manifests = res;
        this.filteredManifests = [...this.manifests];
        console.log('📦 Loaded manifests:', res);
      },
      error: (err) => console.error('❌ Error loading manifests:', err)
    });
  }

  applyFilters() {
    this.filteredManifests = this.manifests.filter(m =>
      (this.searchText ? m.manifestationNumber?.includes(this.searchText) || m.consignments?.some((c: any) => c.consignor?.includes(this.searchText)) : true) &&
      (this.filterDate ? new Date(m.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? m.consignments?.some((c: any) => c.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase())) : true)
    );
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredManifests.forEach(m => m.selected = checked);
  }

  // ✅ Open delivery popup
  openDeliveryPopup() {
    this.selectedForDelivery = this.filteredManifests.filter(m => m.selected);

    if (this.selectedForDelivery.length === 0) {
      alert('⚠️ Please select at least one manifest to deliver.');
      return;
    }

    this.showDeliveryPopup = true;
  }

  closeDeliveryPopup() {
    this.showDeliveryPopup = false;
  }

  // ✅ Finalize delivery and update statuses in both DBs
  finalizeDelivery() {
    if (this.selectedForDelivery.length === 0) {
      alert('No manifests selected for delivery.');
      return;
    }

    this.selectedForDelivery.forEach(manifest => {
      manifest.consignments.forEach((cons: any) => {
        cons.invoices.forEach((inv: any) => {
          inv.products.forEach((p: any) => {
            // update stock — if any product left undelivered
            if (p.instock > 0) {
              p.instock = 0;
            }
          });
        });

        // Update consignment in newshipments DB
        const updatedStatus = 'Delivered';
        const updatedStock = { ...cons, shipmentStatus: updatedStatus };

        this.http.put(`http://localhost:3000/api/newshipments/${cons.consignmentNumber}`, updatedStock)
          .subscribe({
            next: () => {
              console.log(`✅ Consignment ${cons.consignmentNumber} marked as Delivered`);
            },
            error: (err) => {
              console.error(`❌ Error updating consignment ${cons.consignmentNumber}:`, err);
            }
          });
      });
    });

    this.showDeliveryPopup = false;
    alert('✅ Delivery completed successfully!');
    this.filteredManifests.forEach(m => m.selected = false);
    this.loadManifests();
  }
}
