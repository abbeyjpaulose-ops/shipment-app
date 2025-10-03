// shipment-backend/routes/product.js
import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// Create new product
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming product data:', req.body);  // 👈 debug log
  
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error('❌ Error saving product:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get products for a specific user
router.get('/', async (req, res) => {
  try {
    const email = req.query.email;  // frontend will send ?email=user@example.com
    const query = email ? { email } : {};
    const products = await Product.find(query).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle status
router.patch('/:id/status', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    product.status = product.status === 'active' ? 'inactive' : 'active';
    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get products by user
router.get('/by-user/:username', async (req, res) => {
  try {   
    const products = await Product.find({
      email: req.query.email
    }).sort({ createdAt: -1 });
    
    res.json(products);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active product for dropdown
router.get('/productlist', async (req, res) => {
  try {
    const email = req.query.emailId; // frontend sends ?email=user@example.com
    const query = email ? { email, status: 'active' } : { status: 'active' };
    const product = await Product.find(query).sort({ createdAt: -1 });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
