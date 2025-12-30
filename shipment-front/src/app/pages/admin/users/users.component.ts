import { Component } from '@angular/core';

@Component({
  selector: 'app-users',
  standalone: true,
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent {
  tabs = [
    { key: 'clients', label: 'Clients' },
    { key: 'branches', label: 'Branches' },
    { key: 'hubs', label: 'Hubs' },
    { key: 'transportPartners', label: 'Transport Partners' }
  ];
  activeTab = 'clients';
  paymentData: Record<string, any[]> = {
    clients: [],
    branches: [],
    hubs: [],
    transportPartners: []
  };

  setActiveTab(key: string) {
    this.activeTab = key;
  }
}
