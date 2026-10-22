const { db } = require('./firebase');

// This script talks to the live Firestore, which bills per document read. It used to read every
// print job and user on each run; now it needs an explicit --prod flag and is capped per collection.
const READ_LIMIT = 200;
if (!process.argv.includes('--prod')) {
  console.error('Refusing to read production Firestore. Re-run with --prod to confirm (reads up to ' + READ_LIMIT + ' docs per collection).');
  process.exit(1);
}

async function checkJobs() {
  const jobs = await db.collection('print_jobs').limit(READ_LIMIT).get();
  console.log(`--- PRINT JOBS (${jobs.size}) ---`);
  jobs.forEach(doc => {
    const data = doc.data();
    console.log(`Job ID: ${doc.id} | userId: ${data.userId} | status: ${data.status} | file: ${data.fileName}`);
  });
  
  const users = await db.collection('users').limit(READ_LIMIT).get();
  console.log(`\n--- USERS (${users.size}) ---`);
  users.forEach(doc => {
      console.log(`User ID: ${doc.id} | Email: ${doc.data().email}`);
  });
}

checkJobs().catch(console.error);
