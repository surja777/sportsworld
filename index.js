const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

const uri = 'mongodb+srv://sportsworld009:sportsworld009@sportsworldshop.9krj7vc.mongodb.net/';
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

async function connectDB() {
  try {
    await client.connect();
    console.log('MongoDB connected successfully');
    db = client.db('sportsworldshop');
    await db.collection('items').createIndex({ name: 1 }, { unique: true });
    await db.collection('bills').createIndex({ serialNumber: 1 }, { unique: true });
  } catch (e) {
    console.error('MongoDB connection error:', e.message);
    process.exit(1);
  }
}

connectDB().then(() => {
  app.get('/items', async (req, res) => {
    try {
      const items = await db.collection('items').find().toArray();
      res.json(items);
    } catch (e) {
      res.status(500).send('Error fetching items: ' + e.message);
    }
  });

  app.post('/items', async (req, res) => {
    try {
      const { name, price, stock } = req.body;
      if (!name || price === undefined || stock === undefined) return res.status(400).send('Fields required');
      const existing = await db.collection('items').findOne({ name });
      if (existing) return res.status(409).send(`Item exists`);
      await db.collection('items').insertOne({ name, price, stock });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Error adding item');
    }
  });

  app.put('/items/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, price, stock } = req.body;
      const existingItem = await db.collection('items').findOne({ _id: new ObjectId(id) });
      if (!existingItem) return res.status(404).send('Not found');

      const updateData = {
        name: name !== undefined ? name : existingItem.name,
        price: price !== undefined ? price : existingItem.price,
        stock: stock !== undefined ? stock : existingItem.stock
      };

      await db.collection('items').updateOne({ _id: new ObjectId(id) }, { $set: updateData });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Error updating');
    }
  });

  app.delete('/items/:id', async (req, res) => {
    try {
      await db.collection('items').deleteOne({ _id: new ObjectId(req.params.id) });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Error removing');
    }
  });

  app.post('/bill', async (req, res) => {
    try {
      const { items, customer, phone, date, serialNumber, discount } = req.body;
      let newSerialNumber = serialNumber;
      let existing = await db.collection('bills').findOne({ serialNumber: newSerialNumber });
      while (existing) {
        newSerialNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        existing = await db.collection('bills').findOne({ serialNumber: newSerialNumber });
      }

      const itemsWithReturnStatus = items.map(item => ({
        ...item,
        originalQty: item.qty,
        returnedQty: 0,
        returned: false
      }));

      await db.collection('bills').insertOne({
        serialNumber: newSerialNumber,
        customer: customer || null,
        phone: phone || null,
        date: new Date(date),
        items: itemsWithReturnStatus,
        discount: Number(discount) || 0, // NEW FEATURE SAVING
        returned: false
      });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Error saving bill');
    }
  });

  app.get('/bill/:serial', async (req, res) => {
    try {
      const bill = await db.collection('bills').findOne({ serialNumber: req.params.serial });
      res.json(bill);
    } catch (e) {
      res.status(500).send('Error fetching');
    }
  });

  app.put('/bill/:serial/return', async (req, res) => {
    try {
      const { serial } = req.params;
      const { itemIndex, returnQty } = req.body;
      const bill = await db.collection('bills').findOne({ serialNumber: serial });
      if (!bill) return res.status(404).send('Not found');
      
      const billItem = bill.items[itemIndex];
      const qtyToReturn = returnQty || billItem.qty;

      const inventoryItem = await db.collection('items').findOne({ _id: new ObjectId(billItem._id) });
      if (inventoryItem) {
        await db.collection('items').updateOne(
          { _id: new ObjectId(billItem._id) },
          { $set: { stock: inventoryItem.stock + qtyToReturn } }
        );
      }

      billItem.returnedQty = (billItem.returnedQty || 0) + qtyToReturn;
      billItem.returned = billItem.returnedQty >= billItem.qty;
      const allItemsReturned = bill.items.every(item => item.returned);

      await db.collection('bills').updateOne(
        { serialNumber: serial },
        { $set: { items: bill.items, returned: allItemsReturned } }
      );
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Return failed');
    }
  });

  app.delete('/bill/:serial', async (req, res) => {
    try {
      await db.collection('bills').deleteOne({ serialNumber: req.params.serial });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).send('Delete failed');
    }
  });

  app.get('/bills', async (req, res) => {
    try {
      const bills = await db.collection('bills').find().sort({ date: -1 }).toArray();
      res.json(bills);
    } catch (e) {
      res.status(500).send('Fetch failed');
    }
  });

  app.listen(3000, () => console.log('Server running on port 3000'));
});
