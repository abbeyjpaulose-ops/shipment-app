import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { NewShipmentComponent } from './pages/new-shipment/new-shipment.component';
import { ShipmentsComponent } from './pages/shipments/shipments.component';
import { AdminComponent } from './pages/admin/admin.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { NotificationsComponent } from './pages/notifications/notifications.component';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  {
    path: 'home',
    component: HomeComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'new-shipment', component: NewShipmentComponent },
      { path: 'shipments', component: ShipmentsComponent },
      { path: 'admin', component: AdminComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'notifications', component: NotificationsComponent }
    ]
  }
];
