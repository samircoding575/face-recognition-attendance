import face_recognition
import os
import pickle
import numpy as np
from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017")
db = client["attendance_system"]
employees_col = db["employees"]

# Path to your known_faces folder
KNOWN_FACES_DIR = "known_faces"

for filename in os.listdir(KNOWN_FACES_DIR):
    if filename.lower().endswith((".jpg", ".png", ".jpeg")):
        name = os.path.splitext(filename)[0]
        image_path = os.path.join(KNOWN_FACES_DIR, filename)

        # Load the image
        image = face_recognition.load_image_file(image_path)

        # Get face encodings
        encodings = face_recognition.face_encodings(image)
        if len(encodings) == 0:
            print(f"⚠️ No face found in {filename}")
            continue

        # Take the first encoding and convert to float32 to save memory
        face_encoding = np.array(encodings[0], dtype=np.float32)

        # Store in MongoDB as pickled float32 array
        employees_col.insert_one({
            "name": name,
            "face_encoding": pickle.dumps(face_encoding)
        })

        print(f"✅ Registered {name} in MongoDB.")

        # Free memory
        del image, encodings, face_encoding
