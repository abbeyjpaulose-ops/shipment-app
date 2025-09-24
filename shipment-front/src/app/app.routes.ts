import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { NewShipmentComponent } from './pages/new-shipment/new-shipment.component';
import { ShipmentsComponent } from './pages/shipments/shipments.component';
import { AdminComponent } from './pages/admin/admin.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { BranchComponent } from './pages/admin/branch/branch.component';
import { HubComponent } from './pages/admin/hub/hub.component';
import { NotificationsComponent } from './pages/notifications/notifications.component';
import { ClientComponent } from './pages/admin/client/client.component';
import { GuestsComponent } from './pages/admin/guest/guest.component';
import { CategoriesComponent } from './pages/admin/categories/categories.component';
import { PackagesComponent } from './pages/admin/packages/packages.component';
import { ProductsComponent } from './pages/admin/products/products.component';
import { RoleSettingsComponent } from './pages/admin/roleSettings/roleSettings.component';
import { UsersComponent } from './pages/admin/users/users.component';
import { StocksComponent } from './pages/shipments/stocks/stocks.component';
import { ManifestComponent } from './pages/shipments/manifest/manifest.component';
import { InvoiceComponent } from './pages/shipments/invoice/invoice.component';
import { ReportsComponent } from './pages/shipments/reports/reports.component';
import { ConfigurationComponent } from './pages/settings/configuration/configuration.component';
import { LocationsComponent } from './pages/settings/locations/locations.component';
import { LogsComponent } from './pages/settings/logs/logs.component';
import { ChangePassComponent } from './pages/profile/changePass/changePass.component';
import { RolesComponent } from './pages/profile/roles/roles.component';



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
      { path: 'Branches', component:  BranchComponent},
      { path: 'Clients', component:  ClientComponent},
      { path: 'Guests', component:  GuestsComponent},
      { path: 'Categories', component:  CategoriesComponent},
      { path: 'Packages', component:  PackagesComponent},
      { path: 'Hubs', component:  HubComponent},
      { path: 'Logs', component:  LogsComponent},
      { path: 'Reports', component:  ReportsComponent},
      { path: 'Invoice', component:  InvoiceComponent},
      { path: 'Manifest', component:  ManifestComponent},
      { path: 'Stocks', component:  StocksComponent},
      { path: 'RoleSettings', component:  RoleSettingsComponent},
      { path: 'Users', component:  UsersComponent},
      { path: 'Locations', component:  LocationsComponent},
      { path: 'Configuration', component:  ConfigurationComponent},
      { path: 'Products', component:  ProductsComponent},
      { path: 'settings', component: SettingsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'roles', component: RolesComponent },
      { path: 'changePass', component: ChangePassComponent },
      { path: 'notifications', component: NotificationsComponent }
    ]
  }
];
