import face_recognition
import cv2
import os
import pickle
from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017")
db = client["attendance_system"]
employees_col = db["employees"]
# Path to your known_faces folder
KNOWN_FACES_DIR = "known_faces"

for filename in os.listdir(KNOWN_FACES_DIR):
    if filename.endswith((".jpg", ".png", ".jpeg")):
        name = os.path.splitext(filename)[0]
        image_path = os.path.join(KNOWN_FACES_DIR, filename)
        image = face_recognition.load_image_file(image_path)
        encodings = face_recognition.face_encodings(image)
        
        if len(encodings) == 0:
            print(f"⚠️ No face found in {filename}")
            continue
        
        # Take the first encoding
        face_encoding = encodings[0]

        # Store in MongoDB
        employees_col.insert_one({
            "name": name,
            "face_encoding": pickle.dumps(face_encoding)
        })

        print(f"✅ Registered {name} in MongoDB.")
