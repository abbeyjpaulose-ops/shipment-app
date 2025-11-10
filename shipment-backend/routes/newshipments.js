// shipment-backend/routes/newshipments.js
import express from 'express';
import NewShipment from '../models/NewShipment.js';

const router = express.Router();

// Create new shipment
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming New shipment data:', req.body);  // 👈 debug log
    const newshipments = new NewShipment(req.body);
    await newshipments.save();
    res.status(201).json(newshipments);
  } catch (err) { 
    console.error('❌ Error saving New shipment:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get next consignment number for a user (reset on April 1st)
router.get("/nextConsignment", async (req, res) => {
  const emailId = req.query.emailId;
  if (!emailId) {
    return res.status(400).json({ message: "Missing emailId in query parameters" });
  }
  try {
    
    console.log("Fetching next consignment number for:", emailId);
    
    // Get today's fiscal year (April 1 – March 31)
    const today = new Date();
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const fiscalYearStart = new Date(year, 3, 1); // April 1
    const fiscalYearEnd = new Date(year + 1, 2, 31, 23, 59, 59); // March 31

    // Find last shipment in this fiscal year for this user
   const result = await NewShipment.aggregate([
  {
    $match: {
      email: emailId,
      date: { $gte: fiscalYearStart, $lte: fiscalYearEnd }
    }
  },
  {
    $addFields: {
      consignmentNumberInt: { $toInt: "$consignmentNumber" }
    }
  },
  {
    $sort: { consignmentNumberInt: -1 }
  },
  {
    $limit: 1
  }
]);

const lastShipment = result[0]; // Access first item in array
console.log("CCCCCCCCCCCCCCConsignment Number (int):", lastShipment?.consignmentNumberInt);


    let nextNumber = 1;
    if (lastShipment && lastShipment.consignmentNumber) {
      nextNumber = lastShipment.consignmentNumberInt + 1;
    }
    console.log(`Next consignment number for ${emailId} in FY ${year}-${year + 1}:`, nextNumber);

    res.json({ nextNumber, fiscalYear: `${year}-${year + 1}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to get next consignment number", details: err });
  }
});

// GET all shipments for logged-in user
router.get('/', async (req, res) => {
  try {
    const { email, branch } = req.query; // extract both email and branch

    if (!email || !branch) {
      return res.status(400).json({ message: 'Email and branch are required' });
    }

    let shipments;
    if (branch === 'All Branches') {
      shipments = await NewShipment.find({ email }).sort({ createdAt: -1 });
    } else {
      shipments = await NewShipment.find({ email, branch }).sort({ createdAt: -1 });
    }

    // Custom status order
    const statusOrder = {
      "Pending": 1,
      "In Transit/Pending": 2,      
      "In Transit": 3,
      "Delivered": 4,
      "Invoiced": 5,
      "Income Tax filed": 6,
      "Cancel": 7
    };

    // Sort shipments by status group first, then by createdAt (descending)
    shipments.sort((a, b) => {
      const orderA = statusOrder[a.shipmentStatus] || 99; // default 99 for "rest"
      const orderB = statusOrder[b.shipmentStatus] || 99;
      console.log('📦 SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSShipments loaded:', a.shipmentStatus, b.shipmentStatus);

      if (orderA !== orderB) {
        return orderA - orderB; // sort by group
      }
      return new Date(b.createdAt) - new Date(a.createdAt); // then by createdAt
    });
       
    

    res.json(shipments);
  } catch (err) {
    console.error('Error fetching shipments:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


///stocks page edit shipment
router.put('/:consignmentNumber', async (req, res) => {
  try {
    const shipment = await NewShipment.findOneAndUpdate(
      { consignmentNumber: req.params.consignmentNumber },
      req.body,
      { new: true }
    );
    res.json(shipment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/updateConsignment', async (req, res) => {
  const { email, updatedConsignment } = req.body;

  console.log('📥 UUUUUUUUUUUUUpdate request received for:', { email });
  console.log('📦 Updated Consignment:', updatedConsignment);

  try {
    // Log each invoice and its products
    updatedConsignment.invoices.forEach(async invoice => {
        // Update logic (assuming consignmentNumber is unique within a shipment document)   
        const result = await NewShipment.findOneAndUpdate(
          {'consignments.email': email, 'consignments.consignmentNumber': consignmentNumber, 'consignments.invoices': consignmentNumber },
          { $set: { 'consignments.$': updatedConsignment } },
          { new: true }
        );
        if (!result) {
          console.warn('⚠️ No matching consignment found.');
          return res.status(404).json({ error: 'Consignment not found' });
        }
      });    

    console.log('✅ Consignment updated successfully.');
    res.status(200).json({ message: 'Consignment updated', data: result });
  } catch (error) {
    console.error('❌ Error updating consignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/getConsignment', async (req, res) => {
  try {
    const { email, consignmentNumber } = req.query; // extract both email and branch

    let conshipments;
    conshipments = await NewShipment.find({ email, consignmentNumber }).sort({ createdAt: -1 });

    console.log('FFFFFFFFFFFFFetched consignment:', email, consignmentNumber, conshipments);
  

    res.json(conshipments);
  } catch (err) {
    console.error('Error fetching shipments:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
