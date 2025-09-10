import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgIf],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  username: string | null = localStorage.getItem('username');

  // Dropdown states
  showShipments = false;
  showAdmin = false;
  showSettings = false;
  showProfile = false;

  toggleMenu(menu: string) {
    if (menu === 'shipments') this.showShipments = !this.showShipments;
    if (menu === 'admin') this.showAdmin = !this.showAdmin;
    if (menu === 'settings') this.showSettings = !this.showSettings;
    if (menu === 'profile') this.showProfile = !this.showProfile;
  }
}
