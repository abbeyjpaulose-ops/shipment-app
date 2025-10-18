import express from 'express';
import Manifest from '../models/Manifest.js';
import NewShipment from '../models/NewShipment.js';  // existing shipment model

const router = express.Router();


// 🟢 Add new manifestation
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming Manifestation Data:', req.body);

    const { email, username, branch, consignments } = req.body;

    if (!email || !username || !branch || !consignments || consignments.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 🔢 Get the last manifestation number for this user
    const lastManifest = await Manifest.findOne({ email, username }).sort({ manifestationNumber: -1 });
    const nextManifestNo = lastManifest ? lastManifest.manifestationNumber + 1 : 1;

    // Create new manifest document
    const newManifest = new Manifest({
      email,
      username,
      branch,
      manifestationNumber: nextManifestNo,
      consignments
    });

    await newManifest.save();

    // 🔁 Update corresponding shipments in the newshipments collection
    for (const consignment of consignments) {
      
      const shipment = await NewShipment.findOne({ consignmentNumber: consignment.consignmentNumber });
      if (!shipment) continue;

      let stillHasStock = false;

      consignment.invoices.forEach(inv => {
        console.log('📥invoice', inv);
        inv.products.forEach(prod => {
          const shipmentInvoice = shipment.invoices.find(i => i.number === inv.number);
          if (shipmentInvoice) {
            const shipmentProduct = shipmentInvoice.products.find(p => p.type === prod.type);
            if (shipmentProduct) {
              shipmentProduct.instock = Math.max(0, shipmentProduct.instock - prod.manifestQty);
              console.log('📥shipmentproduct', shipmentProduct.instock, shipmentProduct.amount);
              if (shipmentProduct.instock > 0) stillHasStock = true;
            }
          }
        });
      });

      shipment.shipmentStatus = stillHasStock ? 'In Transit/Pending' : 'In Transit';
      console.log('📥 Updated Shipment Status:', shipment.shipmentStatus);
      console.log('📥 Updated Shipment Data:', shipment);
      await shipment.save();
    }

    res.status(201).json({
      success: true,
      message: '✅ Manifestation saved and shipment stock updated.',
      manifestationNumber: nextManifestNo
    });

  } catch (err) {
    console.error('❌ Error saving manifestation:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});


// 🟡 Get all manifests for a specific user (sorted by latest)
router.get('/', async (req, res) => {
  try {
      const { email, branch } = req.query; // extract both email and branch
  
      if (!email || !branch) {
        return res.status(400).json({ message: 'Email and branch are required' });
      }
  
      let shipments;
      if (branch === 'All Branches') {
        shipments = await Manifest.find({ email }).sort({ createdAt: -1 });
      } else {
        shipments = await Manifest.find({ email, branch }).sort({ createdAt: -1 });
      }
  
      res.json(shipments);
    } catch (err) {
      console.error('Error fetching shipments:', err);
      res.status(500).json({ message: 'Server error' });
    }
});


// 🟠 Update a manifest by ID
router.put('/:id', async (req, res) => {
  try {
    const manifest = await Manifest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, manifest });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});


// 🔵 Get manifests by username and email
router.get('/by-user/:username', async (req, res) => {
  try {
    const { email } = req.query;
    const manifests = await Manifest.find({ email, username: req.params.username }).sort({ date: -1 });
    res.json(manifests);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});


// 🟣 Get manifest list for dropdown or summary view
router.get('/manifestlist', async (req, res) => {
  try {
    const email = req.query.emailId;
    const query = email ? { email } : {};
    const manifests = await Manifest.find(query)
      .select('manifestationNumber date consignments')
      .sort({ manifestationNumber: -1 });
    res.json(manifests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
