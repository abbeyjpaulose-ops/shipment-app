import { Component, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-roleSettings',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
  templateUrl: './roleSettings.component.html',
  styleUrls: ['./roleSettings.component.css']
})
export class RoleSettingsComponent implements OnInit {
  isAdmin = String(localStorage.getItem('role') || '').toLowerCase() === 'admin';
  email = localStorage.getItem('email') || '';

  branches: any[] = [];
  users: any[] = [];

  newUser = {
    branches: [] as string[],
    email: '',
    username: '',
    phoneNumber: '',
    password: '',
    role: 'user'
  };

  editId: number | null = null;
  editUser = {
    branches: [] as string[],
    email: '',
    username: '',
    phoneNumber: '',
    password: '',
    role: 'user'
  };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    if (!this.isAdmin) return;
    this.loadBranches();
    this.loadUsers();
  }

  private loadBranches() {
    this.http.get<any[]>(`http://localhost:3000/api/branches`)
      .subscribe({
        next: (data) => {
          this.branches = data || [];
        },
        error: () => {
          this.branches = [];
        }
      });
  }

  private loadUsers() {
    this.http.get<any[]>('http://localhost:3000/api/admin/users')
      .subscribe({
        next: (data) => {
          this.users = data || [];
        },
        error: () => {
          this.users = [];
        }
      });
  }

  onNewRoleChange() {
    if (String(this.newUser.role).toLowerCase() === 'admin') {
      this.newUser.branches = ['All Branches'];
    }
  }

  createUser() {
    if (!this.newUser.email || !this.newUser.username || !this.newUser.password) {
      alert('Email, username, and password are required');
      return;
    }
    if (String(this.newUser.role).toLowerCase() !== 'admin' && !this.newUser.branches.length) {
      alert('At least one branch is required');
      return;
    }

    const payload = {
      email: this.newUser.email,
      username: this.newUser.username,
      phoneNumber: this.newUser.phoneNumber,
      password: this.newUser.password,
      role: this.newUser.role,
      originLocIds: this.newUser.branches
    };

    this.http.post('http://localhost:3000/api/admin/users', payload)
      .subscribe({
        next: () => {
          this.newUser = {
            branches: [],
            email: '',
            username: '',
            phoneNumber: '',
            password: '',
            role: 'user'
          };
          this.loadUsers();
        },
        error: (err) => {
          alert(err?.error?.message || 'Failed to create user');
        }
      });
  }

  startEdit(row: any) {
    this.editId = Number(row?._id);
    this.editUser = {
      branches: Array.isArray(row?.originLocIds)
        ? row.originLocIds
        : this.mapBranchNamesToIds(row?.branchNames || row?.branches || []),
      email: row?.email || '',
      username: row?.username || '',
      phoneNumber: row?.phoneNumber || '',
      password: '',
      role: row?.role || 'user'
    };
  }

  cancelEdit() {
    this.editId = null;
    this.editUser = { branches: [], email: '', username: '', phoneNumber: '', password: '', role: 'user' };
  }

  onEditRoleChange() {
    if (String(this.editUser.role).toLowerCase() === 'admin') {
      this.editUser.branches = ['All Branches'];
    }
  }

  saveEdit() {
    if (this.editId === null) return;

    const payload: any = {
      originLocIds: this.editUser.branches,
      email: this.editUser.email,
      username: this.editUser.username,
      phoneNumber: this.editUser.phoneNumber,
      role: this.editUser.role
    };
    if (this.editUser.password) payload.password = this.editUser.password;

    this.http.put(`http://localhost:3000/api/admin/users/${this.editId}`, payload)
      .subscribe({
        next: () => {
          this.cancelEdit();
          this.loadUsers();
        },
        error: (err) => {
          alert(err?.error?.message || 'Failed to update user');
        }
      });
  }

  private mapBranchNamesToIds(values: any[]): string[] {
    const names = Array.isArray(values) ? values : [values];
    return names
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .map((name) => {
        const match = (this.branches || []).find((b) =>
          String(b?.branchName || '').trim().toLowerCase() === name.toLowerCase()
        );
        return match?._id ? String(match._id) : '';
      })
      .filter(Boolean);
  }

  deleteUser(id: any) {
    const userId = Number(id);
    if (!Number.isFinite(userId)) return;
    if (!confirm('Delete this user?')) return;

    this.http.delete(`http://localhost:3000/api/admin/users/${userId}`)
      .subscribe({
        next: () => this.loadUsers(),
        error: (err) => alert(err?.error?.message || 'Failed to delete user')
      });
  }

  canDeleteUser(row: any): boolean {
    return !Boolean(row?.isSuperAdminProvisioned);
  }
}
