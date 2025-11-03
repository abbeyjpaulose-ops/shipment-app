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
    this.http.get<any[]>('http://localhost:3000/api/manifest', {
      params: {
        email: localStorage.getItem('email') || '',
        branch: localStorage.getItem('branch') || ''
      }
    }).subscribe({
      next: (res: any[]) => {
        this.manifests = res
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.filteredManifests = [...this.manifests];
      },
      error: (err: any) => console.error('❌ Error loading shipments:', err)
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
    const userEmail = localStorage.getItem('email') || '';
    this.selectedForDelivery.forEach(manifest => {
      manifest.consignments.forEach((cons: any) => {
        // Update product delivery status
        cons.invoices.forEach((inv: any) => {
          inv.products.forEach((p: any) => {
            if (p.intransitstock > 0) {
              p.deliveredstock = (p.deliveredstock || 0) + p.intransitstock;
            }
            p.intransitstock = 0;
          });
        });
      // Check if all products are fully delivered
      const allDelivered = cons.invoices.every((inv: any) =>
        inv.products.every((p: any) => p.deliveredstock === p.amount)
      );
      // Prepare updated consignment
 
      const updatedConsignment = {
        ...cons,
        mshipmentStatus: allDelivered ? 'Delivered' : 'In Transit'
      };

      // Send updated consignment using helper method
  
      this.updateConsignment(userEmail, updatedConsignment);
  
    });
    manifest = {
        ...manifest,
        mshipmentStatus: 'Delivered'
      };

  
    console.log(`🚚 Updating consignment ${manifest.manifestationNumber} to status:`, manifest);

    this.http.post(`http://localhost:3000/api/manifest/manifestationNumber`, manifest)
      .subscribe({
        next: () => {
          console.log('✅ Manifest Stock updated');
          
        },
        error: (err) => console.error('❌ Error updating stock:', err)
      });

  
  });

  // Final UI updates
  this.showDeliveryPopup = false;
  alert('✅ Delivery completed successfully!');
  this.filteredManifests.forEach(m => m.selected = false);
  this.loadManifests();
}

updatedstkConsignmentfn(updatedConsignment: any) {
  this.http.put(`http://localhost:3000/api/newshipments/${updatedConsignment.consignmentNumber}`, updatedConsignment)
      .subscribe({
        next: () => {
          console.log('✅ Stock updated');
        },
        error: (err) => console.error('❌ Error updating stock:', err)
      });
  }



updateConsignment(email: string, updatedConsignment: any) {
  const payload = {
    email,
    updatedConsignment
  };
  //console.log('📤 SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSending update payload:', payload.updatedConsignment.invoices[0].products);
  let i=0;

  this.http.get<any[]>('http://localhost:3000/api/newshipments/getConsignment', {
      params: {
        email: email,
        consignmentNumber: updatedConsignment.consignmentNumber
      }
    }).subscribe({
      next: (res: any[]) => {
        let stkupdatedConsignment = res[0];
        
        console.log('📥 SSRRRRRRRRRRRRRRRRRRRRRRRReceived consignment data:', stkupdatedConsignment);  
        stkupdatedConsignment.invoices?.forEach((invoice: any) => {
          i=0;
          invoice.products?.forEach((product: any) => {
            
            product.deliveredstock += updatedConsignment.invoices[0].products[i].manifestQty;
            product.intransitstock -= updatedConsignment.invoices[0].products[i].manifestQty;
            ++i;
            
          });
        });
        // Check if all products are fully delivered
        const allDelivered = stkupdatedConsignment.invoices.every((inv: any) =>
          inv.products.every((p: any) => p.deliveredstock === p.amount)
        );
        // Prepare updated consignment
        stkupdatedConsignment.shipmentStatus = allDelivered ? 'Delivered' : 'In Transit/Pending'
        this.updatedstkConsignmentfn(stkupdatedConsignment);
      },
      error: (err: any) => console.error('❌ Error loading shipments:', err)
    });

 
}




}
