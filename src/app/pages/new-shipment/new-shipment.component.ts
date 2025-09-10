import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-new-shipment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-shipment.component.html',
  styleUrls: ['./new-shipment.component.css']
})
export class NewShipmentComponent {
  // Section 1: Basic Details
  ewaybillNumber: string = '';
  consignmentNumber: number = this.getCurrentConsignmentNumber(); // load current only
  date: string = new Date().toISOString().split('T')[0];
  origin: string = '';
  destination: string = '';
  bookingBranch = { address: '', state: '', district: '', pincode: '' };
  destinationBranch = { address: '', state: '', district: '', pincode: '' };

  // Section 2: Consignment & Payment Mode
  consignor: string = '';
  consignorGST: string = '';
  consignee: string = '';
  consigneeGST: string = '';
  paymentMode: string = 'Account Credit';
  externalRefId: string = '';

  // Section 3: Invoice Details
  invoices = [{ number: '', value: 0 }];

  // Section 4: Package Details
  packages = [{ quantity: 1, type: '', product: '', actualWeight: 0, chargedWeight: 0, rateType: '', amount: 0 }];

  // Section 5: Charges
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
    this.packages.push({ quantity: 1, type: '', product: '', actualWeight: 0, chargedWeight: 0, rateType: '', amount: 0 });
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
    Object.assign(this, new NewShipmentComponent());
  }

  saveShipment() {
    // Save shipment (later we can push to localStorage / backend)
    console.log('Shipment Data:', this);

    // increment and store for next shipment
    this.incrementConsignmentNumber();

    alert(`Shipment ${this.consignmentNumber} saved successfully!`);

    // reset form for next entry
    this.resetForm();
  }

  // --- Serial Number logic ---
  getFiscalYear(): number {
    const today = new Date();
    return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  }

  getCurrentConsignmentNumber(): number {
    const fiscalYear = this.getFiscalYear();
    const key = `consignment_${fiscalYear}`;
    let last = parseInt(localStorage.getItem(key) || '0', 10);
    return last + 1; // show next available number, but don’t store yet
  }

  incrementConsignmentNumber() {
    const fiscalYear = this.getFiscalYear();
    const key = `consignment_${fiscalYear}`;
    let last = parseInt(localStorage.getItem(key) || '0', 10);
    last++;
    localStorage.setItem(key, last.toString());
  }
}
