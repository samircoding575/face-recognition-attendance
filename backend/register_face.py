import face_recognition
import os
import pickle
from pymongo import MongoClient
import numpy as np

# ======================================
# 🔹 MongoDB Setup
# ======================================
client = MongoClient("mongodb://localhost:27017")
db = client["attendance_system"]
employees_col = db["employees"]

# ======================================
# 🔹 Known Faces Directory
# ======================================
KNOWN_FACES_DIR = "known_faces"

# Mapping of employee names to Salesforce OwnerIds
owner_ids = {
    "samir": "0054J000002u2qSQAQ",
    "daoud": "0054J000001p4aNQAQ",
}

# 🔹 NEW: Mapping of employee names to Departments
departments_map = {
    "samir": "Engineering",
    "daoud": "Human Resources",
    # Add more mappings here
}

# ======================================
# 🔹 Default Schedule Template
# ======================================
DEFAULT_SCHEDULE = {
    "work_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "shift_start": "09:00",
    "shift_end": "17:00",
    "is_remote_allowed": False,
    "is_part_time": False,
    "remote_days": [] # Added this to prevent "undefined" errors
}

# ======================================
# 🔹 Register Known Faces
# ======================================
for employee_name in os.listdir(KNOWN_FACES_DIR):
    employee_folder = os.path.join(KNOWN_FACES_DIR, employee_name)

    if not os.path.isdir(employee_folder):
        continue

    name = employee_name.lower()

    # Skip if employee already exists
    if employees_col.find_one({"name": name}):
        print(f"ℹ️ {name} already exists in MongoDB, skipping.")
        continue

    owner_id = owner_ids.get(name)
    if not owner_id:
        print(f"⚠️ OwnerId not found for {name}, skipping.")
        continue
    
    # Get Department (Default to "Unassigned" if not in map)
    department = departments_map.get(name, "Unassigned")

    all_encodings = []

    # Loop through images
    for img_filename in os.listdir(employee_folder):
        if not img_filename.lower().endswith((".jpg", ".jpeg", ".png")):
            continue

        img_path = os.path.join(employee_folder, img_filename)
        image = face_recognition.load_image_file(img_path)
        encodings = face_recognition.face_encodings(image)

        if len(encodings) > 0:
            all_encodings.append(encodings[0])

    if not all_encodings:
        print(f"⚠️ No valid faces found for {name}, skipping.")
        continue

    # Create average encoding
    mean_encoding = np.mean(all_encodings, axis=0)

    # Insert with Default Schedule AND Department
    employees_col.insert_one({
        "name": name,
        "face_encoding": pickle.dumps(mean_encoding),
        "OwnerId": owner_id,
        "department": department,   # <--- NEW FIELD ADDED HERE
        "schedule": DEFAULT_SCHEDULE 
    })

    print(f"✅ Registered {name} | Dept: {department}")