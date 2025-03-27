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
  // GET /items - Fetch all items
  app.get('/items', async (req, res) => {
    try {
      const items = await db.collection('items').find().toArray();
      res.json(items);
    } catch (e) {
      console.error('Error fetching items:', e.message);
      res.status(500).send('Error fetching items: ' + e.message);
    }
  });

  // POST /items - Add a new item
  app.post('/items', async (req, res) => {
    try {
      const { name, price, stock } = req.body;
      if (!name || !price || !stock) {
        return res.status(400).send('All fields are required');
      }

      const existing = await db.collection('items').findOne({ name });
      if (existing) {
        return res.status(409).send(`Item with name "${name}" already exists`);
      }

      await db.collection('items').insertOne({ name, price, stock });
      res.sendStatus(200);
    } catch (e) {
      console.error('Error adding item:', e.message);
      res.status(500).send('Error adding item: ' + e.message);
    }
  });

  // PUT /items/:id - Update an item
  app.put('/items/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, price, stock } = req.body;

      if (!name || !price || !stock) {
        return res.status(400).send('All fields are required');
      }

      const duplicate = await db.collection('items').findOne({ name, _id: { $ne: new ObjectId(id) } });
      if (duplicate) {
        return res.status(409).send(`Item with name "${name}" already exists`);
      }

      const result = await db.collection('items').updateOne(
        { _id: new ObjectId(id) },
        { $set: { name, price, stock } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send('Item not found');
      }

      res.sendStatus(200);
    } catch (e) {
      console.error('Error updating item:', e.message);
      res.status(500).send('Error updating item: ' + e.message);
    }
  });

  // DELETE /items/:id - Remove an item
  app.delete('/items/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.collection('items').deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).send('Item not found');
      }

      res.sendStatus(200);
    } catch (e) {
      console.error('Error removing item:', e.message);
      res.status(500).send('Error removing item: ' + e.message);
    }
  });

  // POST /bill - Save a new bill
  app.post('/bill', async (req, res) => {
    try {
      const { items, customer, phone, date, serialNumber } = req.body;

      let newSerialNumber = serialNumber;
      let existing = await db.collection('bills').findOne({ serialNumber: newSerialNumber });
      while (existing) {
        newSerialNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        existing = await db.collection('bills').findOne({ serialNumber: newSerialNumber });
      }

      // Initialize each item with a `returned` field set to `false`
      const itemsWithReturnStatus = items.map(item => ({
        ...item,
        returned: false
      }));

      await db.collection('bills').insertOne({
        serialNumber: newSerialNumber,
        customer: customer || null,
        phone: phone || null,
        date: new Date(date),
        items: itemsWithReturnStatus,
        returned: false
      });

      res.sendStatus(200);
    } catch (e) {
      console.error('Error saving bill:', e.message);
      res.status(500).send('Error saving bill: ' + e.message);
    }
  });

  // GET /bill/:serial - Fetch a bill by serial number
  app.get('/bill/:serial', async (req, res) => {
    try {
      const { serial } = req.params;
      const bill = await db.collection('bills').findOne({ serialNumber: serial });

      if (!bill) {
        return res.status(404).json(null);
      }

      res.json(bill);
    } catch (e) {
      console.error('Error fetching bill:', e.message);
      res.status(500).send('Error fetching bill: ' + e.message);
    }
  });

  // PUT /bill/:serial/return - Mark a specific item as returned
  app.put('/bill/:serial/return', async (req, res) => {
    try {
      const { serial } = req.params;
      const { itemIndex } = req.body; // Index of the item to return

      if (itemIndex === undefined || itemIndex < 0) {
        return res.status(400).send('Invalid item index');
      }

      // Fetch the bill
      const bill = await db.collection('bills').findOne({ serialNumber: serial });
      if (!bill) {
        return res.status(404).send('Bill not found');
      }

      // Check if the item exists and hasn't been returned yet
      if (itemIndex >= bill.items.length) {
        return res.status(400).send('Item index out of range');
      }

      if (bill.items[itemIndex].returned) {
        return res.status(400).send('Item already returned');
      }

      // Update stock for the returned item
      const billItem = bill.items[itemIndex];
      const inventoryItem = await db.collection('items').findOne({ _id: new ObjectId(billItem._id) });
      if (!inventoryItem) {
        return res.status(404).send(`Item ${billItem.name} not found in inventory`);
      }

      inventoryItem.stock += billItem.qty;
      await db.collection('items').updateOne(
        { _id: new ObjectId(billItem._id) },
        { $set: { stock: inventoryItem.stock } }
      );

      // Mark the item as returned
      bill.items[itemIndex].returned = true;

      // Check if all items are returned
      const allItemsReturned = bill.items.every(item => item.returned);

      // Update the bill with the new items array and overall returned status
      const result = await db.collection('bills').updateOne(
        { serialNumber: serial },
        {
          $set: {
            items: bill.items,
            returned: allItemsReturned
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send('Bill not found');
      }

      res.sendStatus(200);
    } catch (e) {
      console.error('Error marking item as returned:', e.message);
      res.status(500).send('Error marking item as returned: ' + e.message);
    }
  });

  // DELETE /bill/:serial - Delete a bill by serial number
  app.delete('/bill/:serial', async (req, res) => {
    try {
      const { serial } = req.params;
      const result = await db.collection('bills').deleteOne({ serialNumber: serial });

      if (result.deletedCount === 0) {
        return res.status(404).send('Bill not found');
      }

      res.sendStatus(200);
    } catch (e) {
      console.error('Error deleting bill:', e.message);
      res.status(500).send('Error deleting bill: ' + e.message);
    }
  });

  // GET /bills - Fetch all bills
  app.get('/bills', async (req, res) => {
    try {
      const bills = await db.collection('bills').find().sort({ date: -1 }).toArray();
      res.json(bills);
    } catch (e) {
      console.error('Error fetching bills:', e.message);
      res.status(500).send('Error fetching bills: ' + e.message);
    }
  });

  app.listen(3000, () => console.log('Server running on port 3000'));
}).catch(err => {
  console.error('Failed to start server due to database connection error:', err.message);
});