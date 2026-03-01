const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// This part stops the browser from blocking your connection
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

async function connectDB() {
  try {
    await client.connect();
    console.log('--- SYSTEM ONLINE: MongoDB Connected ---');
    db = client.db('sportsworldshop');
    
    // This makes searching for items and bills very fast
    await db.collection('items').createIndex({ name: 1 }, { unique: true });
    await db.collection('bills').createIndex({ serialNumber: 1 }, { unique: true });
  } catch (e) {
    console.error('Database error:', e.message);
    process.exit(1);
  }
}

connectDB().then(() => {
  
  // 1. Get all items for the list
  app.get('/items', async (req, res) => {
    try {
      const items = await db.collection('items').find().toArray();
      res.json(items);
    } catch (e) {
      res.status(500).send('Error getting items');
    }
  });

  // 2. Add a new item to the shop
  app.post('/items', async (req, res) => {
    try {
      await db.collection('items').insertOne(req.body);
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Error adding item');
    }
  });

  // 3. Update stock or price of an item
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

  // 4. Delete an item from the shop
  app.delete('/items/:id', async (req, res) => {
    try {
      await db.collection('items').deleteOne({ _id: new ObjectId(req.params.id) });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Error deleting item');
    }
  });

  // 5. Save a new Bill (with customer phone and discount)
  app.post('/bill', async (req, res) => {
    try {
      const billData = {
        ...req.body,
        date: new Date(req.body.date),
        // Add return tracking to each item
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

  // 6. Get all bills (This powers your Dashboard and History)
  app.get('/bills', async (req, res) => {
    try {
      const bills = await db.collection('bills').find().sort({ date: -1 }).toArray();
      res.json(bills);
    } catch (e) {
      res.status(500).send('Error getting history');
    }
  });

  // 7. Find one specific bill by serial number
  app.get('/bill/:serial', async (req, res) => {
    try {
      const bill = await db.collection('bills').findOne({ serialNumber: req.params.serial });
      res.json(bill);
    } catch (e) {
      res.status(500).send('Error finding bill');
    }
  });

  // 8. The Return Feature (Restores stock to inventory)
  app.put('/bill/:serial/return', async (req, res) => {
    try {
      const { serial } = req.params;
      const { itemIndex, returnQty } = req.body;

      const bill = await db.collection('bills').findOne({ serialNumber: serial });
      if (!bill) return res.status(404).send('Bill not found');

      const item = bill.items[itemIndex];

      // Put the item back in the shop stock
      await db.collection('items').updateOne(
        { _id: new ObjectId(item._id) },
        { $inc: { stock: returnQty } }
      );

      // Update the bill to show it was returned
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

  // 9. Delete a bill permanently
  app.delete('/bill/:serial', async (req, res) => {
    try {
      await db.collection('bills').deleteOne({ serialNumber: req.params.serial });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Error deleting bill');
    }
  });

  const PORT = 3000;
  app.listen(PORT, () => console.log(`--- SPORTS WORLD SERVER RUNNING ON PORT ${PORT} ---`));
});
