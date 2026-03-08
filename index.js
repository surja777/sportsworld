const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());

// Serve images and CSS from your folder
app.use(express.static(path.join(__dirname, '/')));

// Stop browsers from blocking your shop's connection
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

// Ensure DB is connected before any request
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// --- SHOP API ENDPOINTS ---

app.get('/items', async (req, res) => {
  try {
    const items = await db.collection('items').find().toArray();
    res.json(items);
  } catch (e) {
    res.status(500).send('Error getting items');
  }
});

app.post('/items', async (req, res) => {
  try {
    await db.collection('items').insertOne(req.body);
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error adding item');
  }
});

app.put('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('items').updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error updating item');
  }
});

app.delete('/items/:id', async (req, res) => {
  try {
    await db.collection('items').deleteOne({ _id: new ObjectId(req.params.id) });
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error deleting item');
  }
});

app.post('/bill', async (req, res) => {
  try {
    const billData = {
      ...req.body,
      date: new Date(req.body.date),
      items: req.body.items.map(item => ({ ...item, returnedQty: 0, returned: false })),
      returned: false
    };
    await db.collection('bills').insertOne(billData);
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send('Error saving bill');
  }
});

app.get('/bills', async (req, res) => {
  try {
    const bills = await db.collection('bills').find().sort({ date: -1 }).toArray();
    res.json(bills);
  } catch (e) {
    res.status(500).send('Error getting history');
  }
});

app.get('/bill/:serial', async (req, res) => {
  try {
    const bill = await db.collection('bills').findOne({ serialNumber: req.params.serial });
    res.json(bill);
  } catch (e) {
    res.status(500).send('Error finding bill');
  }
});

// --- PAGE ROUTING: This fixes the 404 for /history, /view-bill, etc. ---

// 1. Show the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Show any other page (like sportsworld.vercel.app/history)
app.get('/:page', (req, res) => {
  const pageName = req.params.page;
  res.sendFile(path.join(__dirname, `${pageName}.html`), (err) => {
    if (err) {
      // If page doesn't exist, go back home
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
});

// Export for Vercel
module.exports = app;

// Local testing
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => console.log(`Server running on http://localhost:3000`));
}
