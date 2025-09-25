import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-branch',
  standalone: true,
  imports: [CommonModule, FormsModule],  // 👈 add here
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
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingBranch: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadBranches();
  }

  loadBranches() {
    const email = localStorage.getItem('email'); // set during login
    this.http.get<any[]>(`http://localhost:3000/api/branches?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Branches loaded:", data); // 👈 log to browser console
        this.branches = data;
      },
      error: (err) => console.error("Error loading branches:", err)
    });
}

  addBranch() {
    console.log('📤 Sending branch data:');
    this.http.post('http://localhost:3000/api/branches/add', this.newBranch, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Branch saved', res);
        alert('Branch added successfully!');
      },
      error: (err) => {
        console.error('❌ Error saving branch:', err);
        alert('Error: ' + err.error.message);
      }
    });
  }

  editBranch(branch: any) {
    this.editingBranch = { ...branch };
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/branches/${this.editingBranch._id}`, this.editingBranch)
      .subscribe(() => {
        this.loadBranches();
        this.editingBranch = null;
      });
  }

  toggleStatus(branch: any) {
    this.http.patch(`http://localhost:3000/api/branches/${branch._id}/status`, {})
      .subscribe(() => this.loadBranches());
  }
}
