const { db } = require('./firebase');

async function checkJobs() {
  const jobs = await db.collection('print_jobs').get();
  console.log(`--- PRINT JOBS (${jobs.size}) ---`);
  jobs.forEach(doc => {
    const data = doc.data();
    console.log(`Job ID: ${doc.id} | userId: ${data.userId} | status: ${data.status} | file: ${data.fileName}`);
  });
  
  const users = await db.collection('users').get();
  console.log(`\n--- USERS (${users.size}) ---`);
  users.forEach(doc => {
      console.log(`User ID: ${doc.id} | Email: ${doc.data().email}`);
  });
}

checkJobs().catch(console.error);
