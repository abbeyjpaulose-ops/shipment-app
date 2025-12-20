import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-branch',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch.component.html',
  styleUrls: ['./branch.component.css']
})
export class BranchComponent implements OnInit {
  branches: any[] = [];

  newBranch: any = {
    branchName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNum: '',
    vehicles: [{ vehicleNo: '', driverPhone: '' }],
    status: 'active'
  };

  editingBranch: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    localStorage.setItem('branch', 'All Branches');
    this.loadBranches();
  }

  // Load Branches
  loadBranches() {
    this.http.get<any[]>(`http://localhost:3000/api/branches`).subscribe({
      next: (data) => {
        this.branches = data;
      },
      error: (err) => console.error('Error loading branches:', err)
    });
  }

  // Add Vehicle in Add Form
  addVehicle() {
    this.newBranch.vehicles.push({ vehicleNo: '', driverPhone: '' });
  }

  // Remove Vehicle in Add Form
  removeVehicle(index: number) {
    this.newBranch.vehicles.splice(index, 1);
  }

  // Add Vehicle while Editing
  addVehicleEdit() {
    this.editingBranch.vehicles.push({ vehicleNo: '', driverPhone: '' });
  }

  // Remove Vehicle while Editing
  removeVehicleEdit(index: number) {
    this.editingBranch.vehicles.splice(index, 1);
  }

  // Add Branch
  addBranch() {
    if (!this.newBranch.branchName || !this.newBranch.address || !this.newBranch.phoneNum) {
      alert('Branch Name, Address, and Branch Phone are required.');
      return;
    }

    const hasIncompleteVehicle =
      Array.isArray(this.newBranch.vehicles) &&
      this.newBranch.vehicles.some(
        (v: any) => (v?.vehicleNo || v?.driverPhone) && !(v?.vehicleNo && v?.driverPhone)
      );
    if (hasIncompleteVehicle) {
      alert('Each vehicle must have both Vehicle No. and Driver Phone (or leave the row empty).');
      return;
    }

    const vehicles = Array.isArray(this.newBranch.vehicles)
      ? this.newBranch.vehicles.filter((v: any) => v?.vehicleNo && v?.driverPhone)
      : [];

    const payload = {
      branchName: this.newBranch.branchName,
      address: this.newBranch.address,
      city: this.newBranch.city,
      state: this.newBranch.state,
      pinCode: this.newBranch.pinCode,
      phoneNum: this.newBranch.phoneNum,
      vehicles
    };

    this.http
      .post('http://localhost:3000/api/branches/add', payload, {
        headers: { 'Content-Type': 'application/json' }
      })
      .subscribe({
        next: () => {
          alert('Branch added successfully!');
          this.loadBranches();
          this.resetNewBranch();
        },
        error: (err) => {
          console.error('Error saving branch:', err);
          alert('Error: ' + (err?.error?.message || err?.message || 'Bad Request'));
        }
      });
  }

  // Reset Form
  resetNewBranch() {
    this.newBranch = {
      branchName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      phoneNum: '',
      vehicles: [{ vehicleNo: '', driverPhone: '' }],
      status: 'active'
    };
  }

  // Edit Branch Mode
  editBranch(branch: any) {
    this.editingBranch = JSON.parse(JSON.stringify(branch)); // deep copy to avoid UI distortions
  }

  // Save Edited Branch
  saveEdit() {
    this.http.put(`http://localhost:3000/api/branches/${this.editingBranch._id}`, this.editingBranch).subscribe({
      next: () => {
        alert('Branch updated successfully!');
        this.editingBranch = null;
        this.loadBranches();
      },
      error: (err) => {
        console.error('Error updating branch:', err);
        alert('Error: ' + (err?.error?.message || err?.message || 'Bad Request'));
      }
    });
  }

  // Toggle Status Active / Inactive
  toggleStatus(branch: any) {
    this.http.patch(`http://localhost:3000/api/branches/${branch._id}/status`, {}).subscribe(() => {
      this.loadBranches();
    });
  }
}
