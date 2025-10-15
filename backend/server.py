from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import face_recognition
from pymongo import MongoClient
import pickle
import datetime

app = Flask(__name__)
CORS(app)

# ======================================
# 🔹 Step 1: Connect to MongoDB
# ======================================
client = MongoClient("mongodb://localhost:27017")  # Adjust URI if needed         
db = client["attendance_system"]
employees_col = db["employees"]
logs_col = db["attendance_logs"]

# ======================================
# 🔹 Step 2: Load known faces from MongoDB
# ======================================
known_face_encodings = []
known_face_names = []
known_face_ids = []

for emp in employees_col.find({}):
    # Stored as pickled numpy arrays
    encoding = pickle.loads(emp["face_encoding"])
    known_face_encodings.append(encoding)
    known_face_names.append(emp["name"])
    known_face_ids.append(emp["_id"])

print(f"✅ Loaded {len(known_face_encodings)} known faces from MongoDB.")

# ======================================
# 🔹 Step 3: Define Flask routes
# ======================================
@app.route("/checkin", methods=["POST"])
def checkin():
    return process_face("checkin")

@app.route("/checkout", methods=["POST"])
def checkout():
    return process_face("checkout")

# ======================================
# 🔹 Step 4: Handle image recognition
# ======================================
def process_face(action):
    try:
        data = request.get_json()
        image_data = data["image"].split(",")[1]
        image_bytes = base64.b64decode(image_data)

        # Convert bytes to numpy array for OpenCV
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        # Convert to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Detect faces
        face_locations = face_recognition.face_locations(rgb_frame, model="hog")
        if not face_locations:
            return jsonify({"status": "error", "message": "No face detected"}), 400

        # Compute encodings for first detected face
        face_encodings = face_recognition.face_encodings(rgb_frame, [face_locations[0]])
        if not face_encodings:
            return jsonify({"status": "error", "message": "Could not extract face encoding"}), 400

        face_encoding = face_encodings[0]

        # Compare with known faces
        matches = face_recognition.compare_faces(known_face_encodings, face_encoding)
        name = "Unknown"
        emp_id = None

        if True in matches:
            first_match_index = matches.index(True)
            name = known_face_names[first_match_index]
            emp_id = known_face_ids[first_match_index]

        # Log attendance in MongoDB
        logs_col.insert_one({
            "employee_id": emp_id,
            "name": name,
            "action": action,
            "timestamp": datetime.datetime.utcnow()
        })

        print(f"{action.upper()} detected for: {name}")
        return jsonify({"status": "success", "name": name})

    except Exception as e:
        print("Error processing face:", e)
        return jsonify({"status": "error", "message": str(e)}), 500

# ======================================
# 🔹 Step 5: Run the Flask app
# ======================================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

