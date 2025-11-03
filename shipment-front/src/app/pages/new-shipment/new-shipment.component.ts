import { Component, OnInit  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-new-shipment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-shipment.component.html',
  styleUrls: ['./new-shipment.component.css']
})
export class NewShipmentComponent {
  
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
consignmentNumber: string = '-999'; // will be loaded asynchronously
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

invoices = [
  {
    number: '',
    value: 0,
    packages: [
      { type: '', amount: 0}
    ],
    products: [
      { type: '', amount: 0, instock: 1, intransitstock: 0, deliveredstock: 0}
    ]
  }
];
charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0 };
finalAmount: number = 0;
shipmentStatus: string = 'Pending';
shipmentStatusDetails: string = '';



 // --- Methods ---
addInvoice() {
  this.invoices.push({
    number: '',
    value: 0,
    packages: [],
    products: []
  });
}

deleteInvoice(index: number) {
  this.invoices.splice(index, 1);
}

addPackage(invoiceIndex: number) {
  this.invoices[invoiceIndex].packages.push({
    type: '',    // This now serves as the package name
    amount: 0
  });
}

deletePackage(invoiceIndex: number, packageIndex: number) {
  this.invoices[invoiceIndex].packages.splice(packageIndex, 1);
}

addProduct(invoiceIndex: number) {
  this.invoices[invoiceIndex].products.push({
    type: '',    // This now serves as the product name
    amount: 0,
    instock: 0,
    intransitstock: 0,
    deliveredstock: 0
  });
}

deleteProduct(invoiceIndex: number, productIndex: number) {
  this.invoices[invoiceIndex].products.splice(productIndex, 1);
}



  calculateFinalAmount() {
  const invoiceTotal = this.invoices.reduce((sum: number, i) => sum + (i.value || 0), 0);

  const packageTotal = this.invoices.reduce((sum: number, i) => {
    return sum + i.packages.reduce((pkgSum: number, p) => pkgSum + (p.amount || 0), 0);
  }, 0);

  const chargeTotal = Object.values(this.charges).reduce((sum: number, c) => sum + (Number(c) || 0), 0);

  this.finalAmount = invoiceTotal + packageTotal + chargeTotal;
}


  resetForm() {
    Object.assign(this, new NewShipmentComponent(this.http));
  }

  // --- Serial Number logic ---
  getFiscalYear(): number {
    const today = new Date();
    return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  }


  getCurrentConsignmentNumber() {      
    this.http.get<{ nextNumber: number, fiscalYear: string }>(
      `http://localhost:3000/api/newshipments/nextConsignment?emailId=${this.email}`)
      .subscribe({
        next: (res) => {
          console.log('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFetched consignment number:', res);
          console.log(localStorage.getItem('consignmentNumber'));
          this.consignmentNumber = res.nextNumber.toString();
          localStorage.setItem('consignmentNumber', this.consignmentNumber);
          console.log(localStorage.getItem('consignmentNumber'));
        },
        error: (err) => console.error('Error fetching consignment number', err)
   
      });
  }


  saveShipment() {
    const shipmentData = {
      email: localStorage.getItem('email'),
      username: localStorage.getItem('username'),
      branch: localStorage.getItem('branch'),

      shipmentStatus: this.shipmentStatus,
      shipmentStatusDetails: localStorage.getItem('email')+'$$'+this.date+'$$'+this.shipmentStatus,

      ewaybillNumber: this.ewaybillNumber,
      consignmentNumber: this.consignmentNumber,
      date: this.date,
      consignorTab: this.consignorTab,
      consignor: this.consignor,
      consignorGST: this.consignorGST,
      consignorAddress: this.consignorAddress,
      consignorPhone: this.consignorPhone,
      consigneeTab: this.consigneeTab,

      consignee: this.consignee,
      consigneeGST: this.consigneeGST,
      consigneeAddress: this.consigneeAddress,
      consigneePhone: this.consigneePhone,

      paymentMode: this.paymentMode,
      externalRefId: this.externalRefId,

      billingType: this.billingType,
      billingName: this.billingName,
      billingGSTIN: this.billingGSTIN,
      billingAddress: this.billingAddress,
      billingPhone: this.billingPhone,

      pickupType: this.pickupType,
      pickupName: this.pickupName,
      pickupAddress: this.pickupAddress,
      pickupPhone: this.pickupPhone,

      deliveryType: this.deliveryType,
      deliveryName: this.deliveryName,
      deliveryAddress: this.deliveryAddress,
      deliveryPhone: this.deliveryPhone,

      invoices: this.invoices,
      charges: this.charges,
      finalAmount: this.finalAmount
      
    };
 
    if (this.consignorTab === 'guest') {  
        shipmentData.consignorGST = 'GUEST';
      }

    if (this.consigneeTab === 'guest') {  
        shipmentData.consigneeGST = 'GUEST';
      }

    if (this.billingType === 'consignor') {
      shipmentData.billingName = this.consignor;
      shipmentData.billingAddress = this.consignorAddress;
      shipmentData.billingGSTIN = this.consignorGST;
      shipmentData.billingPhone = this.consignorPhone;
    }

    if (this.pickupType === 'consignor') {
      shipmentData.pickupName = this.consignor;
      shipmentData.pickupAddress = this.consignorAddress;
      shipmentData.pickupPhone = this.consignorPhone;
    }

    if (this.deliveryType === 'consignee') {
      shipmentData.deliveryName = this.consignee;
      shipmentData.deliveryAddress = this.consigneeAddress;
      shipmentData.deliveryPhone = this.consigneePhone;
    }


    if (shipmentData.branch !== 'All Branches') {
      this.http.post('http://localhost:3000/api/newshipments/add', shipmentData, {
        headers: { 'Content-Type': 'application/json' }
      }).subscribe({
        next: (res: any) => {
          // Save shipment (later we can push to localStorage / backend)
          console.log('Shipment Data:', shipmentData);
          
          alert(`Shipment ${this.consignmentNumber} saved successfully!`);
          this.getCurrentConsignmentNumber(); // get next consignment number
          // reset form for next entry
          this.resetForm();
          window.location.reload();
          
         
          console.log('✅ Shipment saved', res);
          console.log('Next Consignment Number:', this.consignmentNumber);
          console.log(localStorage.getItem('consignmentNumber'));
          alert(`Shipment ${this.consignmentNumber} next successfully!`);
        },
        error: (err: any) => {
          console.error("Error saving shipment:", err.message);
          alert('Error: ' + err.message);
        }
      });

    }   
    else {      
      alert(`Please select a branch before saving or create one if you haven't.`);
    }
}

onConsignorSelect(name: string) {
    const selectedconignor = this.clientList.find(c => c.clientName === name);
    if (selectedconignor) {
      this.consignorGST = selectedconignor.GSTIN;
      this.consignorAddress = selectedconignor.address;
      this.consignorPhone = selectedconignor.phoneNum;
    }
  }

  onConsigneeSelect(name: string) {
    const selectedconignee = this.clientList.find(c => c.clientName === name);
    if (selectedconignee) {
      this.consigneeGST = selectedconignee.GSTIN;
      this.consigneeAddress = selectedconignee.address;
      this.consigneePhone = selectedconignee.phoneNum;
    }
  }

  onConsignorGuestSelect(name: string) {
    const selectedguestconignor = this.guestList.find(c => c.guestName === name);
    if (selectedguestconignor) {
      this.consignorGST = 'GUEST';
      this.consignorAddress = selectedguestconignor.address;
      this.consignorPhone = selectedguestconignor.phoneNum;
    }
  }

  onConsigneeGuestSelect(name: string) {
    const selectedguestconignee = this.guestList.find(c => c.guestName === name);
    if (selectedguestconignee) {
      this.consigneeGST = 'GUEST';
      this.consigneeAddress = selectedguestconignee.address;
      this.consigneePhone = selectedguestconignee.phoneNum;
    }
  }

  onPackageList(name: string) {
    const selectedpackage = this.pkgList.find(c => c.pkgName === name);
  }

  onProductList(name: string) {
    const selectedproduct = this.productList.find(c => c.productName === name);
  }
  

  ngOnInit() {
    if (typeof window !== 'undefined') {
      console.log('Window is aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaavailable');
    this.email = localStorage.getItem('email') || '';
    this.username = localStorage.getItem('username') || '';
    this.branch = localStorage.getItem('branch') || 'All Branches';  
    this.getCurrentConsignmentNumber();    

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
    
  }}
  constructor(private http: HttpClient) {}
} 
