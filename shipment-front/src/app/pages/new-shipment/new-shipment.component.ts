import { Component } from '@angular/core';
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
packages = [{ type: '', amount: 0 }];
charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0 };
finalAmount: number = 0;



  // --- Methods ---
  addInvoice() {
    this.invoices.push({ number: '', value: 0 });
  }
  deleteInvoice(index: number) {
    this.invoices.splice(index, 1);
  }

  addPackage() {
    this.packages.push({ type: '', amount: 0 });
  }
  deletePackage(index: number) {
    this.packages.splice(index, 1);
  }

  calculateFinalAmount() {
    const invoiceTotal = this.invoices.reduce((sum, i) => sum + (i.value || 0), 0);
    const packageTotal = this.packages.reduce((sum, p) => sum + (p.amount || 0), 0);
    const chargeTotal = Object.values(this.charges).reduce((sum, c) => sum + (Number(c) || 0), 0);
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
          
          this.consignmentNumber = res.nextNumber.toString();  
        },
        error: (err) => console.error('Error fetching consignment number', err)
   
      });
  }


  saveShipment() {
    const shipmentData = {
      email: localStorage.getItem('email'),
      username: localStorage.getItem('username'),
      branch: localStorage.getItem('branch'),

      ewaybillNumber: this.ewaybillNumber,
      consignmentNumber: this.consignmentNumber,
      date: this.date,

      consignor: this.consignor,
      consignorGST: this.consignorGST,
      consignorAddress: this.consignorAddress,
      consignorPhone: this.consignorPhone,

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
      packages: this.packages,
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
          this.consignmentNumber = (parseInt(this.consignmentNumber) + 1).toString();
          localStorage.setItem('consignmentNumber', this.consignmentNumber);
          // reset form for next entry
          this.resetForm();
          //window.location.reload();
          
         
          console.log('✅ Shipment saved', res);
          alert('Shipment saved successfully!');
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
  

  ngOnInit() {
    this.email = localStorage.getItem('email') || '';
    this.username = localStorage.getItem('username') || '';
    this.branch = localStorage.getItem('branch') || 'All Branches';  
    this.getCurrentConsignmentNumber();
  }
  constructor(private http: HttpClient) {}
} 
