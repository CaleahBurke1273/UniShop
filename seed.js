// Run once:  node seed.js   -> loads the 29 sample listings so search has data to show.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
const sample = require('./seed-listings.json');

if (db.prepare('SELECT COUNT(*) AS n FROM listings').get().n > 0) {
  console.log('Listings table already has data - nothing seeded.');
  process.exit(0);
}
// A placeholder seller owns the sample listings (random password, so nobody can log in as it).
const seller = db.prepare(
  'INSERT OR IGNORE INTO users (full_name, school, username, password_hash) VALUES (?, ?, ?, ?)'
).run('Demo Seller', 'Wilfrid Laurier University', 'demo_seller', bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10));
const sellerId = seller.lastInsertRowid || db.prepare("SELECT id FROM users WHERE username='demo_seller'").get().id;

const soldIds = [5, 9, 17, 21];
const insert = db.prepare(`INSERT INTO listings
  (seller_id, title, description, category, item_condition, price, school, area, pickup_location, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
db.transaction(() => sample.forEach(i =>
  insert.run(sellerId, i.title, i.description, i.category, i.condition, i.price, i.school, i.area,
             'Campus pickup', soldIds.includes(i.id) ? 'Sold' : 'Available', i.createdAt + ' 12:00:00'))
)();
console.log(`Seeded ${sample.length} sample listings.`);
