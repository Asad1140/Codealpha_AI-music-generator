# VisionTracker - Real-time Object Detection and Tracking

VisionTracker is a premium, web-based computer vision application that performs real-time object detection and multi-object tracking. It features a modern, dark-themed, glassmorphic dashboard built using Flask, OpenCV, YOLOv8 (`ultralytics`), and a custom-built implementation of the **SORT (Simple Online and Realtime Tracking)** algorithm.

---

## 🌟 Key Features

1. **Dual Object Trackers**:
   - **Custom SORT Tracker**: A native Python implementation built from scratch using Kalman Filters (`filterpy`) and Bipartite Matching via the Hungarian Algorithm (`scipy`).
   - **ByteTrack**: The state-of-the-art native tracker provided by `ultralytics` for comparative analysis.
2. **Real-time Video Input**:
   - Live Webcam capturing (automatically scans and detects indices).
   - Drag-and-drop video file uploading.
3. **Advanced Overlay Annotations**:
   - Distinct color coding mapped per tracker ID.
   - Historical movement trails (lines following the object's path).
   - Bounding boxes and confidence badges.
4. **Rich Analytics Dashboard**:
   - Dynamic line chart showing active track count over time.
   - Horizontal bar chart showing cumulative category totals.
   - Monospaced console scrolling real-time track logs.
   - Dynamically adjust confidence and IoU thresholds on the fly.
   - Select target COCO categories to filter detections.

---

## 🛠️ Architecture & Core Principles

### Object Detection (YOLOv8)
The system uses `yolov8n.pt` (YOLOv8 Nano) as its detection backbone. It is pre-trained on the COCO dataset (80 categories), lightweight, and optimized for high FPS on CPU inference.

### Object Tracking (Custom SORT)
The custom tracker implements the standard **SORT** framework:
- **State Modeling**: Each track is modeled by a Kalman Filter (`filterpy.kalman.KalmanFilter`) with a 7-dimensional state vector:
  $$x = [u, v, s, r, \dot{u}, \dot{v}, \dot{s}]^T$$
  where $(u, v)$ represents the center coordinates of the bounding box, $s$ is the scale/area of the box, $r$ is the aspect ratio, and the remaining terms represent their constant velocities.
- **State Updates**: Detections in the current frame ($z = [u, v, s, r]^T$) are used to correct the state of matched tracks.
- **Bipartite Association**: Associations are resolved using the Hungarian Algorithm (`scipy.optimize.linear_sum_assignment`) applied to the negative Intersection over Union (IoU) overlap matrix between detections and predicted track locations. Matches with an IoU below the threshold (e.g., 0.3) are rejected.
- **Track Lifecycle**: Detections that cannot be matched to existing tracks spawn new trackers. Trackers that are not matched to any detections for a configurable consecutive frame threshold (`max_age`) are permanently destroyed to conserve memory.

---

## 🚀 Getting Started

### Prerequisites
Ensure you have Python 3.10+ installed. Install the required libraries:

```bash
pip install opencv-python ultralytics filterpy scipy flask Werkzeug
```

### Running the Application

1. Open your terminal in the project directory.
2. Start the Flask application:
   ```bash
   python app.py
   ```
3. Open your web browser and navigate to:
   ```
   http://127.0.0.1:5002
   ```

---

## 📂 Project Structure

- [app.py](file:///c:/Users/LENOVO/Documents/codealpha_task1/OBJECT%20DETECTOR/app.py): Entry point. Runs Flask, grabs frames from OpenCV VideoCapture, passes frames to YOLO, runs tracking, and yields streaming frames.
- [tracker.py](file:///c:/Users/LENOVO/Documents/codealpha_task1/OBJECT%20DETECTOR/tracker.py): Houses the custom `SortTracker` and `KalmanBoxTracker` implementations.
- [templates/index.html](file:///c:/Users/LENOVO/Documents/codealpha_task1/OBJECT%20DETECTOR/templates/index.html): HTML skeleton of the dashboard, loading Chart.js and FontAwesome.
- [static/css/style.css](file:///c:/Users/LENOVO/Documents/codealpha_task1/OBJECT%20DETECTOR/static/css/style.css): Vanilla CSS containing glassmorphism styling, animations, and color scheme.
- [static/js/main.js](file:///c:/Users/LENOVO/Documents/codealpha_task1/OBJECT%20DETECTOR/static/js/main.js): Frontend Javascript that configures charts, manages file uploads, and polls endpoints for metrics.
