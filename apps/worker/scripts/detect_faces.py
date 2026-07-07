"""MediaPipe face detection (PRD §17.4).

Called by the TypeScript worker:  python3 detect_faces.py <image.png>
Prints a JSON array of face boxes with coordinates normalized to 0–1
(PRD §17.5) plus the detector confidence.
"""

import json
import os
import sys

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: detect_faces.py <image>", file=sys.stderr)
        sys.exit(2)
    model_path = os.environ.get("FACE_MODEL_PATH", "/opt/models/blaze_face_short_range.tflite")

    image = mp.Image.create_from_file(sys.argv[1])
    options = vision.FaceDetectorOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        min_detection_confidence=0.5,
    )
    with vision.FaceDetector.create_from_options(options) as detector:
        result = detector.detect(image)

    boxes = []
    for detection in result.detections:
        bbox = detection.bounding_box
        confidence = detection.categories[0].score if detection.categories else None
        boxes.append(
            {
                "x": max(0.0, bbox.origin_x / image.width),
                "y": max(0.0, bbox.origin_y / image.height),
                "width": min(1.0, bbox.width / image.width),
                "height": min(1.0, bbox.height / image.height),
                "confidence": round(confidence, 4) if confidence is not None else None,
            }
        )
    print(json.dumps(boxes))


if __name__ == "__main__":
    main()
