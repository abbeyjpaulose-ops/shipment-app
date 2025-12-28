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
  showAddHubPopup = false;

  newHub: any = {
    hubName: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNum: '',
    perRev: '',
    branch: localStorage.getItem('branch') || 'All Branches',
    deliveryAddresses: [
      {
        location: '',
        vehicles: [
          { vehicleNo: '', driverPhone: '' }
        ]
      }
    ],
    status: 'active',
  };

  editingHub: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    localStorage.setItem('branch', 'All Branches');
    this.newHub.branch = localStorage.getItem('branch') || 'All Branches';
    this.loadHubs();
  }

  loadHubs() {
    this.http.get<any[]>(`http://localhost:3000/api/hubs`)
      .subscribe({
        next: (data) => {
          console.log("Hubs loaded:", data);
          this.hubs = data;
        },
        error: (err) => console.error("Error loading hubs:", err)
      });
  }

  openAddHubPopup() {
    this.showAddHubPopup = true;
  }

  closeAddHubPopup() {
    this.showAddHubPopup = false;
  }

  addHub() {
    this.newHub.branch = localStorage.getItem('branch') || 'All Branches';
    this.http.post('http://localhost:3000/api/hubs/add', this.newHub)
      .subscribe({
        next: () => {
          alert('Hub added successfully!');
          this.loadHubs();
          this.resetForm();
          this.closeAddHubPopup();
        },
        error: (err) => {
          console.error('Error saving hub:', err);
          alert('Error: ' + err.error?.message);
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
      phoneNum: '',
      perRev: '',
      branch: localStorage.getItem('branch') || 'All Branches',
      deliveryAddresses: [
        {
          location: '',
          vehicles: [
            { vehicleNo: '', driverPhone: '' }
          ]
        }
      ],
      status: 'active',
    };
  }


  /** 🔹 Add / Remove Address in Add Mode */
  addAddress() {
    this.newHub.deliveryAddresses.push({
      location: '',
      vehicles: [{ vehicleNo: '', driverPhone: '' }]
    });
  }

  removeAddress(i: number) {
    this.newHub.deliveryAddresses.splice(i, 1);
  }


  /** 🔹 Add / Remove Vehicles in Add Mode */
  addVehicle(addrIndex: number) {
    this.newHub.deliveryAddresses[addrIndex].vehicles.push({
      vehicleNo: '', driverPhone: ''
    });
  }

  removeVehicle(addrIndex: number, vIndex: number) {
    this.newHub.deliveryAddresses[addrIndex].vehicles.splice(vIndex, 1);
  }


  /** 🔹 Edit Mode */
  editHub(hub: any) {
    this.editingHub = JSON.parse(JSON.stringify(hub)); // Deep clone
  }

  addAddressEdit() {
    this.editingHub.deliveryAddresses.push({
      location: '',
      vehicles: [{ vehicleNo: '', driverPhone: '' }]
    });
  }

  removeAddressEdit(i: number) {
    this.editingHub.deliveryAddresses.splice(i, 1);
  }

  addVehicleEdit(addrIndex: number) {
    this.editingHub.deliveryAddresses[addrIndex].vehicles.push({
      vehicleNo: '', driverPhone: ''
    });
  }

  removeVehicleEdit(addrIndex: number, vIndex: number) {
    this.editingHub.deliveryAddresses[addrIndex].vehicles.splice(vIndex, 1);
  }


  saveEdit() {
    this.http.put(`http://localhost:3000/api/hubs/${this.editingHub._id}`, this.editingHub)
      .subscribe({
        next: () => {
          this.loadHubs();
          this.editingHub = null;
        },
        error: (err) => alert("Update failed!")
      });
  }


  /** 🔹 Toggle Active/Inactive */
  toggleStatus(hub: any) {
    this.http.patch(
      `http://localhost:3000/api/hubs/${hub._id}/status`,
      { status: hub.status === 'active' ? 'inactive' : 'active' }
    )
      .subscribe(() => this.loadHubs());
  }

}
