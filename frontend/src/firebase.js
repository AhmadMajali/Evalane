import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyALMpvLkz8u3KqkNg0SjWjETJTU5hN0LAM",
  authDomain: "evalane-b8ed8.firebaseapp.com",
  projectId: "evalane-b8ed8",
  storageBucket: "evalane-b8ed8.firebasestorage.app",
  messagingSenderId: "1094363687987",
  appId: "1:1094363687987:web:8a19ccd556ec82b196c746"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);