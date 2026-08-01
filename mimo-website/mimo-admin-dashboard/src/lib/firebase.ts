import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCTw3Tuk1vSnVD5DXnJHMXD2-Mrk5thcFo",
  authDomain: "mimo-v2-11868.firebaseapp.com",
  projectId: "mimo-v2-11868",
  storageBucket: "mimo-v2-11868.firebasestorage.app",
  messagingSenderId: "144514765704",
  appId: "1:144514765704:web:6973f5a59f18cb10c9e03d",
  measurementId: "G-ZCCSM6N4QF"
};

const app = initializeApp(firebaseConfig);

export const storage = getStorage(app);
export const db = getFirestore(app);
