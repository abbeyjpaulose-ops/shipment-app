// shipment-backend/routes/client.js
import express from 'express';
import Client from '../models/Client.js';

const router = express.Router();

// Create new client
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming client data:', req.body);  // 👈 debug log
  
    const client = new Client(req.body);
    await client.save();
    res.status(201).json(client);
  } catch (err) {
    console.error('❌ Error saving client:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get clients for a specific user
router.get('/', async (req, res) => {
  try {
    // Extract query params from request
    const email = req.query.email;
    const branch = req.query.branch;
    // Build query dynamically
    const query = {
      ...(email && { email }),
      ...(branch && { branch: cbranch })
    };
    // Fetch clients from DB
    let shipments;
    if (branch === 'All Branches') {
      clients = await Client.find(email).sort({ createdAt: -1 })
    } else {
      clients = await Client.find(query).sort({ createdAt: -1 });
    }
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update client
router.put('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, client });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle status
router.patch('/:id/status', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    client.status = client.status === 'active' ? 'inactive' : 'active';
    await client.save();
    res.json({ success: true, client });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/:id/credit', async (req, res) => {

  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    client.creditType = client.creditType === 'credit' ? 'no-credit' : 'credit';
    await client.save();
    res.json({ success: true, client });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});


// Get clients by user
router.get('/by-user/:username', async (req, res) => {
  try {   
    const clients = await Client.find({
      email: req.query.email
    }).sort({ createdAt: -1 });
    
    res.json(clients);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active clients for dropdown
router.get('/clientslist', async (req, res) => {
  try {
    const email = req.query.emailId; // frontend sends ?email=user@example.com
    const query = email ? { email, status: 'active' } : { status: 'active' };
    const clients = await Client.find(query).select('clientName GSTIN address phoneNum');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
