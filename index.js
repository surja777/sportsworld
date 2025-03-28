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
      console.error('Error fetching items:', e.message);
      res.status(500).send('Error fetching items: ' + e.message);
    }
  });

  app.post('/items', async (req, res) => {
    try {
      const { name, price, stock } = req.body;
      if (!name || price === undefined || stock === undefined) {
        return res.status(400).send('All fields (name, price, stock) are required');
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

  app.put('/items/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, price, stock } = req.body;

      // Fetch the existing item to get current values
      const existingItem = await db.collection('items').findOne({ _id: new ObjectId(id) });
      if (!existingItem) {
        return res.status(404).send('Item not found');
      }

      // Prepare the update object with existing values as defaults
      const updateData = {
        name: name !== undefined ? name : existingItem.name,
        price: price !== undefined ? price : existingItem.price,
        stock: stock !== undefined ? stock : existingItem.stock
      };

      // Validate that all fields are now present
      if (!updateData.name || updateData.price === undefined || updateData.stock === undefined) {
        return res.status(400).send('All fields (name, price, stock) must be provided or unchanged');
      }

      // Check for duplicate name if name is being updated
      if (name && name !== existingItem.name) {
        const duplicate = await db.collection('items').findOne({ name, _id: { $ne: new ObjectId(id) } });
        if (duplicate) {
          return res.status(409).send(`Item with name "${name}" already exists`);
        }
      }

      const result = await db.collection('items').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
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

  app.post('/bill', async (req, res) => {
    try {
      const { items, customer, phone, date, serialNumber } = req.body;

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
        returned: false
      });

      res.sendStatus(200);
    } catch (e) {
      console.error('Error saving bill:', e.message);
      res.status(500).send('Error saving bill: ' + e.message);
    }
  });

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

  app.put('/bill/:serial/return', async (req, res) => {
    try {
      const { serial } = req.params;
      const { itemIndex, returnQty } = req.body;

      if (itemIndex === undefined || itemIndex < 0) {
        return res.status(400).send('Invalid item index');
      }

      const bill = await db.collection('bills').findOne({ serialNumber: serial });
      if (!bill) {
        return res.status(404).send('Bill not found');
      }

      if (itemIndex >= bill.items.length) {
        return res.status(400).send('Item index out of range');
      }

      const billItem = bill.items[itemIndex];

      if (!billItem.hasOwnProperty('returnedQty')) {
        billItem.returnedQty = 0;
      }

      if (billItem.returned) {
        return res.status(400).send('Item already fully returned');
      }

      const qtyToReturn = returnQty !== undefined && returnQty !== null ? returnQty : billItem.qty;

      if (qtyToReturn <= 0 || qtyToReturn > billItem.qty - billItem.returnedQty) {
        return res.status(400).send(`Invalid return quantity. You can return between 1 and ${billItem.qty - billItem.returnedQty} items.`);
      }

      const inventoryItem = await db.collection('items').findOne({ _id: new ObjectId(billItem._id) });
      if (!inventoryItem) {
        return res.status(404).send(`Item ${billItem.name} not found in inventory`);
      }

      inventoryItem.stock += qtyToReturn;
      await db.collection('items').updateOne(
        { _id: new ObjectId(billItem._id) },
        { $set: { stock: inventoryItem.stock } }
      );

      billItem.returnedQty += qtyToReturn;
      billItem.returned = billItem.returnedQty >= billItem.qty;

      const allItemsReturned = bill.items.every(item => item.returned);

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
