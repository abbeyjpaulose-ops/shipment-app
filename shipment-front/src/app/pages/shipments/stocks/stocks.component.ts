import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, provideHttpClient } from '@angular/common/http';

@Component({
  selector: 'app-stocks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stocks.component.html',
  styleUrls: ['./stocks.component.css']
})
export class StocksComponent implements OnInit {
  stocks: any[] = [];
  filteredStocks: any[] = [];
  searchText = '';
  filterDate: string = '';
  filterConsignor: string = '';
  selectedStock: any = null;
  editingStock: any = null;   // ✅ track which stock is being edited

  // Billing
billingType: 'consignor' | 'different' = 'consignor';
billingName = '';
billingAddress = '';
billingGSTIN = '';
billingPhone = '';

clientList: any[] = [];
guestList: any[] = [];
pkgList: any[] = [];
productList: any[] = [];
// Pickup
pickupType: 'consignor' | 'different' = 'consignor';
pickupName = '';
pickupAddress = '';
pickupPhone = '';

// Delivery
deliveryType: 'consignee' | 'different' = 'consignee';
deliveryName = '';
deliveryAddress = '';
deliveryPhone = ''; 
consignorTab: 'consignor' | 'guest' = 'consignor';
consigneeTab: 'consignee' | 'guest' = 'consignee';
email: string = '';
username: string = '';
branch: string = localStorage.getItem('branch') || 'All Branches';
consignmentNumber: string = localStorage.getItem('consignmentNumber')||'-999'; // will be loaded asynchronously
date: string = new Date().toISOString().split('T')[0];
ewaybillNumber: string = '';
consignor: string = '';
consignorGST: string = '';
consignorAddress: string = '';
consignorPhone: string = '';
consignee: string = '';
consigneeGST: string = '';
consigneeAddress: string = '';
consigneePhone: string = '';
paymentMode: string = 'Account Credit';
externalRefId: string = '';
invoices = [{ number: '', value: 0 }];
packages = [{ type: '', amount: 1 }];
products = [{ type: '', amount: 1 }];
charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0 };
finalAmount: number = 0;
shipmentStatus: string = 'Pending';
shipmentStatusDetails: string = '';

  constructor(private http: HttpClient) {}


 // --- Methods ---
addInvoice() {
  this.editingStock.invoices.push({
    number: '',
    value: 0,
    packages: [],
    products: []
  });
}

deleteInvoice(index: number) {
  this.editingStock.invoices.splice(index, 1);
}

addPackage(invoiceIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (!invoice.packages) {
    invoice.packages = [];
  }
  invoice.packages.push({ type: '', amount: 1 });
}

deletePackage(invoiceIndex: number, packageIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (invoice.packages && invoice.packages.length > packageIndex) {
    invoice.packages.splice(packageIndex, 1);
  }
}

addProduct(invoiceIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (!invoice.products) {
    invoice.products = [];
  }
  invoice.products.push({ type: '', amount: 1, instock: 0 });
}

deleteProduct(invoiceIndex: number, productIndex: number) {
  const invoice = this.editingStock.invoices[invoiceIndex];
  if (invoice.products && invoice.products.length > productIndex) {
    invoice.products.splice(productIndex, 1);
  }
}

calculateFinalAmount() {
  const invoiceTotal = this.editingStock.invoices.reduce((sum: number, i: { value: number }) => sum + (i.value || 0), 0);
  const packageTotal = this.editingStock.packages.reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
  const chargeTotal = Object.values(this.charges).reduce((sum: number, c: any) => sum + (Number(c) || 0), 0);
  this.editingStock.finalAmount = invoiceTotal + packageTotal + chargeTotal;
}



  loadStocks() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/newshipments?email=${email}`).subscribe({
      next: (res) => {
        // filter only INSTOCK shipments
        
        this.stocks = res.filter(s => s.shipmentStatus === 'Pending');
        console.log(this.stocks);
        this.filteredStocks = [...this.stocks];
      },
      error: (err) => console.error('❌ Error loading stocks:', err)
    });
  }

    getInvoiceAmountTotal(invoices: any[]): number {
  if (!invoices) return 0;

  return invoices.reduce((total, invoice) => {
    const productSum = invoice.products?.reduce((sum: number, prod: any) => sum + (prod.amount || 0), 0) || 0;
    return total + productSum;
  }, 0);
}

  getInStockAmountTotal(invoices: any[]): number {
  if (!invoices) return 0;

  return invoices.reduce((total, invoice) => {
    const productSum = invoice.products?.reduce((sum: number, prod: any) => sum + (prod.instock || 0), 0) || 0;
    return total + productSum;
  }, 0);
}

  applyFilters() {
    this.filteredStocks = this.stocks.filter(s =>
      (this.searchText ? s.consignmentNumber?.includes(this.searchText) || s.consignor?.includes(this.searchText) : true) &&
      (this.filterDate ? new Date(s.date).toISOString().split('T')[0] === this.filterDate : true) &&
      (this.filterConsignor ? s.consignor?.toLowerCase().includes(this.filterConsignor.toLowerCase()) : true)
    );
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    this.filteredStocks.forEach(s => s.selected = checked);
  }


  openStockDetails(stock: any) {
    this.selectedStock = stock;
  }

  closeStockDetails() {
    this.selectedStock = null;
  }

    editStock(stock: any) {
    console.log('✏️ Edit stock:', stock);
    this.editingStock = { ...stock };  // ✅ copy so we don’t mutate directly
  }

  saveStockEdit() {
    if (!this.editingStock) return;

    console.log("kkkkkkkkkkklllllllllllllllll" + this.editingStock.consignmentNumber);

    this.http.put(`http://localhost:3000/api/newshipments/${this.editingStock.consignmentNumber}`, this.editingStock)
      .subscribe({
        next: () => {
          console.log('✅ Stock updated');
          this.loadStocks();          // reload updated data
          this.editingStock = null;   // close modal
        },
        error: (err) => console.error('❌ Error updating stock:', err)
      });
  }

  cancelEdit() {
    this.editingStock = null;
  }

  onConsignorSelect(name: string) {
    const selectedconignor = this.clientList.find(c => c.clientName === name);
    if (selectedconignor) {
      this.editingStock.consignorGST = selectedconignor.GSTIN;
      this.editingStock.consignorAddress = selectedconignor.address;
      this.editingStock.consignorPhone = selectedconignor.phoneNum;
    }
  }

  onConsigneeSelect(name: string) {
    const selectedconignee = this.clientList.find(c => c.clientName === name);
    if (selectedconignee) {
      this.editingStock.consigneeGST = selectedconignee.GSTIN;
      this.editingStock.consigneeAddress = selectedconignee.address;
      this.editingStock.consigneePhone = selectedconignee.phoneNum;
    }
  }

  onConsignorGuestSelect(name: string) {
    const selectedguestconignor = this.guestList.find(c => c.guestName === name);
    if (selectedguestconignor) {
      this.editingStock.consignorGST = 'GUEST';
      this.editingStock.consignorAddress = selectedguestconignor.address;
      this.editingStock.consignorPhone = selectedguestconignor.phoneNum;
    }
  }

  onConsigneeGuestSelect(name: string) {
    const selectedguestconignee = this.guestList.find(c => c.guestName === name);
    if (selectedguestconignee) {
      this.editingStock.consigneeGST = 'GUEST';
      this.editingStock.editingStock.consigneeAddress = selectedguestconignee.address;
      this.editingStock.editingStock.consigneePhone = selectedguestconignee.phoneNum;
    }
  }

  onPackageList(name: string) {
    const selectedpackage = this.pkgList.find(c => c.pkgName === name);
  }

  onProductList(name: string) {
    const selectedproduct = this.productList.find(c => c.productName === name);
  }
  

  ngOnInit() {
    this.loadStocks();
    this.email = localStorage.getItem('email') || '';
    this.username = localStorage.getItem('username') || '';
    this.branch = localStorage.getItem('branch') || 'All Branches';  
    //clients list  
    this.http.get<any[]>(
      `http://localhost:3000/api/clients/clientslist?emailId=${this.email}`)
      .subscribe(data => {
      this.clientList = data;
    });

    //guest list
    this.http.get<any[]>(
      `http://localhost:3000/api/guests/guestslist?emailId=${this.email}`)
      .subscribe(data => {
      this.guestList = data;
    }, error => {
      console.error('Error fetching guest list', error);
    });

    //package list
    this.http.get<any[]>(
      `http://localhost:3000/api/pkgs/pkglist?emailId=${this.email}`)
      .subscribe(data => {
      this.pkgList = data;
    }, error => {
      console.error('Error fetching package list', error);
    });

     //product list
    this.http.get<any[]>(
      `http://localhost:3000/api/products/productlist?emailId=${this.email}`)
      .subscribe(data => {
      this.productList = data;
    }, error => {
      console.error('Error fetching product list', error);
    });
    
  }

  
  showManifestationPopup = false;
  selectedForManifestation: any[] = [];
  manifestationNumber: string = '';

openManifestationPopup() {
  this.selectedForManifestation = this.filteredStocks.filter(s => s.selected);

  if (this.selectedForManifestation.length === 0) {
    alert('⚠️ Please select at least one consignment to manifest.');
    return;
  }

  const now = new Date();
  this.manifestationNumber =
    'MF-' + now.getFullYear().toString().slice(2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    '-' + Math.floor(Math.random() * 10000);

  // Initialize manifestQty = instock
  this.selectedForManifestation.forEach(consignment => {
    consignment.invoices?.forEach((invoice: any) => {
      invoice.products?.forEach((product: any) => {
        product.manifestQty = product.instock;
      });
    });
  });

  this.showManifestationPopup = true;
}


closeManifestationPopup() {
  this.showManifestationPopup = false;
}

finalizeManifestation() {
  if (this.selectedForManifestation.length === 0) {
    alert('No consignments selected.');
    return;
  }

  const manifestationData = {
    email: this.email,
    username: this.username,
    branch: this.branch,
    manifestationNumber: this.manifestationNumber,
    date: new Date(),
    consignments: this.selectedForManifestation.map(c => ({
      consignmentNumber: c.consignmentNumber,
      consignor: c.consignor,
      invoices: c.invoices.map((inv: any) => ({
        number: inv.number,
        value: inv.value,
        products: inv.products.map((p: any) => ({
          type: p.type,
          instock: p.instock,
          amount: p.amount,
          manifestQty: p.manifestQty
        }))
      }))
    }))
  };

  console.log('📦 Sending manifestation to backend:', manifestationData);

  // ✅ 1️⃣ POST manifestation details to backend DB
  this.http.post('http://localhost:3000/api/manifest/add', manifestationData).subscribe({
    next: (res: any) => {
      console.log('✅ Manifestation saved successfully:', res);
      console.log('testttttt', manifestationData);


      // ✅ 2️⃣ Once saved, update shipment statuses (In Transit or In Transit/Pending)
      const selectedConsignments = this.filteredStocks.filter(s => s.selected);

      if (selectedConsignments.length === 0) {
        console.warn('⚠️ No consignments selected for shipment update.');
        return;
      }

      selectedConsignments.forEach(stock => {
        const updatedStock = { ...stock, shipmentStatus: 'In Transit' };
        console.log('🚚 Updating shipment:', stock.consignmentNumber);

        this.http.put(`http://localhost:3000/api/newshipments/${stock.consignmentNumber}`, updatedStock)
          .subscribe({
            next: () => {
              console.log(`✅ Consignment ${stock.consignmentNumber} updated to In Transit`, updatedStock);
              this.loadStocks(); // refresh the table
            },
            error: (err) => {
              console.error(`❌ Error updating consignment ${stock.consignmentNumber}:`, err);
            }
          });
      });

      // ✅ 3️⃣ Clear selection and close the popup
      this.filteredStocks.forEach(s => s.selected = false);
      this.showManifestationPopup = false;
      alert(`✅ Manifestation ${res.manifestationNumber} created successfully!`);

    },
    error: (err) => {
      console.error('❌ Error saving manifestation:', err);
      alert('Failed to save manifestation. Check server logs.');
    }
  });
}


validateManifestQty(product: any) {
  if (product.manifestQty > product.instock) {
    alert(`⚠️ Manifest quantity cannot exceed available stock (${product.instock}).`);
    product.manifestQty = product.instock;
  }
  if (product.manifestQty < 0) {
    alert('⚠️ Manifest quantity cannot be negative.');
    product.manifestQty = 0;
  }
}



}
