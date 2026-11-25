const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 } // add secure:true once on HTTPS
}));
app.use(express.static(path.join(__dirname, 'public')));   // your HTML pages
app.use('/uploads', express.static(UPLOAD_DIR));            // listing photos

// ---------- helpers ----------
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const CATEGORIES = ['Textbooks', 'Furniture', 'Electronics', 'School supplies', 'Clothing'];
const CONDITIONS = ['New', 'Like new', 'Used - good', 'Used - fair'];

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please sign in first.' });
  next();
}

// ---------- accounts ----------
app.post('/api/register', (req, res) => {
  const { fullName, school, username, password } = req.body || {};
  // Re-check on the server: browser validation can be bypassed.
  if (!fullName || !String(fullName).trim()) return res.status(400).json({ field: 'fullname', error: 'Full name is required.' });
  if (!school) return res.status(400).json({ field: 'school', error: 'Please select your school.' });
  if (!USERNAME_RE.test(username || '')) return res.status(400).json({ field: 'username', error: 'Use 3 to 20 letters, numbers, or underscores.' });
  if (!password || password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return res.status(400).json({ field: 'password', error: 'Use at least 10 characters, with letters and numbers.' });

  try {
    const hash = bcrypt.hashSync(password, 12);
    const info = db.prepare(
      'INSERT INTO users (full_name, school, username, password_hash) VALUES (?, ?, ?, ?)'
    ).run(String(fullName).trim(), school, username, hash);
    req.session.userId = info.lastInsertRowid;           // log them in straight away
    res.status(201).json({ id: info.lastInsertRowid, username, school });
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT'))
      return res.status(409).json({ field: 'username', error: 'That username is already taken.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Incorrect username or password.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Something went wrong.' });
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username, school: user.school });
  });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  const u = db.prepare('SELECT id, full_name AS fullName, username, school FROM users WHERE id = ?').get(req.session.userId);
  res.json(u);
});

// ---------- listings ----------
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype];
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype))
});

const LISTING_SELECT = `
  SELECT l.id, l.title, l.description, l.category, l.item_condition AS condition, l.price,
         l.school, l.area, l.pickup_location AS pickupLocation, l.status, l.created_at AS createdAt,
         u.username AS seller, u.id AS sellerId, u.is_verified AS verified,
         (SELECT file_path FROM listing_images WHERE listing_id = l.id ORDER BY id LIMIT 1) AS image
  FROM listings l JOIN users u ON u.id = l.seller_id`;

// GET /api/listings?q=desk&category=Furniture&school=Waterloo&minPrice=0&maxPrice=50&condition=New&sort=newest&hideSold=1&limit=6
app.get('/api/listings', (req, res) => {
  const { q, category, school, minPrice, maxPrice, condition, sort, hideSold, limit } = req.query;
  const where = [];
  const params = [];

  if (q && q.trim()) {
    const like = '%' + q.trim().toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';
    where.push(`(LOWER(l.title) LIKE ? ESCAPE '\\' OR LOWER(l.description) LIKE ? ESCAPE '\\' OR LOWER(l.category) LIKE ? ESCAPE '\\')`);
    params.push(like, like, like);
  }
  if (category)  { where.push('l.category = ?');       params.push(category); }
  if (condition) { where.push('l.item_condition = ?'); params.push(condition); }
  if (school)    { where.push('(l.school = ? OR l.area = ?)'); params.push(school, school); }
  if (minPrice !== undefined && minPrice !== '') { where.push('l.price >= ?'); params.push(Number(minPrice)); }
  if (maxPrice !== undefined && maxPrice !== '') { where.push('l.price <= ?'); params.push(Number(maxPrice)); }
  if (hideSold === '1') where.push(`l.status = 'Available'`);

  const orderBy = {
    'price-low': 'l.price ASC', 'price-high': 'l.price DESC', 'title': 'l.title COLLATE NOCASE ASC'
  }[sort] || 'l.created_at DESC, l.id DESC';             // "recommended" / "newest"

  let sql = LISTING_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + orderBy;
  if (limit && Number(limit) > 0) { sql += ' LIMIT ?'; params.push(Math.min(Number(limit), 100)); }

  const rows = db.prepare(sql).all(...params).map(r => ({ ...r, verified: !!r.verified }));
  res.json(rows);
});

app.get('/api/listings/:id', (req, res) => {
  const row = db.prepare(LISTING_SELECT + ' WHERE l.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Listing not found.' });
  row.verified = !!row.verified;
  row.images = db.prepare('SELECT file_path FROM listing_images WHERE listing_id = ? ORDER BY id').all(row.id).map(i => i.file_path);
  res.json(row);
});

app.post('/api/listings', requireLogin, upload.array('pictures', 4), (req, res) => {
  const files = req.files || [];
  const discard = () => files.forEach(f => fs.unlink(f.path, () => {}));
  const { title, description, category, condition, price, pickupLocation, area } = req.body;
  const priceNum = Number(price);

  const problem =
    !title?.trim() ? ['title', 'Item name is required.'] :
    !description?.trim() ? ['description', 'Description is required.'] :
    !CATEGORIES.includes(category) ? ['category', 'Please select a category.'] :
    !CONDITIONS.includes(condition) ? ['condition', 'Please select a condition.'] :
    (price === '' || price === undefined || !Number.isFinite(priceNum) || priceNum < 0) ? ['price', 'Enter a valid price (0 or more).'] :
    !pickupLocation?.trim() ? ['location', 'Pickup location is required.'] :
    files.length < 1 ? ['pictures', 'Add 1 to 4 pictures (JPG, PNG, WebP or GIF).'] : null;
  if (problem) { discard(); return res.status(400).json({ field: problem[0], error: problem[1] }); }

  const seller = db.prepare('SELECT school FROM users WHERE id = ?').get(req.session.userId);
  const insert = db.transaction(() => {
    const info = db.prepare(`INSERT INTO listings
      (seller_id, title, description, category, item_condition, price, school, area, pickup_location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.session.userId, title.trim(), description.trim(), category, condition, priceNum,
           seller.school, (area || 'Waterloo'), pickupLocation.trim());
    const addImg = db.prepare('INSERT INTO listing_images (listing_id, file_path) VALUES (?, ?)');
    files.forEach(f => addImg.run(info.lastInsertRowid, '/uploads/' + f.filename));
    return info.lastInsertRowid;
  });

  try { res.status(201).json({ id: insert() }); }
  catch (err) { discard(); console.error(err); res.status(500).json({ error: 'Could not save the listing.' }); }
});

// DELETE /api/listings/:id - only the student who posted it can remove it.
app.delete('/api/listings/:id', requireLogin, (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId < 1)
    return res.status(400).json({ error: 'Invalid listing.' });

  const listing = db.prepare('SELECT id, seller_id FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'This listing no longer exists.' });
  if (listing.seller_id !== req.session.userId)
    return res.status(403).json({ error: 'You can only remove listings you created.' });

  const imagePaths = db.prepare('SELECT file_path FROM listing_images WHERE listing_id = ?').all(listingId);
  try {
    // Foreign-key cascades also remove the listing's images, reports, conversations and messages.
    db.prepare('DELETE FROM listings WHERE id = ? AND seller_id = ?').run(listingId, req.session.userId);
    // Remove uploaded files from disk after the database deletion succeeds.
    for (const image of imagePaths) {
      const filename = path.basename(image.file_path);
      fs.unlink(path.join(UPLOAD_DIR, filename), err => {
        if (err && err.code !== 'ENOENT') console.error('Could not remove listing image:', err);
      });
    }
    res.json({ ok: true, message: 'Your listing has been removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not remove the listing.' });
  }
});

// ---------- real buyer/seller messaging ----------
// POST /api/conversations { listingId }
// Creates (or returns) one conversation for this buyer and listing.
app.post('/api/conversations', requireLogin, (req, res) => {
  const listingId = Number(req.body?.listingId);
  if (!Number.isInteger(listingId) || listingId < 1)
    return res.status(400).json({ error: 'A valid listingId is required.' });

  const listing = db.prepare('SELECT id, seller_id, status FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  if (listing.seller_id === req.session.userId)
    return res.status(400).json({ error: 'You cannot message yourself about your own listing.' });

  db.prepare(`INSERT OR IGNORE INTO conversations (listing_id, buyer_id, seller_id)
              VALUES (?, ?, ?)`).run(listingId, req.session.userId, listing.seller_id);
  const conversation = db.prepare(
    'SELECT id FROM conversations WHERE listing_id = ? AND buyer_id = ?'
  ).get(listingId, req.session.userId);
  res.status(200).json(conversation);
});

// GET /api/conversations - inbox for the signed-in user.
app.get('/api/conversations', requireLogin, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.listing_id AS listingId, l.title AS listingTitle,
           CASE WHEN c.buyer_id = ? THEN seller.username ELSE buyer.username END AS otherUsername,
           (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS lastMessage,
           (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS lastMessageAt,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
             AND m.sender_id <> ? AND m.read_at IS NULL) AS unreadCount
    FROM conversations c
    JOIN listings l ON l.id = c.listing_id
    JOIN users buyer ON buyer.id = c.buyer_id
    JOIN users seller ON seller.id = c.seller_id
    WHERE c.buyer_id = ? OR c.seller_id = ?
    ORDER BY COALESCE(lastMessageAt, c.created_at) DESC
  `).all(req.session.userId, req.session.userId, req.session.userId, req.session.userId);
  res.json(rows);
});

// GET /api/conversations/:id/messages
app.get('/api/conversations/:id/messages', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const conversation = db.prepare(
    'SELECT id FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)'
  ).get(id, req.session.userId, req.session.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  db.prepare(`UPDATE messages SET read_at = datetime('now')
              WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`)
    .run(id, req.session.userId);

  const rows = db.prepare(`
    SELECT m.id, m.sender_id AS senderId, u.username AS senderUsername,
           m.body, m.created_at AS createdAt, m.read_at AS readAt
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ? ORDER BY m.id ASC
  `).all(id);
  res.json(rows);
});

// POST /api/conversations/:id/messages { body }
app.post('/api/conversations/:id/messages', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 2000)
    return res.status(400).json({ error: 'Message must contain 1 to 2000 characters.' });

  const conversation = db.prepare(
    'SELECT id FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)'
  ).get(id, req.session.userId, req.session.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  const info = db.prepare(
    'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)'
  ).run(id, req.session.userId, body);
  const saved = db.prepare(`
    SELECT id, sender_id AS senderId, body, created_at AS createdAt
    FROM messages WHERE id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(saved);
});

// ---------- listing reports ----------
app.post('/api/listings/:id/reports', requireLogin, (req, res) => {
  const listingId = Number(req.params.id);
  const { reason, details = '' } = req.body || {};
  const allowed = [
    'Potential scam or fraud', 'Possibly stolen item',
    'Misleading description or price', 'Inappropriate content', 'Other concern'
  ];
  if (!allowed.includes(reason))
    return res.status(400).json({ error: 'Please select a valid report reason.' });
  if (typeof details !== 'string' || details.length > 1000)
    return res.status(400).json({ error: 'Report details must be 1000 characters or fewer.' });

  const listing = db.prepare('SELECT id, seller_id FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  if (listing.seller_id === req.session.userId)
    return res.status(400).json({ error: 'You cannot report your own listing.' });

  try {
    const info = db.prepare(`
      INSERT INTO listing_reports (listing_id, reporter_id, reason, details)
      VALUES (?, ?, ?, ?)
    `).run(listingId, req.session.userId, reason, details.trim());
    res.status(201).json({
      id: info.lastInsertRowid,
      status: 'Pending',
      message: 'Your report has been submitted and is pending review.'
    });
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT'))
      return res.status(409).json({ error: 'You have already reported this listing.' });
    console.error(err);
    res.status(500).json({ error: 'Could not submit the report.' });
  }
});

// ---------- error handling (e.g. file too large) ----------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ field: 'pictures', error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`StudentMarket running at http://localhost:${PORT}`));
