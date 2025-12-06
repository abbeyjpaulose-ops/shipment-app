import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css']
})
export class HubComponent implements OnInit {
  
  hubs: any[] = [];

  newHub: any = {
    hubName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    GSTIN: '',
    phoneNum: '',
    perRev: '',
    vehicles: [
      { vehicleNo: '', driverPhone: '' }
    ],
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };

  editingHub: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadHubs();
  }

  loadHubs() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/hubs?email=${email}`)
      .subscribe({
        next: (data) => {
          console.log("Hubs loaded:", data);
          this.hubs = data;
        },
        error: (err) => console.error("Error loading hubs:", err)
      });
  }

  addVehicle() {
    this.newHub.vehicles.push({ vehicleNo: '', driverPhone: '' });
  }

  removeVehicle(index: number) {
    this.newHub.vehicles.splice(index, 1);
  }

  addHub() {
    this.http.post('http://localhost:3000/api/hubs/add', this.newHub)
      .subscribe({
        next: () => {
          alert('Hub added successfully!');
          this.loadHubs();
          this.resetForm();
        },
        error: (err) => {
          console.error('Error saving hub:', err);
          alert('Error: ' + err.error.message);
        }
      });
  }

  resetForm() {
    this.newHub = {
      hubName: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      GSTIN: '',
      phoneNum: '',
      perRev: '',
      vehicles: [
        { vehicleNo: '', driverPhone: '' }
      ],
      status: 'active',
      email: localStorage.getItem('email'),
      username: localStorage.getItem('username')
    };
  }

  editHub(hub: any) {
    this.editingHub = JSON.parse(JSON.stringify(hub)); // Deep clone
  }

  addVehicleEdit() {
    this.editingHub.vehicles.push({ vehicleNo: '', driverPhone: '' });
  }

  removeVehicleEdit(index: number) {
    this.editingHub.vehicles.splice(index, 1);
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/hubs/${this.editingHub._id}`, this.editingHub)
      .subscribe(() => {
        this.loadHubs();
        this.editingHub = null;
      });
  }

  toggleStatus(hub: any) {
    this.http.patch(`http://localhost:3000/api/hubs/${hub._id}/status`, {})
      .subscribe(() => this.loadHubs());
  }
}
