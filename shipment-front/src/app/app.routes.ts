import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { NewShipmentComponent } from './pages/new-shipment/new-shipment.component';
import { ViewShipmentsComponent } from './pages/shipments/view-shipments/view-shipments.component';
import { AdminComponent } from './pages/admin/admin.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { BranchComponent } from './pages/admin/branch/branch.component';
import { HubComponent } from './pages/admin/hub/hub.component';
import { TpartnerComponent } from './pages/admin/tpartner/tpartner.component';
import { NotificationsComponent } from './pages/notifications/notifications.component';
import { ClientComponent } from './pages/admin/client/client.component';
import { GuestsComponent } from './pages/admin/guest/guest.component';
import { CategoriesComponent } from './pages/admin/categories/categories.component';
import { PkgComponent } from './pages/admin/pkg/pkg.component';
import { ProductComponent } from './pages/admin/product/product.component';
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
import { branchRequiredGuard } from './guards/branch-required.guard';



export const routes: Routes = [
  { path: '', component: LoginComponent },
  {
    path: 'home',
    component: HomeComponent, 
    canActivateChild: [branchRequiredGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'new-shipment', component: NewShipmentComponent },
      { path: 'shipments', component: ViewShipmentsComponent },
      { path: 'admin', component: AdminComponent },
      { path: 'Branches', component:  BranchComponent},
      { path: 'Clients', component:  ClientComponent},
      { path: 'Guests', component:  GuestsComponent},
      { path: 'Categories', component:  CategoriesComponent},
      { path: 'Pkgs', component:  PkgComponent},
      { path: 'Hubs', component:  HubComponent},
      { path: 'Tpartners', component:  TpartnerComponent},
      { path: 'Logs', component:  LogsComponent},
      { path: 'Reports', component:  ReportsComponent},
      { path: 'Invoice', component:  InvoiceComponent},
      { path: 'Manifest', component:  ManifestComponent},
      { path: 'Stocks', component:  StocksComponent},
      { path: 'RoleSettings', component:  RoleSettingsComponent},
      { path: 'Users', component:  UsersComponent},
      { path: 'Locations', component:  LocationsComponent},
      { path: 'Configuration', component:  ConfigurationComponent},
      { path: 'Products', component:  ProductComponent},
      { path: 'settings', component: SettingsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'roles', component: RolesComponent },
      { path: 'changePass', component: ChangePassComponent },
      { path: 'notifications', component: NotificationsComponent }
      
    ]
  }
];
