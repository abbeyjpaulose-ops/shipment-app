import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product.component.html',
  styleUrls: ['./product.component.css']
})
export class ProductComponent implements OnInit {
  products: any[] = [];
  newProduct: any = {
    productName: '',
    branch: localStorage.getItem('branch') || 'All Branches',
    status: 'active',
    email: localStorage.getItem('email'),
    username: localStorage.getItem('username')
  };
  editingProduct: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProducts();
  }

  loadProducts() {
    const email = localStorage.getItem('email');
    this.http.get<any[]>(`http://localhost:3000/api/products?email=${email}`)
      .subscribe({
        next: (data) => {
          this.products = data;
        },
        error: (err) => console.error('Error loading products:', err)
      });
  }

  addProduct() {
    this.newProduct.branch = localStorage.getItem('branch') || 'All Branches';
    if (this.newProduct.branch === 'All Branches') {
      alert('Please select a specific branch before adding a product.');
      return;
    }
    this.http.post('http://localhost:3000/api/products/add', this.newProduct, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: () => {
        alert('Product type added successfully!');
        window.location.reload();
      },
      error: (err) => {
        alert('Error: ' + err.error?.message);
      }
    });
  }

  editProduct(product: any) {
    this.editingProduct = { ...product };
  }

  saveEdit() {
    this.http.put(`http://localhost:3000/api/products/${this.editingProduct._id}`, this.editingProduct)
      .subscribe(() => {
        this.loadProducts();
        this.editingProduct = null;
      });
  }

  toggleStatus(product: any) {
    this.http.patch(`http://localhost:3000/api/products/${product._id}/status`, {})
      .subscribe(() => this.loadProducts());
  }
}
