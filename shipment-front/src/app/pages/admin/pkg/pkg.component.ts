import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-pkg',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pkg.component.html',
  styleUrls: ['./pkg.component.css']
})
export class PkgComponent implements OnInit {
  pkgs: any[] = [];
  showAddPkgPopup = false;
  showEditPkgPopup = false;
  showPkgDetailsPopup = false;

  newPkg: any = {
    pkgName: '',
    rate: 0,
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };

  editingPkg: any = null;
  selectedPkg: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPkgs();
  }

  loadPkgs() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/pkgs?email=${email}`)
      .subscribe({
        next: (data) => {
          this.pkgs = data || [];
        },
        error: (err) => console.error('Error loading pkgs:', err)
      });
  }

  openAddPkgPopup() {
    this.showAddPkgPopup = true;
  }

  closeAddPkgPopup() {
    this.showAddPkgPopup = false;
  }

  openPkgDetailsPopup(pkg: any) {
    this.selectedPkg = pkg;
    this.showPkgDetailsPopup = true;
  }

  closePkgDetailsPopup() {
    this.selectedPkg = null;
    this.showPkgDetailsPopup = false;
  }

  editPkgFromDetails() {
    if (!this.selectedPkg) return;
    const pkg = this.selectedPkg;
    this.closePkgDetailsPopup();
    this.editPkg(pkg);
  }

  addPkg() {
    this.http.post('http://localhost:3000/api/pkgs/add', this.newPkg, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: () => {
        alert('Package type added successfully!');
        this.loadPkgs();
        this.resetNewPkg();
        this.closeAddPkgPopup();
      },
      error: (err) => {
        console.error('Error saving pkg:', err);
        alert('Error: ' + (err?.error?.message || err?.message || 'Unable to save'));
      }
    });
  }

  editPkg(pkg: any) {
    this.editingPkg = { ...pkg };
    this.showEditPkgPopup = true;
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/pkgs/${this.editingPkg._id}`, this.editingPkg)
      .subscribe(() => {
        this.loadPkgs();
        this.editingPkg = null;
        this.showEditPkgPopup = false;
      });
  }

  closeEditPkgPopup() {
    this.editingPkg = null;
    this.showEditPkgPopup = false;
  }

  toggleStatus(pkg: any) {
    this.http.patch(`http://localhost:3000/api/pkgs/${pkg._id}/status`, {})
      .subscribe(() => this.loadPkgs());
  }

  resetNewPkg() {
    this.newPkg = {
      pkgName: '',
      rate: 0,
      status: 'active',
      email: localStorage.getItem('email'),
      username: localStorage.getItem('username')
    };
  }
}
