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
  private branchCheck: any;

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
        this.updateConsignment(this.username, cons);
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

    this.branchCheck = setInterval(() => {
      const current = localStorage.getItem('branch') || 'All Branches';
      if (current !== this.branch) {
        this.branch = current;
        this.loadManifests();
      }
    }, 1000);
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
    if (this.branch === 'All Branches') {
      alert('Please select a specific branch before confirming delivery.');
      return;
    }
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
    if (this.branch === 'All Branches') {
      alert('Please select a specific branch before confirming delivery.');
      return;
    }
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
            const deliveredQty = Number(p.intransitstock) || 0;
            if (deliveredQty > 0) {
              p.deliveredstock = (p.deliveredstock || 0) + deliveredQty;
              p.manifestQty = deliveredQty;
            }
            p.intransitstock = 0;
          });
        });
      // Check if all products are fully delivered
      const allDelivered = cons.invoices.every((inv: any) =>
        inv.products.every((p: any) =>
          (Number(p.deliveredstock) || 0) >= (Number(p.amount) || 0) ||
          ((Number(p.instock) || 0) === 0 && (Number(p.intransitstock) || 0) === 0)
        )
      );
      // Prepare updated consignment
      console.log(`🚚 Updating consignment1  to status:`, allDelivered);
 
      const updatedConsignment = {
        ...cons,
        mshipmentStatus: 'Delivered'
      };

      console.log(`🚚 Updating consignment1  to status:`, updatedConsignment.mshipmentStatus);

      // Send updated consignment using helper method
  
    this.updateConsignment(this.username, updatedConsignment);
  
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



updateConsignment(username: string, updatedConsignment: any) {
  const items: Array<{ type: string; qty: number }> = [];
  (updatedConsignment.invoices || []).forEach((inv: any) => {
    (inv.products || []).forEach((p: any) => {
      const type = String(p.type || '').trim();
      const qty = Number(p.manifestQty) || 0;
      if (!type || qty <= 0) return;
      items.push({ type, qty });
    });
  });

  if (!items.length) return;

  const payload = {
    consignmentNumber: updatedConsignment.consignmentNumber,
    items
  };

  this.http.post('http://localhost:3000/api/newshipments/deliver', payload).subscribe({
    next: () => {
      this.loadManifests();
    },
    error: (err: any) => console.error('Error updating delivery:', err)
  });
}

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
        this.updateConsignment(this.username, updatedConsignment);
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
                  console.log('Manifest cancelled', stkupdatedConsignment);

                  const cancelQtyByType = new Map<string, number>();
                  (cons.invoices || []).forEach((inv: any) => {
                    (inv.products || []).forEach((p: any) => {
                      const key = String(p.type || '').trim();
                      if (!key) return;
                      const qty = Number(p.manifestQty) || 0;
                      if (qty <= 0) return;
                      cancelQtyByType.set(key, (cancelQtyByType.get(key) || 0) + qty);
                    });
                  });

                  stkupdatedConsignment.invoices?.forEach((invoice: any) => {
                    invoice.products?.forEach((product: any) => {
                      const key = String(product.type || '').trim();
                      const qty = cancelQtyByType.get(key) || 0;
                      if (!qty) return;
                      product.intransitstock = Math.max(0, (Number(product.intransitstock) || 0) - qty);
                      product.instock = (Number(product.instock) || 0) + qty;
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

  //Printing the manifest

  printManifest() {
  const selected = this.filteredManifests?.filter(m => m.selected) || [];

  if (selected.length === 0) {
    alert('No manifests selected.');
    return;
  }

  fetch('assets/manifest-template.html')
    .then(res => res.text())
    .then(template => {
      let fullHtml = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h2 { margin-bottom: 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              .page-break { page-break-after: always; }
            </style>
          </head>
          <body>
      `;

      selected.forEach((manifest, index) => {
        // Build rows for consignments/invoices/products
        const rows = manifest.consignments.flatMap((c: any) =>
          c.invoices.flatMap((inv: any) =>
            inv.products.map((p: any) => `
              <tr>
                <td>${manifest.manifestationNumber}</td>
                <td>${manifest.mshipmentStatus}</td>
                <td>${manifest.date}</td>
                <td>${c.consignmentNumber}</td>
                <td>${c.consignor}</td>
                <td>${inv.number}</td>
                <td>${p.type}</td>
                <td>${p.manifestQty}</td>
                <td>${p.instock}</td>
                <td>${inv.value}</td>
                <td>${manifest.branch}</td>
              </tr>
            `)
          )
        ).join('');

        // Replace placeholders in template
        const htmlContent = template
          .replace('{{manifestNumber}}', manifest.manifestationNumber)
          .replace('{{status}}', manifest.mshipmentStatus)
          .replace('{{date}}', manifest.date)
          .replace('{{branch}}', manifest.branch)
          .replace('{{rows}}', rows);

        fullHtml += htmlContent;

        // Add page break after each manifest except the last
        if (index < selected.length - 1) {
          fullHtml += `<div class="page-break"></div>`;
        }
      });

      fullHtml += `</body></html>`;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(fullHtml);  // ✅ safer than body.innerHTML
        printWindow.document.close();
        printWindow.print();
      }
    })
    .catch(err => console.error('Error loading manifest template:', err));
}

}

