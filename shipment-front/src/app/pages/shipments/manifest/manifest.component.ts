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

  showCancelPopup: boolean = false;
  selectedForCancel: any[] = [];

  showEditPopup: boolean = false;

// Open edit popup
openEditPopup(manifest: any) {
  this.selectedManifest = { ...manifest }; // clone to avoid direct mutation
  this.showEditPopup = true;
}

// Close edit popup
closeEditPopup() {
  this.showEditPopup = false;
  this.selectedManifest = null;
}

// Save edits
finalizeEdit() {
  if (!this.selectedManifest) return;
  const email = localStorage.getItem('email') || '';

  // Update manifest in DB
  this.http.post(`http://localhost:3000/api/manifest/manifestationNumber`, this.selectedManifest) 
  .subscribe({
    next: () => {
      console.log('✅ Manifest updated in DDDDDDDDDB', this.selectedManifest.consignments);
      this.selectedManifest.consignments.forEach((cons: any) => {
        this.updateConsignment(email, cons);
      });
      
      console.log('✅ Manifest updated successfully');
      alert('Manifest updated!');
      this.loadManifests(); // reload list
      this.closeEditPopup();
      
    },
    error: (err) => console.error('❌ Error updating manifest:', err)
  });
}


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
        .filter(item => item.mshipmentStatus != 'Delivered' && item.mshipmentStatus != 'Cancelled')
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
        inv.products.every((p: any) => p.instock != 0)
      );
      // Prepare updated consignment
      console.log(`🚚 Updating consignment1  to status:`, allDelivered);
 
      const updatedConsignment = {
        ...cons,
        mshipmentStatus: allDelivered ? 'In Transit' : 'Delivered'
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
            console.log('📥 OOOOOOOOOUpdating product stock:', product.intransitstock);
            product.intransitstock -= updatedConsignment.invoices[0].products[i].manifestQty;
            console.log('📥 OOOOOOOOOUpdating product stock:', product.intransitstock);
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

// ✅ (Deletion)Open cancel popup
  openCancelPopup() {
    this.selectedForCancel = this.filteredManifests.filter(m => m.selected);

    if (this.selectedForCancel.length === 0) {
      alert('⚠️ Please select at least one manifest to cancel.');
      return;
    }

    this.showCancelPopup = true;
  }

  closeCancelPopup() {
    this.showCancelPopup = false;
  }

  // ✅ Finalize cancellation
  finalizeCancel() {
    if (this.selectedForCancel.length === 0) {
      alert('No manifests selected for cancellation.');
      return;
    }

    const userEmail = this.email;

    this.selectedForCancel.forEach(manifest => {
      // Update consignments in newshipments DB
      manifest.consignments.forEach((cons: any) => {
        const updatedConsignment = {
          ...cons,
          shipmentStatus: 'Pending'
        };
        this.updateConsignment(userEmail, updatedConsignment);
      });

      // Update manifest in manifest DB
      const cancelledManifest = {
        ...manifest,
        mshipmentStatus: 'Cancelled'
      };

      this.http.post(`http://localhost:3000/api/manifest/manifestationNumber`, cancelledManifest)
        .subscribe({
          next: () => {

            manifest.consignments.forEach((cons: any) => {
              console.log(`🗑️ Manifest ${manifest.manifestationNumber} cancelled`, cons)

              this.http.get<any[]>('http://localhost:3000/api/newshipments/getConsignment', {
                params: {
                  email: localStorage.getItem('email') || '',
                  consignmentNumber: cons.consignmentNumber
                }}).subscribe({
    
                next: (res: any[]) => {
     
                  let stkupdatedConsignment = res[0];
                  console.log(`🗑️ Manifest1 ${stkupdatedConsignment.manifestationNumber} cancelled`, stkupdatedConsignment)

                stkupdatedConsignment.invoices?.forEach((invoice: any) => {
          
                  let i=0;
                  invoice.products?.forEach((product: any) => {
                    product.intransitstock -= cons.invoices[0].products[i].manifestQty;
                    product.instock += cons.invoices[0].products[i].manifestQty;
                    ++i;
            
          });
        });
        // Check if all products are fully delivered
        const allDelivered = stkupdatedConsignment.invoices.every((inv: any) =>
          inv.products.every((p: any) => p.deliveredstock != 0)
        );
        // Prepare updated consignment
        console.log(`🗑️ Manifest2 cancelled`, allDelivered)
        stkupdatedConsignment.shipmentStatus = allDelivered ? 'Pending' : 'In Transit/Pending'
        this.updatedstkConsignmentfn(stkupdatedConsignment);
    
                },
                error: (err: any) => console.error('❌ Error loading shipments:', err)
            });   
            });
              // Additional logic for finding the consignments and updating the newshipment respectively
          },
          error: err => console.error('❌ Error cancelling manifest:', err)
        });
    });

    this.showCancelPopup = false;
    alert('🗑️ Cancellation completed successfully!');
    this.filteredManifests.forEach(m => m.selected = false);
    this.loadManifests();
  }




}
