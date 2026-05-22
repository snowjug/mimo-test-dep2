require("dotenv").config({ path: "./.env" });
const { admin, db } = require("./api/firebase");

async function checkJobs() {
  try {
    // Find snowjug@gmail.com
    const userSnap = await db.collection("users").where("email", "==", "hpsnowjug@gmail.com").get();
    if (userSnap.empty) {
      console.log("User not found");
      return;
    }
    const userId = userSnap.docs[0].id;
    console.log(`Found user: ${userId}`);

    const jobsSnap = await db.collection("print_jobs").where("userId", "==", userId).get();
    console.log(`User has ${jobsSnap.size} total jobs`);

    let pendingPages = 0;
    jobsSnap.forEach(doc => {
      const data = doc.data();
      console.log(`Job ${doc.id}: status=${data.status}, pages=${data.pageCount}`);
      if (data.status === "pending") {
        pendingPages += (data.pageCount || 0);
      }
    });

    console.log(`Total pending pages for this user: ${pendingPages}`);
  } catch (err) {
    console.error(err);
  }
}

checkJobs();
