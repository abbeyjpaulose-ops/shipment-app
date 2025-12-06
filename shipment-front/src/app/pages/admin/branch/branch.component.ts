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
    GSTIN: '',
    phoneNum: '',
    vehicles: [
      { vehicleNo: '', driverPhone: '' }
    ],
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };

  editingBranch: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadBranches();
  }

  // Load Branches
  loadBranches() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/branches?email=${email}`)
      .subscribe({
        next: (data) => {
          console.log("Branches Loaded:", data);
          this.branches = data;
        },
        error: (err) => console.error("Error loading branches:", err)
      });
  }

  // ➕ Add Vehicle in Add Form
  addVehicle() {
    this.newBranch.vehicles.push({ vehicleNo: '', driverPhone: '' });
  }

  // ❌ Remove Vehicle in Add Form
  removeVehicle(index: number) {
    this.newBranch.vehicles.splice(index, 1);
  }

  // ➕ Add Vehicle while Editing
  addVehicleEdit() {
    this.editingBranch.vehicles.push({ vehicleNo: '', driverPhone: '' });
  }

  // ❌ Remove Vehicle while Editing
  removeVehicleEdit(index: number) {
    this.editingBranch.vehicles.splice(index, 1);
  }

  // Add Branch
  addBranch() {
    console.log('📤 Sending Branch:', this.newBranch);

    this.http.post('http://localhost:3000/api/branches/add', this.newBranch, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: () => {
        alert('Branch added successfully!');
        this.loadBranches();
        this.resetNewBranch();
      },
      error: (err) => {
        console.error('❌ Error saving branch:', err);
        alert('Error: ' + err.error.message);
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
      GSTIN: '',
      phoneNum: '',
      vehicles: [
        { vehicleNo: '', driverPhone: '' }
      ],
      status: 'active',
      email: localStorage.getItem('email'),
      username: localStorage.getItem('username')
    };
  }

  // Edit Branch Mode
  editBranch(branch: any) {
    this.editingBranch = JSON.parse(JSON.stringify(branch)); // deep copy to avoid UI distortions
  }

  // Save Edited Branch
  saveEdit() {
    this.http.put(`http://localhost:3000/api/branches/${this.editingBranch._id}`, this.editingBranch)
      .subscribe({
        next: () => {
          alert('Branch updated successfully!');
          this.editingBranch = null;
          this.loadBranches();
        },
        error: (err) => {
          console.error('❌ Error updating branch:', err);
          alert('Error: ' + err.error.message);
        }
      });
  }

  // Toggle Status Active / Inactive
  toggleStatus(branch: any) {
    const email = localStorage.getItem('email');
    this.http.patch(
      `http://localhost:3000/api/branches/${branch._id}/status?email=${email}`,
      {}
    ).subscribe(() => {
      this.loadBranches();
    });
  }
}
