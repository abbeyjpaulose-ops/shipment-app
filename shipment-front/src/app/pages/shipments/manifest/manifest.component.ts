import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, provideHttpClient } from '@angular/common/http';

@Component({
  selector: 'app-manifest',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manifest.component.html',
  styleUrls: ['./manifest.component.css']
})
export class ManifestComponent implements OnInit {
  manifest: any[] = [];
  filteredManifest: any[] = [];
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  selectedManifest: any = null;
  editingManifest: any = null;   // ✅ track which manifest is being edited

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadManifest();
  }

  loadManifest() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/newshipments?email=${email}`).subscribe({
      next: (res) => {
        // filter only In Tansit shipments
        
        this.manifest = res.filter(s => s.shipmentStatus === 'In Transit');
        console.log(this.manifest);
        this.filteredManifest = [...this.manifest];
      },
      error: (err) => console.error('❌ Error loading manifest:', err)
    });
  }

  applyFilters() {
    this.filteredManifest = this.manifest.filter(s =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true)
    );
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredManifest.forEach(s => s.selected = checked);
  }

  manifestSelected() {
  const selectedConsignments = this.filteredManifest.filter(s => s.selected);

  if (selectedConsignments.length === 0) {
    console.warn('⚠️ No consignments selected for manifestation.');
    return;
  }

  selectedConsignments.forEach(manifest => {
    const updatedManifest = { ...manifest, shipmentStatus: 'Delivered' };
    console.log("sqsqsqsqsqsqsqsqsqs" + manifest.shipmentStatus);

    this.http.put(`http://localhost:3000/api/newshipments/${manifest.consignmentNumber}`, updatedManifest)
      .subscribe({
        next: () => {
          console.log(`✅ Consignment ${manifest.consignmentNumber} updated to Delivered`);
          this.loadManifest(); // Refresh data
        },
        error: (err) => {
          console.error(`❌ Error updating consignment ${manifest.consignmentNumber}:`, err);
        }
      });
  });

  // Optionally clear selection after update
  this.filteredManifest.forEach(s => s.selected = false);
}


  openManifestDetails(manifest: any) {
    this.selectedManifest = manifest;
  }

  closeManifestDetails() {
    this.selectedManifest = null;
  }

    editManifest(manifest: any) {
    console.log('✏️ Edit manifest:', manifest);
    this.editingManifest = { ...manifest };  // ✅ copy so we don’t mutate directly
  }

  saveManifestEdit() {
    if (!this.editingManifest) return;

    console.log("kkkkkkkkkkklllllllllllllllll" + this.editingManifest.consignmentNumber);

    this.http.put(`http://localhost:3000/api/newshipments/${this.editingManifest.consignmentNumber}`, this.editingManifest)
      .subscribe({
        next: () => {
          console.log('✅ Manifest updated');
          this.loadManifest();          // reload updated data
          this.editingManifest = null;   // close modal
        },
        error: (err) => console.error('❌ Error updating manifest:', err)
      });
  }

  cancelEdit() {
    this.editingManifest = null;
  }

}
