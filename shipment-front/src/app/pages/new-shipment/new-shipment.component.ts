import { Component, OnInit } from '@angular/core';
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

  consignmentNumber: string = '-999';
  date: string = new Date().toISOString().split('T')[0];

  consignor: string = '';
  consignorGST: string = '';
  consignorAddress: string = '';
  consignorPhone: string = '';


  consignee: string = '';
  consigneeGST: string = '';
  consigneeAddress: string = '';
  consigneePhone: string = '';

  paymentMode: string = 'To Pay';
  externalRefId: string = '';

  // ===============================
  // NEW STRUCTURE FOR MULTIPLE E-WAYBILLS
  // ===============================
  ewaybills = [
    {
      number: '',
      date: this.date,
      invoices: [
        {
          number: '',
          value: 0,
          packages: [{ type: '', amount: 0 }],
          products: [{ type: '', amount: 0, instock: 1, intransitstock: 0, deliveredstock: 0 }]
        }
      ]
    }
  ];

  charges = { odc: 0, unloading: 0, docket: 0, other: 0, ccc: 0, consignorDiscount: 0 };
  finalAmount: number = 0;

  shipmentStatus: string = 'Pending';
  shipmentStatusDetails: string = '';

  // ======================================================
  // E-WAYBILL FUNCTIONS
  // ======================================================

  addEwaybill() {
    this.ewaybills.push({
      number: '',
      date: this.date,
      invoices: []
    });
  }

  deleteEwaybill(index: number) {
    this.ewaybills.splice(index, 1);
  }


  // ======================================================
  // INVOICE FUNCTIONS (NOW UNDER E-WAYBILL)
  // ======================================================

  addInvoice(ewaybillIndex: number) {
    this.ewaybills[ewaybillIndex].invoices.push({
      number: '',
      value: 0,
      packages: [],
      products: []
    });
  }

  deleteInvoice(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices.splice(invoiceIndex, 1);
  }


  // ======================================================
  // PACKAGE FUNCTIONS
  // ======================================================

  addPackage(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].packages.push({
      type: '',
      amount: 0
    });
  }

  deletePackage(ewaybillIndex: number, invoiceIndex: number, packageIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].packages.splice(packageIndex, 1);
  }


  // ======================================================
  // PRODUCT FUNCTIONS
  // ======================================================

  addProduct(ewaybillIndex: number, invoiceIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].products.push({
      type: '',
      amount: 0,
      instock: 0,
      intransitstock: 0,
      deliveredstock: 0
    });
  }

  deleteProduct(ewaybillIndex: number, invoiceIndex: number, productIndex: number) {
    this.ewaybills[ewaybillIndex].invoices[invoiceIndex].products.splice(productIndex, 1);
  }


  // ======================================================
  // FINAL AMOUNT CALCULATION
  // ======================================================
  calculateFinalAmount() {
    let invoiceTotal = 0;
    let packageTotal = 0;

    this.ewaybills.forEach(ewb => {
      invoiceTotal += ewb.invoices.reduce((sum, inv) => sum + (inv.value || 0), 0);

      packageTotal += ewb.invoices.reduce((sum, inv) =>
        sum + inv.packages.reduce((pSum, p) => pSum + (p.amount || 0), 0), 0);
    });

    const chargeTotal = Object.values(this.charges).reduce((sum, c) => sum + (Number(c) || 0), 0);

    this.finalAmount = invoiceTotal + packageTotal + chargeTotal;
  }


  resetForm() {
    Object.assign(this, new NewShipmentComponent(this.http));
  }


  // ======================================================
  // CONSIGNMENT NUMBER LOGIC
  // ======================================================
  getFiscalYear(): number {
    const today = new Date();
    return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  }


  getCurrentConsignmentNumber() {
    this.http.get<{ nextNumber: number, fiscalYear: string }>(
      `http://localhost:3000/api/newshipments/nextConsignment?emailId=${this.email}`
    ).subscribe({
      next: (res) => {
        this.consignmentNumber = res.nextNumber.toString();
        localStorage.setItem('consignmentNumber', this.consignmentNumber);
      },
      error: (err) => console.error('Error fetching consignment number', err)
    });
  }


  // ======================================================
  // SAVE SHIPMENT (NOW SAVES E-WAYBILLS)
  // ======================================================
  saveShipment() {
    const shipmentData = {
      email: localStorage.getItem('email'),
      username: localStorage.getItem('username'),
      branch: localStorage.getItem('branch'),

      shipmentStatus: this.shipmentStatus,
      shipmentStatusDetails: `${localStorage.getItem('email')}$$${this.date}$$${this.shipmentStatus}`,

      consignmentNumber: this.consignmentNumber,
      date: this.date,
      paymentMode: this.paymentMode,
      externalRefId: this.externalRefId,

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

      ewaybills: this.ewaybills,   // ★ NEW STRUCTURE
      charges: this.charges,
      finalAmount: this.finalAmount
    };

    if (this.consignorTab === 'guest') shipmentData.consignorGST = 'GUEST';
    if (this.consigneeTab === 'guest') shipmentData.consigneeGST = 'GUEST';

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
      this.http.post(
        'http://localhost:3000/api/newshipments/add',
        shipmentData,
        { headers: { 'Content-Type': 'application/json' } }
      ).subscribe({
        next: () => {
          alert(`Shipment ${this.consignmentNumber} saved successfully!`);
          this.getCurrentConsignmentNumber();
          this.resetForm();
          window.location.reload();
        },
        error: err => alert('Error: ' + err.message)
      });
    } else {
      alert('Please select a branch before saving.');
    }
  }

  // ======================================================
  // SELECT HANDLERS
  // ======================================================
  onConsignorSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consignorGST = c.GSTIN;
      this.consignorAddress = c.address;
      this.consignorPhone = c.phoneNum;
      this.charges.consignorDiscount= c.perDis;
    }
  }

  onConsigneeSelect(name: string) {
    const c = this.clientList.find(x => x.clientName === name);
    if (c) {
      this.consigneeGST = c.GSTIN;
      this.consigneeAddress = c.address;
      this.consigneePhone = c.phoneNum;
    }
  }

  onConsignorGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consignorGST = 'GUEST';
      this.consignorAddress = g.address;
      this.consignorPhone = g.phoneNum;
    }
  }

  onConsigneeGuestSelect(name: string) {
    const g = this.guestList.find(x => x.guestName === name);
    if (g) {
      this.consigneeGST = 'GUEST';
      this.consigneeAddress = g.address;
      this.consigneePhone = g.phoneNum;
    }
  }

  onPackageList(name: string) {
    this.pkgList.find(x => x.pkgName === name);
  }

  onProductList(name: string) {
    this.productList.find(x => x.productName === name);
  }


  ngOnInit() {
    if (typeof window !== 'undefined') {

      this.email = localStorage.getItem('email') || '';
      this.username = localStorage.getItem('username') || '';
      this.branch = localStorage.getItem('branch') || 'All Branches';

      this.getCurrentConsignmentNumber();

      // Client list
      this.http.get<any[]>(
        `http://localhost:3000/api/clients/clientslist?emailId=${this.email}`
      ).subscribe(res => this.clientList = res);

      // Guest list
      this.http.get<any[]>(
        `http://localhost:3000/api/guests/guestslist?emailId=${this.email}`
      ).subscribe(res => this.guestList = res);

      // Package list
      this.http.get<any[]>(
        `http://localhost:3000/api/pkgs/pkglist?emailId=${this.email}`
      ).subscribe(res => this.pkgList = res);

      // Product list
      this.http.get<any[]>(
        `http://localhost:3000/api/products/productlist?emailId=${this.email}`
      ).subscribe(res => this.productList = res);
    }
  }

  constructor(private http: HttpClient) { }
}
