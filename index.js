const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

// 1. SERVE STATIC FILES: This allows the browser to find your .html and .png files
app.use(express.static(path.join(__dirname, '/')));

// CORS: Prevents the browser from blocking your connection
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// Your MongoDB Link
const uri = 'mongodb+srv://sportsworld009:sportsworld009@sportsworldshop.9krj7vc.mongodb.net/';
const client = new MongoClient(uri);

let db;

// DATABASE CONNECTION: Optimized for Vercel's serverless environment
async function connectDB() {
  try {
    if (!db) {
      await client.connect();
      db = client.db('sportsworldshop');
      console.log('--- SYSTEM ONLINE: MongoDB Connected ---');
    }
    return db;
  } catch (e) {
    console.error('Database error:', e.message);
  }
}

// 2. ROOT ROUTE: This fixes the "Cannot GET /" error by showing your index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Middleware to ensure DB is ready before any API request
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// --- API ENDPOINTS FOR YOUR BILLING SYSTEM ---

// Get all items
app.get('/items', async (req, res) => {
  try {
    const items = await db.collection('items').find().toArray();
    res.json(items);
  } catch (e) {
    res.status(500).send('Error getting items');
  }
});

// Add a new item
app.post('/items', async (req, res) => {
  try {
    await db.collection('items').insertOne(req.body);
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error adding item');
  }
});

// Update an item
app.put('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('items').updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body }
    );
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error updating item');
  }
});

// Delete an item
app.delete('/items/:id', async (req, res) => {
  try {
    await db.collection('items').deleteOne({ _id: new ObjectId(req.params.id) });
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error deleting item');
  }
});

// Save a new Bill
app.post('/bill', async (req, res) => {
  try {
    const billData = {
      ...req.body,
      date: new Date(req.body.date),
      items: req.body.items.map(item => ({
        ...item,
        returnedQty: 0,
        returned: false
      })),
      returned: false
    };
    await db.collection('bills').insertOne(billData);
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error saving bill');
  }
});

// Get all bills
app.get('/bills', async (req, res) => {
  try {
    const bills = await db.collection('bills').find().sort({ date: -1 }).toArray();
    res.json(bills);
  } catch (e) {
    res.status(500).send('Error getting history');
  }
});

// Get one specific bill
app.get('/bill/:serial', async (req, res) => {
  try {
    const bill = await db.collection('bills').findOne({ serialNumber: req.params.serial });
    res.json(bill);
  } catch (e) {
    res.status(500).send('Error finding bill');
  }
});

// Return an item
app.put('/bill/:serial/return', async (req, res) => {
  try {
    const { serial } = req.params;
    const { itemIndex, returnQty } = req.body;
    const bill = await db.collection('bills').findOne({ serialNumber: serial });
    if (!bill) return res.status(404).send('Bill not found');

    const item = bill.items[itemIndex];
    await db.collection('items').updateOne(
      { _id: new ObjectId(item._id) },
      { $inc: { stock: returnQty } }
    );

    item.returnedQty = (item.returnedQty || 0) + returnQty;
    if (item.returnedQty >= item.qty) item.returned = true;
    const allReturned = bill.items.every(i => i.returned);
    
    await db.collection('bills').updateOne(
      { serialNumber: serial },
      { $set: { items: bill.items, returned: allReturned } }
    );
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Return failed');
  }
});

// Delete a bill
app.delete('/bill/:serial', async (req, res) => {
  try {
    await db.collection('bills').deleteOne({ serialNumber: req.params.serial });
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error deleting bill');
  }
});

// 3. EXPORT FOR VERCEL: This is required for the cloud deployment to work
module.exports = app;

// Only runs app.listen if you are testing locally on your PC
if (process.env.NODE_ENV !== 'production') {
  const PORT = 3000;
  app.listen(PORT, () => console.log(`--- SERVER RUNNING ON PORT ${PORT} ---`));
}
