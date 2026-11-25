# StudentMarket integrated messaging project

## What is connected
- Sign-up calls `POST /api/register` and automatically signs the student in.
- Login/logout use the Express session.
- Listings are read from SQLite, not a hard-coded sample array.
- Create listing uploads photos and saves the listing in SQLite.
- A buyer can start a conversation from a real listing. Suggested messages send real message text.
- The inbox displays conversations for both buyers and sellers. Either participant can reply.
- Messages and reports are saved in SQLite and remain after refresh.
- Reporting submits to `POST /api/listings/:id/reports`.

## Setup (Windows PowerShell)
1. Install Node.js 24 LTS (recommended for the native `better-sqlite3` dependency).
2. Extract this ZIP to a normal folder.
3. Open PowerShell in the `StudentMarket_Integrated` folder.
4. Run:
   ```powershell
   npm.cmd install
   npm.cmd start
   ```
5. Open http://localhost:3000

If PowerShell blocks `npm`, use `npm.cmd` exactly as above.

## First test (two accounts)
1. Open `/signup.html` and create account A.
2. Create a listing with at least one photo.
3. Log out using the navigation.
4. Create account B in another browser profile/private window (or log out and sign up B).
5. Open Browse listings and message account A's listing using a suggested reply or a custom message.
6. Log in as account A and open Messages. The incoming conversation should appear and account A can reply.
7. Log back in as account B and check that the seller's reply appears.

## Important notes
- Do not open the HTML files by double-clicking them. Use `http://localhost:3000` so the API and session cookies work.
- `studentmarket.db` is created automatically the first time the server starts.
- Listing creation requires 1–4 image files, up to 5 MB each.
- The sample `seed.js` is intentionally not included/run: its demo seller has no usable login, so it would not be a fair test of seller replies.
- This is a local development project. Before public deployment, set a long random `SESSION_SECRET`, use HTTPS and secure cookies, and add email/student verification and moderation tooling.
