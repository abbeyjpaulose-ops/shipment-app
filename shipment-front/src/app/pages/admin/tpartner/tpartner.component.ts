import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-transport-partner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tpartner.component.html',
  styleUrls: ['./tpartner.component.css']
})
export class TpartnerComponent implements OnInit {

  partners: any[] = [];
  
  newPartner = {
    partnerName: '',
    vehicleNumbers: [] as string[],
    rateType: 'km',
    rateValue: 0,
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };

  newVehicle = '';
  editVehicleField = '';


  editing: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPartners();
  }

 
  addVehicle() {
    if (this.newVehicle.trim()) {
      this.newPartner.vehicleNumbers.push(this.newVehicle.trim());
      this.newVehicle = '';
    }
  }


  removeVehicle(i: number) {
    this.newPartner.vehicleNumbers.splice(i, 1);
  }


  addEditingVehicle() {
    if (this.editVehicleField.trim()) {
      this.editing.vehicleNumbers.push(this.editVehicleField.trim());
      this.editVehicleField = '';
    }
  }


  removeEditingVehicle(i: number) {
    this.editing.vehicleNumbers.splice(i, 1);
  }


  loadPartners() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/tpartners?email=${email}`)
      .subscribe(res => this.partners = res);
  }

  addPartner() {
    this.http.post('http://localhost:3000/api/tpartners/add', this.newPartner)
      .subscribe({
        next: () => {
          alert('Transport Partner added!');
          this.loadPartners();
        },
        error: err => alert(err.error.message)
      });
  }

  editPartner(p: any) {
    this.editing = { ...p };
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/tpartners/${this.editing._id}`, this.editing)
      .subscribe(() => {
        this.editing = null;
        this.loadPartners();
      });
  }

  toggleStatus(p: any) {
    this.http.patch(`http://localhost:3000/api/tpartners/${p._id}/status`, {
      email: localStorage.getItem('email')
    }).subscribe(() => this.loadPartners());
  }
}
