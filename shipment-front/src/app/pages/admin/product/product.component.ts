import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, FormsModule],  // 👈 add here
  templateUrl: './product.component.html',
  styleUrls: ['./product.component.css']
})
export class ProductComponent implements OnInit {
  products: any[] = [];
  newProduct: any = {
    productName: '',
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
    const email = localStorage.getItem('email'); // set during login
    this.http.get<any[]>(`http://localhost:3000/api/products?email=${email}`)
    .subscribe({
      next: (data) => {
        console.log("Products loaded:", data); // 👈 log to browser console
        this.products = data;
      },
      error: (err) => console.error("Error loading products:", err)
    });
}

  addProduct() {
    console.log('📤 Sending product data:');
    this.http.post('http://localhost:3000/api/products/add', this.newProduct, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      next: (res) => {
        console.log('✅ Product type saved', res);
        alert('Product type added successfully!');
        window.location.reload();
      },
      error: (err) => {
        console.error('❌ Error saving product:', err);
        alert('Error12: ' + err.error.message);
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
